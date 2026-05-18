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
 * Generate an animated SVG where the contribution grid smoothly crossfades
 * into an image-mapped version every N seconds.
 *
 * Uses pure CSS animation (opacity crossfade between two layers) because
 * GitHub README strips <script> tags from SVGs.
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

  // ─── Build SVG ──────────────────────────────────────────────────────

  const parts: string[] = [];

  parts.push(
    `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">`,
  );

  parts.push("<style>", generateStyles(o), "</style>");

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

  // ─── Two layers: contribution (visible first) + image (hidden first) ──

  parts.push('<g class="layer-c">');
  for (const c of cells) {
    const color = CONTRIB_COLORS[c.level] ?? CONTRIB_COLORS[0];
    parts.push(cellRect(c.x, c.y, color, margin, step, cellSize, cellRadius));
  }
  parts.push("</g>");

  parts.push('<g class="layer-i">');
  for (const c of cells) {
    const color = imageColors[c.x]?.[c.y] ?? CONTRIB_COLORS[0];
    parts.push(cellRect(c.x, c.y, color, margin, step, cellSize, cellRadius));
  }
  parts.push("</g>");

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

// ─── Rect helper ──────────────────────────────────────────────────────

const cellRect = (
  x: number,
  y: number,
  color: string,
  margin: number,
  step: number,
  size: number,
  radius: number,
) =>
  `<rect x="${margin + x * step}" y="${margin + y * step}" ` +
  `width="${size}" height="${size}" rx="${radius}" fill="${color}" />`;

// ─── CSS Styles (pure animation, no JS) ────────────────────────────────

const generateStyles = (o: Options) => {
  // Timeline for a full cycle (2 × toggleIntervalMs):
  //
  //   0%      35%     50%            85%     100%
  //   |--------|-------|--------------|--------|
  //   contrib  fade→  image visible   fade→   loop
  //   visible         (3.5s)          back
  //
  const totalMs = o.toggleIntervalMs * 2;
  const fadeOut = ((o.toggleIntervalMs - o.transitionMs) / totalMs) * 100;
  const switchPt = (o.toggleIntervalMs / totalMs) * 100;
  const fadeBack = ((totalMs - o.transitionMs) / totalMs) * 100;

  return `
    .layer-c {
      animation: animC ${totalMs}ms ease-in-out infinite;
    }
    .layer-i {
      animation: animI ${totalMs}ms ease-in-out infinite;
    }

    @keyframes animC {
      0%, ${fadeOut.toFixed(1)}% { opacity: 1; }
      ${switchPt.toFixed(1)}%, ${fadeBack.toFixed(1)}% { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes animI {
      0%, ${fadeOut.toFixed(1)}% { opacity: 0; }
      ${switchPt.toFixed(1)}%, ${fadeBack.toFixed(1)}% { opacity: 1; }
      100% { opacity: 0; }
    }

    .ml { font: 10px sans-serif; fill: #57606a; }
    .dl { font: 10px sans-serif; fill: #57606a; text-anchor: end; }
    .lg { font: 10px sans-serif; fill: #57606a; }

    @media (prefers-color-scheme: dark) {
      .ml, .dl, .lg { fill: #8b949e; }
      svg { background: #0d1117; border-radius: 6px; }
    }
  `;
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
