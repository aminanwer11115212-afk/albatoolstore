import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type BarApi = {
  removeItem: (id: string) => void;
  insertItem: (id: string, beforeId?: string) => void;
  resetOrder: () => void;
};

interface Ctx {
  customizing: boolean;
  toggleCustomizing: () => void;
  registerBar: (key: string, api: BarApi) => () => void;
  resetAll: () => void;
  /** Move a button from one bar to another (or to the same bar). beforeId is target item; undefined = end. */
  moveAcross: (
    fromBar: string,
    toBar: string,
    itemId: string,
    beforeId?: string,
  ) => void;
}

const ToolbarCustomizationContext = createContext<Ctx | null>(null);

// مفتاح موحّد عالمي — لا يعتمد على الجهاز ولا على الصفحة. زر التخصيص واحد للجميع.
const GLOBAL_CUSTOMIZING_KEY = "neobilling:toolbar-customizing:global:v1";
const CUSTOMIZING_EVENT = "neobilling:toolbar-customizing-changed";

function readCustomizing(): boolean {
  try {
    return localStorage.getItem(GLOBAL_CUSTOMIZING_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCustomizing(value: boolean) {
  try {
    localStorage.setItem(GLOBAL_CUSTOMIZING_KEY, value ? "1" : "0");
  } catch {
    /* noop */
  }
  try {
    window.dispatchEvent(new CustomEvent(CUSTOMIZING_EVENT, { detail: value }));
  } catch {
    /* noop */
  }
}

export function ToolbarCustomizationProvider({
  children,
  storageKey,
}: {
  children: React.ReactNode;
  /** (متروك للتوافق فقط — لم يَعُد يؤثر؛ زر التخصيص أصبح موحّداً عالمياً.) */
  storageKey?: string;
}) {
  void storageKey;
  const [customizing, setCustomizing] = useState<boolean>(() => readCustomizing());
  const barsRef = useRef<Map<string, BarApi>>(new Map());

  // مزامنة مع باقي الـ Providers في نفس الصفحة + بين التبويبات
  useEffect(() => {
    const onCustom = (e: Event) => {
      const v = (e as CustomEvent<boolean>).detail;
      setCustomizing((prev) => (prev === v ? prev : !!v));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === GLOBAL_CUSTOMIZING_KEY) {
        setCustomizing(e.newValue === "1");
      }
    };
    window.addEventListener(CUSTOMIZING_EVENT, onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CUSTOMIZING_EVENT, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggleCustomizing = useCallback(() => {
    setCustomizing((c) => {
      const next = !c;
      writeCustomizing(next);
      return next;
    });
  }, []);

  const registerBar = useCallback((key: string, api: BarApi) => {
    barsRef.current.set(key, api);
    return () => {
      barsRef.current.delete(key);
    };
  }, []);

  const resetAll = useCallback(() => {
    barsRef.current.forEach((api) => api.resetOrder());
  }, []);

  const moveAcross = useCallback(
    (fromBar: string, toBar: string, itemId: string, beforeId?: string) => {
      const from = barsRef.current.get(fromBar);
      const to = barsRef.current.get(toBar);
      if (!from || !to) return;
      if (fromBar === toBar) {
        // same bar: insert handles re-position
        to.insertItem(itemId, beforeId);
        return;
      }
      from.removeItem(itemId);
      to.insertItem(itemId, beforeId);
    },
    [],
  );

  const value = useMemo<Ctx>(
    () => ({ customizing, toggleCustomizing, registerBar, resetAll, moveAcross }),
    [customizing, toggleCustomizing, registerBar, resetAll, moveAcross],
  );

  // Exit customizing on Escape
  useEffect(() => {
    if (!customizing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCustomizing(false);
        writeCustomizing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customizing]);

  return (
    <ToolbarCustomizationContext.Provider value={value}>
      {children}
    </ToolbarCustomizationContext.Provider>
  );
}

export function useToolbarCustomization(): Ctx | null {
  return useContext(ToolbarCustomizationContext);
}
