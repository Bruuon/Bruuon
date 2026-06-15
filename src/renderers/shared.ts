import type { Cell } from "../types";

export const CONTRIB_COLORS: Record<number, string> = {
  0: "#ebedf0",
  1: "#9be9a8",
  2: "#40c463",
  3: "#30a14e",
  4: "#216e39",
};

export type RenderOptions = {
  cellSize: number;
  cellGap: number;
  cellRadius: number;
  transitionMs: number;
  toggleIntervalMs: number;
};

export const defaults: RenderOptions = {
  cellSize: 12,
  cellGap: 2,
  cellRadius: 2,
  transitionMs: 1500,
  toggleIntervalMs: 5000,
};

export type Layout = {
  width: number;
  height: number;
  cellSize: number;
  cellRadius: number;
  step: number;
  gridW: number;
  gridH: number;
  margin: number;
  labelH: number;
  svgW: number;
  svgH: number;
};

export const computeLayout = (cells: Cell[], o: RenderOptions): Layout => {
  const width = cells.reduce((max, c) => Math.max(max, c.x), 0) + 1;
  const height = 7;
  const step = o.cellSize + o.cellGap;
  const gridW = width * step - o.cellGap;
  const gridH = height * step - o.cellGap;
  const margin = 24;
  const labelH = 18;
  return {
    width,
    height,
    cellSize: o.cellSize,
    cellRadius: o.cellRadius,
    step,
    gridW,
    gridH,
    margin,
    labelH,
    svgW: margin * 2 + gridW,
    svgH: margin * 2 + gridH + labelH + 20,
  };
};

export const dayLabels = [
  { y: 1, label: "Mon" },
  { y: 3, label: "Wed" },
  { y: 5, label: "Fri" },
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const getMonthLabels = (
  cells: Cell[],
): { x: number; label: string }[] => {
  const seen = new Set<string>();
  const labels: { x: number; label: string }[] = [];
  for (const c of cells) {
    const key = c.date.substring(0, 7);
    if (!seen.has(key)) {
      seen.add(key);
      const month = parseInt(c.date.substring(5, 7), 10);
      labels.push({ x: c.x, label: MONTH_NAMES[month - 1] });
    }
  }
  return labels.sort((a, b) => a.x - b.x);
};

export const svgHeader = (layout: Layout) =>
  `<svg viewBox="0 0 ${layout.svgW} ${layout.svgH}" width="${layout.svgW}" height="${layout.svgH}" xmlns="http://www.w3.org/2000/svg">`;

export const monthLabelElements = (
  cells: Cell[],
  layout: Layout,
): string[] => {
  const parts: string[] = [];
  for (const { x, label } of getMonthLabels(cells)) {
    parts.push(
      `<text x="${layout.margin + x * layout.step}" y="${layout.margin - 6}" class="ml">${label}</text>`,
    );
  }
  return parts;
};

export const dayLabelElements = (layout: Layout): string[] => {
  const { margin, step, cellSize } = layout;
  return dayLabels.map(
    ({ y, label }) =>
      `<text x="${margin - 6}" y="${margin + y * step + cellSize - 2}" class="dl">${label}</text>`,
  );
};

export const labelCss = `
.ml { font: 10px sans-serif; fill: #57606a; }
.dl { font: 10px sans-serif; fill: #57606a; text-anchor: end; }
.lg { font: 10px sans-serif; fill: #57606a; }
@media (prefers-color-scheme: dark) {
  .ml, .dl, .lg { fill: #8b949e; }
  svg { background: #0d1117; border-radius: 6px; }
}`;

export const legendElements = (layout: Layout): string[] => {
  const { margin, cellSize, gridW, svgH } = layout;
  const legendY = svgH - 14;
  return [
    `<text x="${margin}" y="${legendY}" class="lg">Contributions</text>`,
    ...Object.entries(CONTRIB_COLORS).map(
      ([_, color], i) =>
        `<rect x="${margin + 80 + i * (cellSize + 2)}" y="${legendY - cellSize}" ` +
        `width="${cellSize}" height="${cellSize}" rx="2" fill="${color}" />`,
    ),
    `<text x="${margin + gridW - 60}" y="${legendY}" class="lg">Image</text>`,
  ];
};

export const timing = (o: RenderOptions) => {
  const totalMs = o.toggleIntervalMs * 2;
  const fadeOut = ((o.toggleIntervalMs - o.transitionMs) / totalMs) * 100;
  const switchPt = (o.toggleIntervalMs / totalMs) * 100;
  const fadeBack = ((totalMs - o.transitionMs) / totalMs) * 100;
  return { totalMs, fadeOut, switchPt, fadeBack };
};
