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

    const prompt = `Actúa como un experto en facturación electrónica chilena (DTE). Analiza este XML y extrae exclusivamente los siguientes datos en formato JSON:

{
  "rutEmisor": "RUT del Emisor (etiqueta <RUTEmisor>)",
  "folio": "Folio de la factura",
  "razonSocial": "Razón Social del Emisor",
  "items": [
    {
      "nombre": "Nombre del producto",
      "codigo": "Código del proveedor (VlrCodigo)",
      "cantidad": 1,
      "precioNeto": 100,
      "impuestosAdicionales": 0
    }
  ]
}

Regla crítica: Si el código del proveedor no viene explícito, intenta derivarlo de la descripción o marca 'S/C'. No inventes datos.
Para 'impuestosAdicionales', extrae el monto total de impuestos adicionales (ILA, IABA, etc.) aplicados a ese ítem. Si no hay, pon 0. Si el impuesto viene como tasa (%), calcula el monto en base al precio neto.

XML a analizar:
${xmlContent}`;

    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            }
          ],
        }
      ],
    });
    
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    
    // Intentar extraer el JSON del texto
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    
    const data = JSON.parse(jsonText);
    
    // Lógica de base de datos
    const { rutEmisor, items } = data;
    
    if (items && Array.isArray(items)) {
      let supplierNameIdentified = false;

      for (const item of items) {
        if (!item.codigo || item.codigo === 'S/C') continue;

        // 1. Identificar el supplier_name si aún no se ha hecho
        if (!supplierNameIdentified) {
          const { data: legacyData } = await supabase
            .from('sku_equivalences')
            .select('supplier_name')
            .eq('supplier_code', item.codigo)
            .is('rut_provider', null)
            .limit(1);

          if (legacyData && legacyData.length > 0 && legacyData[0].supplier_name) {
            const supplierName = legacyData[0].supplier_name;
            
            // Ejecutar UPDATE masivo para "aprender" el RUT
            const { error: updateError } = await supabase
              .from('sku_equivalences')
              .update({ rut_provider: rutEmisor })
              .eq('supplier_name', supplierName)
              .is('rut_provider', null);

            if (updateError) {
              console.error('Error in massive update for rut_provider:', updateError);
            } else {
              console.log(`Auto-llenado exitoso para el proveedor ${supplierName} con RUT ${rutEmisor}`);
              supplierNameIdentified = true; // Ya lo hicimos para esta factura
            }
          }
        }

        // 2. Verificar en sku_equivalences (ahora con el RUT ya poblado o buscándolo con RUT)
        const { data: equivalence, error: eqError } = await supabase
          .from('sku_equivalences')
          .select('*')
          .eq('supplier_code', item.codigo)
          .eq('rut_provider', rutEmisor)
          .single();

        let finalEquivalence = equivalence;

        if (!finalEquivalence) {
          // Fallback a registros legados sin RUT
          const { data: legacyEq } = await supabase
            .from('sku_equivalences')
            .select('*')
            .eq('supplier_code', item.codigo)
            .is('rut_provider', null)
            .limit(1);

          if (legacyEq && legacyEq.length > 0) {
            finalEquivalence = legacyEq[0];
          }
        }

        if (eqError && eqError.code !== 'PGRST116') {
          console.error('Error checking equivalence:', eqError);
          continue;
        }

        // Si no existe, insertar en validation_queue
        if (!finalEquivalence) {
          const { error: queueError } = await supabase
            .from('validation_queue')
            .upsert({
              product_name: item.nombre,
              supplier_code: item.codigo,
              rut_provider: rutEmisor,
              status: 'SIN_MAPEAR'
            }, { onConflict: 'supplier_code,rut_provider' });

          if (queueError) {
            console.error('Error inserting into queue:', queueError);
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
