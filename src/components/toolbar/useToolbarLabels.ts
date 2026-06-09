import { useCallback, useEffect, useState } from "react";
import { isRetiredToolbarItem } from "./retiredItems";
import { toolbarStorageKey, useToolbarOwnerToken } from "./toolbarOwner";

/**
 * تخزين تسميات قابلة للتعديل للعناصر داخل FreePositionToolbar،
 * بحسب المستخدم + مفتاح الشاشة (مع ترحيل صامت من المفتاح القديم لكل جهاز).
 */
const PREFIX = "neobilling:toolbar-labels:v1";
const EVENT = "neobilling:toolbar-labels-changed";

function storageKey(screenKey: string) {
  return toolbarStorageKey(PREFIX, screenKey);
}

export type LabelMap = Record<string, string>;

function read(screenKey: string): LabelMap {
  try {
    const raw = localStorage.getItem(storageKey(screenKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const cleaned: LabelMap = {};
      let removed = 0;
      for (const [k, v] of Object.entries(parsed as LabelMap)) {
        if (isRetiredToolbarItem(k)) {
          removed++;
          continue;
        }
        cleaned[k] = v;
      }
      if (removed > 0) {
        try {
          localStorage.setItem(storageKey(screenKey), JSON.stringify(cleaned));
        } catch {
          /* noop */
        }
      }
      return cleaned;
    }
  } catch {
    /* noop */
  }
  return {};
}

function write(screenKey: string, map: LabelMap) {
  try {
    localStorage.setItem(storageKey(screenKey), JSON.stringify(map));
  } catch {
    /* noop */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { screenKey } }));
  } catch {
    /* noop */
  }
}

export function useToolbarLabels(screenKey: string) {
  const ownerToken = useToolbarOwnerToken();
  const [labels, setLabels] = useState<LabelMap>(() => read(screenKey));

  useEffect(() => {
    setLabels(read(screenKey));
    const sync = (e: Event) => {
      const detail = (e as CustomEvent<{ screenKey: string }>).detail;
      if (!detail || detail.screenKey === screenKey) {
        setLabels(read(screenKey));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(screenKey)) setLabels(read(screenKey));
    };
    window.addEventListener(EVENT, sync as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, sync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [screenKey, ownerToken]);

  const setLabel = useCallback(
    (id: string, value: string | null) => {
      if (isRetiredToolbarItem(id)) return;
      setLabels((prev) => {
        const next = { ...prev };
        if (value === null || value === "") delete next[id];
        else next[id] = value;
        write(screenKey, next);
        return next;
      });
    },
    [screenKey],
  );

  const reset = useCallback(() => {
    setLabels({});
    write(screenKey, {});
  }, [screenKey]);

  const getLabel = useCallback(
    (id: string, fallback: string) => labels[id] ?? fallback,
    [labels],
  );

  return { labels, setLabel, reset, getLabel };
}
