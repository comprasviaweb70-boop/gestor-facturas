import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { xmlContent } = await request.json();
    
    if (!xmlContent) {
      return NextResponse.json({ error: 'Falta el contenido del XML' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key de Anthropic no configurada' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = `Actúa como un experto en facturación electrónica chilena (DTE). Analiza este XML y extrae exclusivamente los siguientes datos en formato JSON:

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
      "subtotalNeto": 100,
      "impuestosAdicionales": 0
    }
  ]
}

Regla crítica: 
- \`precioUnitario\` DEBE ser el precio neto unitario (etiqueta <PrcItem>). NO uses el monto total del ítem.
- \`subtotalNeto\` DEBE ser el monto total neto del ítem (etiqueta <MontoItem> o Cantidad * Precio Unitario).
- Si el código del proveedor no viene explícito, intenta derivarlo de la descripción o marca 'S/C'. No inventes datos.
- Para 'impuestosAdicionales', extrae el monto total de impuestos adicionales aplicados a ese ítem. Si no hay, pon 0.

Responde ÚNICAMENTE con el objeto JSON válido, sin texto adicional, sin explicaciones, sin bloques de código markdown. El primer carácter de tu respuesta debe ser { y el último }.`;

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
          content: `XML a analizar:\n${xmlContent}`
        }
      ]
    }, { 
      headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } // Requerido para usar prompt caching
    });
    
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    
    // Intentar extraer el JSON del texto
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse JSON from Claude. Raw text:', text);
      return NextResponse.json({ 
        error: 'El análisis de la factura no generó un resultado válido.', 
        details: text.substring(0, 100) 
      }, { status: 500 });
    }
    
    // Lógica de base de datos
    const { rutEmisor, items } = data;
    
    if (items && Array.isArray(items)) {
      // Regla General: Detectar packs o displays y calcular unidades reales
      items.forEach((item: any) => {
        const nombreUpper = (item.nombre || '').toUpperCase();
        let multiplier = 1;

        // Regla específica para HIPERKOR (RUT: 78753810-K)
        // En este proveedor viene el número de unidades después de una X (ej: PEPSI DES 1.5LT X6 BEBIDA)
        if (rutEmisor === '78753810-K') {
          const hiperkorMatch = nombreUpper.match(/\bX(\d+)\b/);
          if (hiperkorMatch) {
            multiplier = parseInt(hiperkorMatch[1], 10);
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

      // Auto-detectar impuestos adicionales por nombre si vienen en 0
      try {
        const { data: taxRates, error: taxError } = await supabase
          .from('tax_rates')
          .select('product_type, tax_percentage');

        if (!taxError && taxRates) {
          // Regla específica para HIPERKOR (RUT: 78753810-K) - Valores vienen en Bruto
          if (rutEmisor === '78753810-K') {
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

              const grossValue = item.subtotalNeto || ((item.cantidad || 1) * (item.precioUnitario || 0));
              
              // Fórmula: Neto = Bruto / (1 + IVA + IMPTO_ADIC)
              const factor = 1 + 0.19 + taxPercentage;
              const netValue = grossValue / factor;
              
              item.subtotalNeto = netValue;
              item.precioUnitario = netValue / (item.cantidad || 1);
              item.impuestosAdicionales = netValue * taxPercentage; // Total tax for the line
              
              console.log(`HIPERKOR: ${item.nombre} -> Bruto: ${grossValue}, Neto: ${netValue}, AddTax: ${item.impuestosAdicionales}`);
            });
          } else {
            // Caso General: Auto-detectar impuestos adicionales por nombre si vienen en 0
            items.forEach((item: any) => {
              if (!item.impuestosAdicionales || item.impuestosAdicionales === 0) {
                const nombreUpper = (item.nombre || '').toUpperCase();
                
                for (const rate of taxRates) {
                  const keyword = (rate.product_type || '').trim().toUpperCase();
                  if (keyword && nombreUpper.includes(keyword)) {
                    const porcentaje = rate.tax_percentage / 100;
                    item.impuestosAdicionales = Math.round((item.subtotalNeto || 0) * porcentaje);
                    console.log(`Aplicado impuesto ${rate.product_type} (${rate.tax_percentage}%) a ${item.nombre}: ${item.impuestosAdicionales}`);
                    break; // Aplicar solo el primero que coincida
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
      // MAD CHARLIES (RUT: 77659607-8) - Distribución de flete
      if (rutEmisor === '77659607-8' || (data.razonSocial && data.razonSocial.toUpperCase().includes('MAD CHARLIES'))) {
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
            
            items.forEach((item: any) => {
              item.deliveryUnitario = deliveryUnitario;
            });
          }
        }
      }

      // Normalizar Impuestos Adicionales: Convertir a valor unitario para el frontend
      items.forEach((item: any) => {
        if (item.impuestosAdicionales && item.impuestosAdicionales > 0) {
          const divisor = item.cantidad || 1;
          item.impuestosAdicionales = item.impuestosAdicionales / divisor;
          console.log(`Normalizado impuesto unitario para ${item.nombre}: ${item.impuestosAdicionales}`);
        }
      });

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
