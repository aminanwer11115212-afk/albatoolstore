import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, FileText, X, AlertTriangle, ArrowDownAZ, TrendingDown, TrendingUp, Command } from "lucide-react";
import { useCustomers } from "@/hooks/useData";
import { containsAny } from "@/utils/searchMatch";
import { netBalanceOf, formatMoney } from "@/utils/balanceDisplay";
import ChargeBalanceDialog, { type ChargePrefill } from "@/components/dashboard/ChargeBalanceDialog";

type SortKey = "debt" | "credit" | "alpha";
type ToneKey = "all" | "owes" | "owed" | "settled";

const SORTS: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: "debt",   label: "الأعلى مديونية", hint: "من عليه أكثر أوّلاً" },
  { key: "credit", label: "الأعلى رصيداً",  hint: "من له أكثر أوّلاً" },
  { key: "alpha",  label: "أبجدي",          hint: "بالاسم من الألف" },
];

const TONES: Array<{ key: ToneKey; label: string }> = [
  { key: "all",      label: "الكل" },
  { key: "owes",     label: "عليه" },
  { key: "owed",     label: "له" },
  { key: "settled",  label: "خالص" },
];

/**
 * صفحة "كشوفات حسابات العملاء" — نقطة وصول موحّدة.
 * تعرض قائمة العملاء مع صافي الرصيد (netBalanceOf — نفس المصدر في كل النظام)،
 * بحث فوري بالاسم/الهاتف، Enter يفتح كشف حساب أول نتيجة على المسار الموحّد
 * /customers/:id/statement.
 *
 * حالة البحث محفوظة في URL (?q=...) حتى ترجع للصفحة فتظهر نفس النتائج.
 */
