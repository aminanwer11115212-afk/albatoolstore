import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useUserRole } from "@/hooks/useUserRole";

export type EditableCharge = {
  groupId: string;
  customerId: string;
  amount: number;
  method?: string | null;
  accountId?: string | null;
  date?: string | null;
  hasConsumption: boolean;
};

interface Props {
  open: boolean;
  charge: EditableCharge | null;
  onClose: () => void;
  onSaved?: () => void;
}

const REASONS: Record<string, string> = {
  unauthorized_admin_only: "التعديل مسموح لمدير النظام فقط",
  missing_group_id: "مُعرِّف الشحنة مفقود",
  invalid_amount: "المبلغ غير صالح",
  group_not_found: "الشحنة غير موجودة",
  charge_partly_consumed: "الشحنة استُهلك جزء منها على فواتير — ألغِ التوزيع أولاً",
  reverse_failed: "تعذّر إعادة الشحنة قبل التعديل",
};

type Account = { id: string; name: string; bank_name: string | null; account_type: string | null };

export default function EditChargeDialog({ open, charge, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const { isAdmin } = useUserRole();
  const [mode, setMode] = useState<"edit" | "cancel">("edit");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [accountId, setAccountId] = useState<string | "none">("none");
  const [date, setDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!open || !charge) return;
    setMode(charge.hasConsumption ? "cancel" : "edit");
    setAmount(String(charge.amount ?? ""));
    setMethod(charge.method || "cash");
    setAccountId((charge.accountId as any) || "none");
    setDate(charge.date || new Date().toISOString().slice(0, 10));
    setReferenceNo("");
    setNote("");
    setReason("");
    setCancelReason("");
    (async () => {
      const { data } = await supabase.from("accounts").select("id,name,bank_name,account_type").order("name");
      setAccounts((data as Account[]) || []);
    })();
  }, [open, charge]);

  if (!charge) return null;

  const filteredAccounts = method === "bank" || method === "bank_transfer"
    ? accounts.filter((a) => a.account_type === "bank")
    : accounts;

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["accounts"] }),
      qc.invalidateQueries({ queryKey: ["customers"] }),
      qc.invalidateQueries({ queryKey: ["invoices"] }),
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] }),
      qc.invalidateQueries({ queryKey: ["activity-log"] }),
      qc.invalidateQueries({ queryKey: ["customer-charge-history", charge?.customerId] }),
      qc.invalidateQueries({ queryKey: ["customer", charge?.customerId] }),
      qc.invalidateQueries({ queryKey: ["customer-audit-log", charge?.customerId] }),
    ]);
  }

  async function handleSave() {
    if (!isAdmin) return toast.error(REASONS.unauthorized_admin_only);
    const num = Number(amount) || 0;
    if (num <= 0) return toast.error("المبلغ غير صالح");
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("revise_customer_charge", {
        _group_id: charge.groupId,
        _new_amount: num,
        _new_method: method || null,
        _new_account_id: accountId === "none" ? null : accountId,
        _new_date: date || null,
        _new_reference_no: referenceNo || null,
        _new_note: note || null,
        _reason: reason || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(REASONS[data?.reason] || `تعذّر التعديل: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      await invalidateAll();
      toast.success("تم تعديل الشحنة وإعادة توزيع الرصيد");
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء التعديل");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!isAdmin) return toast.error(REASONS.unauthorized_admin_only);
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("cancel_customer_charge", {
        _group_id: charge.groupId, _reason: cancelReason || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(REASONS[data?.reason] || `تعذّر الإلغاء: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      await invalidateAll();
      toast.success("تم إلغاء الشحنة وإعادة حساب الأرصدة");
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء الإلغاء");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل شحن الرصيد</DialogTitle>
        </DialogHeader>

        {!isAdmin && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
            التعديل مسموح لمدير النظام فقط.
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 space-y-1">
          <div>قيمة الشحنة الحالية: <b className="text-foreground">{Number(charge.amount || 0).toLocaleString()}</b></div>
          {charge.hasConsumption && (
            <div className="text-destructive">
              ⚠️ هذه الشحنة استُهلك جزء منها على فواتير — التعديل غير مسموح، يمكنك فقط إلغاؤها بالكامل.
            </div>
          )}
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="edit" disabled={charge.hasConsumption}>تعديل</TabsTrigger>
            <TabsTrigger value="cancel">إلغاء الشحنة</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">المبلغ</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">طريقة الدفع</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="bank">تحويل بنكي</SelectItem>
                    <SelectItem value="mobile">محفظة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">الحساب المستلم</Label>
                <Select value={accountId} onValueChange={(v) => setAccountId(v as any)}>
                  <SelectTrigger><SelectValue placeholder="— اختر —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون —</SelectItem>
                    {filteredAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.bank_name ? `${a.bank_name} — ${a.name}` : a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">رقم العملية</Label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="اختياري" />
              </div>
            </div>
            <div>
              <Label className="text-xs">ملاحظة</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة تظهر مع الشحنة" />
            </div>
            <div>
              <Label className="text-xs">سبب التعديل</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="للسجل" />
            </div>
          </TabsContent>

          <TabsContent value="cancel" className="space-y-3 pt-3">
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
              سيتم عكس الشحنة بالكامل، حذف قيود التوزيع/الفائض، وإعادة حساب الأرصدة.
            </div>
            <div>
              <Label className="text-xs">سبب الإلغاء</Label>
              <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="اذكر السبب للسجل" />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>رجوع</Button>
          {mode === "edit" ? (
            <Button onClick={handleSave} disabled={saving || !isAdmin || charge.hasConsumption}>
              {saving ? "جارٍ الحفظ…" : "حفظ التعديل"}
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleCancel} disabled={saving || !isAdmin}>
              {saving ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
