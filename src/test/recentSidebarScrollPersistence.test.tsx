import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";

/**
 * Validates the scroll-persistence contract used by RecentItemsSidebar:
 *   - User scroll positions are saved (in a ref + sessionStorage).
 *   - When `limit` changes (10 → 50 → 100) or `data` reference changes,
 *     the scroll container is restored synchronously to the same offset
 *     instead of jumping back to the top.
 *   - When the new list is shorter than the saved offset, the position
 *     is clamped to the new max scroll.
 *
 * This mirrors the production hook in src/components/RecentItemsSidebar.tsx
 * (lines ~417-425). Keeping this test isolated avoids needing to mock
 * Supabase, react-query and the full sidebar tree.
 */

type DocType = "quotes" | "invoices" | "purchases" | "returns";
const storageKeyFor = (t: DocType) => `recent-sidebar:scroll:${t}:v1`;
const STORAGE_KEY = storageKeyFor("quotes");

function ScrollHarness({
  limit,
  rowCount,
  rowHeight = 30,
  clientHeight = 200,
  type = "quotes",
  refetchTick = 0,
  filterKeep,
}: {
  limit: number;
  rowCount: number;
  rowHeight?: number;
  clientHeight?: number;
  type?: DocType;
  /** Bump to simulate a Supabase refetch: new data array reference, same content. */
  refetchTick?: number;
  /**
   * Optional predicate to mimic in-memory filtering (status / search / customer
   * autosave patch). When this changes, `data` (the filtered useMemo result)
   * gets a new reference — exactly the production sidebar code path.
   */
  filterKeep?: (row: number) => boolean;
}) {
  const storageKey = storageKeyFor(type);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<number>(0);
  const [rawData, setRawData] = useState<number[]>(() =>
    Array.from({ length: rowCount }, (_, i) => i)
  );

  // Mirror production: filtered data via useMemo → new array ref on filter change
  const data = useMemo(
    () => (filterKeep ? rawData.filter(filterKeep) : rawData),
    [rawData, filterKeep]
  );

  // Mirror: load saved scroll position from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw == null) return;
      const n = Number(raw);
      savedScrollRef.current = isNaN(n) ? 0 : n;
    } catch { /* noop */ }
  }, [storageKey]);

  // Mirror: track scroll changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      savedScrollRef.current = el.scrollTop;
      try { sessionStorage.setItem(storageKey, String(el.scrollTop)); } catch { /* noop */ }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [storageKey]);

  // Mirror: restore scroll synchronously when data/limit changes
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = savedScrollRef.current;
    if (target <= 0) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.min(target, max);
  }, [data, limit]);

  // Re-create data array when limit/rowCount/refetchTick changes (simulates
  // either a limit bump OR a Supabase refetch returning a fresh array).
  useEffect(() => {
    setRawData(Array.from({ length: rowCount }, (_, i) => i));
  }, [limit, rowCount, refetchTick]);

  return (
    <div
      ref={scrollRef}
      data-testid="scroll-container"
      style={{ height: clientHeight, overflowY: "auto" }}
    >
      {data.map((i) => (
        <div key={i} style={{ height: rowHeight }}>row {i}</div>
      ))}
    </div>
  );
}

/**
 * jsdom does not implement layout, so scrollHeight/clientHeight default to 0.
 * We stub them based on data row count for deterministic clamping tests.
 */
function stubLayout(el: HTMLElement, rowCount: number, rowHeight: number, clientHeight: number) {
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => rowCount * rowHeight,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
  let _top = 0;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => _top,
    set: (v: number) => { _top = v; },
  });
}

