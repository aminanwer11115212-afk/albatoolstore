import { useState, useEffect, useRef } from "react";
import { useCompanySettings } from "@/hooks/useData";
import { useAppearance, type ThemeColor, type FontSize } from "@/hooks/useAppearance";
import { toast } from "sonner";
import { runOrQueue } from "@/lib/offlineQueue";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Building, Receipt, Globe, Clock, Palette, Mail, Upload, Image, Phone, MapPin, FileText, Hash, Percent, DollarSign, Check, RotateCcw, Lock, Unlock, Columns3, Scissors } from "lucide-react";
import { lockAllPagesColumnWidths, unlockAllPagesColumnWidths, resetAllPagesColumnWidths } from "@/hooks/useColumnWidths";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ImageCropDialog from "@/components/shared/ImageCropDialog";
import { Separator } from "@/components/ui/separator";

const tabs = [
  { key: "company", label: "الشركة", icon: <Building size={16} />, path: "/settings/company" },
  { key: "billing", label: "الفوترة", icon: <Receipt size={16} />, path: "/settings/billing" },
  { key: "currency", label: "العملة", icon: <Globe size={16} />, path: "/settings/currency" },
  { key: "datetime", label: "التاريخ والوقت", icon: <Clock size={16} />, path: "/settings/datetime" },
  { key: "theme", label: "المظهر", icon: <Palette size={16} />, path: "/settings/theme" },
  { key: "smtp", label: "SMTP", icon: <Mail size={16} />, path: "/settings/smtp" },
  { key: "columns", label: "أعمدة الجداول", icon: <Columns3 size={16} />, path: "/settings/columns" },
];

