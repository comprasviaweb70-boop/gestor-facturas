export function parseSpanishNumber(val: unknown): number {
  if (typeof val === 'string') {
    let str = val.trim();
    if (str.includes('.') && str.includes(',')) {
      str = str.replace(/\./g, '').replace(/,/g, '.');
    } else if (str.includes(',')) {
      str = str.replace(/,/g, '.');
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  return 0;
}

export function normalizeRut(rut: string | undefined | null): string {
  if (!rut) return '';
  return rut.replace(/[^0-9Kk]/g, '').toUpperCase();
}
