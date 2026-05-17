import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  value: string;
  onSave: (v: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  displayClassName?: string;
  inputMode?: "text" | "tel" | "email" | "numeric" | "decimal" | "search" | "url" | "none";
  onOpenView?: () => void;
  dir?: "ltr" | "rtl" | "auto";
  validate?: (v: string) => string | null;
}

export default function EditableCell({
  value,
  onSave,
  disabled,
  placeholder,
  inputClassName,
  displayClassName,
  inputMode,
  onOpenView,
  dir,
  validate,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  // Optimistic display value — يُعرض فوراً بعد الإدخال حتى لو DB لم يرد بعد
  const [displayVal, setDisplayVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // مزامنة displayVal مع value الخارجي (بعد رد DB أو rollback)
  useEffect(() => { if (!editing) { setVal(value); setDisplayVal(value); } }, [value, editing]);
  // عند الدخول للتعديل: focus + تحديد كل النص تلقائياً
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async () => {
    if (validate) {
      const err = validate(val);
      if (err) { setError(err); return; }
    }
    setEditing(false);
    setError(null);
    const trimmedNew = (val ?? "").trim();
    const trimmedOld = (value ?? "").trim();
    if (trimmedNew === trimmedOld) return;
    // ─── Optimistic: أظهر القيمة الجديدة فوراً ───
    setDisplayVal(val);
    setSaving(true);
    try {
      await onSave(val);
    } catch {
      // Rollback — أعد القيمة القديمة إذا فشل onSave
      setDisplayVal(value);
    } finally {
      setSaving(false);
    }
  }, [val, value, validate, onSave]);

  if (editing) {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex" }}>
        <input
          ref={inputRef}
          value={val}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={inputMode}
          dir={dir}
          onChange={(e) => { setVal(e.target.value); if (error) setError(null); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { setVal(value); setEditing(false); setError(null); }
          }}
          className={inputClassName}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: 0,
            outline: 0,
            padding: "0 4px",
            margin: 0,
            borderRadius: 0,
            boxShadow: error
              ? "inset 0 0 0 2px hsl(var(--destructive))"
              : "inset 0 0 0 2px hsl(var(--primary))",
          }}
          title={error || undefined}
        />
        {error && (
          <div style={{ position: "absolute", top: "100%", insetInlineStart: 0, marginTop: 2, fontSize: 10, color: "hsl(var(--destructive))", background: "hsl(var(--background))", padding: "2px 4px", border: "1px solid hsl(var(--destructive))", borderRadius: 3, zIndex: 10, whiteSpace: "nowrap" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // عرض القيمة الـ Optimistic (تتغير فوراً) مع مؤشر الحفظ
  const display = displayVal || value || "-";
  return (
    <span
      tabIndex={disabled ? -1 : 0}
      role="textbox"
      aria-label={placeholder}
      onClick={(e) => {
        if (disabled) return;
        if (onOpenView && (e.detail === 2)) { onOpenView(); return; }
        setEditing(true);
      }}
      onDoubleClick={onOpenView}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.stopPropagation();
          setVal((value ?? "") + e.key);
          setEditing(true);
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.stopPropagation();
          setVal(value ?? "");
          setEditing(true);
        }
      }}
      title={onOpenView ? "نقرة للتعديل، نقرتان للعرض" : "نقرة للتعديل"}
      className={`${displayClassName || "cursor-text hover:bg-muted/40"} focus:outline-none focus:bg-primary/10`}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        minHeight: "100%",
        padding: "0 4px",
        boxSizing: "border-box",
        // مؤشر بصري خفيف أثناء الحفظ
        opacity: saving ? 0.75 : 1,
        transition: "opacity 0.15s",
        boxShadow: saving ? "inset 0 0 0 1px hsl(var(--primary) / 0.4)" : undefined,
      }}
    >
      {display}
    </span>
  );
}
