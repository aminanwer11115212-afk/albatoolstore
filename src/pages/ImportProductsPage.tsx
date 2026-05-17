import { useState, useRef } from "react";
import ZoomControls from "@/components/ZoomControls";
import { toast } from "sonner";

export default function ImportProductsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setResult(null); }
  };

  const handleImport = () => {
    if (!file) return toast.error("اختر ملف أولاً");
    setImporting(true); setProgress(0); setResult(null);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { clearInterval(interval); setImporting(false); setResult({ success: 45, errors: 2 }); toast.success("تم الاستيراد"); return 100; }
        return p + 10;
      });
    }, 200);
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h5 style={{ margin: 0 }}>استيراد المنتجات</h5>
          <ZoomControls />
        </div>
        <hr />
        <div className="legacy-form-horizontal">
          <div className="legacy-form-row">
            <label className="legacy-form-label">الملف</label>
            <div className="legacy-form-control-wrap">
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} className="legacy-control" />
              <small style={{ color: "hsl(var(--muted-foreground))" }}>يدعم CSV, XLSX, XLS</small>
            </div>
          </div>
          {importing && (
            <div className="legacy-form-row">
              <label className="legacy-form-label">التقدم</label>
              <div className="legacy-form-control-wrap">
                <div style={{ background: "hsl(var(--muted))", height: 8, borderRadius: 4 }}>
                  <div style={{ background: "hsl(var(--primary))", width: `${progress}%`, height: "100%", borderRadius: 4 }} />
                </div>
              </div>
            </div>
          )}
          {result && (
            <div className="legacy-form-row">
              <label className="legacy-form-label">النتيجة</label>
              <div className="legacy-form-control-wrap">
                <span className="st-paid">{result.success} ناجح</span>{" "}
                <span className="st-due">{result.errors} خطأ</span>
              </div>
            </div>
          )}
          <div className="legacy-form-row">
            <label className="legacy-form-label"></label>
            <div className="legacy-form-control-wrap">
              <button onClick={handleImport} disabled={!file || importing} className="legacy-btn legacy-btn-success">
                {importing ? "جاري..." : "بدء الاستيراد"}
              </button>{" "}
              <button onClick={() => toast.info("جاري تحميل القالب...")} className="legacy-btn legacy-btn-info">تحميل القالب</button>
            </div>
          </div>
        </div>

        <h5 style={{ marginTop: "1.5rem" }}>الأعمدة المطلوبة</h5>
        <hr />
        <table className="legacy-table">
          <thead><tr><th>العمود</th><th>الوصف</th></tr></thead>
          <tbody>
            <tr className="odd"><td><b>name</b></td><td>اسم المنتج (مطلوب)</td></tr>
            <tr className="even"><td><b>sku</b></td><td>رمز المنتج</td></tr>
            <tr className="odd"><td><b>sale_price</b></td><td>سعر البيع</td></tr>
            <tr className="even"><td><b>purchase_price</b></td><td>سعر الشراء</td></tr>
            <tr className="odd"><td><b>stock_quantity</b></td><td>الكمية</td></tr>
            <tr className="even"><td><b>min_stock</b></td><td>الحد الأدنى</td></tr>
            <tr className="odd"><td><b>unit</b></td><td>الوحدة</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}
