import { normalizeRut } from './invoice-utils';

export interface KnownProvider {
  id: string;
  name: string;
  rut: string;
  rutNormalized: string;
  documentPromptKey: string;
}

export const KNOWN_IMAGE_PROVIDERS: KnownProvider[] = [
  {
    id: 'coca-cola-embonor',
    name: 'Coca-Cola Embonor',
    rut: '93.281.000-K',
    rutNormalized: '93281000K',
    documentPromptKey: 'coca-cola-embonor',
  },
];

export function getProviderByRut(rut?: string): KnownProvider | undefined {
  if (!rut) return undefined;
  const normalized = normalizeRut(rut);
  return KNOWN_IMAGE_PROVIDERS.find((p) => p.rutNormalized === normalized);
}

export function getProviderByKey(key?: string): KnownProvider | undefined {
  if (!key) return undefined;
  return KNOWN_IMAGE_PROVIDERS.find((p) => p.documentPromptKey === key);
}
