import type { Cell } from "../types";
import {
  CONTRIB_COLORS,
  defaults,
  type RenderOptions,
  computeLayout,
  svgHeader,
  monthLabelElements,
  dayLabelElements,
  labelCss,
  legendElements,
  timing,
} from "./shared";

/**
 * Per-pair @keyframes renderer.
 *
 * Each cell's fill animates between its contribution color and the
 * corresponding image color from the processed (blurred) pixel map.
 * One @keyframes per unique (contribColor, imageColor) pair —
 * same proven strategy as snk, works in GitHub's <img>-tag rendering.
 */
export const generateColorFillSvg = (
  cells: Cell[],
  imageColors: string[][],
  opts: Partial<RenderOptions> = {},
): string => {
  const o = { ...defaults, ...opts };
  const layout = computeLayout(cells, o);
  const { margin, step, cellSize, cellRadius } = layout;

  // Group cells by unique (contribColor, imageColor) pairs
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

  const parts: string[] = [];

  parts.push(svgHeader(layout));
  parts.push("<style>", generateCss(o, pairs), "</style>");
  parts.push(...monthLabelElements(cells, layout));
  parts.push(...dayLabelElements(layout));

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

  parts.push(...legendElements(layout));
  parts.push("</svg>");

  return parts.join("\n");
};

const generateCss = (
  o: RenderOptions,
  pairs: { contrib: string; image: string }[],
) => {
  const { totalMs, fadeOut, switchPt, fadeBack } = timing(o);
  const css: string[] = [];

  css.push(
    `.c {`,
    `  animation: none ${totalMs}ms ease-in-out infinite;`,
    `  shape-rendering: geometricPrecision;`,
    `}`,
  );

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

  css.push(labelCss.trim());
  return css.join("\n");
};
