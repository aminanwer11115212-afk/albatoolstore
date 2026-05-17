import { useState } from "react";
import { toast } from "sonner";

export default function RecaptchaSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [version, setVersion] = useState<"v2" | "v3">("v2");

  const save = () => {
    if (enabled && (!siteKey || !secretKey)) return toast.error("أدخل المفاتيح المطلوبة");
    toast.success("تم الحفظ");
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>إعدادات Google reCAPTCHA</h5>
        <hr />
        <div className="legacy-form-horizontal">
          <div className="legacy-form-row">
            <label className="legacy-form-label">الحالة</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={enabled ? "1" : "0"} onChange={(e) => setEnabled(e.target.value === "1")}>
                <option value="0">معطّل</option><option value="1">مفعّل</option>
              </select>
            </div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">الإصدار</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={version} onChange={(e) => setVersion(e.target.value as any)}>
                <option value="v2">reCAPTCHA v2</option><option value="v3">reCAPTCHA v3</option>
              </select>
            </div>
          </div>
          <div className="legacy-form-row"><label className="legacy-form-label">Site Key</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={siteKey} onChange={(e) => setSiteKey(e.target.value)} dir="ltr" /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">Secret Key</label><div className="legacy-form-control-wrap"><input type="password" className="legacy-control" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} dir="ltr" /></div></div>
          <div className="legacy-form-row">
            <label className="legacy-form-label"></label>
            <div className="legacy-form-control-wrap">
              <button onClick={save} className="legacy-btn legacy-btn-success">حفظ</button>{" "}
              <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noopener noreferrer" className="legacy-btn legacy-btn-info">الحصول على المفاتيح</a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
