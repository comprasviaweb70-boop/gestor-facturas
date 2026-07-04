export function calculatePCU(
  subtotalNeto: number,
  impuestosAdicionales: number,
  cantidad: number
): number {
  return (subtotalNeto + impuestosAdicionales) / (cantidad || 1);
}

export function calculatePVU(
  pcu: number,
  marginPercent: number
): number {
  return pcu * (1 + marginPercent / 100) * 1.19;
}
