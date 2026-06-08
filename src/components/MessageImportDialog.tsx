/**
 * MessageImportDialog — استيراد رسالة العميل وتحويلها إلى بنود.
 * • زر الاستدعاء: أيقونة فقط (بدون نص)، أزرق صغير
 * • تنقل لوحة مفاتيح في جدول النتائج:
 *   ↑/↓  : التنقل بين الصفوف
 *   Space : تفعيل/تعطيل الصف (تحديد/إلغاء)
 *   Delete/Backspace : حذف الصف من القائمة
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseMessage, type ParsedLine, type ProductLike } from "@/hooks/useMessageImport";
import { useDialogSize } from "@/hooks/useDialogSize";

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IcoX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IcoMsg = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IcoSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 56 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: "hsl(var(--muted))" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 24 }}>{pct}%</span>
    </div>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  products: ProductLike[];
  warehouseId?: string | null;
  onImport: (lines: ParsedLine[]) => void;
}

export default function MessageImportDialog({ open, onClose, products, warehouseId, onImport }: Props) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedLine[] | null>(null);
  const [enabled, setEnabled] = useState<boolean[]>([]);
  const [qtyOverrides, setQtyOverrides] = useState<Record<number, string>>({});
  const [productOverrides, setProductOverrides] = useState<Record<number, ProductLike>>({});
  const [altSearch, setAltSearch] = useState<Record<number, string>>({});
  const [altOpen, setAltOpen] = useState<Record<number, boolean>>({});
  // keyboard focus row index
  const [focusedRow, setFocusedRow] = useState<number>(-1);
  const tableRef = useRef<HTMLDivElement>(null);
  const { dlgRef, dlgStyle } = useDialogSize("message_import_dialog", open, { w: "min(700px, 95vw)", h: "90vh" });

  // Reset when dialog opens
  useEffect(() => {
    if (!open) return;
    setText(""); setParsed(null); setEnabled([]); setQtyOverrides({});
    setProductOverrides({}); setAltSearch({}); setAltOpen({}); setFocusedRow(-1);
  }, [open]);

  const handleParse = useCallback(() => {
    if (!text.trim()) return;
    const result = parseMessage(text, products, warehouseId);
    setParsed(result);
    setEnabled(result.map((r) => r.matched !== null));
    setQtyOverrides({}); setProductOverrides({}); setAltSearch({}); setAltOpen({});
    setFocusedRow(result.length > 0 ? 0 : -1);
    setTimeout(() => tableRef.current?.focus(), 50);
  }, [text, products, warehouseId]);

  // Delete a row
  const deleteRow = useCallback((idx: number) => {
    setParsed((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== idx);
      return next;
    });
    setEnabled((prev) => prev.filter((_, i) => i !== idx));
    setProductOverrides((prev) => {
      const n: Record<number, ProductLike> = {};
      Object.entries(prev).forEach(([k, v]) => { const ki = parseInt(k); if (ki !== idx) n[ki > idx ? ki - 1 : ki] = v; });
      return n;
    });
    setQtyOverrides((prev) => {
      const n: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => { const ki = parseInt(k); if (ki !== idx) n[ki > idx ? ki - 1 : ki] = v; });
      return n;
    });
    setFocusedRow((prev) => {
      const len = (parsed?.length ?? 1) - 1;
      return Math.min(prev, len - 1);
    });
  }, [parsed]);

  // Keyboard handler on table container
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!parsed || parsed.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedRow((prev) => Math.min(prev + 1, parsed.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedRow((prev) => Math.max(prev - 1, 0));
    } else if (e.key === " ") {
      e.preventDefault();
      if (focusedRow < 0) return;
      setEnabled((prev) => prev.map((v, i) => i === focusedRow ? !v : v));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      // only delete if not focused on an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (focusedRow < 0) return;
      deleteRow(focusedRow);
    }
  }, [parsed, focusedRow, deleteRow]);

  const altMatches = useCallback((idx: number) => {
    const q = (altSearch[idx] || "").trim();
    if (!q) return [];
    return products.filter((p) => startsWithMatch(p.name, q)).slice(0, 8);
  }, [altSearch, products]);

  const matchedCount = useMemo(
    () => (parsed ? parsed.filter((_, i) => enabled[i] && (productOverrides[i] ?? parsed[i].matched)).length : 0),
    [parsed, enabled, productOverrides],
  );
  const unmatchedCount = useMemo(
    () => (parsed ? parsed.filter((l, i) => enabled[i] && !(productOverrides[i] ?? l.matched)).length : 0),
    [parsed, enabled, productOverrides],
  );

  const handleImport = () => {
    if (!parsed) return;
    const valid = parsed
      .map((line, i) => ({ ...line, matched: productOverrides[i] ?? line.matched, qty: parseFloat(qtyOverrides[i] ?? "") || line.qty || 1 }))
      .filter((_, i) => enabled[i])
      .filter((l) => l.matched);
    if (!valid.length) return;
    onImport(valid);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent ref={dlgRef} dir="rtl" style={{ ...dlgStyle, display: "flex", flexDirection: "column", gap: 0, padding: 0, overflow: "hidden" }}>

        {/* Header */}
        <DialogHeader style={{ padding: "12px 16px 10px", borderBottom: "1px solid hsl(var(--border))", flexShrink: 0 }}>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
            <span style={{ background: "linear-gradient(135deg,#2563eb,#6366f1)", color: "#fff", borderRadius: 6, padding: "3px 8px", display: "flex", alignItems: "center", gap: 5 }}>
              <IcoMsg /> استيراد رسالة العميل
            </span>
            {parsed && (
              <span style={{ fontSize: 11, fontWeight: 400, color: "hsl(var(--muted-foreground))" }}>
                {parsed.length} سطر · <span style={{ color: "#22c55e", fontWeight: 700 }}>{matchedCount} مطابق</span>
                {unmatchedCount > 0 && <> · <span style={{ color: "#ef4444", fontWeight: 700 }}>{unmatchedCount} غير مطابق</span></>}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {/* Step 1 */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 5 }}>
              الخطوة 1 — الصق رسالة العميل
            </label>
            <Textarea
              dir="rtl"
              placeholder={"مثال:\nأرز بسمتي 5\nسكر 3 كيلو\nزيت نباتي\nلحم ضان 2"}
              value={text}
              onChange={(e) => { setText(e.target.value); setParsed(null); }}
              style={{ minHeight: 90, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <Button onClick={handleParse} disabled={!text.trim()} style={{ background: "linear-gradient(135deg,#2563eb,#6366f1)", color: "#fff", border: "none", padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 5, display: "flex", alignItems: "center", gap: 5, opacity: !text.trim() ? 0.6 : 1 }}>
              <IcoSearch /> تحليل ومطابقة المنتجات
            </Button>
          </div>

          {/* Step 2 */}
          {parsed && parsed.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>
                  الخطوة 2 — راجع وعدّل (↑↓ تنقل · مسطرة تحديد/إلغاء · Delete حذف)
                </label>
              </div>
              <div
                ref={tableRef}
                tabIndex={0}
                onKeyDown={handleTableKeyDown}
                style={{ border: "1px solid hsl(var(--border))", borderRadius: 7, overflow: "hidden", outline: "none" }}
              >
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 100px 70px 72px 28px", gap: 3, padding: "4px 8px", background: "hsl(var(--muted))", fontSize: 10, fontWeight: 700, color: "hsl(var(--muted-foreground))", borderBottom: "1px solid hsl(var(--border))" }}>
                  <span>✓</span><span>المنتج المطابق</span><span style={{ textAlign: "center" }}>النص</span><span style={{ textAlign: "center" }}>تطابق</span><span style={{ textAlign: "center" }}>الكمية</span><span />
                </div>

                {/* Rows */}
                {parsed.map((line, i) => {
                  const prod = productOverrides[i] ?? line.matched;
                  const isEnabled = enabled[i];
                  const isFocused = focusedRow === i;
                  const rowBg = isFocused
                    ? "hsl(var(--primary) / 0.08)"
                    : !isEnabled ? "hsl(var(--muted) / 0.35)"
                    : prod ? "transparent"
                    : "hsl(0 80% 97% / 0.7)";

                  return (
                    <div
                      key={i}
                      onClick={() => setFocusedRow(i)}
                      style={{
                        display: "grid", gridTemplateColumns: "26px 1fr 100px 70px 72px 28px", gap: 3,
                        padding: "4px 8px", borderBottom: i < parsed.length - 1 ? "1px solid hsl(var(--border))" : "none",
                        background: rowBg, opacity: isEnabled ? 1 : 0.55, transition: "background .1s",
                        alignItems: "center", cursor: "pointer",
                        outline: isFocused ? "2px solid hsl(var(--primary) / 0.4)" : "none",
                        outlineOffset: -2,
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEnabled((prev) => prev.map((v, idx) => idx === i ? !v : v)); }}
                          style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${isEnabled ? "#2563eb" : "hsl(var(--border))"}`, background: isEnabled ? "#2563eb" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}
                          title={isEnabled ? "إلغاء" : "تحديد"}
                        >{isEnabled && <IcoCheck />}</button>
                      </div>

                      {/* Product */}
                      <div>
                        {prod ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: productOverrides[i] ? "#2563eb" : "hsl(var(--foreground))" }}>{prod.name}</span>
                            <button onClick={(e) => { e.stopPropagation(); setAltOpen((prev) => ({ ...prev, [i]: !prev[i] })); }} style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", cursor: "pointer", background: "hsl(var(--muted))", border: "none", borderRadius: 3, padding: "1px 4px" }}>تغيير</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                            <IcoX /> لم يُطابَق
                            <button onClick={(e) => { e.stopPropagation(); setAltOpen((prev) => ({ ...prev, [i]: !prev[i] })); }} style={{ fontSize: 9, color: "#2563eb", cursor: "pointer", background: "hsl(var(--muted))", border: "none", borderRadius: 3, padding: "1px 4px" }}>اختر</button>
                          </span>
                        )}
                        {altOpen[i] && (
                          <div style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                            <input autoFocus type="text" placeholder="ابحث..." value={altSearch[i] || ""} onChange={(e) => setAltSearch((prev) => ({ ...prev, [i]: e.target.value }))}
                              style={{ width: "100%", padding: "2px 6px", borderRadius: 3, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))", color: "hsl(var(--foreground))" }} />
                            <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid hsl(var(--border))", borderRadius: 3, marginTop: 2, background: "hsl(var(--popover))" }}>
                              {altMatches(i).map((p) => (
                                <div key={p.id} onMouseDown={() => { setProductOverrides((prev) => ({ ...prev, [i]: p })); setAltOpen((prev) => ({ ...prev, [i]: false })); setEnabled((prev) => prev.map((v, idx) => idx === i ? true : v)); }}
                                  style={{ padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600, borderBottom: "1px solid hsl(var(--border))" }} className="msg-alt-item">
                                  {p.name}
                                </div>
                              ))}
                              {altMatches(i).length === 0 && altSearch[i] && (
                                <div style={{ padding: "5px 8px", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>لا نتائج</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Raw line */}
                      <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", textAlign: "center", direction: "rtl", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={line.rawLine}>
                        {line.rawLine}
                      </div>

                      {/* Score */}
                      <div>
                        {productOverrides[i] ? (
                          <span style={{ fontSize: 9, color: "#2563eb", fontWeight: 700 }}>يدوي</span>
                        ) : line.matched ? (
                          <ScoreBar score={line.score} />
                        ) : (
                          <span style={{ fontSize: 9, color: "#ef4444" }}>—</span>
                        )}
                      </div>

                      {/* Qty */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <input type="number" min={0.01} step={0.01}
                          value={qtyOverrides[i] !== undefined ? qtyOverrides[i] : line.qty}
                          onChange={(e) => setQtyOverrides((prev) => ({ ...prev, [i]: e.target.value }))}
                          style={{ width: "100%", textAlign: "center", padding: "2px 3px", borderRadius: 3, border: "1px solid hsl(var(--border))", fontSize: 12, fontWeight: 700, background: "hsl(var(--card))", color: "hsl(var(--foreground))" }} />
                      </div>

                      {/* Delete */}
                      <button onClick={(e) => { e.stopPropagation(); deleteRow(i); }}
                        title="حذف هذا السطر"
                        style={{ width: 22, height: 22, borderRadius: 3, border: "1px solid hsl(var(--border))", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>
                        <IcoX />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 5, textAlign: "center" }}>
                انقر على الجدول ثم: ↑↓ للتنقل · مسطرة للتحديد/إلغاء · Delete لحذف الصف
              </p>
            </div>
          )}

          {parsed && parsed.length === 0 && (
            <div style={{ textAlign: "center", color: "hsl(var(--muted-foreground))", fontSize: 12, padding: "16px 0" }}>
              لم يتم التعرف على أي منتجات في الرسالة
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter style={{ padding: "9px 16px", borderTop: "1px solid hsl(var(--border))", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            {parsed && matchedCount > 0 && <>سيتم إضافة <strong style={{ color: "hsl(var(--foreground))" }}>{matchedCount}</strong> منتج</>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} style={{ fontSize: 12, height: 30 }}>إلغاء</Button>
            <Button onClick={handleImport} disabled={!parsed || matchedCount === 0}
              style={{ background: matchedCount > 0 ? "linear-gradient(135deg,#2563eb,#6366f1)" : undefined, color: matchedCount > 0 ? "#fff" : undefined, fontSize: 12, height: 30, fontWeight: 700, opacity: (!parsed || matchedCount === 0) ? 0.5 : 1 }}>
              إضافة {matchedCount > 0 ? `(${matchedCount})` : ""} للجدول
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <style>{`.msg-alt-item:hover { background: hsl(var(--accent) / 0.2); }`}</style>
    </Dialog>
  );
}

// ── Compact icon-only button ──────────────────────────────────────────────────
export function MessageImportButton({ onClick, style: s }: { onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="استيراد المنتجات من رسالة العميل"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "#2563eb", color: "#fff", border: "none",
        borderRadius: 4, width: 28, height: 28, flexShrink: 0,
        cursor: "pointer", boxShadow: "0 1px 3px rgba(37,99,235,0.3)",
        transition: "opacity .15s",
        ...s,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
    >
      <IcoMsg size={14} />
    </button>
  );
}
