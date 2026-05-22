import { readFileSync } from "node:fs";
import type { Cell } from "../types";
import {
  CONTRIB_COLORS,
  defaults,
  type RenderOptions,
  type Layout,
  computeLayout,
  monthLabelElements,
  dayLabelElements,
  labelCss,
  timing,
} from "./shared";

/**
 * Scatter / reassemble renderer.
 *
 * Phase 1 (0s–5s): cells sit at contribution-grid positions
 *                    filled with contribution-level colours.
 * Phase 2 (5s–10s): every cell glides to a square grid; together
 *                    they form the uploaded image.
 *
 * Two sub-modes:
 *   pixel   — image processed to S×S, each cell gets a single solid colour
 *   highres — full-res image embedded once; each cell carries its own
 *             image fragment via <use> offset so the fragment travels
 *             WITH the cell throughout the animation.
 */

type CellAnim = {
  cell: Cell;
  contribColor: string;
  imageColor: string;
  gridX: number;
  gridY: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
};

export const generateScatterSvg = (
  cells: Cell[],
  imageColors: string[][],
  opts: Partial<RenderOptions> = {},
  highResImagePath?: string,
): string => {
  const o = { ...defaults, ...opts };
  const gridLayout = computeLayout(cells, o);
  const { margin, step, cellSize, cellRadius, gridW } = gridLayout;

  const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date));
  const S = Math.ceil(Math.sqrt(sorted.length));
  const isHighRes = !!highResImagePath;

  // ── Square layout ─────────────────────────────────────────────────
  const squareStep = step;
  const squareWH = S * squareStep - o.cellGap;
  const squareLeft = margin + (gridW - squareWH) / 2;
  const squareTop = margin; // overlap: square starts at same y as grid

  const svgH = squareTop + squareWH + margin + gridLayout.labelH + 20;
  const fullLayout: Layout = { ...gridLayout, svgH };

  // ── Per-cell animation data ───────────────────────────────────────
  const anims: CellAnim[] = sorted.map((cell, i) => {
    const sx = squareLeft + (i % S) * squareStep;
    const sy = squareTop + Math.floor(i / S) * squareStep;
    return {
      cell,
      contribColor: CONTRIB_COLORS[cell.level] ?? CONTRIB_COLORS[0],
      imageColor: imageColors[i % S]?.[Math.floor(i / S)] ?? "#ebedf0",
      gridX: margin + cell.x * step,
      gridY: margin + cell.y * step,
      sx,
      sy,
      tx: sx - (margin + cell.x * step),
      ty: sy - (margin + cell.y * step),
    };
  });

  // ── Timing ────────────────────────────────────────────────────────
  const { totalMs, fadeOut, switchPt, fadeBack } = timing(o);
  const kt = (pct: number) => (pct / 100).toFixed(4);

  // ── Build SVG ────────────────────────────────────────────────────
  const parts: string[] = [];
  parts.push(
    `<svg viewBox="0 0 ${fullLayout.svgW} ${svgH}" width="${fullLayout.svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">`,
  );

  if (isHighRes) {
    // ── Highres: per-cell image fragment via <use> + SMIL ───────────
    const imageBase64 = readFileSync(highResImagePath!).toString("base64");
    const ext = highResImagePath!.split(".").pop()?.toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    const dataUri = `data:${mime};base64,${imageBase64}`;

    // Shared clipPath: single cell window at (0,0)
    // Shared image in defs, referenced by each cell via <use>
    parts.push(
      "<defs>",
      `<clipPath id="cw">`,
      `  <rect x="0" y="0" width="${cellSize}" height="${cellSize}" rx="${cellRadius}"/>`,
      `</clipPath>`,
      `<image id="img" x="0" y="0" width="${squareWH}" height="${squareWH}" ` +
        `preserveAspectRatio="xMidYMid slice" href="${dataUri}"/>`,
      "</defs>",
    );

    // Shared label/legend styles
    parts.push(
      "<style>",
      ".sll { font: 11px sans-serif; fill: #57606a; }",
      labelCss.trim(),
      "</style>",
    );
  } else {
    // ── Pixel: CSS grouping (unchanged) ─────────────────────────────
    const makeKey = (a: CellAnim) =>
      `${a.contribColor}|${a.imageColor}|${a.tx}|${a.ty}`;

    const groupMap = new Map<string, CellAnim[]>();
    for (const a of anims) {
      const key = makeKey(a);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(a);
    }
    const groups = [...groupMap.values()];

    parts.push("<style>", generatePixelCss(o, groups), "</style>");

    for (let i = 0; i < groups.length; i++) {
      for (const a of groups[i]) {
        parts.push(
          `<rect class="c t${i}" x="${a.gridX}" y="${a.gridY}" ` +
            `width="${cellSize}" height="${cellSize}" rx="${cellRadius}" />`,
        );
      }
    }
  }

  // ── Labels: fade out during square phase, fade in at grid ────────
  // Wrapped in a group with SMIL opacity animation; shared for both modes.
  const labelAnim =
    `<animate attributeName="opacity" ` +
    `values="1;1;0;0;1" ` +
    `keyTimes="0;${kt(fadeOut)};${kt(switchPt)};${kt(fadeBack)};1" ` +
    `dur="${totalMs}ms" repeatCount="indefinite"/>`;

  parts.push("<g>", labelAnim);
  parts.push(...monthLabelElements(cells, fullLayout));
  parts.push(...dayLabelElements(fullLayout));
  parts.push(
    `<text x="${margin}" y="${margin + gridLayout.gridH + 30}" class="sll">Contribution grid</text>`,
    `<text x="${margin + 120}" y="${margin + gridLayout.gridH + 30}" class="sll">Image</text>`,
  );
  parts.push("</g>"); // close label group before cells

  // ── Cell elements with SMIL animation (highres) ──────────────────
  if (isHighRes) {
    const fmt = (n: number) => n.toFixed(1);
    for (const a of anims) {
      // <use> offset: positions the image so the fragment at (sx,sy)
      // within the full image aligns with the cell window at (0,0)
      const ux = fmt(squareLeft - a.sx);
      const uy = fmt(squareTop - a.sy);

      parts.push(
        // Outer group: animateTransform moves it to absolute positions
        `<g>`,
        `  <animateTransform attributeName="transform" type="translate" ` +
          `values="${fmt(a.gridX)},${fmt(a.gridY)};${fmt(a.gridX)},${fmt(a.gridY)};${fmt(a.sx)},${fmt(a.sy)};${fmt(a.sx)},${fmt(a.sy)};${fmt(a.gridX)},${fmt(a.gridY)}" ` +
          `keyTimes="0;${kt(fadeOut)};${kt(switchPt)};${kt(fadeBack)};1" ` +
          `dur="${totalMs}ms" repeatCount="indefinite"/>`,
        // Inner group: shared clipPath clips to cell window at (0,0)
        `<g clip-path="url(#cw)">`,
        // Contribution-color rect at (0,0), fades out at square
        `  <rect x="0" y="0" width="${cellSize}" height="${cellSize}" rx="${cellRadius}" fill="${a.contribColor}">`,
        `    <animate attributeName="opacity" ` +
          `values="1;1;0;0;1" ` +
          `keyTimes="0;${kt(fadeOut)};${kt(switchPt)};${kt(fadeBack)};1" ` +
          `dur="${totalMs}ms" repeatCount="indefinite"/>`,
        `  </rect>`,
        // Image fragment at offset, fades in at square
        `  <use href="#img" x="${ux}" y="${uy}">`,
        `    <animate attributeName="opacity" ` +
          `values="0;0;1;1;0" ` +
          `keyTimes="0;${kt(fadeOut)};${kt(switchPt)};${kt(fadeBack)};1" ` +
          `dur="${totalMs}ms" repeatCount="indefinite"/>`,
        `  </use>`,
        `</g>`,
        `</g>`,
      );
    }
  }

  parts.push("<g>", labelAnim);
  parts.push(...scatterLegend(fullLayout));
  parts.push("</g>"); // close legend group
  parts.push("</svg>");
  return parts.join("\n");
};

