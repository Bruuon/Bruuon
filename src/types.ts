/** A single contribution day */
export type Cell = {
  x: number;
  y: number;
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

/** 2D grid of contribution levels (0 = empty, 1-4 = contribution intensity) */
export type Grid = {
  width: number;
  height: number;
  data: Uint8Array;
};

export const createEmptyGrid = (width: number, height: number): Grid => ({
  width,
  height,
  data: new Uint8Array(width * height),
});

const getIndex = (grid: Grid, x: number, y: number) => x * grid.height + y;

export const getColor = (grid: Grid, x: number, y: number) =>
  grid.data[getIndex(grid, x, y)];

export const setColor = (grid: Grid, x: number, y: number, level: number) => {
  grid.data[getIndex(grid, x, y)] = level;
};

export const isInside = (grid: Grid, x: number, y: number) =>
  x >= 0 && y >= 0 && x < grid.width && y < grid.height;

/** Convert a flat list of cells into a 2D grid */
export const cellsToGrid = (cells: Cell[]): Grid => {
  const width = Math.max(0, ...cells.map((c) => c.x)) + 1;
  const height = 7; // always 7 days per week

  const grid = createEmptyGrid(width, height);
  for (const c of cells) {
    setColor(grid, c.x, c.y, c.level);
  }

  return grid;
};
