import { readFile } from "node:fs/promises";
import path from "node:path";

let loaded = false;

/** Loads the workspace .env file without ever logging its values. */
export async function loadEnvironment() {
  if (loaded) return;
  loaded = true;
  for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")]) {
    try {
      const contents = await readFile(candidate, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (value && !process.env[key]) process.env[key] = value;
    }
      return;
    } catch {
      // Try the next conventional workspace location.
    }
  }
  // Local demo mode remains available when no .env file has been created.
}

export function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment setting: ${name}`);
  return value;
}

export function hasSupabaseConfiguration() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasSupabaseAuthConfiguration() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_PUBLISHABLE_KEY);
}
