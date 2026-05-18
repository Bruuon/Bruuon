import type { Cell } from "./types";

const CONTRIB_COLORS: Record<number, string> = {
  0: "#ebedf0",
  1: "#9be9a8",
  2: "#40c463",
  3: "#30a14e",
  4: "#216e39",
};

type Options = {
  cellSize: number;
  cellGap: number;
  cellRadius: number;
  transitionMs: number;
  toggleIntervalMs: number;
};

const defaults: Options = {
  cellSize: 12,
  cellGap: 2,
  cellRadius: 2,
  transitionMs: 1500,
  toggleIntervalMs: 5000,
};

/**
 * Generate an animated SVG where each cell's fill animates between
 * its contribution color and image-mapped color.
 *
 * Uses per-color-pair @keyframes (same strategy as snk) so the animation
 * survives GitHub's <img>-tag rendering — no JS, no opacity-on-groups.
 */
export const generateSvg = (
  cells: Cell[],
  imageColors: string[][],
  opts: Partial<Options> = {},
): string => {
  const o = { ...defaults, ...opts };
  const { cellSize, cellGap, cellRadius } = o;

  const width = cells.reduce((max, c) => Math.max(max, c.x), 0) + 1;
  const height = 7;
  const step = cellSize + cellGap;

  const gridW = width * step - cellGap;
  const gridH = height * step - cellGap;
  const margin = 24;
  const labelH = 18;
  const svgW = margin * 2 + gridW;
  const svgH = margin * 2 + gridH + labelH + 20;

  const monthLabels = getMonthLabels(cells);

  const dayLabels = [
    { y: 1, label: "Mon" },
    { y: 3, label: "Wed" },
    { y: 5, label: "Fri" },
  ];

  // Group cells by unique (contribColor, imageColor) pairs
  // so we generate one @keyframes per unique pair, not per cell
  const pairMap = new Map<string, { contrib: string; image: string; cells: Cell[] }>();
  for (const c of cells) {
    const contrib = CONTRIB_COLORS[c.level] ?? CONTRIB_COLORS[0];
    const image = imageColors[c.x]?.[c.y] ?? contrib;
    const key = `${contrib}|${image}`;
    if (!pairMap.has(key)) {
      pairMap.set(key, { contrib, image, cells: [] });
    }
    pairMap.get(key)!.cells.push(c);
  }
  const pairs = [...pairMap.values()];

  // ─── Build SVG ──────────────────────────────────────────────────────

  const parts: string[] = [];

  parts.push(
    `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">`,
  );

  parts.push("<style>", generateStyles(o, pairs), "</style>");

  // Month labels
  for (const { x, label } of monthLabels) {
    parts.push(
      `<text x="${margin + x * step}" y="${margin - 6}" class="ml">${label}</text>`,
    );
  }

  // Day-of-week labels
  for (const { y, label } of dayLabels) {
    parts.push(
      `<text x="${margin - 6}" y="${margin + y * step + cellSize - 2}" class="dl">${label}</text>`,
    );
  }

  // Cell rects — one per cell, each referencing its color-pair group
  for (let i = 0; i < pairs.length; i++) {
    for (const c of pairs[i].cells) {
      const x = margin + c.x * step;
      const y = margin + c.y * step;
      parts.push(
        `<rect class="c g${i}" x="${x}" y="${y}" ` +
          `width="${cellSize}" height="${cellSize}" rx="${cellRadius}" />`,
      );
    }
  }

  // Legend
  const legendY = svgH - 14;
  parts.push(
    `<text x="${margin}" y="${legendY}" class="lg">Contributions</text>`,
    ...Object.entries(CONTRIB_COLORS).map(([_, color], i) =>
      `<rect x="${margin + 80 + i * (cellSize + 2)}" y="${legendY - cellSize}" ` +
        `width="${cellSize}" height="${cellSize}" rx="2" fill="${color}" />`,
    ),
    `<text x="${margin + gridW - 60}" y="${legendY}" class="lg">Image</text>`,
  );

  parts.push("</svg>");

  return parts.join("\n");
};

// ─── CSS Styles ───────────────────────────────────────────────────────

const generateStyles = (
  o: Options,
  pairs: { contrib: string; image: string }[],
) => {
  const totalMs = o.toggleIntervalMs * 2;
  const fadeOut = ((o.toggleIntervalMs - o.transitionMs) / totalMs) * 100;
  const switchPt = (o.toggleIntervalMs / totalMs) * 100;
  const fadeBack = ((totalMs - o.transitionMs) / totalMs) * 100;

  const css: string[] = [];

  // Base cell style — animation is "none" by default
  css.push(
    `.c {`,
    `  animation: none ${totalMs}ms ease-in-out infinite;`,
    `  shape-rendering: geometricPrecision;`,
    `}`,
  );

  // Per-pair @keyframes + class that enables it
  for (let i = 0; i < pairs.length; i++) {
    const { contrib, image } = pairs[i];
    const name = `k${i}`;
    css.push(
      `.c.g${i} { animation-name: ${name}; }`,
      `@keyframes ${name} {`,
      `  0%, ${fadeOut.toFixed(1)}% { fill: ${contrib}; }`,
      `  ${switchPt.toFixed(1)}%, ${fadeBack.toFixed(1)}% { fill: ${image}; }`,
      `  100% { fill: ${contrib}; }`,
      `}`,
    );
  }

  // Labels
  css.push(
    `.ml { font: 10px sans-serif; fill: #57606a; }`,
    `.dl { font: 10px sans-serif; fill: #57606a; text-anchor: end; }`,
    `.lg { font: 10px sans-serif; fill: #57606a; }`,
    `@media (prefers-color-scheme: dark) {`,
    `  .ml, .dl, .lg { fill: #8b949e; }`,
    `  svg { background: #0d1117; border-radius: 6px; }`,
    `}`,
  );

  return css.join("\n");
};

// ─── Month label extraction ────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const getMonthLabels = (
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
