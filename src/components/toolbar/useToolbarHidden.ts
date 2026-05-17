import { useCallback, useEffect, useState } from "react";
import { isRetiredToolbarItem } from "./retiredItems";
import { toolbarStorageKey } from "./toolbarOwner";

/**
 * تخزين قائمة العناصر المخفية داخل FreePositionToolbar،
 * بحسب المستخدم + مفتاح الشاشة (مع ترحيل صامت من المفتاح القديم لكل جهاز).
 */
const PREFIX = "neobilling:toolbar-hidden:v1";
const EVENT = "neobilling:toolbar-hidden-changed";

function storageKey(screenKey: string) {
  return toolbarStorageKey(PREFIX, screenKey);
}

function read(screenKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(screenKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const list = parsed.filter(
        (x): x is string => typeof x === "string" && !isRetiredToolbarItem(x),
      );
      // Self-heal: if storage contained retired ids, persist the cleaned list.
      if (list.length !== parsed.length) {
        try {
          localStorage.setItem(storageKey(screenKey), JSON.stringify(list));
        } catch {
          /* noop */
        }
      }
      return list;
    }
  } catch {
    /* noop */
  }
  return [];
}

function write(screenKey: string, list: string[]) {
  try {
    localStorage.setItem(storageKey(screenKey), JSON.stringify(list));
  } catch {
    /* noop */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { screenKey } }));
  } catch {
    /* noop */
  }
}

export function useToolbarHidden(screenKey: string) {
  const [hidden, setHidden] = useState<string[]>(() => read(screenKey));

  useEffect(() => {
    const sync = (e: Event) => {
      const detail = (e as CustomEvent<{ screenKey: string }>).detail;
      if (!detail || detail.screenKey === screenKey) setHidden(read(screenKey));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(screenKey)) setHidden(read(screenKey));
    };
    window.addEventListener(EVENT, sync as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, sync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [screenKey]);

  const hide = useCallback(
    (id: string) => {
      if (isRetiredToolbarItem(id)) return;
      setHidden((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        write(screenKey, next);
        return next;
      });
    },
    [screenKey],
  );

  const show = useCallback(
    (id: string) => {
      setHidden((prev) => {
        const next = prev.filter((x) => x !== id);
        write(screenKey, next);
        return next;
      });
    },
    [screenKey],
  );

  const reset = useCallback(() => {
    setHidden([]);
    write(screenKey, []);
  }, [screenKey]);

  const isHidden = useCallback((id: string) => hidden.includes(id), [hidden]);

  return { hidden, hide, show, reset, isHidden };
}
