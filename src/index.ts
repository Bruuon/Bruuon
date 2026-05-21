import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { fetchContributions, fetchContributionsHtml } from "./fetchContributions";
import { processImage } from "./imageProcessor";
import { generateColorFillSvg } from "./renderers/colorFill";
import { generateImageClipSvg } from "./renderers/imageClip";
import { generateScatterSvg } from "./renderers/scatter";
import { cellsToGrid } from "./types";
import type { RenderMode } from "./types";
import { loadConfig } from "./config";

const config = loadConfig("config.yml");
const { github, image, blur, output } = config;
const mode: RenderMode = output.render_mode;
const blurSigma = blur.enabled ? blur.sigma : 0;

console.log(`📡 Fetching contribution data for "${github.username}"...`);

let cells;
if (github.token) {
  cells = await fetchContributions(github.username, github.token);
} else {
  console.log("   (no token — using HTML scraping, data precision limited)");
  console.log("   Set token in config.yml for exact contribution counts");
  cells = await fetchContributionsHtml(github.username);
}

const grid = cellsToGrid(cells);
console.log(`✅ Got ${cells.length} cells (${grid.width} weeks × ${grid.height} days)`);

// Use provided image or generate demo gradient
const imagePath = image.path || createDemoImage(grid.width, grid.height);

const svgOptions = {
  cellSize: output.cell_size,
  cellGap: output.cell_gap,
  transitionMs: output.transition_ms,
  toggleIntervalMs: output.toggle_interval_ms,
};

let svg: string;

if (mode === "imageClip") {
  console.log(`🖼  Mode: imageClip — embedding "${imagePath}" at full resolution`);
  svg = generateImageClipSvg(cells, imagePath, svgOptions);
} else if (mode === "scatter") {
  const S = Math.ceil(Math.sqrt(cells.length));
  if (blur.enabled) {
    console.log(`🖼  Mode: scatter (pixel) — processing "${imagePath}" to ${S}×${S} square (blur σ=${blur.sigma})`);
    const imageColors = await processImage(imagePath, S, S, blurSigma);
    svg = generateScatterSvg(cells, imageColors, svgOptions);
  } else {
    console.log(`🖼  Mode: scatter (highres) — embedding "${imagePath}" at full resolution`);
    const dummy = Array.from({ length: S }, () => Array(S).fill("#ebedf0"));
    svg = generateScatterSvg(cells, dummy, svgOptions, imagePath);
  }
} else {
  console.log(`🖼  Mode: colorFill — processing "${imagePath}" (blur ${blur.enabled ? `σ=${blur.sigma}` : "off"})`);
  const imageColors = await processImage(imagePath, grid.width, grid.height, blurSigma);
  svg = generateColorFillSvg(cells, imageColors, svgOptions);
}

writeFileSync(output.file, svg, "utf-8");
console.log(`✅ Written to ${output.file}`);
console.log(`   Mode: ${mode}  |  Open in browser to see the toggle animation.`);

// ─── Demo image generator ──────────────────────────────────────────────

function createDemoImage(w: number, h: number): string {
  const path = "demo-image.png";
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const hue = x / w;
      const vib = 0.7 + 0.2 * Math.sin(y * 2 + x * 0.5);
      const [r, g, b] = hslToRgb(hue, 0.8, vib);
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  writeFileSync(path, PNG.sync.write(png));
  return path;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
