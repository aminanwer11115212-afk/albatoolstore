import { useEffect, useState } from "react";

/**
 * Debug HUD for column resizing.
 * Toggle with Ctrl+Shift+D (persists in localStorage as "colwidths:debug").
 *
 * Listens to two custom events emitted by useColumnWidths:
 *  - "colwidths-debug-start": { storageKey, index, startW, before }
 *  - "colwidths-debug-move":  { storageKey, index, dx, widths }
 *  - "colwidths-debug-end":   { storageKey, index, final }
 */

type EdgeInfo = {
  cellIndex: number;
  edge: "left" | "right";
  dir: "rtl" | "ltr";
  resolvedIndex: number;
};

type DebugState = {
  storageKey: string;
  index: number;
  startW: number;
  dx: number;
  before: (number | null)[];
  widths: (number | null)[];
  active: boolean;
  edge: EdgeInfo | null;
  // Auto-check: did exactly the dragged column change?
  checkPassed: boolean | null;
  checkMessage: string;
  // Pin-after-mouseup auto-check.
  pinCheckPassed: boolean | null;
  pinCheckMessage: string;
  // Per-direction history of the last pin check (so user can verify both).
  rtlPinResult: { passed: boolean; message: string } | null;
  ltrPinResult: { passed: boolean; message: string } | null;
  // Did any column other than the dragged one change DURING the drag?
  midDragRedistribution: boolean;
};

const ENABLED_KEY = "colwidths:debug";

