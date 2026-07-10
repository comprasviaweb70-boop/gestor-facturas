import { getProviderByKey } from '@/lib/providers';

type ProviderPromptKey = 'coca-cola-embonor';

const PROVIDER_IMAGE_PROMPTS: Record<ProviderPromptKey, string> = {
  'coca-cola-embonor': `Actúa como un experto en facturación electrónica chilena. Analiza esta factura de Coca-Cola Embonor y extrae exclusivamente los datos en formato JSON.

Formato requerido:
{
  "rutEmisor": "RUT del emisor (ej: 93.281.000-K)",
  "folio": "Número del folio ubicado DEBAJO del texto 'FACTURA ELECTRONICA'",
  "razonSocial": "Razón social del emisor (ej: Coca Cola Embonor S.A.)",
  "items": [
    {
      "nombre": "Descripción del producto",
      "codigo": "Código del producto (columna Código)",
      "cantidad": "Cantidad tal como aparece en la columna Cantidad (ej: '1/0', '2/0'). Deja el formato original con la barra.",
      "precioUnitario": 0,
      "precioBrutoUnitario": 0,
      "subtotalNeto": "Valor de la columna Neto Total",
      "impuestosAdicionales": "Valor de la columna Adicional (I.A.B.A.)",
      "fleteTotal": "Valor de la columna Flete Total"
    }
  ]
}

Reglas críticas:
- Lee TODOS los productos de la tabla. Ignora líneas de garantía, depósito de envases, cuotas o totales.
- La columna "I.V.A." debe IGNORARSE por completo; no se ingresa a Bsale.
- cantidad: devuélvela como string con el formato original (ej: "2/0"). NO la multipliques.
- subtotalNeto: usa el valor de "Neto Total" (ya incluye descuentos de la columna %Desc).
- impuestosAdicionales: usa el valor de "Adicional" (I.A.B.A.). Si no hay, 0.
- fleteTotal: usa el valor de "Flete Total". Si no hay, 0.
- codigo: si no hay código, usa "S/C".
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