export default function CustomerStatementsPage() {
  const navigate = useNavigate();
  const { data: customers, isLoading, isError, error, refetch } = useCustomers();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * الترتيب والتصفية — قرارٌ في يد المستخدم بدل ترتيبٍ واحدٍ مفروض.
   *
   * كان الترتيب ثابتاً بالأعلى مبلغاً مطلقاً، وهو مفيدٌ لمن يلاحق الديون
   * ومُرهقٌ لمن يبحث عن اسمٍ يعرفه. فصار الترتيب ثلاثةً والتصفية أربعاً،
   * وكلاهما محفوظٌ في الرابط فتعود الصفحة كما تركتَها.
   */
  const [sortBy, setSortBy] = useState<SortKey>(
    () => (searchParams.get("sort") as SortKey) || "debt",
  );
  const [tone, setTone] = useState<ToneKey>(
    () => (searchParams.get("tone") as ToneKey) || "all",
  );
  const [paletteOpen, setPaletteOpen] = useState(false);

  /**
   * إدخالٌ سريع على خليّة الرصيد — رقمٌ ثم «له/عليه» ثم ✓.
   *
   * طلبه صاحب المستودع: «الذهاب لمربّع حساب العميل وضغط إنتر، تكتب الرقم
   * ويظهر اختيار له وعليه في المربّع نفسه، واختاره بعلامة صح».
   *
   * و**لا يكتب هذا الحقل في القاعدة**: التأكيد يفتح حوار الشحن مملوءاً بما
   * كتبت. فتصل بضغطتين بدل خمس، ولا يُفقد حارسٌ من حرّاسه — تحقّقُ التحويل
   * البنكي، ورفضُ الصفر، وقاعدة «الشحن يُخزَّن ولا يُوزَّع».
   */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [prefill, setPrefill] = useState<ChargePrefill | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // مزامنة q ↔ URL (بدون إغراق التاريخ)
  useEffect(() => {
    const cur = searchParams.get("q") || "";
    if (cur === q) return;
    const next = new URLSearchParams(searchParams);
    if (q) next.set("q", q);
    else next.delete("q");
    if (sortBy !== "debt") next.set("sort", sortBy); else next.delete("sort");
    if (tone !== "all") next.set("tone", tone); else next.delete("tone");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sortBy, tone]);

  /**
   * Shift+C — لوحةُ قفزٍ سريعة بين العملاء.
   *
   * طلبها صاحب المستودع: «اختصارٌ منبثق للتنقّل في صفحات العملاء بشكلٍ سريع
   * وبالكيبورد، والضغط مرّةً أخرى يُغلقه».
   *
   * ولمَ Shift+C لا حرفٌ مجرّد: حقلُ البحث في هذه الصفحة يأخذ التركيز تلقائياً
   * عند فتحها، فاختصارٌ بحرفٍ واحد كان سيُكتب في الحقل بدل أن يفتح شيئاً.
   */



  const rows = useMemo(() => {
    const list = (customers || []) as any[];
    const query = q.trim();
    const filtered = query
      ? list.filter((c) => containsAny([c.name, c.phone, c.company], query))
      : list;
    const withNet = filtered.map((c) => ({ ...c, _net: netBalanceOf(c) }));

    // التصفية بالاتجاه: عليه / له / خالص
    const byTone = withNet.filter((c) => {
      if (tone === "owes") return c._net > 0.009;
      if (tone === "owed") return c._net < -0.009;
      if (tone === "settled") return Math.abs(c._net) <= 0.009;
      return true;
    });

    const sorted = [...byTone];
    if (sortBy === "alpha") {
      // ترتيبٌ عربيّ صحيح: `localeCompare` بلغة العربية يرتّب الألف قبل الباء
      sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
    } else if (sortBy === "credit") {
      // الأعلى رصيداً **له** أوّلاً — الصافي السالب هو الدائن
      sorted.sort((a, b) => a._net - b._net);
    } else {
      // الأعلى مديونيةً أوّلاً — وهو الافتراضي الذي كان
      sorted.sort((a, b) => b._net - a._net);
    }
    return sorted;
  }, [customers, q, sortBy, tone]);

  useEffect(() => setActiveIdx(0), [q, sortBy, tone]);

  const openStatement = (id: string) => navigate(`/customers/${id}/statement`);

  /**
   * خريطة المفاتيح كما طلبها صاحب المستودع:
   *
   *   ↑ ↓            تنقّلٌ بين العملاء
   *   Enter          يفتح كشف حساب الصفّ النشط
   *   Shift (وحده)   يفتح تعديل الرصيد على الصفّ النشط
   *   Shift + C      لوحةُ القفز السريع — وضغطةٌ ثانية تُغلقها
   *   Alt + Backspace  رجوعٌ إلى صفحة العملاء
   *
   * ## و«Shift وحده» ليست `shiftKey`
   * `shiftKey` صحيحةٌ مع كلّ حرفٍ كبير يُكتب في البحث، فربطُ التعديل بها كان
   * سيفتح المحرّر كلّما كتب المستخدم اسماً بحرفٍ كبير. فتُقرأ **نقرةً
   * مفردة**: تُرصد عند الضغط، وتُلغى إن تلاها أيّ مفتاحٍ آخر، ولا تقع إلا عند
   * الإفلات وحدها. فـShift+C تبقى للّوحة، وShift المجرّدة للتعديل.
   */
  const shiftAloneRef = useRef(false);

  useEffect(() => {
    /**
     * حقولٌ تملك مفاتيحها.
     *
     * وحقلُ البحث **ليس منها** لـShift المجرّدة: التركيز فيه دائماً في هذه
     * الصفحة، فاستثناؤه يُبطل الاختصار عملياً. أمّا Enter فيعالجه الحقل نفسه
     * (`handleKey`) فلا يصل هنا مرّتين.
     */
    const inField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // أيّ مفتاحٍ غير Shift يُلغي النقرة المفردة
      if (e.key !== "Shift") shiftAloneRef.current = false;
      else if (!e.repeat) shiftAloneRef.current = true;

      if (e.altKey && e.key === "Backspace") {
        e.preventDefault();
        navigate("/customers");
        return;
      }
      if (e.shiftKey && (e.key === "C" || e.key === "c") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Enter" && !paletteOpen && !editing && !prefill && !inField(e.target)) {
        const target = rows[activeIdx] || rows[0];
        if (target) { e.preventDefault(); openStatement(target.id); }
        return;
      }
      if (e.key === "Escape") { setPaletteOpen(false); setEditing(null); }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      const alone = shiftAloneRef.current;
      shiftAloneRef.current = false;
      // لا يُفتح فوق شيءٍ مفتوح، ولا في حقلٍ نصّيٍّ متعدّد الأسطر
      if (!alone || paletteOpen || editing || prefill || inField(e.target)) return;
      const target = rows[activeIdx] || rows[0];
      if (!target) return;
      e.preventDefault();
      setEditing({ id: target.id, name: target.name || "" });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // فقدُ التركيز يترك Shift «مضغوطة» في الذاكرة — فتُصفَّر
    const onBlur = () => { shiftAloneRef.current = false; };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [navigate, rows, activeIdx, paletteOpen, editing, prefill, openStatement]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = rows[activeIdx] || rows[0];
      if (target) openStatement(target.id);
    } else if (e.key === "Escape") {
      setQ("");
    }
  };

  const totals = useMemo(() => {
    let debt = 0, credit = 0;
    for (const r of rows) {
      if (r._net > 0) debt += r._net;
      else if (r._net < 0) credit += -r._net;
    }
    return { debt, credit, count: rows.length };
  }, [rows]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Hero: عنوان + إجماليات موحدة (netBalanceOf) بشكل بارز مع أنيميشن دخول */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-l from-primary/5 via-card to-card p-5 md:p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div aria-hidden className="pointer-events-none absolute -top-16 -start-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -end-16 h-48 w-48 rounded-full bg-destructive/10 blur-3xl" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <FileText size={22} className="text-primary" />
              كشوفات حسابات العملاء
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              اختر عميلًا لعرض كشف حسابه التفصيلي — الأرقام موحّدة عبر netBalanceOf في كل النظام.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 min-w-[280px]">
            <TotalPill label="العملاء" value={totals.count} tone="primary" plain />
            <TotalPill label="المديونية" value={totals.debt} tone="destructive" />
            <TotalPill label="الدائن" value={totals.credit} tone="success" />
          </div>
        </div>
      </div>

      <div className="legacy-card card-block p-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="ابحث بالاسم أو الشركة أو الهاتف — اضغط Enter لفتح الكشف"
            className="w-full h-11 pr-10 pl-10 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="مسح"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* الترتيب والتصفية — شرائحُ تُقرأ بضغطةٍ لا قوائمُ تُفتح */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5" role="group" aria-label="الترتيب">
            <span className="text-[11px] font-bold text-muted-foreground">الترتيب</span>
            {SORTS.map((s) => {
              const on = sortBy === s.key;
              const Icon = s.key === "alpha" ? ArrowDownAZ : s.key === "credit" ? TrendingUp : TrendingDown;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSortBy(s.key)}
                  title={s.hint}
                  aria-pressed={on}
                  data-testid={`sort-${s.key}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  <Icon size={12} />
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="التصفية">
            <span className="text-[11px] font-bold text-muted-foreground">إظهار</span>
            {TONES.map((t) => {
              const on = tone === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTone(t.key)}
                  aria-pressed={on}
                  data-testid={`tone-${t.key}`}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                    on
                      ? t.key === "owes"
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : t.key === "owed"
                          ? "border-emerald-600 bg-emerald-600/10 text-emerald-600"
                          : "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <span className="ms-auto hidden text-[10px] text-muted-foreground sm:inline" data-testid="keys-hint">
            <kbd className="font-mono">↑↓</kbd> تنقّل ·
            <kbd className="font-mono"> Enter </kbd> كشف الحساب ·
            <kbd className="font-mono"> Shift </kbd> تعديل الرصيد ·
            <kbd className="font-mono"> Alt+⌫ </kbd> رجوع
          </span>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            data-testid="open-palette"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted/60"
            title="قفزٌ سريع بين العملاء"
          >
            <Command size={12} />
            <kbd className="font-mono">Shift</kbd>+<kbd className="font-mono">C</kbd>
            قفزٌ سريع
          </button>
        </div>
      </div>

      <ChargeBalanceDialog
        open={!!prefill}
        onOpenChange={(v) => { if (!v) setPrefill(null); }}
        onSaved={() => { setPrefill(null); refetch(); }}
        prefill={prefill}
      />

      {paletteOpen && (
        <CustomerJumpPalette
          rows={rows}
          onPick={(id) => { setPaletteOpen(false); openStatement(id); }}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      <div className="legacy-card card-block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground w-12">#</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الاسم</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الهاتف</th>
                {/* عمود واحد: الرصيد التراكمي «له / عليه / خالص». عرضُ المديونية
                    والدائن منفصلَين يوحي بحسابين، والعميل حسابه واحد — ومجموعهما
                    الجبري هو الرقم الوحيد الذي يعنيه. */}
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">الرصيد</th>
                <th className="text-right px-3 py-3 font-semibold text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground">
                    <span className="inline-block h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin align-middle me-2" />
                    جاري تحميل بيانات العملاء...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="text-center py-10">
                    <div className="inline-flex items-center gap-2 text-destructive">
                      <AlertTriangle size={18} />
                      <span>تعذّر جلب بيانات العملاء (netBalanceOf).</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{(error as any)?.message || "خطأ غير معروف"}</div>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-3 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90"
                    >
                      إعادة المحاولة
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground">
                    {q ? `لا يوجد عملاء مطابقون لـ "${q}"` : "لا يوجد عملاء بعد"}
                  </td>
                </tr>
              ) : (
                rows.map((c, i) => {
                  const net = c._net as number;
                  const isActive = i === activeIdx;
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border cursor-pointer transition-colors ${
                        isActive ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => openStatement(c.id)}
                    >
                      <td className="px-3 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{c.name}</td>
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">
                        {c.phone || "—"}
                      </td>
                      <td
                        tabIndex={0}
                        data-testid={`balance-cell-${i}`}
                        onFocus={() => setActiveIdx(i)}
                        onClick={(e) => { e.stopPropagation(); setEditing({ id: c.id, name: c.name || "" }); }}
                        title="Shift لإدخال مبلغٍ سريع — له أو عليه"
                        className={`px-3 py-3 font-bold tabular-nums cursor-text outline-none focus-visible:ring-2 focus-visible:ring-primary rounded ${
                          net > 0
                            ? "text-destructive"
                            : net < 0
                              ? "text-emerald-600"
                              : "text-foreground"
                        }`}
                      >
                        {editing?.id === c.id ? (
                          <QuickChargeCell
                            onCancel={() => setEditing(null)}
                            onConfirm={(signed) => {
                              setEditing(null);
                              setPrefill({ customerId: c.id, customerName: c.name, amount: signed });
                            }}
                          />
                        ) : (
                          <>
                            {Math.abs(net) < 0.01 ? "خالص" : formatMoney(Math.abs(net))}
                            {Math.abs(net) >= 0.01 && (
                              <span className="text-[10px] font-normal mr-1">
                                {net > 0 ? "عليه" : "له"}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openStatement(c.id);
                          }}
                          className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90 inline-flex items-center gap-1"
                        >
                          <FileText size={12} />
                          كشف الحساب
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TotalPill({
  label,
  value,
  tone,
  plain = false,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "destructive";
  plain?: boolean;
}) {
  const map = {
    primary: "bg-primary/8 text-primary border-primary/20",
    success: "bg-success/8 text-success border-success/20",
    destructive: "bg-destructive/8 text-destructive border-destructive/20",
  } as const;
  return (
    <div className={`rounded-xl border ${map[tone]} px-3 py-2 text-center transition-transform hover:-translate-y-0.5`}>
      <div className="text-[10px] font-medium opacity-80">{label}</div>
      <div className="text-base font-bold tabular-nums mt-0.5">
        {plain ? value.toLocaleString() : formatMoney(value)}
      </div>
    </div>
  );
}


/**
 * لوحةُ القفز السريع — Shift+C.
 *
 * غرضُها واحد: الوصول إلى كشف عميلٍ بلا ماوس وبلا مغادرة الصفحة. تُفتح فوق
 * ما يُعرَض، وتُغلق بـEscape أو بالضغطة نفسها، وتُعيد التركيز إلى ما كان.
 *
 * وتبدأ من القائمة المعروضة حالياً — بترتيبها وتصفيتها — لا من كل العملاء.
 * فما تراه أمامك هو ما تقفز بينه، ولا تُفاجأ باسمٍ رشّحتَه بعيداً.
 */
function CustomerJumpPalette({
  rows,
  onPick,
  onClose,
}: {
  rows: Array<{ id: string; name?: string | null; phone?: string | null; _net: number }>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [idx, setIdx] = useState(0);
  const boxRef = useRef<HTMLInputElement>(null);

  useEffect(() => { boxRef.current?.focus(); }, []);

  const list = useMemo(() => {
    const t = term.trim();
    const filtered = t ? rows.filter((c) => containsAny([c.name, c.phone], t)) : rows;
    return filtered.slice(0, 40);
  }, [rows, term]);

  useEffect(() => { setIdx(0); }, [term]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const t = list[idx]; if (t) onPick(t.id); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
      data-testid="jump-palette"
    >
      <div
        dir="rtl"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="قفزٌ سريع بين العملاء"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search size={15} className="text-muted-foreground" />
          <input
            ref={boxRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKey}
            placeholder="اكتب اسم العميل ثم Enter"
            data-testid="palette-input"
            className="w-full bg-transparent text-sm text-foreground outline-none"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {list.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">لا نتائج</p>
          ) : (
            list.map((c, i) => {
              const on = i === idx;
              const net = c._net;
              return (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => onPick(c.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-right transition ${
                    on ? "bg-primary/10" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="truncate text-sm font-semibold text-foreground">{c.name}</span>
                  <span
                    className={`shrink-0 tabular-nums text-xs font-bold ${
                      net > 0.009 ? "text-destructive" : net < -0.009 ? "text-emerald-600" : "text-muted-foreground"
                    }`}
                  >
                    {Math.abs(net) < 0.01 ? "خالص" : `${formatMoney(Math.abs(net))} ${net > 0 ? "عليه" : "له"}`}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> للتنقّل ·
          <kbd className="font-mono"> Enter </kbd> يفتح الكشف ·
          <kbd className="font-mono"> Shift+C </kbd> يُغلق
        </div>
      </div>
    </div>
  );
}

/**
 * الإدخال السريع داخل خليّة الرصيد — رقمٌ ثم اتجاه ثم ✓.
 *
 * ## لماذا لا يكتب في القاعدة
 * لأنّ في النظام مساراً واحداً للشحن يحمل تحقّقاتٍ لا يجوز الالتفاف عليها:
 * التحويل البنكي، ورفضُ الصفر، وقاعدةُ «الشحن يُخزَّن ولا يُوزَّع». وحقلٌ
 * يكتب بنفسه يتخطّاها، وأوّلُ خطأٍ فيه يقع **في المال لا في العرض**.
 *
 * فهذا الحقل يجمع ما يُكتب بسرعة — الرقم والاتجاه — ثمّ يسلّمه للمسار المحكَم
 * مملوءاً. ضغطتان بدل خمس، وحارسٌ لا يُفقد.
 *
 * ## والاتجاه بإشارة النظام
 * «له» موجب (شحنٌ لصالحه)، و«عليه» سالب (خصمٌ يزيد دَينه) — نفس اصطلاح
 * `isCustomerDebitAmount`. فلا اصطلاحَ ثانٍ يُترجَم بينهما.
 */
function QuickChargeCell({
  onConfirm,
  onCancel,
}: {
  onConfirm: (signedAmount: number) => void;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [dir, setDir] = useState<"owed" | "owes">("owed");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const value = Number(String(raw).replace(/[^\d.-]/g, ""));
  const ready = Number.isFinite(value) && Math.abs(value) > 0.009;
  /** «عليه» خصمٌ فيُرسَل سالباً — والقيمة المطلقة تمنع إشارةً مزدوجة. */
  const signed = dir === "owes" ? -Math.abs(value) : Math.abs(value);

  const submit = () => { if (ready) onConfirm(signed); };

  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      data-testid="quick-charge"
    >
      <input
        ref={ref}
        value={raw}
        inputMode="decimal"
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          // سهما اليمين واليسار يبدّلان الاتجاه — بلا مغادرة الحقل
          else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setDir((d) => (d === "owed" ? "owes" : "owed"));
          }
        }}
        onBlur={(e) => {
          // لا يُغلق حين ينتقل التركيز إلى أزراره — وإلا تعذّر الضغط عليها
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) onCancel();
        }}
        placeholder="المبلغ"
        data-testid="quick-charge-amount"
        className="w-24 rounded border border-primary bg-background px-2 py-1 text-sm font-bold tabular-nums outline-none"
      />

      <div className="flex overflow-hidden rounded border border-border" role="group" aria-label="الاتجاه">
        <button
          type="button"
          onClick={() => setDir("owed")}
          aria-pressed={dir === "owed"}
          data-testid="quick-charge-owed"
          title="له — شحن رصيد لصالح العميل"
          className={`px-2 py-1 text-[11px] font-bold transition ${
            dir === "owed" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted/60"
          }`}
        >
          {dir === "owed" && "✓ "}له
        </button>
        <button
          type="button"
          onClick={() => setDir("owes")}
          aria-pressed={dir === "owes"}
          data-testid="quick-charge-owes"
          title="عليه — خصمٌ يزيد دَين العميل"
          className={`px-2 py-1 text-[11px] font-bold transition ${
            dir === "owes" ? "bg-destructive text-white" : "text-muted-foreground hover:bg-muted/60"
          }`}
        >
          {dir === "owes" && "✓ "}عليه
        </button>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!ready}
        data-testid="quick-charge-confirm"
        title="متابعة — يفتح حوار الشحن مملوءاً"
        className="rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
      >
        ✓
      </button>
    </div>
  );
}
