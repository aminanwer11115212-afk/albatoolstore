import { useState } from "react";
import { toast } from "sonner";

export default function TwilioSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const save = () => {
    if (enabled && (!accountSid || !authToken || !phoneNumber)) return toast.error("أكمل الحقول");
    toast.success("تم الحفظ");
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>إعدادات Twilio SMS</h5>
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
          <div className="legacy-form-row"><label className="legacy-form-label">Account SID</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={accountSid} onChange={(e) => setAccountSid(e.target.value)} dir="ltr" /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">Auth Token</label><div className="legacy-form-control-wrap"><input type="password" className="legacy-control" value={authToken} onChange={(e) => setAuthToken(e.target.value)} dir="ltr" /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">رقم الهاتف</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1234567890" dir="ltr" /></div></div>
          <div className="legacy-form-row">
            <label className="legacy-form-label"></label>
            <div className="legacy-form-control-wrap">
              <button onClick={save} className="legacy-btn legacy-btn-success">حفظ</button>{" "}
              <button onClick={() => toast.info("جاري الإرسال...")} className="legacy-btn legacy-btn-info">إرسال تجريبي</button>{" "}
              <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="legacy-btn legacy-btn-default">لوحة Twilio</a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
