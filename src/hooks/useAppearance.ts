import { useState, useEffect, useCallback } from "react";

export type ThemeColor = "orange" | "blue" | "green" | "purple";
export type FontSize = "small" | "medium" | "large";
export type ThemeMode = "light" | "dark";

export interface AppearanceSettings {
  color: ThemeColor;
  fontSize: FontSize;
  mode: ThemeMode;
  showSidebar: boolean;
  showFloatingTools: boolean;
}

const STORAGE_KEY = "albatoul_appearance";

const DEFAULTS: AppearanceSettings = {
  color: "orange",
  fontSize: "medium",
  mode: "light",
  showSidebar: true,
  showFloatingTools: true,
};

// HSL values (no `hsl()` wrapper) for `--primary`, `--accent`, `--ring`, `--sidebar-accent`
const COLOR_TOKENS: Record<ThemeColor, { primary: string; accent: string }> = {
  orange: { primary: "25 95% 53%", accent: "25 90% 48%" },
  blue:   { primary: "217 91% 60%", accent: "217 85% 52%" },
  green:  { primary: "142 71% 45%", accent: "142 65% 38%" },
  purple: { primary: "262 83% 58%", accent: "262 75% 50%" },
};

const FONT_SCALE: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

function readStorage(): AppearanceSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Fall back to legacy theme key for dark mode
      const legacy = localStorage.getItem("albatoul_theme");
      const prefersDark =
        window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
      return {
        ...DEFAULTS,
        mode: legacy === "dark" || legacy === "light"
          ? (legacy as ThemeMode)
          : prefersDark ? "dark" : "light",
      };
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function applyAppearance(s: AppearanceSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Dark / light
  root.classList.toggle("dark", s.mode === "dark");

  // Color tokens
  const tokens = COLOR_TOKENS[s.color] ?? COLOR_TOKENS.orange;
  root.style.setProperty("--primary", tokens.primary);
  root.style.setProperty("--accent", tokens.accent);
  root.style.setProperty("--ring", tokens.primary);
  root.style.setProperty("--sidebar-accent", tokens.primary);
  root.style.setProperty("--sidebar-ring", tokens.primary);

  // Font size — applied at root so rem cascades everywhere (web + native webview)
  root.style.fontSize = FONT_SCALE[s.fontSize] ?? FONT_SCALE.medium;

  // Body classes for visibility toggles
  document.body.classList.toggle("hide-sidebar", !s.showSidebar);
  document.body.classList.toggle("hide-floating-tools", !s.showFloatingTools);

  // Mobile theme color (status bar on Android Chrome, iOS PWA)
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = `hsl(${tokens.primary})`;
}

let listeners: Array<(s: AppearanceSettings) => void> = [];
let current: AppearanceSettings = readStorage();
applyAppearance(current);

function setGlobal(next: AppearanceSettings) {
  current = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  applyAppearance(next);
  listeners.forEach((fn) => fn(next));
}

export function useAppearance() {
  const [state, setState] = useState<AppearanceSettings>(current);

  useEffect(() => {
    const fn = (s: AppearanceSettings) => setState(s);
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }, []);

  const update = useCallback((patch: Partial<AppearanceSettings>) => {
    setGlobal({ ...current, ...patch });
  }, []);

  const reset = useCallback(() => setGlobal(DEFAULTS), []);

  return { settings: state, update, reset };
}
