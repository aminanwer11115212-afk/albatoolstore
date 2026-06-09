import { useCallback, useEffect, useState, useRef } from "react";
import { userKey, onUserChange } from "@/lib/userScopedKey";
import { formFactorUserKey } from "@/lib/formFactorKey";
import { useFormFactor } from "@/hooks/useFormFactor";

const SCOPE = "zoom";
const MIN = 0.8;
const MAX = 1.6;
const STEP = 0.1;

function clamp(v: number) {
  return Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100));
}

function readKey(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 1;
    const n = parseFloat(raw);
    return isNaN(n) ? 1 : clamp(n);
  } catch {
    return 1;
  }
}

/**
 * Per-screen + per-user zoom level for items / tables.
 *
 * - `screenId`: stable identifier for the screen (e.g. `quote-create`).
 * - `target`: optional ref to the element that should receive the
 *   `--items-zoom` CSS variable. If omitted, falls back to `document.body`
 *   (legacy behavior) for backward compat with existing CSS that reads
 *   `body { --items-zoom }`.
 *
 * Migrates the legacy global `itemsZoom` localStorage key once, only if
 * the per-screen key has no value yet.
 */
export function useScreenZoom(
  screenId: string,
  target?: React.RefObject<HTMLElement | null>,
  cssVarName: string = "--items-zoom"
) {
  const keyRef = useRef(userKey(SCOPE, screenId));

  const [zoom, setZoom] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    // One-time migration from legacy global key (only for items-zoom users).
    try {
      const cur = localStorage.getItem(keyRef.current);
      if (cur === null && cssVarName === "--items-zoom") {
        const legacy = localStorage.getItem("itemsZoom");
        if (legacy !== null) {
          localStorage.setItem(keyRef.current, legacy);
        }
      }
    } catch { /* noop */ }
    return readKey(keyRef.current);
  });

  // Re-read when user changes (login/logout).
  useEffect(() => {
    return onUserChange(() => {
      keyRef.current = userKey(SCOPE, screenId);
      setZoom(readKey(keyRef.current));
    });
  }, [screenId]);

  // Apply CSS var to target (or body as fallback).
  useEffect(() => {
    const el = target?.current ?? document.body;
    try { el.style.setProperty(cssVarName, String(zoom)); } catch { /* noop */ }
    try { localStorage.setItem(keyRef.current, String(zoom)); } catch { /* noop */ }
    return () => {
      // Only clear if we set on a scoped target (not body).
      if (target?.current) {
        try { target.current.style.removeProperty(cssVarName); } catch { /* noop */ }
      }
    };
  }, [zoom, target, cssVarName]);

  const inc = useCallback(() => setZoom((z) => clamp(z + STEP)), []);
  const dec = useCallback(() => setZoom((z) => clamp(z - STEP)), []);
  const reset = useCallback(() => setZoom(1), []);

  return { zoom, inc, dec, reset };
}
