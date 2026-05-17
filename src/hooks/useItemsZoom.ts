import { useCallback, useEffect, useState } from "react";

const KEY = "itemsZoom";
const MIN = 0.8;
const MAX = 1.6;
const STEP = 0.1;

function clamp(v: number) {
  return Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100));
}

function read(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 1;
    const n = parseFloat(raw);
    return isNaN(n) ? 1 : clamp(n);
  } catch {
    return 1;
  }
}

function apply(v: number) {
  try {
    document.body.style.setProperty("--items-zoom", String(v));
  } catch {
    /* noop */
  }
}

export function useItemsZoom() {
  const [zoom, setZoom] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const v = read();
    apply(v);
    return v;
  });

  useEffect(() => {
    apply(zoom);
    try {
      localStorage.setItem(KEY, String(zoom));
    } catch {
      /* noop */
    }
  }, [zoom]);

  const inc = useCallback(() => setZoom((z) => clamp(z + STEP)), []);
  const dec = useCallback(() => setZoom((z) => clamp(z - STEP)), []);
  const reset = useCallback(() => setZoom(1), []);

  return { zoom, inc, dec, reset };
}
