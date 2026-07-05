import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { hasValidCode } from '@/lib/skuUtils';
import {
  extractJson,
  parseSpanishNumber,
  calcularFleteOcultoBruto,
  normalizeRut,
  detectHiperkorMultiplier,
  detectDimakMultiplier,
  detectBatMultiplier,
  detectPackMultiplier,
  detectAlcoholTaxRate,
  distributeFreight,
} from '@/lib/invoice-utils';

// Permitir más tiempo para procesamiento de imágenes/PDF
export const maxDuration = 60;

const MAX_XML_SIZE = 2 * 1024 * 1024; // 2MB para XML
const MAX_FILE_BASE64_SIZE = 10 * 1024 * 1024; // ~7.5MB archivo real (10MB en base64)

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { xmlContent, fileBase64, fileType, knownRut, knownName } = body;
    
    if (!xmlContent && !fileBase64) {
      return NextResponse.json({ error: 'Falta contenido para procesar (XML, PDF o imagen)' }, { status: 400 });
    }

    if (xmlContent && xmlContent.length > MAX_XML_SIZE) {
      return NextResponse.json({ error: 'El XML excede el tamaño máximo permitido (2MB).' }, { status: 413 });
    }

    if (fileBase64 && fileBase64.length > MAX_FILE_BASE64_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el tamaño máximo permitido.' }, { status: 413 });
    }

    if (fileType && !['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(fileType)) {
      return NextResponse.json({ error: 'Tipo de archivo no soportado.' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key de Anthropic no configurada' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });

    // Prompt para XML (existente)
    const xmlSystemPrompt = `Actúa como un experto en facturación electrónica chilena (DTE). Analiza este XML y extrae exclusivamente los siguientes datos en formato JSON:

{
  "rutEmisor": "RUT del Emisor (etiqueta <RUTEmisor>)",
  "folio": "Folio de la factura",
  "razonSocial": "Razón Social del Emisor",
  "items": [
    {
      "nombre": "Nombre del producto",
      "codigo": "Código del proveedor (VlrCodigo)",
      "cantidad": 1,
      "precioUnitario": 100,
      "precioBrutoUnitario": 0,
      "subtotalNeto": 100,
      "impuestosAdicionales": 0
    }
  ]
}

Regla crítica: 
- precioUnitario: Es el precio neto unitario (etiqueta <PrcItem>).
- precioBrutoUnitario: Es el precio con impuestos (etiqueta <MontoBrutoItem> dividido por cantidad).
- subtotalNeto: Es el monto total neto del ítem (<MontoItem>).
- codigo: Es el SKU del proveedor (VlrCodigo). Si no encuentra VlrCodigo, buscar en <CdgItem><Codigo> o <Sku>. Si no hay código identificable, usar 'S/C'.
- fleteTotal: Si el RUT es 79576940-4 (ZAPATA), utiliza la fórmula: (Bruto - (Neto * (1 + 0.19 + ILA))) / 1.19. Multiplica el resultado por la cantidad.

Responde ÚNICAMENTE con el objeto JSON válido.`;

    // Prompt para PDF/Imágenes (visión)
    const documentSystemPrompt = `Actúa como un experto en facturación electrónica chilena. Analiza esta factura (PDF o imagen) y extrae exclusivamente los siguientes datos en formato JSON:

{
  "rutEmisor": "RUT del Emisor/Proveedor",
  "folio": "Número de folio de la factura",
  "razonSocial": "Razón Social del Emisor/Proveedor",
  "items": [
    {
      "nombre": "Nombre/Descripción del producto",
      "codigo": "Código o SKU del proveedor",
      "cantidad": 1,
      "precioUnitario": 100,
      "precioBrutoUnitario": 0,
      "subtotalNeto": 100,
      "impuestosAdicionales": 0,
      "fleteTotal": 0
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la factura.
- cantidad: Es la cantidad del producto. Si en la factura viene con coma decimal (ej: "0,6"), conviértela a un número decimal válido usando punto (ej: 0.6). Nunca lo dejes como texto ni con coma.
- precioUnitario: Es el precio neto unitario. Búscalo en la columna "T.NETO" y DIVÍDELO por la "Cantidad" para obtener el valor unitario. Si no existe "T.NETO", usa la columna "Precio" o "Neto". No uses el total bruto.
- precioBrutoUnitario: Es el precio final por unidad con impuestos y flete incluidos. Busca columnas como "P.BRUTO", "P. BRUTO" o "PRECIO BRUTO". Si no existe la columna, CALCÚLALO dividiendo el "Total Línea" por la "Cantidad".
- subtotalNeto: Es Cantidad * Precio Unitario.
- codigo: Es el SKU del proveedor. Si no hay, usa 'S/C'.
- tasaImpuestoAdicional: Es la TASA del impuesto adicional (ILA). Búscala en la columna dedicada a la tasa de impuestos de la factura (ej: 20.5%, 31.5%). Exprésalo siempre como decimal (0.205, 0.315). Si la columna está vacía, usa 0.
- fleteTotal: Si el RUT es 79576940-4 (ZAPATA), utiliza la fórmula: (Bruto - (Neto * (1 + 0.19 + tasaImpuestoAdicional))) / 1.19. Multiplica el resultado por la cantidad.
- impuestosAdicionales: Extrae montos de ILA/Impuestos adicionales.

Responde ÚNICAMENTE con el objeto JSON válido.`;

    // Seleccionar prompt según tipo de entrada
    const systemPrompt = xmlContent ? xmlSystemPrompt : documentSystemPrompt;

    // Construir contenido del mensaje según tipo de entrada
    let userContent: any;
    if (xmlContent) {
      // Flujo XML existente
      userContent = `XML a analizar:\n${xmlContent}`;
    } else if (fileType === 'application/pdf') {
      // Flujo PDF — usar tipo document de Claude
      userContent = [
        {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: fileBase64,
          },
        },
        {
          type: "text" as const,
          text: "Analiza esta factura y extrae los datos según las instrucciones del sistema.",
        },
      ];
    } else {
      // Flujo Imagen (JPG, PNG)
      userContent = [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: fileType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: fileBase64,
          },
        },
        {
          type: "text" as const,
          text: "Analiza esta factura y extrae los datos según las instrucciones del sistema.",
        },
      ];
    }

    // Headers beta: prompt caching + PDF si aplica
    const betaHeaders = ['prompt-caching-2024-07-31'];
    if (fileType === 'application/pdf') {
      betaHeaders.push('pdfs-2024-09-25');
    }

    const messages: any[] = [
      {
        role: "user",
        content: userContent
      }
    ];

    let text = '';
    let lastResult: any;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 16384,
        temperature: 0,
        system: [
          {
            type: "text",
            text: systemPrompt,
            // @ts-ignore
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: messages
      }, {
        headers: { 'anthropic-beta': betaHeaders.join(',') }
      });

      lastResult = result;
      const partial = result.content[0]?.type === 'text' ? result.content[0].text : '';
      text += partial;

      if (result.stop_reason !== 'max_tokens') {
        break;
      }

      console.log(`Attempt ${attempt + 1}: Response truncated at ${text.length} chars. Requesting continuation...`);
      messages.push(
        { role: "assistant", content: partial },
        { role: "user", content: "Continúa exactamente donde te quedaste, sin repetir nada ya dicho. Responde solo con el JSON completo concatenado (sin bloques markdown, sin preámbulos)." }
      );
    }

    if (lastResult?.stop_reason === 'max_tokens') {
      console.warn(`JSON truncado después de ${maxRetries} intentos. Se intentará parsear lo obtenido.`);
    }

    // --- Extracción robusta de JSON ---
    let data = null;
    const rawText = text.trim();

    try {
      data = extractJson(rawText);
    } catch (parseError) {
      console.error('Failed to parse JSON from Claude.');
      console.error('Raw response from Claude:', text.substring(0, 500));
      console.error('Parse error:', parseError);
      const preview = text.substring(0, 300).replace(/\n/g, ' ');
      return NextResponse.json({
        error: `Error al procesar factura: El análisis no generó JSON válido. Respuesta de Claude: ${preview}...`,
      }, { status: 500 });
    }


    
    // Si Claude devolvió un array (ej: CCU con múltiples DTEs), tomar el primer elemento
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return NextResponse.json({ error: 'Claude devolvió un array vacío.' }, { status: 500 });
      }
      console.log(`Claude devolvió array con ${data.length} elemento(s). Usando el primero.`);
      data = data[0];
    }
    
    // Lógica de base de datos
    let { rutEmisor, items, razonSocial } = data;
    
    // Fallback a los datos conocidos si Claude no los pudo extraer del XML
    if (!rutEmisor && knownRut) rutEmisor = knownRut;
    if (!razonSocial && knownName) razonSocial = knownName;
    if (knownName && !data.razonSocial) data.razonSocial = knownName;
    
    // Normalizar RUT (quitar puntos, guiones y espacios) para comparaciones consistentes
    const normalizedRut = normalizeRut(rutEmisor);
    
    if (items && Array.isArray(items)) {
      // Regla General: Detectar packs o displays y calcular unidades reales
      items.forEach((item: any) => {
        // Sanitizar cantidad y valores numéricos: convertir string con comas a number (ej: "0,6" -> 0.6)
        if (typeof item.cantidad === 'string') {
          item.cantidad = parseFloat(item.cantidad.replace(/,/g, '.'));
        }
        item.cantidad = Number(item.cantidad) || 0;

        item.precioUnitario = parseSpanishNumber(item.precioUnitario);
        item.precioBrutoUnitario = parseSpanishNumber(item.precioBrutoUnitario);
        item.subtotalNeto = parseSpanishNumber(item.subtotalNeto);
        item.impuestosAdicionales = parseSpanishNumber(item.impuestosAdicionales);

        let multiplier = 1;

        if (normalizedRut?.startsWith('78753810') || (data.razonSocial && data.razonSocial.toUpperCase().includes('HIPER'))) {
          multiplier = detectHiperkorMultiplier(item.nombre);
        }
        if (multiplier === 1 && (normalizedRut === '788095600' || (data.razonSocial && data.razonSocial.toUpperCase().includes('DIMAK')))) {
          multiplier = detectDimakMultiplier(item.nombre);
        }
        if (multiplier === 1 && (normalizedRut === '885029000' || (data.razonSocial && data.razonSocial.toUpperCase().includes('BAT CHILE')))) {
          multiplier = detectBatMultiplier(item.nombre);
        }
        if (multiplier === 1) {
          multiplier = detectPackMultiplier(item.nombre);
        }

        item.unidadesPorPack = multiplier;
        item.cantidadReal = (item.cantidad || 0) * multiplier;
        
        // Aplicar regla de packs automáticamente si se detecta más de 1 unidad por pack
        if (multiplier > 1) {
          const originalCantidad = item.cantidad || 0;
          item.cantidad = item.cantidadReal;
          
          if (item.subtotalNeto && item.subtotalNeto > 0) {
            item.precioUnitario = item.subtotalNeto / item.cantidadReal;
          }
          console.log(`Pack Applied Auto: ${item.nombre} -> Cantidad: ${originalCantidad} to ${item.cantidad}, PCU: ${item.precioUnitario}`);
        }
        
        console.log(`Pack Detection: ${item.nombre} -> Mult: ${multiplier}, Cantidad Real: ${item.cantidadReal}`);
      });

      // Inicializar fleteTotal en 0 para todos los ítems
      items.forEach((item: any) => {
        item.fleteTotal = item.fleteTotal || 0;
      });

      // Auto-detectar impuestos adicionales por nombre si vienen en 0
      try {
        const { data: taxRates, error: taxError } = await supabase
          .from('tax_rates')
          .select('product_type, tax_percentage');

        if (!taxError && taxRates) {
          // Regla específica para HIPERKOR (RUT: 78753810K) - Valores vienen en Bruto
          if (normalizedRut?.startsWith('78753810') || (data.razonSocial && data.razonSocial.toUpperCase().includes('HIPER'))) {
            items.forEach((item: any) => {
              const nombreUpper = (item.nombre || '').toUpperCase();
              let taxPercentage = 0;

              for (const rate of taxRates) {
                const keyword = (rate.product_type || '').trim().toUpperCase();
                if (keyword && nombreUpper.includes(keyword)) {
                  taxPercentage = rate.tax_percentage / 100;
                  break;
                }
              }

              // Fallback específico para bebidas/cervezas en Hiperkor si no se detectó
              if (taxPercentage === 0 && (nombreUpper.includes('CERVEZA') || nombreUpper.includes('BEBIDA') || nombreUpper.includes('STELLA'))) {
                taxPercentage = 0.205;
              }

              // Regla especial Hiperkor: Aplican erróneamente 10% a Aguas Minerales
              if (nombreUpper.includes('AGUA')) {
                taxPercentage = 0.10;
              }

              const grossValue = item.subtotalNeto || ((item.cantidad || 1) * (item.precioUnitario || 0));
              
              // Fórmula: Neto = Bruto / (1 + IVA + IMPTO_ADIC)
              const factor = 1 + 0.19 + taxPercentage;
              const netValue = grossValue / factor;
              
              item.subtotalNeto = netValue;
              item.precioUnitario = netValue / (item.cantidad || 1);
              item.impuestosAdicionales = netValue * taxPercentage; // Total tax for the line
              item.fleteTotal = 0; // Forzar flete 0 para Hiperkor
              
              console.log(`HIPERKOR: ${item.nombre} -> Bruto: ${grossValue}, Neto: ${netValue}, AddTax: ${item.impuestosAdicionales}`);
            });
          } else {
            // Caso General: Auto-detectar impuestos adicionales por nombre si vienen en 0
            items.forEach((item: any) => {
              if (!item.impuestosAdicionales || item.impuestosAdicionales === 0) {
                const nombreUpper = (item.nombre || '').toUpperCase();
                let taxPercentage = 0;
                
                // Regla especial: Bebidas energéticas no identificadas por proveedores (18%)
                if (nombreUpper.includes('SCOREGORILLA') || nombreUpper.includes('RB ACAI') || nombreUpper.includes('REDBULRED')) {
                  item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * 0.18);
                  console.log(`Aplicado impuesto especial Bebida Energética (18%) a ${item.nombre}`);
                } else {
                  for (const rate of taxRates) {
                    const keyword = (rate.product_type || '').trim().toUpperCase();
                    if (keyword && nombreUpper.includes(keyword)) {
                      taxPercentage = rate.tax_percentage / 100;
                      item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * taxPercentage);
                      console.log(`Aplicado impuesto ${rate.product_type} (${rate.tax_percentage}%) a ${item.nombre}: ${item.impuestosAdicionales}`);
                      break; 
                    }
                  }
                }
              }

              // Regla específica para JOSE ZAPATA E HIJOS S.A. (RUT: 79576940-4)
              if (normalizedRut?.startsWith('79576940') || (data.razonSocial && data.razonSocial.toUpperCase().includes('ZAPATA'))) {
                // Para Zapata necesitamos saber la tasa de impuesto adicional para el cálculo del flete
                let currentTaxRate = Number(item.tasaImpuestoAdicional) || 0;
                const nombreUpper = (item.nombre || '').toUpperCase();
                
                if (currentTaxRate === 0) {
                  for (const rate of taxRates) {
                    const keyword = (rate.product_type || '').trim().toUpperCase();
                    if (keyword && nombreUpper.includes(keyword)) {
                      currentTaxRate = rate.tax_percentage / 100;
                      break;
                    }
                  }
                }

                if (item.precioBrutoUnitario && item.precioBrutoUnitario > 0) {
                  const fleteUni = calcularFleteOcultoBruto(item.precioBrutoUnitario, item.precioUnitario, currentTaxRate);
                  item.fleteTotal = Math.round(fleteUni * (item.cantidad || 1));
                  
                  // Ajuste: El precio neto base debe ser el real sin el flete oculto
                  const originalNeto = item.precioUnitario || 0;
                  item.precioUnitario = originalNeto - fleteUni;
                  item.subtotalNeto = item.precioUnitario * (item.cantidad || 1);
                  
                  console.log(`ZAPATA: Flete oculto ${fleteUni}. Neto original: ${originalNeto} -> Neto real: ${item.precioUnitario} (Tasa ILA: ${currentTaxRate})`);
                }
              }
            });
          }
        }
      } catch (e) {
        console.error('Error in tax auto-detection:', e);
      }

      // Reglas especiales por proveedor
      // MAD CHARLIES (RUT: 776596078) - Distribución de flete
      if (normalizedRut === '776596078' || (data.razonSocial && data.razonSocial.toUpperCase().includes('MAD CHARLIES'))) {
        items.forEach((item: any) => {
          const name = (item.nombre || '').toUpperCase();
          if (name.includes('SIN ALCOHOL')) {
            item.impuestosAdicionales = (item.subtotalNeto || 0) * 0.10;
          } else if (!name.includes('DELIVERY') && !name.includes('FLETE')) {
            item.impuestosAdicionales = (item.subtotalNeto || 0) * 0.205;
          }
        });

        const deliveryItemIndex = items.findIndex((item: any) => {
          const name = (item.nombre || '').toUpperCase();
          return name.includes('DELIVERY') || name.includes('FLETE');
        });

        if (deliveryItemIndex >= 0) {
          const deliveryItem = items[deliveryItemIndex];
          const totalDelivery = deliveryItem.subtotalNeto || ((deliveryItem.cantidad || 0) * (deliveryItem.precioUnitario || 0));
          items.splice(deliveryItemIndex, 1);

          const itemsConFlete = distributeFreight(items, totalDelivery);
          items.forEach((item: any, idx: number) => {
            item.fleteTotal = itemsConFlete[idx].fleteTotal;
          });
        }
      }

      // DIMAK (RUT: 78809560-0) - Regla de grados alcohólicos
      if (normalizedRut === '788095600' || (data.razonSocial && data.razonSocial.toUpperCase().includes('DIMAK'))) {
        items.forEach((item: any) => {
          const tasa = detectAlcoholTaxRate(item.nombre);
          if (tasa > 0) {
            item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * tasa);
            console.log(`DIMAK: Detectado grado alcohólico en ${item.nombre}. Aplicando ILA ${tasa * 100}% -> ${item.impuestosAdicionales}`);
          }
        });
      }

      // VCT (RUT: 850379009) - Reglas especiales
      if (normalizedRut === '850379009' || (data.razonSocial && data.razonSocial.toUpperCase().includes('VCT'))) {
        console.log('VCT: Aplicando reglas especiales');
        
        // 1. Recalcular subtotalNeto = precioUnitario (Valor Unit. Neto c/Descto) × cantidad
        items.forEach((item: any) => {
          const nombre = (item.nombre || '').toUpperCase();
          // No recalcular items de servicio logístico
          if (!nombre.includes('SERV') || !nombre.includes('LOG')) {
            if (item.precioUnitario && item.cantidad) {
              item.subtotalNeto = item.precioUnitario * item.cantidad;
              console.log(`VCT: ${item.nombre} -> SubtotalNeto recalculado: ${item.precioUnitario} × ${item.cantidad} = ${item.subtotalNeto}`);
            }
          }
        });

        // 2. Usar fleteTotal ya extraído por Claude de la columna "Total Serv. Log."
        // Y también manejar el caso de que existan filas separadas de servicio logístico (fallback)
        const servLogIndices: number[] = [];
        let extraServLog = 0;
        
        items.forEach((item: any, index: number) => {
          const nombre = (item.nombre || '').toUpperCase();
          if ((nombre.includes('SERV') && nombre.includes('LOG')) || 
              nombre.includes('SERVICIO LOGISTICO') || 
              nombre.includes('SERVICIO LOGÍSTICO') ||
              nombre.includes('SERV. LOG')) {
            // Si el item tiene un flete propio pero es una línea de servicio logístico, 
            // acumulamos para distribuir después o simplemente ignoramos si ya viene por columna
            extraServLog += item.subtotalNeto || ((item.cantidad || 1) * (item.precioUnitario || 0));
            servLogIndices.push(index);
          }
        });

        // Eliminar items de servicio logístico si se detectaron como filas
        if (servLogIndices.length > 0) {
          for (let i = servLogIndices.length - 1; i >= 0; i--) {
            items.splice(servLogIndices[i], 1);
          }

          // Si había flete en filas pero no en columnas, lo distribuimos
          const totalUnits = items.reduce((acc: number, item: any) => acc + (Number(item.cantidad) || 0), 0);
          if (totalUnits > 0 && extraServLog > 0) {
            const fleteExtraUnitario = extraServLog / totalUnits;
            items.forEach((item: any) => {
              item.fleteTotal = (item.fleteTotal || 0) + (fleteExtraUnitario * (item.cantidad || 1));
            });
          }
        }

        // 3. Recalcular impuestos adicionales sobre el subtotalNeto corregido
        try {
          const { data: vctTaxRates } = await supabase
            .from('tax_rates')
            .select('product_type, tax_percentage');

          if (vctTaxRates) {
            items.forEach((item: any) => {
              const nombreUpper = (item.nombre || '').toUpperCase();
              let taxApplied = false;

              for (const rate of vctTaxRates) {
                const keyword = (rate.product_type || '').trim().toUpperCase();
                if (keyword && nombreUpper.includes(keyword)) {
                  const porcentaje = rate.tax_percentage / 100;
                  item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * porcentaje);
                  console.log(`VCT: Impuesto ${rate.product_type} (${rate.tax_percentage}%) aplicado a ${item.nombre}: ${item.impuestosAdicionales}`);
                  taxApplied = true;
                  break;
                }
              }

              if (!taxApplied) {
                item.impuestosAdicionales = 0;
              }
            });
          }
        } catch (e) {
          console.error('VCT: Error en detección de impuestos:', e);
        }
      }

      // Nota: impuestosAdicionales se mantiene como TOTAL por línea (no se normaliza a unitario)
      // El PCU se calcula en el frontend: (subtotalNeto + impuestosAdicionales + fleteTotal) / cantidad

      const codigos = items.map(item => item.codigo).filter(hasValidCode);
      
      if (codigos.length > 0) {
        // 1. Buscar todas las equivalencias de golpe
        const { data: equivalences, error: eqError } = await supabase
          .from('sku_equivalences')
          .select('*')
          .in('supplier_code', codigos);

        if (eqError) {
          console.error('Error fetching equivalences:', eqError);
        }

        // Crear mapa para búsqueda rápida
        const eqMap = new Map();
        equivalences?.forEach((eq: any) => {
          eqMap.set(eq.supplier_code + '_' + eq.rut_provider, eq);
          if (!eq.rut_provider) {
            eqMap.set(eq.supplier_code + '_null', eq);
          }
        });

        // 2. Identificar y actualizar supplier_name si aplica (Aprendizaje de RUT)
        const legacyItems = items.filter((item: any) => {
          return !eqMap.has(item.codigo + '_' + rutEmisor) && eqMap.has(item.codigo + '_null');
        });

        if (legacyItems.length > 0) {
          const firstLegacy = eqMap.get(legacyItems[0].codigo + '_null');
          if (firstLegacy && firstLegacy.supplier_name) {
            const supplierName = firstLegacy.supplier_name;
            
            // UPDATE masivo
            const { error: updateError } = await supabase
              .from('sku_equivalences')
              .update({ rut_provider: rutEmisor })
              .eq('supplier_name', supplierName)
              .is('rut_provider', null);

            if (updateError) {
              console.error('Error in massive update for rut_provider:', updateError);
            } else {
              console.log('Auto-llenado exitoso para el proveedor ' + supplierName + ' con RUT ' + rutEmisor);
            }
          }
        }

        // 3. Identificar cuáles van a la cola de validación
        const itemsToQueue = [];
        
        for (const item of items) {
          if (!hasValidCode(item.codigo)) continue;
          
          const hasEq = eqMap.has(item.codigo + '_' + rutEmisor) || eqMap.has(item.codigo + '_null');
          
          if (!hasEq) {
            itemsToQueue.push({
              product_name: item.nombre,
              supplier_code: item.codigo,
              rut_provider: rutEmisor,
              status: 'SIN_MAPEAR'
            });
          }
        }

        // Inserción masiva en la cola
        if (itemsToQueue.length > 0) {
          const { error: queueError } = await supabase
            .from('validation_queue')
            .upsert(itemsToQueue, { onConflict: 'supplier_code,rut_provider' });

          if (queueError) {
            console.error('Error inserting into queue in batch:', queueError);
          }
        }
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error processing document with Claude:', error);
    return NextResponse.json({ error: 'Error al procesar el documento con Claude' }, { status: 500 });
  }
}
