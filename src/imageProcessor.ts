import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

type RawImage = { data: Uint8Array; width: number; height: number };

const decodeImage = (buf: Buffer): RawImage => {
  // PNG magic: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const png = PNG.sync.read(buf);
    return { data: png.data, width: png.width, height: png.height };
  }
  // JPEG magic: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const raw = jpeg.decode(buf, { useTArray: true });
    return { data: raw.data, width: raw.width, height: raw.height };
  }
  throw new Error("Unsupported image format (only PNG / JPEG accepted)");
};

/**
 * Process an image for contribution-grid mapping:
 * 1. Crop to match grid aspect ratio (center cover)
 * 2. Resize to exact grid dimensions (1 pixel = 1 cell)
 * 3. Apply separable Gaussian blur to smooth color transitions
 * 4. Return 2D array of hex colors: colors[x][y]
 */
export const processImage = async (
  imagePath: string,
  gridWidth: number,
  gridHeight: number,
  sigma: number = 1.2,
): Promise<string[][]> => {
  const buf = readFileSync(imagePath);
  const img = decodeImage(buf);

  const resized = resizeCover(img, gridWidth, gridHeight);
  const blurred = gaussianBlur(resized.data, gridWidth, gridHeight, 4, sigma);

  const colors: string[][] = [];
  for (let x = 0; x < gridWidth; x++) {
    colors[x] = [];
    for (let y = 0; y < gridHeight; y++) {
      const i = (y * gridWidth + x) * 4;
      colors[x][y] = toHex(
        blurred[i],
        blurred[i + 1],
        blurred[i + 2],
        blurred[i + 3] / 255,
      );
    }
  }

  return colors;
};

// ─── Resize with center-cover crop ─────────────────────────────────────

const resizeCover = (
  img: RawImage,
  targetW: number,
  targetH: number,
): { data: Uint8ClampedArray; width: number; height: number } => {
  const srcW = img.width;
  const srcH = img.height;
  const targetAspect = targetW / targetH;
  const srcAspect = srcW / srcH;

  let cropW: number, cropH: number, offX: number, offY: number;

  if (srcAspect > targetAspect) {
    cropH = srcH;
    cropW = Math.round(srcH * targetAspect);
    offX = Math.floor((srcW - cropW) / 2);
    offY = 0;
  } else {
    cropW = srcW;
    cropH = Math.round(srcW / targetAspect);
    offX = 0;
    offY = Math.floor((srcH - cropH) / 2);
  }

  const out = new Uint8ClampedArray(targetW * targetH * 4);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const sx = offX + ((x + 0.5) / targetW) * cropW;
      const sy = offY + ((y + 0.5) / targetH) * cropH;
      sampleBilinear(img.data, srcW, srcH, sx, sy, out, (y * targetW + x) * 4);
    }
  }

  return { data: out, width: targetW, height: targetH };
};

const sampleBilinear = (
  src: Uint8Array,
  srcW: number,
  srcH: number,
  x: number,
  y: number,
  dst: Uint8ClampedArray,
  off: number,
) => {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(x0 + 1, srcW - 1);
  const y1 = Math.min(y0 + 1, srcH - 1);
  const fx = x - x0;
  const fy = y - y0;

  for (let c = 0; c < 4; c++) {
    const v00 = src[(y0 * srcW + x0) * 4 + c];
    const v10 = src[(y0 * srcW + x1) * 4 + c];
    const v01 = src[(y1 * srcW + x0) * 4 + c];
    const v11 = src[(y1 * srcW + x1) * 4 + c];

    dst[off + c] = Math.round(
      v00 * (1 - fx) * (1 - fy) +
        v10 * fx * (1 - fy) +
        v01 * (1 - fx) * fy +
        v11 * fx * fy,
    );
  }
};

// ─── Separable Gaussian blur ───────────────────────────────────────────

const gaussianBlur = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
  sigma: number,
): Uint8ClampedArray => {
  if (sigma <= 0) return data; // no blur — pixel-perfect mosaic
  const kernel = createKernel(sigma);
  const radius = Math.floor(kernel.length / 2);

  // Use float accumulator to avoid rounding losses between passes
  const tmp = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) tmp[i] = data[i];

  const mid = new Float64Array(data.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const nx = x + k;
          if (nx < 0 || nx >= width) continue;
          sum += tmp[(y * width + nx) * channels + c] * kernel[k + radius];
        }
        mid[(y * width + x) * channels + c] = sum;
      }
    }
  }

  // Vertical pass
  const dst = new Uint8ClampedArray(data.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const ny = y + k;
          if (ny < 0 || ny >= height) continue;
          sum += mid[(ny * width + x) * channels + c] * kernel[k + radius];
        }
        dst[(y * width + x) * channels + c] = Math.round(
          Math.max(0, Math.min(255, sum)),
        );
      }
    }
  }

  return dst;
};

const createKernel = (sigma: number): number[] => {
  // sigma = 0 means no blur — identity kernel
  if (sigma <= 0) return [1];
  const radius = Math.ceil(sigma * 2.5);
  const k: number[] = [];
  let sum = 0;
  for (let x = -radius; x <= radius; x++) {
    const v = Math.exp(-(x * x) / (2 * sigma * sigma));
    k.push(v);
    sum += v;
  }
  return k.map((v) => v / sum);
};

// ─── Helpers ────────────────────────────────────────────────────────────

const toHex = (r: number, g: number, b: number, a: number): string => {
  if (a <= 0.05) return "#ebedf0";
  const hex = [r, g, b]
    .map((c) => Math.round(c).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
};
