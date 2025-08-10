export function totalPointsFromSpec(spec: any): number {
  const grid = spec?.grid ?? {};
  return Object.values(grid).reduce((acc: number, axis: any) => acc * (Array.isArray(axis) ? axis.length : 0), 1);
}