// ── CSS (pixel mode only) ────────────────────────────────────────────

const generatePixelCss = (o: RenderOptions, groups: CellAnim[][]): string => {
  const { totalMs, fadeOut, switchPt, fadeBack } = timing(o);
  const css: string[] = [];

  css.push(
    `.c {`,
    `  animation: none ${totalMs}ms ease-in-out infinite;`,
    `}`,
  );

  for (let i = 0; i < groups.length; i++) {
    const a = groups[i][0];
    css.push(
      `.c.t${i} { animation-name: k${i}; }`,
      `@keyframes k${i} {`,
      `  0%, ${fadeOut.toFixed(1)}% {`,
      `    transform: translate(0px, 0px);`,
      `    fill: ${a.contribColor};`,
      `  }`,
      `  ${switchPt.toFixed(1)}%, ${fadeBack.toFixed(1)}% {`,
      `    transform: translate(${a.tx}px, ${a.ty}px);`,
      `    fill: ${a.imageColor};`,
      `  }`,
      `  100% {`,
      `    transform: translate(0px, 0px);`,
      `    fill: ${a.contribColor};`,
      `  }`,
      `}`,
    );
  }

  css.push(`.sll { font: 11px sans-serif; fill: #57606a; }`, labelCss.trim());
  return css.join("\n");
};

// ── Legend ───────────────────────────────────────────────────────────

const scatterLegend = (layout: Layout): string[] => {
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
