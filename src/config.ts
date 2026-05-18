import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type Config = {
  github: { username: string; token: string };
  image: { path: string; blur_sigma: number };
  output: {
    file: string;
    cell_size: number;
    cell_gap: number;
    transition_ms: number;
    toggle_interval_ms: number;
  };
};

const defaults: Config = {
  github: { username: "platane", token: "" },
  image: { path: "", blur_sigma: 1.2 },
  output: {
    file: "output.svg",
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

  if (!existsSync(resolved)) {
    console.warn(`⚠ config.yml not found, using defaults`);
    return defaults;
  }

  const raw = readFileSync(resolved, "utf-8");
  return parseSimpleYaml(raw, defaults);
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

function parseValue(v: string): string | number {
  if (v === "" || v === '""' || v === "''") return "";
  // Remove surrounding quotes
  const unquoted = v.replace(/^["'](.*)["']$/, "$1");
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
