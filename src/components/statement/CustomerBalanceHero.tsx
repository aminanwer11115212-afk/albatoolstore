import { useMemo } from "react";
import { Link } from "react-router-dom";
import { netBalanceOf, formatMoney } from "@/utils/balanceDisplay";
import { TrendingUp, TrendingDown, CheckCircle2, ArrowRight } from "lucide-react";

/**
 * بطاقة عرض بارزة لصافي رصيد العميل — تُستخدم في أعلى صفحة كشف الحساب.
 * تعتمد كلياً على netBalanceOf كمصدر وحيد (نفس الرقم في كل النظام).
 *
 * ميّزات التصميم:
 *  - تدرّج ناعم من ألوان النظام (بدون ألوان صريحة).
 *  - أنيميشن دخول (fade + slide) + halo نابض لطيف حول الرقم لجذب الانتباه.
 *  - شرائح ملخّص جانبية: فواتير / مدفوع / متبقٍ.
 *  - يعمل RTL افتراضياً وبخط Cairo السميك.
 */
type Customer = {
  name?: string | null;
  phone?: string | null;
  balance?: number | null;
  credit_balance?: number | null;
  net_balance?: number | null;
};

type Props = {
  customer: Customer;
  totalInvoices: number;
  totalPaid: number;
};

export default function CustomerBalanceHero({ customer, totalInvoices, totalPaid }: Props) {
  const net = useMemo(() => netBalanceOf(customer), [customer]);
  const remaining = totalInvoices - totalPaid;
  const isDebtor = net > 0.005;
  const isCreditor = net < -0.005;
  const label = isDebtor ? "عليه" : isCreditor ? "له" : "خالص";
  const Icon = isDebtor ? TrendingUp : isCreditor ? TrendingDown : CheckCircle2;

  const accent = isDebtor
    ? { text: "text-destructive", ring: "ring-destructive/30", halo: "bg-destructive/15", chip: "bg-destructive/10 text-destructive" }
    : isCreditor
      ? { text: "text-success", ring: "ring-success/30", halo: "bg-success/15", chip: "bg-success/10 text-success" }
      : { text: "text-foreground", ring: "ring-border", halo: "bg-muted", chip: "bg-muted text-foreground" };

  return (
    <div
      dir="rtl"
      data-testid="customer-balance-hero"
      className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-l from-primary/5 via-card to-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500"
    >
      {/* زخرفة خلفية ناعمة */}
      <div aria-hidden className="pointer-events-none absolute -top-16 -start-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className={`pointer-events-none absolute -bottom-20 -end-20 h-56 w-56 rounded-full ${accent.halo} blur-3xl`} />

      <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
        {/* اليمين: اسم العميل + الرقم البارز */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <Link
              to="/customers/statements"
              data-testid="hero-back-to-statements"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowRight size={14} />
              كشوفات العملاء
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-muted-foreground">كشف حساب عميل</span>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <Link
              to="/customers/statements"
              data-testid="hero-customer-name"
              title="العودة إلى قائمة كشوفات العملاء"
              className="text-2xl md:text-3xl font-bold text-foreground leading-tight hover:text-primary transition-colors"
            >
              {customer.name || "—"}
            </Link>
            {customer.phone && (
              <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                📞 {customer.phone}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${accent.chip}`}>
              <Icon size={14} />
              {label}
            </span>
            <span className="text-xs text-muted-foreground">الرصيد الصافي الحالي</span>
          </div>

          <div className="relative inline-block">
            {/* halo pulsing behind number */}
            <span
              aria-hidden
              className={`absolute inset-0 -m-2 rounded-2xl ${accent.halo} blur-md animate-pulse [animation-duration:2.5s]`}
            />
            <div
              className={`relative text-4xl md:text-5xl font-black tabular-nums tracking-tight ${accent.text}`}
              data-testid="hero-net-balance"
              data-net-balance={net}
            >
              {isDebtor && <span className="opacity-80 me-1">−</span>}
              {formatMoney(Math.abs(net))}
            </div>
          </div>
        </div>

        {/* اليسار: شرائح إجمالية */}
        <div className="grid grid-cols-3 gap-2 min-w-[220px]">
          <StatChip label="الفواتير" value={totalInvoices} tone="primary" />
          <StatChip label="المدفوع" value={totalPaid} tone="success" />
          <StatChip label="المتبقي" value={remaining} tone={remaining > 0.005 ? "destructive" : "muted"} />
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "destructive" | "muted";
}) {
  const map = {
    primary: "bg-primary/8 text-primary border-primary/20",
    success: "bg-success/8 text-success border-success/20",
    destructive: "bg-destructive/8 text-destructive border-destructive/20",
    muted: "bg-muted text-muted-foreground border-border",
  } as const;
  return (
    <div className={`rounded-xl border ${map[tone]} px-3 py-2 text-center transition-transform hover:-translate-y-0.5`}>
      <div className="text-[10px] font-medium opacity-80">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{formatMoney(value)}</div>
    </div>
  );
}
