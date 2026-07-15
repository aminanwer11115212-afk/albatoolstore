import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useData";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";

/**
 * لوحة اختيار أولوية استهلاك الرصيد الدائن (FIFO / LIFO).
 * تحفظ الإعداد في company_settings.credit_consumption_order وتُبطّل الكاش.
 * تُعرض أينما احتاج المستخدم لتغيير السياسة بسرعة (كشف الحساب، الإعدادات).
 */
export default function CreditConsumptionOrderControl({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { data: settings } = useCompanySettings();
  const row = (settings as any)?.[0];
  const current: "fifo" | "lifo" = row?.credit_consumption_order === "lifo" ? "lifo" : "fifo";
  const [saving, setSaving] = useState<"fifo" | "lifo" | null>(null);

  const save = async (next: "fifo" | "lifo") => {
    if (!row?.id || next === current) return;
    setSaving(next);
    const { error } = await (supabase as any)
      .from("company_settings")
      .update({ credit_consumption_order: next })
      .eq("id", row.id);
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["companySettings"] });
    qc.invalidateQueries({ queryKey: ["company_settings"] });
    toast.success(`تم تحديث أولوية الاستهلاك: ${next === "fifo" ? "الأقدم أولاً" : "الأحدث أولاً"}`);
  };

  const btn = (val: "fifo" | "lifo", label: string, Icon: any, desc: string) => {
    const active = current === val;
    const isSaving = saving === val;
    return (
      <button
        type="button"
        disabled={!!saving}
        onClick={() => save(val)}
        className={`flex-1 flex items-start gap-2 text-right p-3 rounded-lg border transition text-xs ${
          active
            ? "bg-primary/10 border-primary text-foreground"
            : "bg-background border-border hover:bg-muted text-muted-foreground"
        } ${saving ? "opacity-60" : ""}`}
        data-testid={`credit-order-${val}`}
      >
        {isSaving ? <Loader2 size={14} className="animate-spin mt-0.5" /> : <Icon size={14} className="mt-0.5" />}
        <div className="flex-1">
          <div className="font-semibold">{label}</div>
          {!compact && <div className="text-[10px] leading-relaxed mt-0.5 opacity-80">{desc}</div>}
        </div>
        {active && <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">مفعّل</span>}
      </button>
    );
  };

  return (
    <div dir="rtl" className="bg-card border border-border rounded-lg p-3 space-y-2">
      <div className="text-xs font-semibold text-foreground">أولوية استهلاك الرصيد الدائن</div>
      <div className="flex gap-2">
        {btn("fifo", "الأقدم أولاً (FIFO)", ArrowDown, "يستهلك أوّل رصيد دائن دخل للعميل، ثم الذي يليه.")}
        {btn("lifo", "الأحدث أولاً (LIFO)", ArrowUp, "يستهلك آخر رصيد دائن دخل للعميل، ثم الأقدم.")}
      </div>
    </div>
  );
}
