import Anthropic from '@anthropic-ai/sdk';
import { extractJson } from '../invoice-utils';

const MAX_RETRIES = 3;

const XML_SYSTEM_PROMPT = `Actúa como un experto en facturación electrónica chilena (DTE). Analiza este XML y extrae exclusivamente los siguientes datos en formato JSON:

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

const DOCUMENT_SYSTEM_PROMPT = `Actúa como un experto en facturación electrónica chilena. Analiza esta factura (PDF o imagen) y extrae exclusivamente los siguientes datos en formato JSON:

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

export interface ClaudeExtractionResult {
  data: any;
  sourceFormat: 'xml' | 'pdf' | 'image';
}

export async function extractWithClaude(params: {
  xmlContent?: string;
  fileBase64?: string;
  fileType?: string;
}): Promise<ClaudeExtractionResult> {
  const { xmlContent, fileBase64, fileType } = params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('API Key de Anthropic no configurada');
  }

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = xmlContent ? XML_SYSTEM_PROMPT : DOCUMENT_SYSTEM_PROMPT;
  const sourceFormat: 'xml' | 'pdf' | 'image' = xmlContent ? 'xml' : (fileType === 'application/pdf' ? 'pdf' : 'image');

  let userContent: any;
  if (xmlContent) {
    userContent = `XML a analizar:\n${xmlContent}`;
  } else if (fileType === 'application/pdf') {
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

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
    console.warn(`JSON truncado después de ${MAX_RETRIES} intentos. Se intentará parsear lo obtenido.`);
  }

  let data = extractJson(text.trim());

  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error('Claude devolvió un array vacío.');
    }
    console.log(`Claude devolvió array con ${data.length} elemento(s). Usando el primero.`);
    data = data[0];
  }

  return { data, sourceFormat };
}