export default function CompanySettingsPage() {
  const location = useLocation();
  const currentTab = tabs.find(t => t.path === location.pathname)?.key || "company";
  const [activeTab, setActiveTab] = useState(currentTab);
  const { data, isLoading } = useCompanySettings();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    company_name: "", phone: "", email: "", address: "", tax_number: "",
    currency: "ج.س", logo_url: "", city: "", region: "", country: "السودان", postbox: "", website: "",
  });
  const [billingForm, setBillingForm] = useState({
    invoice_prefix: "INV-", quote_prefix: "QT-", purchase_prefix: "PO-",
    recurring_prefix: "REC-", return_prefix: "RET-", transaction_prefix: "TRX-",
    payment_terms_days: "30", show_discount: true, show_shipping: true,
    invoice_notes: "شكراً لتعاملكم معنا", invoice_footer: "",
    bank_name: "", bank_account: "", iban: "",
  });
  const [smtpForm, setSmtpForm] = useState({
    host: "", port: "587", username: "", password: "", from_name: "", from_email: "", encryption: "tls",
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && data.length > 0) {
      const s = data[0] as any;
      setForm({
        company_name: s.company_name || "", phone: s.phone || "", email: s.email || "",
        address: s.address || "", tax_number: s.tax_number || "",
        currency: s.currency || "ج.س",
        logo_url: s.logo_url || "", city: s.city || "", region: s.region || "",
        country: s.country || "السودان", postbox: s.postbox || "", website: s.website || "",
      });
      setBillingForm(prev => ({
        ...prev,
        invoice_prefix: s.invoice_prefix || "INV-",
        quote_prefix: s.quote_prefix || "QT-",
        purchase_prefix: s.purchase_prefix || "PO-",
        recurring_prefix: s.recurring_prefix || "REC-",
        return_prefix: s.return_prefix || "RET-",
        transaction_prefix: s.transaction_prefix || "TRX-",
        payment_terms_days: String(s.payment_terms_days || 30),
        show_discount: s.show_discount ?? true,
        show_shipping: s.show_shipping ?? true,
        invoice_notes: s.invoice_notes || "شكراً لتعاملكم معنا",
        invoice_footer: s.invoice_footer || "",
        bank_name: s.bank_name || "",
        bank_account: s.bank_account || "",
        iban: s.iban || "",
      }));
      if (s.logo_url) setLogoPreview(s.logo_url);
    }
  }, [data]);

  useEffect(() => {
    const tab = tabs.find(t => t.path === location.pathname)?.key;
    if (tab) setActiveTab(tab);
  }, [location.pathname]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const id = data?.[0]?.id;
      if (id) {
        const { queued, error } = await runOrQueue({
          table: "company_settings",
          op: "update",
          payload: {
            company_name: form.company_name, phone: form.phone, email: form.email,
            address: form.address, tax_number: form.tax_number,
            currency: form.currency,
            logo_url: form.logo_url,
            city: form.city, region: form.region, country: form.country,
            postbox: form.postbox, website: form.website,
          },
          match: { id },
          label: "حفظ إعدادات الشركة",
        });
        if (error) throw error;
        if (queued) toast.info("تم الحفظ محلياً — سيُرفع تلقائياً عند عودة الاتصال");
      }
      toast.success("تم حفظ الإعدادات");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleSaveBilling = async () => {
    setSaving(true);
    try {
      const id = data?.[0]?.id;
      if (id) {
        const { queued, error } = await runOrQueue({
          table: "company_settings",
          op: "update",
          payload: {
            tax_number: form.tax_number,
            invoice_prefix: billingForm.invoice_prefix,
            quote_prefix: billingForm.quote_prefix,
            purchase_prefix: billingForm.purchase_prefix,
            recurring_prefix: billingForm.recurring_prefix,
            return_prefix: billingForm.return_prefix,
            transaction_prefix: billingForm.transaction_prefix,
            payment_terms_days: parseInt(billingForm.payment_terms_days) || 30,
            show_discount: billingForm.show_discount,
            show_shipping: billingForm.show_shipping,
            invoice_notes: billingForm.invoice_notes,
            invoice_footer: billingForm.invoice_footer,
            bank_name: billingForm.bank_name,
            bank_account: billingForm.bank_account,
            iban: billingForm.iban,
        } as any).eq("id", id);
        if (error) throw error;
      }
      toast.success("تم حفظ إعدادات الفوترة");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const [logoCropFile, setLogoCropFile] = useState<File | null>(null);
  const [logoCropOpen, setLogoCropOpen] = useState(false);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (logoInputRef.current) logoInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("يرجى اختيار ملف صورة"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("حجم الملف يجب أن يكون أقل من 2 ميجابايت"); return; }
    setLogoCropFile(file);
    setLogoCropOpen(true);
  };

  const applyLogoCropped = (cropped: File) => {
    setLogoCropOpen(false);
    setLogoCropFile(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setLogoPreview(url);
      setForm(prev => ({ ...prev, logo_url: url }));
    };
    reader.readAsDataURL(cropped);
  };

  if (isLoading) return <p className="text-muted-foreground p-6">جاري التحميل...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings size={24} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground">إعدادات النظام</h1>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-muted rounded-xl p-1">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Company Tab */}
      {activeTab === "company" && (
        <div className="space-y-6">
          {/* Logo Section */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Image size={18} /> شعار الشركة</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div
                  className="w-28 h-28 rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors overflow-hidden bg-muted"
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="شعار الشركة" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-center">
                      <Upload size={24} className="mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">رفع الشعار</p>
                    </div>
                  )}
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                <div className="space-y-2">
                  <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                    <Upload size={14} className="ml-1" /> اختيار صورة
                  </Button>
                  {logoPreview && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const tid = toast.loading("جارٍ تحميل الشعار...");
                          try {
                            const { fetchImageAsFile } = await import("@/utils/fetchImageAsFile");
                            const f = await fetchImageAsFile(logoPreview, "logo.png");
                            toast.dismiss(tid);
                            setLogoCropFile(f);
                            setLogoCropOpen(true);
                          } catch (e: any) {
                            toast.dismiss(tid);
                            toast.error(e?.message || "تعذّر تحميل الشعار لإعادة القص");
                          }
                        }}
                      >
                        <Scissors size={14} className="ml-1" /> إعادة قص
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setLogoPreview(null); setForm(p => ({ ...p, logo_url: "" })); }}>
                        إزالة الشعار
                      </Button>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">PNG, JPG أو SVG. الحد الأقصى 2 ميجابايت</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Info */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building size={18} /> معلومات الشركة</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label className="flex items-center gap-1 mb-1.5"><Building size={12} /> اسم الشركة</Label>
                  <Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} /></div>
                <div><Label className="flex items-center gap-1 mb-1.5"><Phone size={12} /> الهاتف</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} dir="ltr" /></div>
                <div><Label className="flex items-center gap-1 mb-1.5"><Mail size={12} /> البريد الإلكتروني</Label>
                  <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" dir="ltr" /></div>
                <div><Label className="flex items-center gap-1 mb-1.5"><Globe size={12} /> الموقع الإلكتروني</Label>
                  <Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://www.example.com" dir="ltr" /></div>
              </div>
              <Separator className="my-4" />
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><MapPin size={14} /> العنوان</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2"><Label className="mb-1.5">العنوان</Label>
                  <Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} /></div>
                <div><Label className="mb-1.5">المدينة</Label>
                  <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="الخرطوم" /></div>
                <div><Label className="mb-1.5">المنطقة / الولاية</Label>
                  <Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="ولاية الخرطوم" /></div>
                <div><Label className="mb-1.5">البلد</Label>
                  <Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="السودان" /></div>
                <div><Label className="mb-1.5">صندوق البريد</Label>
                  <Input value={form.postbox} onChange={e => setForm({ ...form, postbox: e.target.value })} placeholder="P.O. Box 12345" dir="ltr" /></div>
              </div>
              <Button onClick={handleSave} disabled={saving} className="mt-4">
                {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === "billing" && (
        <div className="space-y-6">
          {/* Tax Number */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Hash size={18} /> الرقم الضريبي</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label className="flex items-center gap-1 mb-1.5"><Hash size={12} /> الرقم الضريبي</Label>
                  <Input value={form.tax_number} onChange={e => setForm({ ...form, tax_number: e.target.value })} placeholder="300000000000003" /></div>
              </div>
            </CardContent>
          </Card>

          {/* Prefixes */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText size={18} /> اختصارات المستندات</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label className="mb-1.5">بادئة الفاتورة</Label>
                  <Input value={billingForm.invoice_prefix} onChange={e => setBillingForm(p => ({ ...p, invoice_prefix: e.target.value }))} dir="ltr" /></div>
                <div><Label className="mb-1.5">بادئة عرض السعر</Label>
                  <Input value={billingForm.quote_prefix} onChange={e => setBillingForm(p => ({ ...p, quote_prefix: e.target.value }))} dir="ltr" /></div>
                <div><Label className="mb-1.5">بادئة أمر الشراء</Label>
                  <Input value={billingForm.purchase_prefix} onChange={e => setBillingForm(p => ({ ...p, purchase_prefix: e.target.value }))} dir="ltr" /></div>
                <div><Label className="mb-1.5">بادئة الفاتورة المتكررة</Label>
                  <Input value={billingForm.recurring_prefix} onChange={e => setBillingForm(p => ({ ...p, recurring_prefix: e.target.value }))} dir="ltr" /></div>
                <div><Label className="mb-1.5">بادئة المرتجعات</Label>
                  <Input value={billingForm.return_prefix} onChange={e => setBillingForm(p => ({ ...p, return_prefix: e.target.value }))} dir="ltr" /></div>
                <div><Label className="mb-1.5">بادئة المعاملات</Label>
                  <Input value={billingForm.transaction_prefix} onChange={e => setBillingForm(p => ({ ...p, transaction_prefix: e.target.value }))} dir="ltr" /></div>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Settings */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt size={18} /> إعدادات الفواتير</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label className="mb-1.5">مدة السداد (أيام)</Label>
                  <Input type="number" value={billingForm.payment_terms_days} onChange={e => setBillingForm(p => ({ ...p, payment_terms_days: e.target.value }))} /></div>
              </div>
              <Separator className="my-4" />
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2"><Switch checked={billingForm.show_discount} onCheckedChange={v => setBillingForm(p => ({ ...p, show_discount: v }))} /><Label>إظهار الخصم</Label></div>
                <div className="flex items-center gap-2"><Switch checked={billingForm.show_shipping} onCheckedChange={v => setBillingForm(p => ({ ...p, show_shipping: v }))} /><Label>إظهار الشحن</Label></div>
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label className="mb-1.5">ملاحظات الفاتورة الافتراضية</Label>
                  <Textarea value={billingForm.invoice_notes} onChange={e => setBillingForm(p => ({ ...p, invoice_notes: e.target.value }))} rows={3} /></div>
                <div><Label className="mb-1.5">تذييل الفاتورة</Label>
                  <Textarea value={billingForm.invoice_footer} onChange={e => setBillingForm(p => ({ ...p, invoice_footer: e.target.value }))} rows={3} placeholder="شروط وأحكام..." /></div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Info */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign size={18} /> معلومات الحساب البنكي</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label className="mb-1.5">اسم البنك</Label><Input value={billingForm.bank_name} onChange={e => setBillingForm(p => ({ ...p, bank_name: e.target.value }))} placeholder="البنك الأهلي" /></div>
                <div><Label className="mb-1.5">رقم الحساب</Label><Input value={billingForm.bank_account} onChange={e => setBillingForm(p => ({ ...p, bank_account: e.target.value }))} dir="ltr" /></div>
                <div><Label className="mb-1.5">IBAN</Label><Input value={billingForm.iban} onChange={e => setBillingForm(p => ({ ...p, iban: e.target.value }))} placeholder="SA..." dir="ltr" /></div>
              </div>
              <Button onClick={handleSaveBilling} disabled={saving} className="mt-4">
                {saving ? "جاري الحفظ..." : "حفظ إعدادات الفوترة"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Currency Tab */}
      {activeTab === "currency" && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign size={18} /> إعدادات العملة</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
              <div>
                <Label className="mb-1.5">العملة الافتراضية</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ج.س">جنيه سوداني (ج.س)</SelectItem>
                    <SelectItem value="SDG">SDG</SelectItem>
                    <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
                    <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                    <SelectItem value="AED">درهم إماراتي (AED)</SelectItem>
                    <SelectItem value="EUR">يورو (EUR)</SelectItem>
                    <SelectItem value="EGP">جنيه مصري (EGP)</SelectItem>
                    <SelectItem value="KWD">دينار كويتي (KWD)</SelectItem>
                    <SelectItem value="QAR">ريال قطري (QAR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">موضع رمز العملة</Label>
                <Select defaultValue="before">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">قبل المبلغ (ج.س 100)</SelectItem>
                    <SelectItem value="after">بعد المبلغ (100 ج.س)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">عدد الخانات العشرية</Label>
                <Select defaultValue="2">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">فاصل الآلاف</Label>
                <Select defaultValue="comma">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comma">فاصلة (1,000.00)</SelectItem>
                    <SelectItem value="dot">نقطة (1.000,00)</SelectItem>
                    <SelectItem value="space">مسافة (1 000.00)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}</Button>
          </CardContent>
        </Card>
      )}

      {/* DateTime Tab */}
      {activeTab === "datetime" && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock size={18} /> إعدادات التاريخ والوقت</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
              <div><Label className="mb-1.5">تنسيق التاريخ</Label>
                <Select defaultValue="dd-mm-yyyy">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dd-mm-yyyy">dd-mm-yyyy</SelectItem>
                    <SelectItem value="mm-dd-yyyy">mm-dd-yyyy</SelectItem>
                    <SelectItem value="yyyy-mm-dd">yyyy-mm-dd</SelectItem>
                    <SelectItem value="dd/mm/yyyy">dd/mm/yyyy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="mb-1.5">تنسيق الوقت</Label>
                <Select defaultValue="24">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 ساعة (14:30)</SelectItem>
                    <SelectItem value="12">12 ساعة (2:30 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="mb-1.5">المنطقة الزمنية</Label>
                <Select defaultValue="Africa/Khartoum">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Khartoum">Africa/Khartoum (UTC+2)</SelectItem>
                    <SelectItem value="Asia/Riyadh">Asia/Riyadh (UTC+3)</SelectItem>
                    <SelectItem value="Asia/Dubai">Asia/Dubai (UTC+4)</SelectItem>
                    <SelectItem value="Africa/Cairo">Africa/Cairo (UTC+2)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="mb-1.5">نوع التقويم</Label>
                <Select defaultValue="gregorian">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gregorian">ميلادي</SelectItem>
                    <SelectItem value="hijri">هجري</SelectItem>
                    <SelectItem value="both">ميلادي + هجري</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => toast.success("تم حفظ الإعدادات")}>حفظ الإعدادات</Button>
          </CardContent>
        </Card>
      )}

      {/* Theme Tab */}
      {activeTab === "theme" && (
        <ThemeTab />
      )}

      {/* SMTP Tab */}
      {activeTab === "smtp" && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail size={18} /> إعدادات خادم البريد SMTP</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label className="mb-1.5">SMTP Host</Label><Input value={smtpForm.host} onChange={e => setSmtpForm(p => ({ ...p, host: e.target.value }))} placeholder="smtp.gmail.com" dir="ltr" /></div>
              <div><Label className="mb-1.5">SMTP Port</Label><Input value={smtpForm.port} onChange={e => setSmtpForm(p => ({ ...p, port: e.target.value }))} dir="ltr" /></div>
              <div><Label className="mb-1.5">اسم المستخدم</Label><Input value={smtpForm.username} onChange={e => setSmtpForm(p => ({ ...p, username: e.target.value }))} placeholder="user@example.com" dir="ltr" /></div>
              <div><Label className="mb-1.5">كلمة المرور</Label><Input type="password" value={smtpForm.password} onChange={e => setSmtpForm(p => ({ ...p, password: e.target.value }))} /></div>
              <div><Label className="mb-1.5">اسم المرسل</Label><Input value={smtpForm.from_name} onChange={e => setSmtpForm(p => ({ ...p, from_name: e.target.value }))} placeholder="شركة البتول" /></div>
              <div><Label className="mb-1.5">بريد المرسل</Label><Input value={smtpForm.from_email} onChange={e => setSmtpForm(p => ({ ...p, from_email: e.target.value }))} placeholder="info@albatool.com" dir="ltr" /></div>
              <div><Label className="mb-1.5">التشفير</Label>
                <Select value={smtpForm.encryption} onValueChange={v => setSmtpForm(p => ({ ...p, encryption: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tls">TLS</SelectItem>
                    <SelectItem value="ssl">SSL</SelectItem>
                    <SelectItem value="none">بدون تشفير</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => toast.success("تم حفظ الإعدادات")}>حفظ الإعدادات</Button>
              <Button variant="outline" onClick={() => toast.info("جاري إرسال بريد تجريبي...")}>إرسال بريد تجريبي</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Columns Tab */}
      {activeTab === "columns" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Columns3 size={18} /> تثبيت عرض الأعمدة في كل الصفحات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              اضبط مقاسات الأعمدة في صفحات المنتجات والعملاء والفواتير وعروض السعر والمشتريات والمرتجعات بحرية، ثم اضغط
              <b> "قفل كل الصفحات" </b>
              ليُحفظ التنسيق ويُمنع تغييره بالخطأ. هذا الإعداد يخصّك أنت فقط — كل مستخدم له تنسيقه المستقل.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => { lockAllPagesColumnWidths(); toast.success("تم قفل عرض الأعمدة في كل الصفحات"); }}
              >
                <Lock size={16} className="ml-1" /> قفل كل الصفحات
              </Button>
              <Button
                variant="outline"
                onClick={() => { unlockAllPagesColumnWidths(); toast.success("تم فتح القفل — يمكنك الآن سحب حواف الأعمدة"); }}
              >
                <Unlock size={16} className="ml-1" /> فتح القفل لتعديل الأعمدة
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!confirm("هل تريد إعادة جميع أحجام الأعمدة إلى الافتراضي في كل الصفحات؟")) return;
                  resetAllPagesColumnWidths();
                  toast.success("تم إعادة ضبط أحجام الأعمدة في كل الصفحات");
                }}
              >
                <RotateCcw size={16} className="ml-1" /> إعادة ضبط أحجام الأعمدة
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ImageCropDialog
        open={logoCropOpen}
        file={logoCropFile}
        onCancel={() => { setLogoCropOpen(false); setLogoCropFile(null); }}
        onConfirm={applyLogoCropped}
        defaultAspect="1:1"
        title="قص شعار الشركة"
      />
    </div>
  );
}

