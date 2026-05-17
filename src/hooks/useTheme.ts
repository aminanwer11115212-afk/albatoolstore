import { useCallback } from "react";
import { useAppearance } from "./useAppearance";

/**
 * Backwards-compat wrapper around useAppearance for the dark/light toggle
 * used by the navbar. The single source of truth is useAppearance.
 */
export function useTheme() {
  const { settings, update } = useAppearance();
  const toggleTheme = useCallback(() => {
    update({ mode: settings.mode === "dark" ? "light" : "dark" });
  }, [settings.mode, update]);

  return {
    theme: settings.mode,
    toggleTheme,
    isDark: settings.mode === "dark",
  };
}
