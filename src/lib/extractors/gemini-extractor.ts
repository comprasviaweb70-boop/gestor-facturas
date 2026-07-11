import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractJson } from '../invoice-utils';

const XML_SYSTEM_PROMPT = `Actúa como un experto en facturación electrónica chilena (DTE). Analiza este XML y extrae exclusivamente los siguientes datos en formato JSON:

{
  "rutEmisor": "RUT del Emisor (etiqueta <RUTEmisor>)",
  "folio": "Folio de la factura",
  "razonSocial": "Razón Social del Emisor",
  "descuentoGlobal": {
    "porcentaje": "Porcentaje del descuento/recargo global (DscRcgGlobal) como decimal (4,63% -> 0.0463). Si no existe, 0.",
    "monto": "Monto del descuento/recargo global en pesos (etiqueta <ValorDscRcg>). Si no existe, 0."
  },
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
- subtotalNeto: Es el monto total neto del ítem (<MontoItem>), SIN aplicar el descuento global del pie.
- codigo: Es el SKU del proveedor (VlrCodigo). Si no encuentra VlrCodigo, buscar en <CdgItem><Codigo> o <Sku>. Si no hay código identificable, usar 'S/C'.
- descuentoGlobal: Extrae el descuento/recargo global del pie de factura (ej: <DscRcgGlobal>).

Responde ÚNICAMENTE con el objeto JSON válido.`;

const DOCUMENT_SYSTEM_PROMPT = `Actúa como un experto en facturación electrónica chilena. Analiza esta factura (PDF o imagen) y extrae exclusivamente los siguientes datos en formato JSON:

{
  "rutEmisor": "RUT del Emisor/Proveedor",
  "folio": "Número de folio de la factura",
  "razonSocial": "Razón Social del Emisor/Proveedor",
  "totalNetoFactura": "Subtotal neto del pie de factura (suma de netos de todos los productos, sin IVA, sin impuestos adicionales y sin flete; entero sin puntos ni comas)",
  "descuentoGlobal": {
    "porcentaje": "Porcentaje del descuento global del pie de factura (ej: DS/RC 4,63%) como decimal (0.0463). Si no existe, 0.",
    "monto": "Monto del descuento global en pesos (ej: 3.933). Si no existe, 0."
  },
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
- cantidad: Es la cantidad del producto. Si en la factura viene con coma decimal, conviértela a número decimal válido.
- precioUnitario, precioBrutoUnitario, subtotalNeto, impuestosAdicionales, fleteTotal y descuentoGlobal.monto: devuélvelos SIEMPRE como números enteros sin puntos ni comas (ej. 4299, no "4.299" ni "4,299"). Los valores son en pesos chilenos; no hay decimales. Si ves un punto en la factura, es separador de miles y debe ignorarse.
- precioUnitario: Es el precio neto unitario.
- precioBrutoUnitario: Es el precio final por unidad con impuestos y flete incluidos.
- subtotalNeto: Es Cantidad * Precio Unitario. NO apliques el descuento global del pie; extrae el neto de línea original.
- codigo: Es el SKU del proveedor. Si no hay, usa 'S/C'.
- tasaImpuestoAdicional: Tasa del impuesto adicional (ILA) como decimal (0.205, 0.315).
- fleteTotal: Monto de flete si existe.
- impuestosAdicionales: Montos de ILA/Impuestos adicionales.
- descuentoGlobal: Extrae el descuento global del pie de factura (ej: DS/RC). Si solo hay monto, deja porcentaje en 0. Si solo hay porcentaje, deja monto en 0.

Responde ÚNICAMENTE con el objeto JSON válido.`;

export interface GeminiExtractionResult {
  data: any;
  sourceFormat: 'xml' | 'pdf' | 'image';
}

export async function extractWithGemini(params: {
  xmlContent?: string;
  fileBase64?: string;
  fileType?: string;
  docPromptOverride?: string;
}): Promise<GeminiExtractionResult> {
  const { xmlContent, fileBase64, fileType, docPromptOverride } = params;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const systemPrompt = xmlContent
    ? XML_SYSTEM_PROMPT
    : (docPromptOverride || DOCUMENT_SYSTEM_PROMPT);
  const sourceFormat: 'xml' | 'pdf' | 'image' = xmlContent ? 'xml' : (fileType === 'application/pdf' ? 'pdf' : 'image');

  let result: any;

  if (xmlContent) {
    // XML: enviar como texto
    result = await model.generateContent([
      { text: `${systemPrompt}\n\nXML a analizar:\n${xmlContent}` }
    ]);
  } else if (fileBase64 && fileType) {
    // PDF o imagen: enviar como inlineData
    const mimeType = fileType === 'application/pdf' ? 'application/pdf' : fileType;
    result = await model.generateContent([
      { text: `${systemPrompt}\n\nAnaliza esta factura y extrae los datos según las instrucciones.` },
      {
        inlineData: {
          mimeType,
          data: fileBase64,
        }
      }
    ]);
  } else {
    throw new Error('Gemini: falta contenido para procesar');
  }

  const text = result.response.text();
  let data = extractJson(text.trim());

  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error('Gemini devolvió un array vacío.');
    }
    console.log(`Gemini devolvió array con ${data.length} elemento(s). Usando el primero.`);
    data = data[0];
  }

  return { data, sourceFormat };
}