function ThemeTab() {
  const { settings, update, reset } = useAppearance();
  const colors: { key: ThemeColor; name: string; hsl: string }[] = [
    { key: "orange", name: "برتقالي (افتراضي)", hsl: "25 95% 53%" },
    { key: "blue",   name: "أزرق",              hsl: "217 91% 60%" },
    { key: "green",  name: "أخضر",              hsl: "142 71% 45%" },
    { key: "purple", name: "بنفسجي",            hsl: "262 83% 58%" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Palette size={18} /> إعدادات المظهر
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="mb-3 block">لون النظام الرئيسي</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {colors.map((c) => {
              const active = settings.color === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { update({ color: c.key }); toast.success(`تم تطبيق اللون: ${c.name}`); }}
                  className={`p-4 rounded-xl border transition-all text-center ${
                    active ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <div
                    className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center"
                    style={{ background: `hsl(${c.hsl})` }}
                  >
                    {active && <Check size={20} className="text-white" />}
                  </div>
                  <span className="text-sm text-foreground">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        <div>
          <Label className="mb-3 block">حجم الخط</Label>
          <Select
            value={settings.fontSize}
            onValueChange={(v) => { update({ fontSize: v as FontSize }); toast.success("تم تحديث حجم الخط"); }}
          >
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="small">صغير</SelectItem>
              <SelectItem value="medium">متوسط (افتراضي)</SelectItem>
              <SelectItem value="large">كبير</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            يطبَّق على كامل النظام (الويب، Android، iOS، Desktop).
          </p>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={settings.showSidebar}
              onCheckedChange={(v) => update({ showSidebar: v })}
            />
            <Label>إظهار الشريط الجانبي</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={settings.showFloatingTools}
              onCheckedChange={(v) => update({ showFloatingTools: v })}
            />
            <Label>الأدوات العائمة</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={settings.mode === "dark"}
              onCheckedChange={(v) => update({ mode: v ? "dark" : "light" })}
            />
            <Label>الوضع الداكن</Label>
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast.success("تم حفظ إعدادات المظهر")}>
            <Check size={16} className="ml-1" /> حفظ الإعدادات
          </Button>
          <Button
            variant="outline"
            onClick={() => { reset(); toast.success("تمت إعادة الإعدادات للافتراضي"); }}
          >
            <RotateCcw size={16} className="ml-1" /> إعادة التعيين
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
