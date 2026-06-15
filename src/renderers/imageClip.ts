import { readFileSync } from "node:fs";
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
 * High-resolution image-clip renderer.
 *
 * The original image is embedded at full resolution as a base64 data URI
 * and clipped to the contribution-cell grid.  A single opacity @keyframes
 * on the <image> element toggles between "clean contribution graph" and
 * "hi-res image peeking through every cell window".
 */
export const generateImageClipSvg = (
  cells: Cell[],
  imagePath: string,
  opts: Partial<RenderOptions> = {},
): string => {
  const o = { ...defaults, ...opts };
  const layout = computeLayout(cells, o);
  const { margin, step, cellSize, cellRadius } = layout;

  const imageBase64 = readFileSync(imagePath).toString("base64");
  const imageDataUri = `data:image/png;base64,${imageBase64}`;

  const { totalMs, fadeOut, switchPt, fadeBack } = timing(o);

  const parts: string[] = [];

  parts.push(svgHeader(layout));

  // ── <defs> / <clipPath> ──────────────────────────────────────────
  parts.push(
    "<defs>",
    `  <clipPath id="gc">`,
  );
  for (const c of cells) {
    const x = margin + c.x * step;
    const y = margin + c.y * step;
    parts.push(
      `    <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${cellRadius}" />`,
    );
  }
  parts.push("  </clipPath>", "</defs>");

  // ── CSS ──────────────────────────────────────────────────────────
  parts.push(
    "<style>",
    `.cc { shape-rendering: geometricPrecision; }`,
    `.ci {`,
    `  animation: none ${totalMs}ms ease-in-out infinite;`,
    `}`,
    `.ci.a { animation-name: fi; }`,
    `@keyframes fi {`,
    `  0%, ${fadeOut.toFixed(1)}% { opacity: 0; }`,
    `  ${switchPt.toFixed(1)}%, ${fadeBack.toFixed(1)}% { opacity: 1; }`,
    `  100% { opacity: 0; }`,
    `}`,
    labelCss.trim(),
    "</style>",
  );

  parts.push(...monthLabelElements(cells, layout));
  parts.push(...dayLabelElements(layout));

  // ── Contribution layer (always visible, underneath) ──────────────
  for (const c of cells) {
    const x = margin + c.x * step;
    const y = margin + c.y * step;
    const fill = CONTRIB_COLORS[c.level] ?? CONTRIB_COLORS[0];
    parts.push(
      `<rect class="cc" x="${x}" y="${y}" ` +
        `width="${cellSize}" height="${cellSize}" rx="${cellRadius}" fill="${fill}" />`,
    );
  }

  // ── Image layer (clipped, animated opacity) ──────────────────────
  parts.push(
    `<image href="${imageDataUri}" ` +
      `x="${margin}" y="${margin}" ` +
      `width="${layout.gridW}" height="${layout.gridH}" ` +
      `clip-path="url(#gc)" ` +
      `class="ci a" ` +
      `preserveAspectRatio="xMidYMid slice" />`,
  );

  parts.push(...legendElements(layout));
  parts.push("</svg>");

  return parts.join("\n");
};
