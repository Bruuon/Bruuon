import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { fetchContributions, fetchContributionsHtml } from "./fetchContributions";
import { processImage } from "./imageProcessor";
import { generateSvg } from "./generateSvg";
import { cellsToGrid } from "./types";
import { loadConfig } from "./config";

const config = loadConfig("config.yml");
const { github, image, output } = config;

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
console.log(`🖼  Processing image: ${imagePath}  (blur σ=${image.blur_sigma})`);

const imageColors = await processImage(imagePath, grid.width, grid.height, image.blur_sigma);

console.log(`🎨 Generating SVG...`);
const svg = generateSvg(cells, imageColors, {
  cellSize: output.cell_size,
  cellGap: output.cell_gap,
  transitionMs: output.transition_ms,
  toggleIntervalMs: output.toggle_interval_ms,
});

writeFileSync(output.file, svg, "utf-8");
console.log(`✅ Written to ${output.file}`);
console.log(`   Open it in a browser to see the animated toggle effect.`);

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
