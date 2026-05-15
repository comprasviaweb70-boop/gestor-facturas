import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Permitir más tiempo para procesamiento de imágenes/PDF
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { xmlContent, fileBase64, fileType, knownRut, knownName } = body;
    
    if (!xmlContent && !fileBase64) {
      return NextResponse.json({ error: 'Falta contenido para procesar (XML, PDF o imagen)' }, { status: 400 });
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
- \`precioUnitario\` DEBE ser el precio neto unitario (etiqueta <PrcItem>). NO uses el monto total del ítem.
- \`precioBrutoUnitario\` debe ser el precio unitario bruto (con impuestos) si aparece en el documento, de lo contrario 0.
- \`subtotalNeto\` DEBE ser el monto total neto del ítem (etiqueta <MontoItem> o Cantidad * Precio Unitario).
- Si el código del proveedor no viene explícito, intenta derivarlo de la descripción o marca 'S/C'. No inventes datos.
- Para 'impuestosAdicionales', extrae el monto total de impuestos adicionales aplicados a ese ítem. Si no hay, pon 0.

Responde ÚNICAMENTE con el objeto JSON válido, sin texto adicional, sin explicaciones, sin bloques de código markdown. El primer carácter de tu respuesta debe ser { y el último }.`;

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
- Lee TODOS los productos/ítems de la factura, no omitas ninguno.
- \`precioUnitario\` DEBE ser el precio neto unitario POR UNIDAD. Si hay una columna "Valor Unit. Neto c/Descto", usa ese valor.
- \`precioBrutoUnitario\` extrae el precio unitario final con impuestos incluidos si está presente en una columna (ej: "Precio Unit. Bruto"). Si no existe, devuélvelo como 0.
- \`subtotalNeto\` DEBE ser el monto neto total del ítem (Cantidad × Precio Unitario).
- \`codigo\` debe ser el código/SKU del producto que aparece en la factura. Si no hay código visible, marca 'S/C'.
- \`impuestosAdicionales\`: extrae impuestos adicionales (ILA, impuesto a bebidas alcohólicas/analcohólicas, etc.) aplicados al ítem. Si no hay, pon 0.
- \`fleteTotal\`: EXTRAE ÚNICAMENTE de la columna "Total Serv. Log." o similar. NO CONFUNDAS con "Precio Unit. Bruto Final" ni con "Total neto C/Serv. Logístico". Si no hay columna de flete por línea, pon 0.
- Para \`folio\`, busca el número de documento, folio, o N° factura.
- Los valores numéricos deben ser números puros, sin formato. ¡CUIDADO CON LOS PUNTOS DE MILES! En Chile se usa el punto (.) para los miles y la coma (,) para decimales. Un precio como "5.000" significa CINCO MIL (5000), NO "5.0". Elimina TODOS los puntos antes de convertir el texto a número.
- Los valores numéricos deben ser números, no strings.

Responde ÚNICAMENTE con el objeto JSON válido, sin texto adicional, sin explicaciones, sin bloques de código markdown. El primer carácter de tu respuesta debe ser { y el último }.`;

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

    const result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      temperature: 0,
      system: [
        {
          type: "text",
          text: systemPrompt,
          // @ts-ignore
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: [
        {
          role: "user",
          content: userContent
        }
      ]
    }, { 
      headers: { 'anthropic-beta': betaHeaders.join(',') }
    });
    
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    
    // Intentar extraer el JSON del texto - múltiples estrategias
    let jsonText = text.trim();
    
    // Estrategia 1: Remover bloques de código markdown (```json ... ``` o ``` ... ```)
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }
    
    // Estrategia 2: Intentar parsear directamente (podría ser un objeto o array válido)
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      // Estrategia 3: Extraer array JSON [...] o objeto JSON {...}
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      const objectMatch = jsonText.match(/\{[\s\S]*\}/);
      
      const candidate = arrayMatch ? arrayMatch[0] : (objectMatch ? objectMatch[0] : jsonText);
      
      try {
        data = JSON.parse(candidate);
      } catch (e) {
        console.error('Failed to parse JSON from Claude. Raw text:', text);
        const preview = text.substring(0, 200).replace(/\n/g, ' ');
        return NextResponse.json({ 
          error: `El análisis no generó JSON válido. Respuesta de Claude: "${preview}..."`, 
        }, { status: 500 });
      }
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
    
    // Normalizar RUT (quitar puntos, guiones y espacios) para comparaciones consistentes (ej: 12345678K)
    const normalizedRut = rutEmisor?.replace(/[^0-9Kk]/g, '').toUpperCase();
    
    // Función reutilizable: Cálculo de Flete Oculto en Precio Bruto
    const calcularFleteOcultoBruto = (pBrutoUni: number, pNetoUni: number, imptoAdicRate: number) => {
      if (!pBrutoUni || pBrutoUni <= 0) return 0;
      const fleteUni = (pBrutoUni - pNetoUni * (1 + 0.19 + imptoAdicRate)) / 1.19;
      return Math.max(0, fleteUni); // Evitar fletes negativos
    };
    
    if (items && Array.isArray(items)) {
      // Regla General: Detectar packs o displays y calcular unidades reales
      items.forEach((item: any) => {
        const nombreUpper = (item.nombre || '').toUpperCase();
        let multiplier = 1;

        // Regla específica para HIPERKOR (RUT: 78753810K)
        // En este proveedor viene el número de unidades después de una X (ej: PEPSI DES 1.5LT X6 BEBIDA)
        if (normalizedRut?.startsWith('78753810') || (data.razonSocial && data.razonSocial.toUpperCase().includes('HIPER'))) {
          // Captura "X6", "X 6", "CJ 24", "CJA 12", "6 UN"
          const hiperkorMatch = nombreUpper.match(/(?:\bX\s*(\d+)\b|\b(?:CJ|CJA|CAJA)\s*(\d+)\b|(\d+)\s*(?:UN|UNID|UNIDADES)\b)/);
          if (hiperkorMatch) {
            multiplier = parseInt(hiperkorMatch[1] || hiperkorMatch[2] || hiperkorMatch[3], 10);
          }
        }

        // Si no se encontró multiplicador por regla específica, aplicar reglas generales
        if (multiplier === 1) {
          // Caso 1: Patrón AxBxC (ej: 12X30X15 GRS), el segundo término es la cantidad de unidades
          const multiXMatch = nombreUpper.match(/(\d+)\s*X\s*(\d+)\s*X\s*\d+/);
          if (multiXMatch) {
            multiplier = parseInt(multiXMatch[2], 10);
          } else {
            // Caso 2: Palabra unidades, unid, un precedida por un número
            // Usamos límites de palabra \b para evitar falsos positivos con "BUN", "LUN", etc.
            const unMatch = nombreUpper.match(/(\d+)\s*(?:UNIDADES|UNID|UN)\b/);
            if (unMatch) {
              multiplier = parseInt(unMatch[1], 10);
            } else {
              // Caso 3: PACK o DISPLAY seguido de un número
              const packMatch = nombreUpper.match(/(?:PACK|DISPLAY)\s*(?:DE\s*)?(\d+)/);
              if (packMatch) {
                multiplier = parseInt(packMatch[1], 10);
              }
            }
          }
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
                
                // Regla específica para JOSE ZAPATA E HIJOS S.A. (RUT: 79576940-4)
                if (normalizedRut?.startsWith('79576940') || (data.razonSocial && data.razonSocial.toUpperCase().includes('ZAPATA'))) {
                  if (item.precioBrutoUnitario && item.precioBrutoUnitario > 0) {
                    const fleteUni = calcularFleteOcultoBruto(item.precioBrutoUnitario, item.precioUnitario, taxPercentage);
                    item.fleteTotal = Math.round(fleteUni * (item.cantidad || 1));
                    console.log(`ZAPATA: Flete oculto calculado para ${item.nombre} -> ${item.fleteTotal}`);
                  }
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
        // MAD CHARLIES es proveedor de cerveza, aplicar 20.5% de impuesto a todo (excepto flete)
        items.forEach((item: any) => {
          const name = (item.nombre || '').toUpperCase();
          if (name.includes('SIN ALCOHOL')) {
            item.impuestosAdicionales = (item.subtotalNeto || 0) * 0.10;
          } else if (!name.includes('DELIVERY') && !name.includes('FLETE')) {
            item.impuestosAdicionales = (item.subtotalNeto || 0) * 0.205;
          }
        });

        const deliveryItemIndex = items.findIndex((item: any) => 
          (item.nombre || '').toUpperCase().includes('DELIVERY') || 
          (item.nombre || '').toUpperCase().includes('FLETE')
        );

        if (deliveryItemIndex >= 0) {
          const deliveryItem = items[deliveryItemIndex];
          const totalDelivery = deliveryItem.subtotalNeto || ((deliveryItem.cantidad || 0) * (deliveryItem.precioUnitario || 0));
          
          // Eliminar el item de delivery de la lista
          items.splice(deliveryItemIndex, 1);
          
          // Calcular total de unidades de productos restantes
          const totalUnits = items.reduce((acc: number, item: any) => acc + (Number(item.cantidad) || 0), 0);
          
          if (totalUnits > 0) {
            const deliveryUnitario = totalDelivery / totalUnits;
            console.log(`MAD CHARLIES: Distribuyendo ${totalDelivery} de flete entre ${totalUnits} unidades. Delivery unitario: ${deliveryUnitario}`);
            
            // Asignar fleteTotal por línea = deliveryUnitario × cantidad del ítem
            items.forEach((item: any) => {
              item.fleteTotal = deliveryUnitario * (item.cantidad || 1);
            });
          }
        }
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

      const codigos = items.map(item => item.codigo).filter(c => c && c !== 'S/C');
      
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
          if (!item.codigo || item.codigo === 'S/C') continue;
          
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
