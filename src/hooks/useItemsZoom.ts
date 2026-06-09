import { useCallback, useEffect, useState } from "react";
import { formFactorKey } from "@/lib/formFactorKey";
import { useFormFactor } from "@/hooks/useFormFactor";

const LEGACY_KEY = "itemsZoom";
const MIN = 0.8;
const MAX = 1.6;
const STEP = 0.1;

function clamp(v: number) {
  return Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100));
}

function currentKey(): string {
  return formFactorKey("ui", "items-zoom");
}

function read(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 1;
    const n = parseFloat(raw);
    return isNaN(n) ? 1 : clamp(n);
  } catch {
    return 1;
  }
}

function migrate(key: string) {
  try {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(key) !== null) return;
    // Desktop-only inheritance from un-namespaced legacy.
    if (!key.includes(":ff:desktop:")) return;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null) localStorage.setItem(key, legacy);
  } catch { /* noop */ }
}

function apply(v: number) {
  try {
    document.body.style.setProperty("--items-zoom", String(v));
  } catch {
    /* noop */
  }
}

export function useItemsZoom() {
  const ff = useFormFactor();
  const [key, setKey] = useState<string>(() => {
    const k = currentKey();
    migrate(k);
    return k;
  });
  const [zoom, setZoom] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const v = read(currentKey());
    apply(v);
    return v;
  });

  useEffect(() => {
    const k = currentKey();
    migrate(k);
    setKey(k);
    const v = read(k);
    apply(v);
    setZoom(v);
  }, [ff]);

  useEffect(() => {
    apply(zoom);
    try {
      localStorage.setItem(key, String(zoom));
    } catch {
      /* noop */
    }
  }, [zoom, key]);

  const inc = useCallback(() => setZoom((z) => clamp(z + STEP)), []);
  const dec = useCallback(() => setZoom((z) => clamp(z - STEP)), []);
  const reset = useCallback(() => setZoom(1), []);

  return { zoom, inc, dec, reset };
}
