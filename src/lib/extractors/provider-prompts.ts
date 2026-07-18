import { getProviderByKey } from '@/lib/providers';

type ProviderPromptKey = 'coca-cola-embonor' | 'vct' | 'ideal' | 'ccu' | 'bundor' | 'zapata' | 'mad-charlies';

const PROVIDER_IMAGE_PROMPTS: Record<ProviderPromptKey, string> = {
  'coca-cola-embonor': `Actúa como un experto en facturación electrónica chilena. Analiza esta factura de Coca-Cola Embonor y extrae exclusivamente los datos en formato JSON.

IMPORTANTE — Orden visual exacto de las columnas monetarias en cada fila de producto (de izquierda a derecha):
Neto Total | Flete Total | I.V.A. | Adicional (I.A.B.A.)

La columna I.V.A. está SIEMPRE ubicada entre "Flete Total" (a su izquierda) y "Adicional" (a su derecha). DEBES ignorarla por completo.

Formato requerido:
{
  "rutEmisor": "RUT del emisor (ej: 93.281.000-K)",
  "folio": "Número del folio ubicado DEBAJO del texto 'FACTURA ELECTRONICA'",
  "razonSocial": "Razón social del emisor (ej: Coca Cola Embonor S.A.)",
  "totalNetoFactura": "Subtotal neto del pie de factura (suma de Neto Total de todos los productos, sin IVA ni flete; entero sin puntos ni comas)",
  "items": [
    {
      "nombre": "Descripción del producto",
      "codigo": "Código del producto (columna Código)",
      "cantidad": "Cantidad tal como aparece en la columna Cantidad (ej: '1/0', '2/0'). Deja el formato original con la barra.",
      "precioUnitario": 0,
      "precioBrutoUnitario": 0,
      "subtotalNeto": "Valor de la columna Neto Total (entero, sin puntos ni comas; ej: 4299)",
      "impuestosAdicionales": "Valor de la columna Adicional (I.A.B.A.) (entero, sin puntos ni comas; ej: 774)",
      "fleteTotal": "Valor de la columna Flete Total (entero, sin puntos ni comas; ej: 1460)"
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la tabla. Ignora líneas de garantía, depósito de envases, cuotas o totales.
- La columna "I.V.A." debe IGNORARSE por completo; no se ingresa a Bsale. NUNCA copies su valor en ningún campo.
- cantidad: devuélvela como string con el formato original (ej: "2/0"). NO la multipliques.
- subtotalNeto, impuestosAdicionales y fleteTotal: devuélvelos SIEMPRE como números enteros sin puntos ni comas (ej. 4299, no "4.299"). En Chile el punto es separador de miles; ignóralo. Si no hay valor, usa 0.
- subtotalNeto: usa el valor de "Neto Total" (ya incluye descuentos de la columna %Desc).
- fleteTotal: EXCLUSIVAMENTE el valor de la columna "Flete Total", que está INMEDIATAMENTE a la izquierda de la columna "I.V.A.". Si ves un valor que es aproximadamente el 19% del Neto Total, estás leyendo la columna I.V.A. — corrige y toma el valor que está justo a su izquierda.
- impuestosAdicionales: EXCLUSIVAMENTE el valor de la columna "Adicional" (I.A.B.A.), que está INMEDIATAMENTE a la derecha de la columna "I.V.A.". Si esa celda está vacía o en blanco, el valor debe ser exactamente 0. NUNCA uses el valor de la columna "I.V.A." ni ninguna otra columna como reemplazo.
- codigo: si no hay código, usa "S/C".
- Antes de responder, verifica fila por fila que fleteTotal NO coincida con el valor de la columna I.V.A. y que impuestosAdicionales NO coincida con el valor de I.V.A.
- Responde ÚNICAMENTE con el objeto JSON válido.`,

  'vct': `Actúa como un experto en facturación electrónica chilena. Analiza esta factura de VCT (Comercial Peumo Ltda., R.U.T. 85.037.900-9) y extrae exclusivamente los datos en formato JSON.

Formato requerido:
{
  "rutEmisor": "R.U.T. del emisor",
  "folio": "Número del folio ubicado al lado del texto 'FACTURA ELECTRONICA' (ej: 7471476)",
  "razonSocial": "Razón social del emisor",
  "totalNetoFactura": "SubTotal Neto del pie de factura (sin S. Logísticos; entero sin puntos ni comas; ej: 68249)",
  "items": [
    {
      "nombre": "Descripción del producto (conservar el sufijo de pack: 6BOT, 06TPK, 12BOT, etc.)",
      "codigo": "Código del producto (columna Código)",
      "unidad": "CAJ o BOT (columna Un.)",
      "cantidad": "Número entero EXACTO de la columna Cant. (no de la columna cc). Verifica cuidadosamente el dígito; presta especial atención a no confundir 2 con 3.",
      "precioUnitario": 0,
      "precioBrutoUnitario": 0,
      "subtotalNeto": "Valor de la columna Valor Unit. Neto c/Descto multiplicado por la columna Cant. (sin puntos ni comas)",
      "fleteTotal": "Valor de la columna Serv. Log. (diferencia entre Total neto C/Serv. Logístico y Valor Unit. Neto c/Descto)",
      "impuestosAdicionales": "Valor de la columna 'Total Imp. Adic.' (IABA). Si está vacío, usa 0.",
      "tasaImpuestoAdicional": "Tasa del impuesto adicional (columna Tasa): 20,50 -> 0.205, 31,50 -> 0.315"
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la tabla. Ignora líneas de totales, subtotales, garantía o depósito de envases.
- unidad: extrae el valor exacto de la columna Un. (puede ser CAJ o BOT). Si no la ves, usa "CAJ".
- cantidad: número entero EXACTO de la columna Cant. (no uses la columna cc). Verifica el dígito cuidadosamente: presta especial atención a no confundir 2 con 3.
- subtotalNeto: únicamente el neto del producto (Valor Unit. Neto c/Descto × Cant.), sin incluir el flete.
- fleteTotal: es la columna Serv. Log. de la línea. Si la factura no la trae por línea, calcúlala como Total neto C/Serv. Logístico − subtotalNeto. El flete total del pie se suma si no está en líneas.
- impuestosAdicionales: usa el valor de Total Imp. Adic. por línea. Si no existe, calcúlalo como subtotalNeto × tasaImpuestoAdicional.
- tasaImpuestoAdicional: decimal según columna Tasa Impto. Adic.: 20,50 -> 0.205, 31,50 -> 0.315. Si está vacía, usa 0.
- No uses el valor de IVA (19%) para impuestosAdicionales.
- No uses Precio Unit. Bruto Final.
- codigo: si no hay código visible, usa "S/C".
- Todos los montos deben ser números enteros sin puntos ni comas; en Chile el punto es separador de miles.
- Responde ÚNICAMENTE con el objeto JSON válido.`,

  'ideal': `Actúa como un experto en facturación electrónica chilena. Analiza esta factura de IDEAL (R.U.T. 82.623.500-4) y extrae exclusivamente los datos en formato JSON.

Formato requerido:
{
  "rutEmisor": "R.U.T. del emisor (ej: 82.623.500-4)",
  "folio": "Número del folio de la factura",
  "razonSocial": "Razón social del emisor",
  "totalNetoFactura": "Subtotal neto del pie de factura (sin IVA; entero sin puntos ni comas)",
  "items": [
    {
      "nombre": "Descripción del producto",
      "codigo": "Código del producto (columna Código o SKU del proveedor)",
      "cantidad": "Cantidad de la columna Cantidad (número entero o decimal según aparezca)",
      "precioUnitario": 0,
      "precioBrutoUnitario": 0,
      "subtotalNeto": "Valor neto de la línea (entero, sin puntos ni comas)",
      "impuestosAdicionales": 0,
      "fleteTotal": 0
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la tabla. Ignora líneas de totales, subtotales, garantía o depósito de envases.
- cantidad: número EXACTO de la columna Cantidad. Si trae formato con barra (ej: "2/0"), devuélvelo como string.
- subtotalNeto: devuélvelo SIEMPRE como número entero sin puntos ni comas (ej: 4299, no "4.299"). En Chile el punto es separador de miles; ignóralo. Si no hay valor, usa 0.
- impuestosAdicionales: siempre 0 (IDEAL no usa impuestos adicionales).
- fleteTotal: siempre 0 (IDEAL no usa flete).
- codigo: si no hay código visible, usa "S/C".
- Responde ÚNICAMENTE con el objeto JSON válido.`,
  
  'ccu': `Actúa como un experto en facturación electrónica chilena. Analiza esta factura de COMERCIAL CCU S.A. (R.U.T. 99.554.560-8) y extrae exclusivamente los datos en formato JSON.

Formato requerido:
{
  "rutEmisor": "R.U.T. del emisor (99.554.560-8)",
  "folio": "Número del folio de la factura",
  "razonSocial": "Razón social del emisor",
  "totalNetoFactura": "Subtotal neto del pie de factura (sin IVA; entero sin puntos ni comas)",
  "items": [
    {
      "nombre": "Descripción COMPLETA del producto tal como aparece en la factura (conservar todo: códigos, sufijos, medidas, etc.)",
      "codigo": "Código del producto (columna Código)",
      "cantidadVisual": "Solo el número visual de la columna Cantidad (ej: 1, 2, 3...). NO calcular ni multiplicar.",
      "precioUnitario": 0,
      "precioBrutoUnitario": "Valor de la columna 'Total x Unidad' (PTU - Precio Total por Unidad, con 1 decimal)",
      "subtotalNeto": "Valor de la columna 'Valor' (neto post-descuento comercial, antes de IVA e IABA; entero sin puntos ni comas)",
      "impuestosAdicionales": 0,
      "fleteTotal": 0,
      "tasaImpuestoAdicional": "Tasa del impuesto adicional (ILA) obtenida de la columna 'GRADO ALCOH' o del pie de factura. Ver reglas abajo."
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la tabla. Ignora líneas de totales, subtotales, garantía o depósito de envases.
- EXCLUYE productos con código 9999 ("Flete de Mercaderías" - contabilidad interna CCU).
- subtotalNeto: extrae el valor de la columna 'Valor' (NO de 'Precio Unit'), es el neto post-descuento comercial antes de IVA e IABA.
- precioBrutoUnitario: extrae el valor de la columna 'Total x Unidad' (PTU - Precio Total por Unidad, con 1 decimal).
- cantidadVisual: devuelve SOLO el número que ves en la columna Cantidad. No lo modifiques ni calcules nada.
- nombre: copia EXACTAMENTE toda la descripción del producto. Incluir SIEMPRE el tipo de pack (ej: 6PF, 12PF, 6PFX4, 1600X6, etc.). Esto es CRÍTICO para el cálculo posterior de unidades.
- impuestosAdicionales: inicialmente 0; el cálculo se hará posteriormente según clasificación fiscal.
- fleteTotal: inicialmente 0; el cálculo se hará posteriormente basado en PTU.
- tasaImpuestoAdicional: Determínala en este orden:
  1) PRIMERO: Busca en el PIE DE FACTURA la tasa de impuesto adicional (ILA/IABA). Suele aparecer como porcentaje (ej: 10%, 20.5%, 31.5%) junto al monto total del impuesto. Si la encuentras, conviértela a decimal (10% → 0.10, 20.5% → 0.205, 31.5% → 0.315).
  2) SI NO aparece en el pie: Busca la columna 'GRADO ALCOH' (o 'GRADO ALC.', 'G.A.', '°ALC') en la tabla de productos. Toma el valor numérico del grado alcohólico (ej: 13, 5.5, 40).
     * Si el grado es < 20 → tasa es 0.205 (vino/cerveza 20.5%)
     * Si el grado es >= 20 → tasa es 0.315 (destilado/pisco 31.5%)
     * Si la columna existe pero está vacía o dice '0' → tasa es 0 (sin ILA, ej: agua/jugo)
  3) Si no hay tasa en el pie ni columna GRADO ALCOH → tasa es 0
  Siempre expresa la tasa como decimal (0.10, 0.205, 0.315, 0).
  - codigo: si no hay código visible, usa "S/C".
  - Todos los montos deben ser números enteros sin puntos ni comas; en Chile el punto es separador de miles.
  - Responde ÚNICAMENTE con el objeto JSON válido.`,

  'bundor': `Actúa como un experto en facturación electrónica chilena. Analiza esta factura de CERVECERÍA BUNDOR SPA (R.U.T. 76.424.467-2) y extrae exclusivamente los datos en formato JSON.

Formato requerido:
{
  "rutEmisor": "R.U.T. del emisor (76.424.467-2)",
  "folio": "Número del folio de la factura",
  "razonSocial": "Razón social del emisor",
  "totalNetoFactura": "Subtotal neto del pie de factura (sin IVA; entero sin puntos ni comas)",
  "items": [
    {
      "nombre": "Descripción COMPLETA del producto tal como aparece en la factura (incluir grado alcohólico si existe)",
      "codigo": "Código del producto (columna Código)",
      "cantidad": "Cantidad de la columna Cantidad (número entero o decimal)",
      "unidad": "Unidad de medida de la columna U.M. (ej: UN, BOT, CAJ)",
      "precioUnitario": 0,
      "precioBrutoUnitario": 0,
      "subtotalNeto": "Valor de la columna Total (neto de la línea; entero sin puntos ni comas)",
      "impuestosAdicionales": 0,
      "fleteTotal": 0
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la tabla. Ignora líneas de totales, subtotales, garantía o depósito de envases.
- cantidad: número EXACTO de la columna Cantidad. Si trae formato con barra, devuélvelo como string.
- subtotalNeto: devuélvelo SIEMPRE como número entero sin puntos ni comas (ej: 10655, no "10.655"). En Chile el punto es separador de miles; ignóralo. Si no hay valor, usa 0.
- precioUnitario y precioBrutoUnitario: deja 0 (se calcularán posteriormente).
- impuestosAdicionales: inicialmente 0; se calculará posteriormente según clasificación fiscal.
- fleteTotal: inicialmente 0; si existe una línea de "FLETE MERCADERIA" o similar, inclúyela como ítem normal (la post-proceso la manejará).
- codigo: si no hay código visible, usa "S/C".
- Responde ÚNICAMENTE con el objeto JSON válido.`,

  'zapata': `Actúa como un experto en facturación electrónica chilena. Analiza esta factura de ZAPATA (R.U.T. 79.576.940-4) y extrae exclusivamente los datos en formato JSON.

Formato requerido:
{
  "rutEmisor": "R.U.T. del emisor (79.576.940-4)",
  "folio": "Número del folio de la factura",
  "razonSocial": "Razón social del emisor",
  "totalNetoFactura": "Subtotal neto del pie de factura (sin IVA; entero sin puntos ni comas)",
  "items": [
    {
      "nombre": "Descripción del producto",
      "codigo": "Código del producto",
      "cantidad": "Cantidad",
      "precioUnitario": "Precio neto unitario",
      "precioBrutoUnitario": "Precio bruto unitario (con impuestos) si existe",
      "subtotalNeto": "Subtotal neto de la línea (entero sin puntos ni comas)",
      "impuestosAdicionales": 0,
      "fleteTotal": 0,
      "tasaImpuestoAdicional": "Tasa del impuesto adicional (ILA) si aparece en la factura (ej: 20.5% -> 0.205)"
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la tabla. Ignora líneas de totales, subtotales, garantía o depósito de envases.
- precioUnitario: precio neto unitario (sin IVA ni impuestos adicionales).
- precioBrutoUnitario: precio bruto unitario (con IVA e impuestos adicionales incluidos) si existe en la factura.
- subtotalNeto: devuélvelo SIEMPRE como número entero sin puntos ni comas. En Chile el punto es separador de miles; ignóralo.
- impuestosAdicionales: inicialmente 0; se calculará posteriormente según la tasa.
- fleteTotal: inicialmente 0; se calculará posteriormente a partir del precio bruto.
- tasaImpuestoAdicional: expresa la tasa como decimal (0.205, 0.315, 0.10, etc.). Si no aparece, usa 0.
- codigo: si no hay código visible, usa "S/C".
- Responde ÚNICAMENTE con el objeto JSON válido.`,

  'mad-charlies': `Actúa como un experto en facturación electrónica chilena. Analiza esta factura de MAD CHARLIES (R.U.T. 77.659.607-8) y extrae exclusivamente los datos en formato JSON.

Formato requerido:
{
  "rutEmisor": "R.U.T. del emisor (77.659.607-8)",
  "folio": "Número del folio de la factura",
  "razonSocial": "Razón social del emisor",
  "totalNetoFactura": "Subtotal neto del pie de factura (sin IVA; entero sin puntos ni comas)",
  "items": [
    {
      "nombre": "Descripción del producto",
      "codigo": "Código del producto",
      "cantidad": "Cantidad",
      "precioUnitario": 0,
      "precioBrutoUnitario": 0,
      "subtotalNeto": "Subtotal neto de la línea (entero sin puntos ni comas)",
      "impuestosAdicionales": 0,
      "fleteTotal": 0
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la tabla. Ignora líneas de totales, subtotales, garantía o depósito de envases.
- Si existe una línea de "DELIVERY", "FLETE" o "DELIVERY MANUAL", inclúyela como ítem normal (la post-proceso la manejará).
- subtotalNeto: devuélvelo SIEMPRE como número entero sin puntos ni comas. En Chile el punto es separador de miles; ignóralo.
- impuestosAdicionales: inicialmente 0; se calculará posteriormente según clasificación fiscal (10% sin alcohol, 20.5% con alcohol).
- fleteTotal: inicialmente 0; si hay línea de delivery/flete, la post-proceso lo distribuirá.
- codigo: si no hay código visible, usa "S/C".
- Responde ÚNICAMENTE con el objeto JSON válido.`,
};

export function getProviderImagePrompt(rutOrKey?: string): string | undefined {
  if (!rutOrKey) return undefined;

  const provider = getProviderByKey(rutOrKey) || getProviderByKey(
    rutOrKey.toLowerCase().replace(/[^a-z0-9-]/g, '')
  );

  if (!provider) return undefined;
  return PROVIDER_IMAGE_PROMPTS[provider.documentPromptKey as ProviderPromptKey];
}
