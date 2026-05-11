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

Responde EXCLUSIVAMENTE con el objeto JSON. No agregues texto antes ni después.`;

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
    
    const data = JSON.parse(jsonText);
    
    // Lógica de base de datos
    const { rutEmisor, items } = data;
    
    if (items && Array.isArray(items)) {
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
