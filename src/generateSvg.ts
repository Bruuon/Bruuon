import type { Cell } from "./types";

// GitHub's standard contribution color palette (light mode)
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
 * Generate an animated SVG where each contribution cell smoothly transitions
 * between real contribution colors and image-derived colors every 5 seconds.
 */
export const generateSvg = (
  cells: Cell[],
  imageColors: string[][],
  opts: Partial<Options> = {},
): string => {
  const o = { ...defaults, ...opts };
  const { cellSize, cellGap, cellRadius, toggleIntervalMs } = o;

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

  // Build day-of-week labels (show only Mon, Wed, Fri when those rows exist)
  const dayLabels = [
    { y: 0, label: "Sun" },
    { y: 1, label: "Mon" },
    { y: 2, label: "Tue" },
    { y: 3, label: "Wed" },
    { y: 4, label: "Thu" },
    { y: 5, label: "Fri" },
    { y: 6, label: "Sat" },
  ].filter((_, i) => i % 2 === 1); // Show only odd rows: Mon, Wed, Fri

  // ─── Build SVG ──────────────────────────────────────────────────────

  const parts: string[] = [];

  parts.push(
    `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">`,
  );

  // Dark mode support
  parts.push("<style>", generateStyles(o, width, height), "</style>");

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

  // Cell rects
  for (const c of cells) {
    const contribColor = CONTRIB_COLORS[c.level] ?? CONTRIB_COLORS[0];
    const imgColor = imageColors[c.x]?.[c.y] ?? contribColor;
    const x = margin + c.x * step;
    const y = margin + c.y * step;

    parts.push(
      `<rect class="c" x="${x}" y="${y}" ` +
        `width="${cellSize}" height="${cellSize}" rx="${cellRadius}" ` +
        `style="--c:${contribColor};--i:${imgColor}" />`,
    );
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

  // Embedded toggle script
  parts.push(
    "<script type='text/javascript'><![CDATA[",
    `  var s=document.querySelector('svg');`,
    `  setInterval(function(){s.classList.toggle('i')},${toggleIntervalMs});`,
    "]]></script>",
  );

  parts.push("</svg>");

  return parts.join("\n");
};

// ─── CSS Styles ───────────────────────────────────────────────────────

const generateStyles = (o: Options, _w: number, _h: number) => `
  .c {
    fill: var(--c);
    transition: fill ${o.transitionMs}ms ease-in-out;
    shape-rendering: geometricPrecision;
  }
  svg.i .c {
    fill: var(--i);
  }
  .ml { font: 10px sans-serif; fill: #57606a; }
  .dl { font: 10px sans-serif; fill: #57606a; text-anchor: end; }
  .lg { font: 10px sans-serif; fill: #57606a; }

  @media (prefers-color-scheme: dark) {
    .c {
      fill: var(--c);
      transition: fill ${o.transitionMs}ms ease-in-out;
    }
    svg.i .c {
      fill: var(--i);
    }
    .ml, .dl, .lg { fill: #8b949e; }
    svg { background: #0d1117; border-radius: 6px; }
  }
`;

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