function readEnabled(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function ColumnResizeDebugHud() {
  const [enabled, setEnabled] = useState<boolean>(() => readEnabled());
  const [state, setState] = useState<DebugState | null>(null);

  // Keyboard toggle: Ctrl+Shift+D
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        const next = !readEnabled();
        try {
          localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
        } catch { /* noop */ }
        setEnabled(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Latest edge info, captured before "start" fires.
    let pendingEdge: EdgeInfo | null = null;

    const onEdge = (e: Event) => {
      const d = (e as CustomEvent).detail as EdgeInfo & { storageKey: string };
      pendingEdge = {
        cellIndex: d.cellIndex,
        edge: d.edge,
        dir: d.dir,
        resolvedIndex: d.resolvedIndex,
      };
    };

    const runCheck = (
      before: (number | null)[],
      widths: (number | null)[],
      draggedIndex: number,
      dx: number,
      dir: "rtl" | "ltr"
    ): { passed: boolean; message: string } => {
      // 1) Only the dragged column should differ from `before`.
      const offenders: number[] = [];
      for (let i = 0; i < widths.length; i++) {
        if (i === draggedIndex) continue;
        const a = typeof before[i] === "number" ? before[i] : null;
        const b = typeof widths[i] === "number" ? widths[i] : null;
        if (a !== b) offenders.push(i);
      }
      if (offenders.length > 0) {
        return { passed: false, message: `❌ تغيّرت أعمدة أخرى: [${offenders.join(", ")}]` };
      }
      // 2) Direction sanity: in RTL, +dx (mouse →) must shrink the column;
      //    in LTR, +dx must grow it. Compare current vs start width.
      const beforeW = before[draggedIndex];
      const nowW = widths[draggedIndex];
      if (typeof beforeW === "number" && typeof nowW === "number" && Math.abs(dx) > 2) {
        const grew = nowW > beforeW;
        const expectedToGrow = dir === "rtl" ? dx < 0 : dx > 0;
        if (grew !== expectedToGrow) {
          return {
            passed: false,
            message: `❌ اتجاه خاطئ: dir=${dir}, dx=${dx}, grew=${grew}, expectedToGrow=${expectedToGrow}`,
          };
        }
      }
      return { passed: true, message: `✅ OK · dir=${dir} · فقط العمود ${draggedIndex} تغيّر` };
    };

    const onStart = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        storageKey: string; index: number; startW: number; before: (number | null)[];
      };
      setState((prev) => ({
        storageKey: d.storageKey,
        index: d.index,
        startW: d.startW,
        dx: 0,
        before: d.before,
        widths: d.before,
        active: true,
        edge: pendingEdge,
        checkPassed: null,
        checkMessage: "اسحب لرؤية النتيجة…",
        pinCheckPassed: null,
        pinCheckMessage: "في انتظار mouseup…",
        rtlPinResult: prev?.rtlPinResult ?? null,
        ltrPinResult: prev?.ltrPinResult ?? null,
        midDragRedistribution: false,
      }));
    };
    const onMove = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        storageKey: string; index: number; dx: number; widths: (number | null)[];
        tablePinned?: boolean; tableWidth?: string; pinChangedDuringDrag?: boolean;
      };
      setState((prev) => {
        if (!prev) return prev;
        const dir = prev.edge?.dir ?? (
          (typeof document !== "undefined" &&
            (document.documentElement.dir === "rtl" || document.body.dir === "rtl"))
            ? "rtl" : "ltr"
        );
        const check = runCheck(prev.before, d.widths, d.index, d.dx, dir);
        // Detect redistribution of OTHER columns during drag.
        let redistribution = prev.midDragRedistribution;
        for (let i = 0; i < d.widths.length; i++) {
          if (i === d.index) continue;
          const a = typeof prev.before[i] === "number" ? prev.before[i] : null;
          const b = typeof d.widths[i] === "number" ? d.widths[i] : null;
          if (a !== b) { redistribution = true; break; }
        }
        // Live mid-drag pin sanity: the pin state should NOT change mid-drag.
        let pinMsg = prev.pinCheckMessage;
        let pinPassed = prev.pinCheckPassed;
        if (d.pinChangedDuringDrag) {
          pinMsg = `❌ تغيّر تثبيت العرض أثناء السحب (pinned=${d.tablePinned}, w=${d.tableWidth || "—"})`;
          pinPassed = false;
        }
        return {
          ...prev,
          dx: d.dx,
          widths: d.widths,
          checkPassed: check.passed,
          checkMessage: check.message,
          pinCheckPassed: pinPassed,
          pinCheckMessage: pinMsg,
          midDragRedistribution: redistribution,
        };
      });
    };
    const onEnd = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        storageKey: string; index: number; final: (number | null)[];
        initialPin: { pinned: boolean; width: string };
        beforePinUp: { pinned: boolean; width: string };
        afterPinUp: { pinned: boolean; width: string };
        expectedSum: number;
      };
      setState((prev) => {
        if (!prev) return prev;
        const dir = prev.edge?.dir ?? "ltr";

        // Pin-after-mouseup checks:
        // 1. mid-drag pin must equal initial pin (no premature pinning).
        // 2. after pinTableWidth(), table.style.width must equal `${expectedSum}px`.
        // 3. after pin, dataset.colwidthsPinned must be "1".
        const failures: string[] = [];
        if (prev.midDragRedistribution) {
          failures.push("توزّع العرض على أعمدة أخرى أثناء السحب");
        }
        if (
          d.beforePinUp.pinned !== d.initialPin.pinned ||
          d.beforePinUp.width !== d.initialPin.width
        ) {
          failures.push(
            `تغيّر تثبيت <table> قبل mouseup (init=${d.initialPin.width || "—"}, beforeUp=${d.beforePinUp.width || "—"})`
          );
        }
        const expected = `${d.expectedSum}px`;
        if (d.afterPinUp.width !== expected) {
          failures.push(
            `width بعد mouseup ≠ مجموع الأعمدة (got=${d.afterPinUp.width || "—"}, expected=${expected})`
          );
        }
        if (!d.afterPinUp.pinned) {
          failures.push(`data-colwidths-pinned لم يُضبط بعد mouseup`);
        }

        const result = failures.length === 0
          ? { passed: true, message: `✅ تثبيت العرض بعد mouseup فقط · dir=${dir} · width=${d.afterPinUp.width}` }
          : { passed: false, message: `❌ ${failures.join(" | ")}` };

        return {
          ...prev,
          active: false,
          pinCheckPassed: result.passed,
          pinCheckMessage: result.message,
          rtlPinResult: dir === "rtl" ? result : prev.rtlPinResult,
          ltrPinResult: dir === "ltr" ? result : prev.ltrPinResult,
        };
      });
      pendingEdge = null;
    };
    window.addEventListener("colwidths-debug-edge", onEdge as EventListener);
    window.addEventListener("colwidths-debug-start", onStart as EventListener);
    window.addEventListener("colwidths-debug-move", onMove as EventListener);
    window.addEventListener("colwidths-debug-end", onEnd as EventListener);
    return () => {
      window.removeEventListener("colwidths-debug-edge", onEdge as EventListener);
      window.removeEventListener("colwidths-debug-start", onStart as EventListener);
      window.removeEventListener("colwidths-debug-move", onMove as EventListener);
      window.removeEventListener("colwidths-debug-end", onEnd as EventListener);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      dir="ltr"
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        zIndex: 999999,
        background: "hsl(var(--background) / 0.95)",
        color: "hsl(var(--foreground))",
        border: "1px solid hsl(var(--primary))",
        borderRadius: 8,
        padding: "8px 10px",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: 11,
        lineHeight: 1.4,
        minWidth: 320,
        maxWidth: 520,
        boxShadow: "0 8px 28px hsl(var(--primary) / 0.25)",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700, color: "hsl(var(--primary))", marginBottom: 4 }}>
        🐛 Column Resize Debug · Ctrl+Shift+D to toggle
      </div>
      {!state ? (
        <div style={{ opacity: 0.7 }}>اسحب أي فاصل عمود لرؤية القيم…</div>
      ) : (
        <>
          <div>key: <b>{state.storageKey}</b></div>
          {state.edge && (
            <div style={{ marginTop: 2 }}>
              edge: <b style={{
                color: state.edge.edge === "right" ? "hsl(var(--primary))" : "hsl(var(--destructive))",
              }}>{state.edge.edge}</b>
              {" "}· dir: <b>{state.edge.dir}</b>
              {" "}· cellIdx: <b>{state.edge.cellIndex}</b>
              {" "}→ resolved col: <b style={{ color: "hsl(var(--primary))" }}>{state.edge.resolvedIndex}</b>
            </div>
          )}
          <div>
            col index: <b>{state.index}</b> · startW: <b>{state.startW}px</b> ·
            dx: <b style={{ color: state.dx >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))" }}>
              {state.dx >= 0 ? "+" : ""}{state.dx}px
            </b> · {state.active ? "🟢 active" : "⏸ idle"}
          </div>
          <div style={{
            marginTop: 4,
            padding: "3px 6px",
            borderRadius: 4,
            background: state.checkPassed === null
              ? "hsl(var(--muted))"
              : state.checkPassed
                ? "hsl(var(--primary) / 0.15)"
                : "hsl(var(--destructive) / 0.18)",
            color: state.checkPassed === false ? "hsl(var(--destructive))" : "hsl(var(--foreground))",
            fontWeight: 600,
          }}>
            {state.checkMessage}
          </div>
          {/* Pin-after-mouseup auto-check */}
          <div style={{
            marginTop: 4,
            padding: "3px 6px",
            borderRadius: 4,
            background: state.pinCheckPassed === null
              ? "hsl(var(--muted))"
              : state.pinCheckPassed
                ? "hsl(var(--primary) / 0.15)"
                : "hsl(var(--destructive) / 0.18)",
            color: state.pinCheckPassed === false ? "hsl(var(--destructive))" : "hsl(var(--foreground))",
            fontWeight: 600,
          }}>
            📌 Pin: {state.pinCheckMessage}
          </div>
          {/* Per-direction history (RTL + LTR) */}
          <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
            <div style={{
              flex: 1,
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 10,
              background: state.rtlPinResult
                ? (state.rtlPinResult.passed ? "hsl(var(--primary) / 0.12)" : "hsl(var(--destructive) / 0.15)")
                : "hsl(var(--muted))",
              color: state.rtlPinResult?.passed === false ? "hsl(var(--destructive))" : "hsl(var(--foreground))",
            }}>
              <b>RTL:</b> {state.rtlPinResult ? (state.rtlPinResult.passed ? "✅" : "❌") : "—"}
            </div>
            <div style={{
              flex: 1,
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 10,
              background: state.ltrPinResult
                ? (state.ltrPinResult.passed ? "hsl(var(--primary) / 0.12)" : "hsl(var(--destructive) / 0.15)")
                : "hsl(var(--muted))",
              color: state.ltrPinResult?.passed === false ? "hsl(var(--destructive))" : "hsl(var(--foreground))",
            }}>
              <b>LTR:</b> {state.ltrPinResult ? (state.ltrPinResult.passed ? "✅" : "❌") : "—"}
            </div>
          </div>
          <table style={{ marginTop: 4, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ opacity: 0.7 }}>
                <th style={{ textAlign: "left", paddingInlineEnd: 8 }}>i</th>
                <th style={{ textAlign: "right", paddingInlineEnd: 8 }}>before</th>
                <th style={{ textAlign: "right", paddingInlineEnd: 8 }}>now</th>
                <th style={{ textAlign: "right" }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {state.widths.map((w, i) => {
                const b = state.before[i];
                const bn = typeof b === "number" ? b : null;
                const wn = typeof w === "number" ? w : null;
                const diff = bn !== null && wn !== null ? wn - bn : null;
                const isDragged = i === state.index;
                return (
                  <tr key={i} style={{
                    background: isDragged ? "hsl(var(--primary) / 0.12)" : "transparent",
                    fontWeight: isDragged ? 700 : 400,
                  }}>
                    <td style={{ paddingInlineEnd: 8 }}>{i}{isDragged ? " ←" : ""}</td>
                    <td style={{ textAlign: "right", paddingInlineEnd: 8 }}>{bn ?? "null"}</td>
                    <td style={{ textAlign: "right", paddingInlineEnd: 8 }}>{wn ?? "null"}</td>
                    <td style={{
                      textAlign: "right",
                      color: diff === null || diff === 0
                        ? "hsl(var(--muted-foreground))"
                        : (isDragged ? "hsl(var(--primary))" : "hsl(var(--destructive))"),
                    }}>
                      {diff === null ? "—" : (diff > 0 ? `+${diff}` : `${diff}`)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 4, opacity: 0.7 }}>
            ✅ Δ يجب أن يظهر فقط على السطر المُمَيَّز (العمود المسحوب).
          </div>
        </>
      )}
    </div>
  );
}
