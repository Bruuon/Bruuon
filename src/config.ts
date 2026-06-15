import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type Config = {
  github: { username: string; token: string };
  image: { path: string };
  blur: { enabled: boolean; sigma: number };
  output: {
    file: string;
    render_mode: "colorFill" | "imageClip" | "scatter";
    cell_size: number;
    cell_gap: number;
    transition_ms: number;
    toggle_interval_ms: number;
  };
};

const defaults: Config = {
  github: { username: "platane", token: "" },
  image: { path: "" },
  blur: { enabled: true, sigma: 1.2 },
  output: {
    file: "output.svg",
    render_mode: "colorFill",
    cell_size: 12,
    cell_gap: 2,
    transition_ms: 1500,
    toggle_interval_ms: 5000,
  },
};

/**
 * Load config from a simple YAML file (or JSON).
 * Only handles the flat structure we need — no dependency required.
 */
export const loadConfig = (path = "config.yml"): Config => {
  const resolved = resolve(path);
  let config = structuredClone(defaults);

  if (existsSync(resolved)) {
    const raw = readFileSync(resolved, "utf-8");
    config = parseSimpleYaml(raw, defaults);
  } else {
    console.warn("⚠ config.yml not found, using defaults + env vars");
  }

  // ── Backward compat: old `image.blur_sigma` → new `blur` section ──
  const legacySigma = (config as any).image?.blur_sigma;
  if (legacySigma !== undefined) {
    console.warn("⚠ image.blur_sigma is deprecated — move it to `blur:` section (see config.example.yml)");
    config.blur.enabled = Number(legacySigma) > 0;
    config.blur.sigma = Number(legacySigma);
    delete (config as any).image.blur_sigma;
  }

  // Environment variables override config file values (for CI/CD)
  config.github.username = process.env.SP_GITHUB_USERNAME || config.github.username;
  config.github.token = process.env.SP_GITHUB_TOKEN || config.github.token;
  config.image.path = process.env.SP_IMAGE_PATH || config.image.path;
  if (process.env.SP_BLUR_ENABLED) config.blur.enabled = process.env.SP_BLUR_ENABLED !== "false";
  if (process.env.SP_BLUR_SIGMA) config.blur.sigma = Number(process.env.SP_BLUR_SIGMA);
  if (process.env.SP_OUTPUT_FILE) config.output.file = process.env.SP_OUTPUT_FILE;
  if (process.env.SP_RENDER_MODE) config.output.render_mode = process.env.SP_RENDER_MODE as Config["output"]["render_mode"];

  return config;
};

// ─── Minimal YAML parser (handles our config format) ───────────────────

function parseSimpleYaml(raw: string, fallback: Config): Config {
  const config = structuredClone(fallback);

  const lines = raw.split("\n");
  let section: string | null = null;

  for (const line of lines) {
    // Skip comments and blank lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Section header: e.g. "github:"
    const sectionMatch = trimmed.match(/^(\w+):\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    // Key: value
    const kv = trimmed.match(/^(\w+):\s*(.+)$/);
    if (kv && section) {
      const [, key, rawValue] = kv;
      const value = rawValue.trim();
      setNested(config, [section, key], parseValue(value));
    }
  }

  return config;
}

function parseValue(v: string): string | number | boolean {
  if (v === "" || v === '""' || v === "''") return "";
  // Remove surrounding quotes
  const unquoted = v.replace(/^["'](.*)["']$/, "$1");
  if (unquoted === "true" || unquoted === "false") return unquoted === "true";
  const num = Number(unquoted);
  return isNaN(num) ? unquoted : num;
}

function setNested(obj: any, keys: string[], value: any) {
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}
