export function calculatePCU(
  subtotalNeto: number,
  impuestosAdicionales: number,
  cantidad: number,
  fleteTotal: number = 0
): number {
  return (subtotalNeto + impuestosAdicionales + fleteTotal) / (cantidad || 1);
}

export function calculatePVU(
  pcu: number,
  marginPercent: number
): number {
  return pcu * (1 + marginPercent / 100) * 1.19;
}
