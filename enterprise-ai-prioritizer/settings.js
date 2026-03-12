import { DEFAULT_CONFIG, mergeWithDefaultConfig } from "./decision-engine.js";

export const CONFIG_STORAGE_KEY = "ai-architect-decision-workbench.config.v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getDefaultConfig() {
  return clone(DEFAULT_CONFIG);
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
      return getDefaultConfig();
    }
    const parsed = JSON.parse(raw);
    return mergeWithDefaultConfig(parsed);
  } catch {
    return getDefaultConfig();
  }
}

export function saveConfig(config) {
  const merged = mergeWithDefaultConfig(config);
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function resetConfig() {
  localStorage.removeItem(CONFIG_STORAGE_KEY);
  return getDefaultConfig();
}
