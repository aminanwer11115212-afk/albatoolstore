import { useState } from "react";
import EditableCell from "@/components/EditableCell";
import InlineSearchSelect from "@/components/InlineSearchSelect";
import { useRowHeights, RowResizeHandle } from "@/hooks/useRowHeights";

type Row = {
  id: string;
  short: string;
  long: string;
  num: string;
  phone: string;
  cat: string;
  company: string;
  inline1: string;
  inline2: string;
  frozen: boolean;
  date: string;
};

const initialRows: Row[] = Array.from({ length: 5 }, (_, i) => ({
  id: `r${i + 1}`,
  short: `عنصر ${i + 1}`,
  long: `وصف طويل للعنصر رقم ${i + 1}`,
  num: String((i + 1) * 10),
  phone: `0791000000${i}`,
  cat: "",
  company: "",
  inline1: "",
  inline2: "",
  frozen: false,
  date: "",
}));

const cats = [
  { value: "c1", label: "فئة 1" },
  { value: "c2", label: "فئة 2" },
  { value: "c3", label: "فئة 3" },
];
const companies = [
  { value: "co1", label: "شركة A" },
  { value: "co2", label: "شركة B" },
  { value: "co3", label: "شركة C" },
];
const inlineOpts = [
  { value: "x1", label: "خيار أول" },
  { value: "x2", label: "خيار ثاني" },
  { value: "x3", label: "خيار ثالث" },
  { value: "x4", label: "رابع" },
  { value: "x5", label: "خامس" },
];

export default function FieldsPlaygroundPage() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [extra, setExtra] = useState(inlineOpts);
  const { getHeight, resetHeight, startDrag, locked, setLocked } =
    useRowHeights("playground:rowH");

  const set = <K extends keyof Row>(id: string, k: K, v: Row[K]) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  const cell = "px-2 py-1 border border-border align-middle";
  const headCell = "px-2 py-2 border border-border bg-muted text-right text-xs font-semibold";

  return (
    <div dir="rtl" className="p-4 space-y-3">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold">اختبار الحقول والقوائم المنسدلة</h1>
          <p className="text-xs text-muted-foreground">
            اضغط <kbd className="px-1 border rounded">Enter</kbd> لفتح القائمة،
            <kbd className="px-1 border rounded mx-1">Backspace</kbd> للإغلاق،
            الأسهم للتنقل بين الخلايا.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocked((v) => !v)}
            className={`px-3 py-1 rounded text-xs border ${
              locked
                ? "bg-yellow-500/15 border-yellow-500 text-yellow-700"
                : "bg-green-500/15 border-green-500 text-green-700"
            }`}
            title="قفل/فتح ارتفاع الصفوف"
          >
            {locked ? "🔒 الارتفاع مقفل" : "🔓 الارتفاع مفتوح"}
          </button>
          <button
            type="button"
            onClick={() => resetHeight()}
            className="px-3 py-1 rounded text-xs border bg-background hover:bg-muted"
          >
            ↺ إعادة الارتفاع
          </button>
        </div>
      </header>

      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th className={headCell}>#</th>
              <th className={headCell}>نص قصير</th>
              <th className={headCell}>نص طويل</th>
              <th className={headCell}>رقم</th>
              <th className={headCell}>هاتف</th>
              <th className={headCell}>{"<select> فئة"}</th>
              <th className={headCell}>{"<select> شركة"}</th>
              <th className={headCell}>InlineSearchSelect (مع إضافة)</th>
              <th className={headCell}>InlineSearchSelect (بدون إضافة)</th>
              <th className={headCell}>تجميد</th>
              <th className={headCell}>تاريخ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const h = getHeight(r.id);
              return (
                <tr
                  key={r.id}
                  style={{ position: "relative", ...(h ? { height: h } : {}) }}
                >
                  <td className={cell} style={{ padding: 0, width: 36, textAlign: "center" }}>
                    {i + 1}
                  </td>
                  <td className={cell} style={{ padding: 0 }}>
                    <EditableCell value={r.short} onSave={(v) => set(r.id, "short", v)} />
                  </td>
                  <td className={cell} style={{ padding: 0 }}>
                    <EditableCell value={r.long} onSave={(v) => set(r.id, "long", v)} />
                  </td>
                  <td className={cell} style={{ padding: 0 }}>
                    <EditableCell
                      value={r.num}
                      onSave={(v) => set(r.id, "num", v)}
                      inputMode="numeric"
                    />
                  </td>
                  <td className={cell} style={{ padding: 0 }}>
                    <EditableCell
                      value={r.phone}
                      onSave={(v) => set(r.id, "phone", v)}
                      inputMode="tel"
                    />
                  </td>
                  <td className={cell} style={{ padding: 0 }}>
                    <select
                      value={r.cat}
                      onChange={(e) => set(r.id, "cat", e.target.value)}
                      className="w-full h-full bg-transparent border-0 outline-none px-1 text-xs"
                    >
                      <option value="">—</option>
                      {cats.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cell} style={{ padding: 0 }}>
                    <select
                      value={r.company}
                      onChange={(e) => set(r.id, "company", e.target.value)}
                      className="w-full h-full bg-transparent border-0 outline-none px-1 text-xs"
                    >
                      <option value="">—</option>
                      {companies.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cell} style={{ padding: 0, minWidth: 160 }}>
                    <InlineSearchSelect
                      value={r.inline1}
                      options={extra}
                      onChange={(v) => set(r.id, "inline1", v)}
                      onAdd={async (name) => {
                        const id = `n${Date.now()}`;
                        setExtra((xs) => [...xs, { value: id, label: name }]);
                        return id;
                      }}
                      addLabel="إضافة"
                      placeholder="—"
                    />
                  </td>
                  <td className={cell} style={{ padding: 0, minWidth: 160 }}>
                    <InlineSearchSelect
                      value={r.inline2}
                      options={inlineOpts}
                      onChange={(v) => set(r.id, "inline2", v)}
                      placeholder="—"
                    />
                  </td>
                  <td
                    className={cell}
                    style={{ padding: 0, width: 56, textAlign: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={r.frozen}
                      onChange={(e) => set(r.id, "frozen", e.target.checked)}
                    />
                  </td>
                  <td className={cell} style={{ padding: 0, width: 140 }}>
                    <input
                      type="date"
                      value={r.date}
                      onChange={(e) => set(r.id, "date", e.target.value)}
                      className="w-full h-full bg-transparent border-0 outline-none px-1 text-xs"
                    />
                  </td>
                  <RowResizeHandle
                    rowId={r.id}
                    startDrag={startDrag}
                    resetHeight={resetHeight}
                    visible={!locked}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-muted-foreground">
        💡 اسحب الحافة السفلية لأي صف (عند فتح القفل) لتغيير ارتفاع كل الصفوف، أو
        انقر مزدوجاً لإعادة الضبط.
      </div>
    </div>
  );
}