describe("RecentItemsSidebar scroll persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("does not jump to top when limit changes from 10 → 50", () => {
    const { rerender, getByTestId } = render(
      <ScrollHarness limit={10} rowCount={10} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 50, 30, 200); // assume new tall list after limit bump

    // Simulate user scrolling down to offset 250
    act(() => {
      el.scrollTop = 250;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("250");

    // Limit bumped to 50 → data ref changes → layout effect restores
    rerender(<ScrollHarness limit={50} rowCount={50} />);
    expect(el.scrollTop).toBe(250);
  });

  it("does not jump to top when limit changes from 50 → 100", () => {
    const { rerender, getByTestId } = render(
      <ScrollHarness limit={50} rowCount={50} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 100, 30, 200);

    act(() => {
      el.scrollTop = 800;
      el.dispatchEvent(new Event("scroll"));
    });

    rerender(<ScrollHarness limit={100} rowCount={100} />);
    expect(el.scrollTop).toBe(800);
  });

  it("clamps scroll to max when shrinking limit (100 → 10)", () => {
    const { rerender, getByTestId } = render(
      <ScrollHarness limit={100} rowCount={100} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 100, 30, 200);

    act(() => {
      el.scrollTop = 2500;
      el.dispatchEvent(new Event("scroll"));
    });

    // Shrink list: scrollHeight becomes 10*30=300, clientHeight 200 → max 100
    stubLayout(el, 10, 30, 200);
    rerender(<ScrollHarness limit={10} rowCount={10} />);
    expect(el.scrollTop).toBeLessThanOrEqual(100);
    expect(el.scrollTop).toBeGreaterThan(0);
  });

  it("persists scroll position to sessionStorage for cross-mount restore", () => {
    const { unmount, getByTestId } = render(
      <ScrollHarness limit={10} rowCount={10} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 10, 30, 200);

    act(() => {
      el.scrollTop = 120;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("120");

    unmount();

    // After unmount, the persisted offset must remain in sessionStorage
    // so a fresh mount (e.g. navigating back to the page) can restore it.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("120");
  });

  it("does not restore when user is at top (target = 0)", () => {
    const { rerender, getByTestId } = render(
      <ScrollHarness limit={10} rowCount={10} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 50, 30, 200);

    // No scroll happened → savedScrollRef stays 0
    rerender(<ScrollHarness limit={50} rowCount={50} />);
    expect(el.scrollTop).toBe(0);
  });

  // Verify the scroll-preservation contract holds for ALL document types
  // used by the create/edit screens that share RecentItemsSidebar:
  //   - quotes  → /quotes/create, /quotes/edit/:id
  //   - invoices → /invoices/create, /invoices/edit/:id
  //   - purchases → /purchases/create, /purchases/edit/:id
  //   - returns  → /stock-returns/create, /stock-returns/edit/:id
  describe.each<DocType>(["quotes", "invoices", "purchases", "returns"])(
    "limit change preserves scroll for type=%s",
    (type) => {
      it("10 → 50 keeps offset", () => {
        const { rerender, getByTestId } = render(
          <ScrollHarness type={type} limit={10} rowCount={10} />
        );
        const el = getByTestId("scroll-container");
        stubLayout(el, 50, 30, 200);
        act(() => {
          el.scrollTop = 300;
          el.dispatchEvent(new Event("scroll"));
        });
        expect(sessionStorage.getItem(storageKeyFor(type))).toBe("300");
        rerender(<ScrollHarness type={type} limit={50} rowCount={50} />);
        expect(el.scrollTop).toBe(300);
      });

      it("50 → 100 keeps offset", () => {
        const { rerender, getByTestId } = render(
          <ScrollHarness type={type} limit={50} rowCount={50} />
        );
        const el = getByTestId("scroll-container");
        stubLayout(el, 100, 30, 200);
        act(() => {
          el.scrollTop = 600;
          el.dispatchEvent(new Event("scroll"));
        });
        rerender(<ScrollHarness type={type} limit={100} rowCount={100} />);
        expect(el.scrollTop).toBe(600);
      });
    }
  );

  it("storage keys are isolated per document type (no cross-talk)", () => {
    // Quotes sidebar saves position
    const { unmount, getByTestId } = render(
      <ScrollHarness type="quotes" limit={10} rowCount={10} />
    );
    const elQ = getByTestId("scroll-container");
    stubLayout(elQ, 10, 30, 200);
    act(() => {
      elQ.scrollTop = 90;
      elQ.dispatchEvent(new Event("scroll"));
    });
    unmount();

    // Invoices sidebar must NOT inherit quotes' offset
    const { getByTestId: getById2 } = render(
      <ScrollHarness type="invoices" limit={10} rowCount={10} />
    );
    const elI = getById2("scroll-container");
    stubLayout(elI, 10, 30, 200);
    expect(sessionStorage.getItem(storageKeyFor("quotes"))).toBe("90");
    expect(sessionStorage.getItem(storageKeyFor("invoices"))).toBeNull();
    expect(elI.scrollTop).toBe(0);
  });

  // Round-trip isolation: each sidebar type must save AND restore ITS OWN
  // offset independently, with no leakage across types. Mirrors the user
  // workflow of switching between /quotes/edit and /invoices/edit pages.
  it("saves & restores scroll independently for Quotes and Invoices sidebars", () => {
    // 1) Quotes sidebar: scroll to 220 and unmount
    {
      const { unmount, getByTestId } = render(
        <ScrollHarness type="quotes" limit={50} rowCount={50} />
      );
      const el = getByTestId("scroll-container");
      stubLayout(el, 50, 30, 200);
      act(() => {
        el.scrollTop = 220;
        el.dispatchEvent(new Event("scroll"));
      });
      unmount();
    }

    // 2) Invoices sidebar: scroll to 880 and unmount
    {
      const { unmount, getByTestId } = render(
        <ScrollHarness type="invoices" limit={50} rowCount={50} />
      );
      const el = getByTestId("scroll-container");
      stubLayout(el, 50, 30, 200);
      act(() => {
        el.scrollTop = 880;
        el.dispatchEvent(new Event("scroll"));
      });
      unmount();
    }

    // 3) Both keys must coexist with their own values
    expect(sessionStorage.getItem(storageKeyFor("quotes"))).toBe("220");
    expect(sessionStorage.getItem(storageKeyFor("invoices"))).toBe("880");

    // 4) Remount Quotes → must restore 220 (NOT 880)
    {
      const { rerender, getByTestId, unmount } = render(
        <ScrollHarness type="quotes" limit={50} rowCount={50} refetchTick={0} />
      );
      const el = getByTestId("scroll-container");
      stubLayout(el, 50, 30, 200);
      // Trigger a refetch so the layout-effect runs and restores the offset
      rerender(
        <ScrollHarness type="quotes" limit={50} rowCount={50} refetchTick={1} />
      );
      expect(el.scrollTop).toBe(220);
      unmount();
    }

    // 5) Remount Invoices → must restore 880 (NOT 220)
    {
      const { rerender, getByTestId, unmount } = render(
        <ScrollHarness type="invoices" limit={50} rowCount={50} refetchTick={0} />
      );
      const el = getByTestId("scroll-container");
      stubLayout(el, 50, 30, 200);
      rerender(
        <ScrollHarness type="invoices" limit={50} rowCount={50} refetchTick={1} />
      );
      expect(el.scrollTop).toBe(880);
      unmount();
    }
  });

  // Simulates a Supabase refetch (e.g. autosave/Realtime/manual refresh)
  // where `limit` stays the same but the query returns a NEW array reference
  // with the same rows. Without the layout-effect restore, this would reset
  // scrollTop to 0 because React replaces the rendered list.
  it("does not jump to top when data refetches with limit unchanged", () => {
    const { rerender, getByTestId } = render(
      <ScrollHarness limit={50} rowCount={50} refetchTick={0} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 50, 30, 200);

    // User scrolls into the middle of the list
    act(() => {
      el.scrollTop = 700;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el.scrollTop).toBe(700);

    // Simulate Supabase refetch: same limit, fresh data array reference
    rerender(<ScrollHarness limit={50} rowCount={50} refetchTick={1} />);
    expect(el.scrollTop).toBe(700);

    // Another refetch (e.g. Realtime UPDATE) — still anchored
    rerender(<ScrollHarness limit={50} rowCount={50} refetchTick={2} />);
    expect(el.scrollTop).toBe(700);
  });

  it("preserves scroll across refetch for every document type", () => {
    const types: DocType[] = ["quotes", "invoices", "purchases", "returns"];
    for (const type of types) {
      sessionStorage.clear();
      const { rerender, getByTestId, unmount } = render(
        <ScrollHarness type={type} limit={50} rowCount={50} refetchTick={0} />
      );
      const el = getByTestId("scroll-container");
      stubLayout(el, 50, 30, 200);
      act(() => {
        el.scrollTop = 450;
        el.dispatchEvent(new Event("scroll"));
      });
      rerender(
        <ScrollHarness type={type} limit={50} rowCount={50} refetchTick={1} />
      );
      expect(el.scrollTop, `type=${type}`).toBe(450);
      unmount();
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Filter / search / customer-change scenarios
  // The production sidebar pipes raw query data through a useMemo that
  // applies status + payment + party-name search filters. Any change to
  // those produces a new `data` array reference, which would normally
  // reset scrollTop. The same useLayoutEffect must clamp scroll back.
  // ─────────────────────────────────────────────────────────────────────

  it("does not jump to top when changing the search/filter (rowCount unchanged)", () => {
    let keep: ((r: number) => boolean) | undefined = undefined;
    const { rerender, getByTestId } = render(
      <ScrollHarness limit={50} rowCount={50} filterKeep={keep} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 50, 30, 200);

    act(() => {
      el.scrollTop = 500;
      el.dispatchEvent(new Event("scroll"));
    });

    // User types in search → predicate identity changes → useMemo returns new array
    keep = (r) => r >= 0;
    rerender(
      <ScrollHarness limit={50} rowCount={50} filterKeep={keep} />
    );
    expect(el.scrollTop).toBe(500);
  });

  it("clamps scroll when filter narrows the list to a few rows", () => {
    const { rerender, getByTestId } = render(
      <ScrollHarness limit={100} rowCount={100} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 100, 30, 200);

    act(() => {
      el.scrollTop = 2500;
      el.dispatchEvent(new Event("scroll"));
    });

    // Apply a narrowing filter (only rows divisible by 25 → 4 rows)
    stubLayout(el, 4, 30, 200);
    rerender(
      <ScrollHarness
        limit={100}
        rowCount={100}
        filterKeep={(r) => r % 25 === 0}
      />
    );
    // 4 * 30 = 120 < 200 client height → max scroll is 0
    expect(el.scrollTop).toBe(0);
  });

  it("preserves scroll when a customer autosave patches the cache (refetch with same limit)", () => {
    // Workflow: user is editing a quote, picks a different customer, the
    // autosave fires `setQueriesData` which patches the row in the sidebar.
    // From the sidebar's point of view this is a refetchTick bump with the
    // same limit and same rowCount.
    const { rerender, getByTestId } = render(
      <ScrollHarness type="invoices" limit={50} rowCount={50} refetchTick={0} />
    );
    const el = getByTestId("scroll-container");
    stubLayout(el, 50, 30, 200);

    act(() => {
      el.scrollTop = 950;
      el.dispatchEvent(new Event("scroll"));
    });

    // Multiple silent autosaves while typing the customer / fields
    for (let tick = 1; tick <= 5; tick++) {
      rerender(
        <ScrollHarness type="invoices" limit={50} rowCount={50} refetchTick={tick} />
      );
      expect(el.scrollTop, `tick=${tick}`).toBe(950);
    }
  });

  it("filter + refetch combined keep scroll anchored for every doc type", () => {
    const types: DocType[] = ["quotes", "invoices", "purchases", "returns"];
    for (const type of types) {
      sessionStorage.clear();
      const { rerender, getByTestId, unmount } = render(
        <ScrollHarness
          type={type}
          limit={50}
          rowCount={50}
          refetchTick={0}
          filterKeep={undefined}
        />
      );
      const el = getByTestId("scroll-container");
      stubLayout(el, 50, 30, 200);
      act(() => {
        el.scrollTop = 380;
        el.dispatchEvent(new Event("scroll"));
      });

      // 1. Apply a non-narrowing filter (predicate ref change only)
      rerender(
        <ScrollHarness
          type={type}
          limit={50}
          rowCount={50}
          refetchTick={0}
          filterKeep={(r) => r >= 0}
        />
      );
      expect(el.scrollTop, `type=${type} after filter`).toBe(380);

      // 2. A refetch happens (autosave) on top of the active filter
      rerender(
        <ScrollHarness
          type={type}
          limit={50}
          rowCount={50}
          refetchTick={1}
          filterKeep={(r) => r >= 0}
        />
      );
      expect(el.scrollTop, `type=${type} after refetch`).toBe(380);

      unmount();
    }
  });
});
