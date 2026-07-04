export const NO_CODE_SENTINEL = 'S/C';

export function hasValidCode(codigo?: string | null): boolean {
  return !!codigo && codigo !== NO_CODE_SENTINEL;
}
