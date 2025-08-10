export type Axis = Array<string | number | boolean>;
export type Grid = Record<string, Axis>;

export function cartesianSizes(grid: Grid): number[] {
  return Object.values(grid).map(a => a.length);
}

export function totalPoints(grid: Grid): number {
  return Object.values(grid).reduce((acc, a) => acc * a.length, 1);
}

// Map linear index -> coordinates across axes
export function indexToCoords(index: number, sizes: number[]): number[] {
  const coords: number[] = [];
  for (let i = sizes.length - 1; i >= 0; i--) {
    coords[i] = index % sizes[i];
    index = Math.floor(index / sizes[i]);
  }
  return coords;
}

export function coordsToParams(grid: Grid, coords: number[]) {
  const keys = Object.keys(grid);
  const obj: Record<string, any> = {};
  keys.forEach((k, i) => (obj[k] = grid[k][coords[i]]));
  return obj;
}