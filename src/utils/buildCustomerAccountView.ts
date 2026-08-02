/**
 * عرض حساب العميل مجمّعاً حسب الفاتورة — بلا توزيع تلقائي ولا تسوية تراكمية.
 *
 * كل فاتورة كتلة مستقلة تتبعها **حركاتها الحقيقية فقط**: الحركة تُنسب لفاتورة
 * إذا كانت تشير إليها صراحةً (`reference_id`) — لا استنتاج FIFO ولا تخمين عن
 * أي شحنة غُطّي منها. شحنات الرصيد غير المرتبطة بفاتورة تبقى في «الرصيد
 * القابل للتوزيع» ينقص من إجمالي حساب العميل، ويوزّعه المستخدم يدوياً.
 *
 * ## قاعدة الإشارة (نفس `netBalanceOf`)
 *   موجب  → «عليه» (مدين لنا)   — يُعرض بالأحمر بإشارة −
 *   سالب  → «له»   (دائن له)    — يُعرض بالأخضر بإشارة +
 *
 * ## الأثر على الحساب (`effect`)
 *   إنشاء فاتورة            → +الإجمالي
 *   دفعة نقدية/بنكية        → −المبلغ
 *   فائض دفعة (رصيد دائن)   → −المبلغ
 *   شحن رصيد                → −المبلغ
 *   سداد فاتورة من الرصيد   → 0 (المديونية والرصيد ينقصان معاً)
 *
 * ## الثابت المحفوظ
 *   إجمالي حساب العميل = Σ(متبقي الفواتير بإشارته) − الرصيد القابل للتوزيع
 *                      = `net_balance` المحسوب من القاعدة.
 * وهو أيضاً ناتج تراكم `effect` على كامل السلسلة.
 */
import { extractOperationNo } from "@/utils/buildCustomerLedger";
import { classifyCreditRow } from "@/utils/creditSource";

export type AccountEntryKind =
  | "invoice"
  | "payment"
  | "credit_settle"
  | "overpay"
  | "credit_charge"
  | "adjust";

export interface AccountEntry {
  id: string;
  kind: AccountEntryKind;
  /** طابع زمني كامل للترتيب والعرض بدقة الساعة */
  at: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM أو "" إن لم يُسجَّل وقت */
  time: string;
  /** اسم اليوم بالعربية */
  dayName: string;
  label: string;
  /** الحساب/الطريقة/رقم العملية */
  detail: string;
  /** جملة كاملة بصيغة مخاطبة العميل — لمن لا يقرأ لغة المحاسبة */
  customerText: string;
  /** أثر العملية على حساب العميل — موجب يزيد ما عليه، سالب يزيد ما له */
  effect: number;
  /** رصيد حساب العميل بعد هذه العملية */
  runningBalance: number;
  raw?: any;
}

export interface InvoiceBlock {
  invoiceId: string;
  invoiceNumber: string;
  at: string;
  date: string;
  time: string;
  dayName: string;
  total: number;
  /** المدفوع على الفاتورة (نقداً + ما طُبِّق من الرصيد) */
  paid: number;
  /**
   * المتبقي بإشارته: موجب «عليه»، سالب «له» (دفع أكثر من قيمتها).
   * يشمل الفائض المرتبط بهذه الفاتورة تحديداً.
   */
  remaining: number;
  /** الفائض المرتبط بهذه الفاتورة (يُستثنى من الرصيد القابل للتوزيع) */
  linkedOverpay: number;
  movements: AccountEntry[];
  /** رصيد حساب العميل لحظة إنشاء الفاتورة (قبل حركاتها) — يُعرض على سطرها */
  runningAtCreation: number;
  /** رصيد حساب العميل بعد آخر حركة في هذه الكتلة */
  runningAfter: number;
}

/**
 * عقدة في الجدول الزمني: إمّا كتلة فاتورة، وإمّا شريط شحن رصيد يفصل بين
 * الفواتير في موضعه الزمني الصحيح.
 */
export type TimelineNode =
  | { type: "invoice"; block: InvoiceBlock }
  | { type: "credit_band"; entry: AccountEntry };

export type AccountRowKind = "invoice" | "credit";

/**
 * سطر واحد في جدول الكشف المسطّح — نوعان فقط: فاتورة، وشحن رصيد.
 *
 * **لا أسطر سداد.** السداد من الرصيد نقلٌ داخلي لا يغيّر صافي حساب العميل،
 * فإظهاره يشوّش على العميل بلا فائدة: عمود «المتبقي» على سطر الشحن يُظهر
 * أثره على الحساب مباشرةً. وتفاصيل الشحن نفسها مكانها شاشة المعاملات.
 *
 * ## الأعمدة
 *   `value`  «القيمة»  — قيمة الفاتورة، و`null` لسطر الشحن
 *   `paid`   «المدفوع» — المدفوع نقداً على الفاتورة، أو مبلغ الشحن
 *   `remaining` «المتبقي» — بإشارة **العرض**: موجب لصالح العميل، سالب عليه
 *
 * ## قاعدة عمود «المتبقي» — كل سطر يُحسب وحده
 *   سطر فاتورة → المدفوع نقداً − قيمتها (سالبٌ عليه، موجبٌ فائض)
 *   سطر شحن   → مبلغ الشحن موجباً
 *
 * فالعمود **يُجمَع رأسياً فيعطي صافي الحساب**، ويستطيع العميل التحقّق بنفسه:
 *
 *     فاتورة 500  دفع 300   →  −200
 *     فاتورة 600  دفع 400   →  −200
 *     فاتورة 300  دفع 200   →  −100
 *     فاتورة 500  دفع 1000  →  +500
 *     فاتورة 500  دفع 100   →  −400
 *     شحن رصيد              →  +300
 *     ──────────────────────────────
 *     الجملة                →  −100
 *
 * وكان سطر الشحن يحمل الرصيدَ الجاري بعده بدل مبلغه، فلا يُجمع العمود ولا
 * يعرف قارئه من أين جاء الرقم. والشحن يُخصم من **التراكمي** لا من فاتورةٍ
 * بعينها — ولهذا يقف سطراً مستقلاً لا خصماً داخل صف فاتورة.
 *
 * ## الحساب يقفل بطرح بسيط يستطيع العميل التحقّق منه بنفسه
 *   Σ القيمة − Σ المدفوع = −(المتبقي في سطر المجموع) = صافي الحساب.
 * ولهذا يحمل سطر الفاتورة **النقد وحده**: ما سُدِّد من الرصيد محسوب أصلاً
 * ضمن مبلغ الشحن في عموده، فاحتسابه مرّتين يكسر الطرح.
 */
export interface AccountRow {
  id: string;
  kind: AccountRowKind;
  at: string;
  date: string;
  time: string;
  /** «البيان» — نص واحد يقرأه العميل مباشرة */
  label: string;
  value: number | null;
  paid: number | null;
  remaining: number;
  /** الفاتورة التي يخصّها السطر إن وُجدت — للفلترة في الشاشة الداخلية */
  invoiceId?: string;
  /**
   * مصدر الرصيد على أسطر `credit`. الشريط الأخضر الفاصل **للشحن وحده**:
   * الشحن مالٌ جديد دخل الحساب فيستحق فاصلاً بارزاً، أمّا الفائض فهو بقيّة
   * دفعةٍ على فاتورة قائمة — إبرازه بنفس القوّة يوحي بمالٍ ثانٍ لم يُدفع.
   */
  creditKind?: "charge" | "overpay";
}

export interface CustomerAccountView {
  /** الجدول المسطّح المعروض للعميل — كل الأسطر بنفس الشكل بترتيبها الزمني */
  rows: AccountRow[];
  /** الفواتير وشحنات الرصيد بترتيبها الزمني الواحد */
  timeline: TimelineNode[];
  blocks: InvoiceBlock[];
  /** شحنات الرصيد غير المرتبطة بفاتورة — قابلة للتوزيع يدوياً */
  creditPool: AccountEntry[];
  creditPoolTotal: number;
  totalInvoiced: number;
  totalPaid: number;
  /** Σ متبقي الفواتير بإشارته */
  totalRemaining: number;
  /** مجموع عمود «القيمة» في الجدول المسطّح */
  rowsValue: number;
  /** مجموع عمود «المدفوع» في الجدول المسطّح: نقد الفواتير + الشحنات */
  rowsPaid: number;
  /** إجمالي حساب العميل = totalRemaining − creditPoolTotal */
  accountTotal: number;
  /** فرق عن `net_balance` المخزَّن — يجب أن يكون 0 */
  drift: number;
}

const num = (v: any) => Number(v || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدًا",
  bank: "تحويل بنكي",
  bank_transfer: "تحويل بنكي",
  card: "بطاقة",
  mobile: "محفظة",
  credit_balance: "رصيد العميل",
};

/** تفكيك طابع زمني إلى تاريخ + وقت + اسم يوم. */
export function stampOf(row: { date?: any; created_at?: any }): {
  at: string; date: string; time: string; dayName: string;
} {
  const created = row.created_at ? String(row.created_at) : "";
  const plainDate = row.date ? String(row.date).slice(0, 10) : created.slice(0, 10);
  // الوقت يأتي من created_at وحده؛ عمود date تاريخ بلا وقت.
  const d = created ? new Date(created) : plainDate ? new Date(`${plainDate}T00:00:00`) : null;
  const valid = d && !Number.isNaN(d.getTime());
  const hasTime = !!created && valid;
  return {
    at: valid ? d!.toISOString() : plainDate,
    date: plainDate || (valid ? d!.toISOString().slice(0, 10) : ""),
    time: hasTime
      ? `${String(d!.getHours()).padStart(2, "0")}:${String(d!.getMinutes()).padStart(2, "0")}`
      : "",
    dayName: valid ? DAY_NAMES[d!.getDay()] : "",
  };
}

/** تنسيق مبلغ للعرض للعميل. */
const money = (n: number) => Math.abs(r2(n)).toLocaleString();

/**
 * نصّ سطر الإيراد — المبلغ بإشارته، ثم ما يُعرَّف به الإيراد.
 *
 * سطر الفاتورة يحمل رقمها فيعرف العميل أي ورقة يقابله. وكان سطر الشحن بلا
 * معرّف أصلاً: «تم شحن +500» — فإن تكرّر شحنان بنفس المبلغ لم يُميَّزا، ولا
 * يستطيع العميل مطابقة السطر بإيصال تحويله.
 *
 * فصار يحمل حسابه ورقم عمليته — وهو ما يُعرَّف به الإيراد كما يُعرَّف بند
 * الفاتورة برقمها. والأرقام تبقى في أعمدتها لا في النصّ.
 */
function chargeLabel(entry: AccountEntry, amount: number): string {
  const head = entry.kind === "overpay" ? "دفعة زائدة" : "تم شحن";
  const detail = (entry.detail || "").trim();
  return detail ? `${head} +${money(amount)} — ${detail}` : `${head} +${money(amount)}`;
}

function accountOf(t: any, map?: Map<string, string>): string {
  if (t.method === "credit_balance") return "رصيد العميل";
  if (!t.account_id) return METHOD_LABEL[t.method] || "نقدًا";
  return map?.get(t.account_id) || METHOD_LABEL[t.method] || "—";
}

export interface BuildAccountViewInput {
  invoices?: any[];
  transactions?: any[];
  accountNameById?: Map<string, string>;
  /** `net_balance` المخزَّن — للتحقّق من عدم الانحراف */
  netBalance?: number | null;
}

export function buildCustomerAccountView(input: BuildAccountViewInput): CustomerAccountView {
  const { invoices = [], transactions = [], accountNameById, netBalance } = input;

  const liveInvoices = invoices.filter((i) => i.status !== "cancelled");
  const invoiceIds = new Set(liveInvoices.map((i) => String(i.id)));

  // ===== 1) دمج (استهلاك رصيد + دفعة بطريقة credit_balance) في حركة واحدة =====
  // الصفّان متلازمان وأثرهما على الحساب صفر — عرضهما منفصلين يضاعف الأرقام.
  const consumptions = transactions.filter(
    (t) => t.category === "customer_credit" && num(t.amount) < 0,
  );
  const creditPayments = transactions.filter(
    (t) => t.category === "customer_payment" && t.method === "credit_balance",
  );
  const mergedPaymentIds = new Set<string>();
  for (const c of consumptions) {
    const amt = Math.abs(num(c.amount));
    const match = creditPayments.find(
      (p) =>
        !mergedPaymentIds.has(p.id) &&
        Math.abs(num(p.amount) - amt) < 0.01 &&
        (!c.reference_id || !p.reference_id || c.reference_id === p.reference_id),
    );
    if (match) mergedPaymentIds.add(match.id);
  }

  // رقم الفاتورة من معرّفها — لتسمية أسطر السداد من الرصيد باسم فاتورتها
  const invoiceNoById = new Map<string, string>(
    liveInvoices.map((i) => [String(i.id), String(i.invoice_number || "—")]),
  );

  // ===== 2) بناء الحركات =====
  const byInvoice = new Map<string, AccountEntry[]>();
  const pool: AccountEntry[] = [];
  const linkedOverpayByInvoice = new Map<string, number>();
  /** قيود الفائض التي ضُمّت إلى سطر فاتورتها — لا سطر مستقل لها */
  const overpayFoldedIds = new Set<string>();
  /** كل عمليات السداد من الرصيد — أسطر مستقلة في الجدول المسطّح */
  const settles: { entry: AccountEntry; amount: number; invoiceId: string | null }[] = [];
  /** ما سُدِّد من الرصيد لكل فاتورة — يُستبعد من «المدفوع» على سطرها */
  const settledByInvoice = new Map<string, number>();
  /** كل إضافات الرصيد (شحن أو فائض) — صندوق واحد للفائض */
  const creditAdds: { entry: AccountEntry; amount: number }[] = [];

  const push = (invoiceId: string | null, entry: AccountEntry) => {
    if (invoiceId && invoiceIds.has(invoiceId)) {
      if (!byInvoice.has(invoiceId)) byInvoice.set(invoiceId, []);
      byInvoice.get(invoiceId)!.push(entry);
    } else {
      pool.push(entry);
    }
  };

  for (const t of transactions) {
    if (mergedPaymentIds.has(t.id)) continue; // عولجت مع قيد الاستهلاك
    const amt = num(t.amount);
    const st = stampOf(t);
    const acc = accountOf(t, accountNameById);
    // رقم العملية: العمود المخصّص أولاً ثم ما يُستخرج من الوصف (بيانات قديمة)
    const opNo = t.allocation?.operation_no || t.reference_no || extractOperationNo(t.description);
    const detail = `${acc}${opNo ? ` — رقم العملية ${opNo}` : ""}`;
    const ref = t.reference_id ? String(t.reference_id) : null;

    // (أ) استهلاك رصيد مُطبَّق على فاتورة — أثره صفر
    if (t.category === "customer_credit" && amt < 0) {
      const linked = ref && invoiceIds.has(ref) ? ref : null;
      const entry: AccountEntry = {
        id: `settle:${t.id}`,
        kind: "credit_settle",
        ...st,
        label: "سداد من رصيد العميل",
        detail,
        customerText: `سدّدنا ${money(Math.abs(amt))} من رصيدكم الموجود لدينا على هذه الفاتورة`,
        effect: 0,
        runningBalance: 0,
        raw: t,
      };
      push(ref, entry);
      settles.push({ entry, amount: r2(Math.abs(amt)), invoiceId: linked });
      if (linked) {
        settledByInvoice.set(linked, r2((settledByInvoice.get(linked) || 0) + Math.abs(amt)));
      }
      continue;
    }

    // (ب) شحن رصيد أو فائض دفعة
    if (t.category === "customer_credit" && amt > 0) {
      const info = classifyCreditRow(t);
      const isOverpay = info.source === "overpay_invoice";
      const entry: AccountEntry = {
        id: `credit:${t.id}`,
        kind: isOverpay ? "overpay" : "credit_charge",
        ...st,
        label: isOverpay ? "فائض دفعة → رصيد العميل" : "شحن رصيد للعميل",
        customerText: isOverpay
          ? `دفعتم زيادة ${money(amt)} عن قيمة الفاتورة — أُضيفت إلى رصيدكم لدينا`
          : `تم شحن رصيدكم بمبلغ ${money(amt)} عن طريق ${acc}${opNo ? ` — رقم العملية ${opNo}` : ""}`,
        detail,
        effect: -r2(amt),
        runningBalance: 0,
        raw: t,
      };
      // صندوق واحد للفائض: كل رصيد دائن — من شحن أو من دفعة زائدة — يدخل
      // نفس الصندوق القابل للتوزيع اليدوي. لا يُخصم من متبقّي فاتورة بعينها،
      // فلا يظهر المال نفسه مرّتين ولا يضيع الفائض إن حُذفت فاتورته.
      if (isOverpay && ref && invoiceIds.has(ref)) {
        linkedOverpayByInvoice.set(ref, r2((linkedOverpayByInvoice.get(ref) || 0) + amt));
        overpayFoldedIds.add(entry.id);
        entry.label = `دفعة زائدة على فاتورة ${invoiceNoById.get(ref)} → رصيد العميل`;
      }
      pool.push(entry);
      creditAdds.push({ entry, amount: r2(amt) });
      continue;
    }

    // (ج) دفعة نقدية/بنكية
    if (t.category === "customer_payment") {
      push(ref, {
        id: `pay:${t.id}`,
        kind: "payment",
        ...st,
        label: ref && invoiceIds.has(ref) ? "دفعة على الفاتورة" : "دفعة من العميل",
        detail,
        customerText: `دفعتم ${money(Math.abs(amt))} عن طريق ${acc}${opNo ? ` — رقم العملية ${opNo}` : ""}`,
        effect: -r2(Math.abs(amt)),
        runningBalance: 0,
        raw: t,
      });
      continue;
    }

    // (د) أي حركة أخرى
    push(ref, {
      id: `adj:${t.id}`,
      kind: "adjust",
      ...st,
      label: t.description || "حركة مالية",
      detail,
      customerText: t.description || `حركة على الحساب بمبلغ ${money(amt)}`,
      effect: amt < 0 ? r2(Math.abs(amt)) : -r2(amt),
      runningBalance: 0,
      raw: t,
    });
  }

  // ===== 3) كتل الفواتير مرتّبة زمنياً =====
  const blocks: InvoiceBlock[] = liveInvoices
    .map((inv) => {
      const st = stampOf(inv);
      const total = r2(num(inv.total));
      const paid = r2(num(inv.paid_amount));
      const overpay = r2(linkedOverpayByInvoice.get(String(inv.id)) || 0);
      const movements = (byInvoice.get(String(inv.id)) || []).sort((a, b) =>
        a.at.localeCompare(b.at),
      );
      return {
        invoiceId: String(inv.id),
        invoiceNumber: inv.invoice_number || "—",
        ...st,
        total,
        paid,
        // موجب «عليه»، سالب «له». الفائض لم يعد يُخصم هنا — صار في صندوق
        // الفائض الواحد، فلا يُحتسب المبلغ نفسه على الفاتورة وفي الصندوق معاً.
        remaining: r2(total - paid),
        linkedOverpay: overpay,
        movements,
        runningAtCreation: 0,
        runningAfter: 0,
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  const poolSorted = pool.sort((a, b) => a.at.localeCompare(b.at));

  // ===== 4) جدول زمني واحد: الفواتير وشحنات الرصيد بترتيبها الحقيقي =====
  // شحنة الرصيد تفصل بين الفواتير في موضعها الزمني (شريط أخضر في العرض)
  // بدل أن تُجمَع كلها في ذيل الكشف بعيداً عن سياقها.
  const timeline: TimelineNode[] = [
    ...blocks.map((block) => ({ type: "invoice" as const, block, at: block.at })),
    ...poolSorted.map((entry) => ({ type: "credit_band" as const, entry, at: entry.at })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(({ at: _at, ...node }) => node as TimelineNode);

  // ===== 5) الرصيد الجاري بترتيب الجدول الزمني — ينتهي عند إجمالي الحساب =====
  let running = 0;
  for (const node of timeline) {
    if (node.type === "invoice") {
      const b = node.block;
      running = r2(running + b.total);
      b.runningAtCreation = running;
      for (const m of b.movements) {
        running = r2(running + m.effect);
        m.runningBalance = running;
      }
      b.runningAfter = running;
    } else {
      running = r2(running + node.entry.effect);
      node.entry.runningBalance = running;
    }
  }

  const totalInvoiced = r2(blocks.reduce((s, b) => s + b.total, 0));
  const totalPaid = r2(blocks.reduce((s, b) => s + b.paid, 0));
  const totalRemaining = r2(blocks.reduce((s, b) => s + b.remaining, 0));

  // الرصيد القابل للتوزيع = صافي الرصيد الدائن (`credit_balance`) كاملاً:
  // مجموع كل قيود customer_credit — الشحنات والفوائض موجبة وما استُهلك سالب.
  // صندوق واحد، فلا خصم للفائض المرتبط بفاتورة.
  const netCredit = r2(
    transactions
      .filter((t) => t.category === "customer_credit")
      .reduce((s, t) => s + num(t.amount), 0),
  );
  const creditPoolTotal = netCredit;
  const accountTotal = r2(totalRemaining - creditPoolTotal);

  // ===== 6) الجدول المسطّح =====
  // نوعان من الأسطر فقط. «المتبقي» على سطر الشحن هو صافي حساب العميل بعده،
  // فيرى العميل مباشرةً كم ابتلع الشحنُ من دَينه وكم بقي مخزّناً له.
  type Seed = {
    at: string;
    /** أثر السطر على صافي الحساب بإشارة العرض (موجب لصالح العميل) */
    delta: number;
    make: (netAfter: number) => AccountRow;
  };

  const seeds: Seed[] = [
    ...blocks.map((b) => {
      // النقد وحده: ما سُدِّد من الرصيد داخل في مبلغ الشحن بعموده.
      //
      // والفائض يعود إلى سطر فاتورته: من دفع 500 على فاتورة 400 دفعها كلها
      // في عمليةٍ واحدة، فتفتيتها إلى «مدفوع 400» وسطرٍ ثانٍ «دفعة زائدة
      // +100» يجعل حساب الفاتورة على سطرها خاطئاً — يقرأ العميل «خالص» وقد
      // دفع أكثر. مضمومةً يصير السطر صادقاً بذاته: 400 · 500 · +100.
      const cashPaid = r2(
        b.paid
        - r2(settledByInvoice.get(b.invoiceId) || 0)
        + r2(linkedOverpayByInvoice.get(b.invoiceId) || 0),
      );
      return {
        at: b.at,
        delta: r2(cashPaid - b.total),
        make: (): AccountRow => ({
          id: `inv:${b.invoiceId}`,
          kind: "invoice" as const,
          at: b.at, date: b.date, time: b.time,
          label: `فاتورة ${b.invoiceNumber}`,
          invoiceId: b.invoiceId,
          value: b.total,
          paid: cashPaid,
          remaining: r2(cashPaid - b.total),
        }),
      };
    }),
    // الفائض المرتبط بفاتورة قائمة ضُمّ إلى سطرها أعلاه — فلا سطر مستقل له.
    // ويبقى مستقلاً إن كانت فاتورته محذوفة، وإلا ضاع من الكشف.
    ...creditAdds
      .filter(({ entry }) => !(entry.kind === "overpay" && overpayFoldedIds.has(entry.id)))
      .map(({ entry, amount }) => ({
      at: entry.at,
      delta: amount,
      make: (): AccountRow => ({
        id: entry.id,
        kind: "credit" as const,
        creditKind: entry.kind === "overpay" ? ("overpay" as const) : ("charge" as const),
        at: entry.at, date: entry.date, time: entry.time,
        label: chargeLabel(entry, amount),
        value: null,
        // مبلغ الشحن نفسه لا الرصيد الجاري بعده — راجع «قاعدة عمود المتبقي».
        remaining: amount,
        paid: amount,
      }),
    })),
  ];

  let netRunning = 0;
  const rows = seeds
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((s) => {
      netRunning = r2(netRunning + s.delta);
      return s.make(netRunning);
    });

  // مجاميع أعمدة الجدول المسطّح — يجب أن يقفل الطرح:
  // Σ القيمة − Σ المدفوع = صافي الحساب. حارس في الاختبارات يمنع أي انحراف.
  const rowsValue = r2(rows.reduce((s, r) => s + (r.value || 0), 0));
  const rowsPaid = r2(rows.reduce((s, r) => s + (r.paid || 0), 0));

  return {
    rows,
    rowsValue,
    rowsPaid,
    timeline,
    blocks,
    creditPool: poolSorted,
    creditPoolTotal,
    totalInvoiced,
    totalPaid,
    totalRemaining,
    accountTotal,
    drift:
      netBalance != null && !Number.isNaN(Number(netBalance))
        ? r2(accountTotal - Number(netBalance))
        : 0,
  };
}

/**
 * نص أثر الحركة — دلتا موقّعة لا رصيد.
 *
 * الإشارة معروضة **بلغة العميل** لا بلغة الدفاتر، فتطابق `signedBalanceText`
 * وتطابق ما يكتبه العميل نفسه («دفع 300 … متبقي -200 … شحن رصيد +300»):
 *   ما يصبّ في مصلحته (دفعة/شحن) ⇒ «+X» **أخضر**
 *   ما يزيد عليه (فاتورة)         ⇒ «−X» **أحمر**
 * أي أن العلامة المعروضة عكس `effect` الداخلي الذي يقيس الدين علينا.
 * لا تُستعمل هنا لغة «له/عليه» لأنها تصف رصيداً لا حركة.
 */
export function effectText(effect: number): { text: string; tone: "debit" | "credit" | "settled" } {
  const n = r2(effect);
  if (Math.abs(n) < 0.01) return { text: "لا أثر", tone: "settled" };
  if (n < 0) return { text: `+${Math.abs(n).toLocaleString()}`, tone: "credit" };
  return { text: `−${n.toLocaleString()}`, tone: "debit" };
}

/**
 * رقم موقّع بلغة العميل لعمود «المتبقي» — مختصر بلا كلمات:
 * «+300» أخضر لما هو لصالحه، «−100» أحمر لما هو عليه، «خالص» عند الصفر.
 * القيمة الداخلة **بإشارة العرض** (موجب لصالح العميل) لا بإشارة الدفاتر.
 */
/**
 * نوع السطر لأغراض التلوين — المصدر الواحد للشريط الأخضر في الكشفين والطباعة.
 *
 * الأخضر البارز **للشحن وحده**: مالٌ جديد دخل الحساب فيستحق فاصلاً يقطع
 * الجدول. أمّا الفائض فبقيّةُ دفعةٍ على فاتورة قائمة، لا مال ثانٍ — تلوينه
 * بنفس القوّة يجعل العميل يعدّ المبلغ مرّتين.
 */
export function accountRowBand(row: AccountRow): "invoice" | "charge" | "overpay" {
  if (row.kind !== "credit") return "invoice";
  return row.creditKind === "overpay" ? "overpay" : "charge";
}

export function signedAmountText(shown: number): { text: string; tone: "debit" | "credit" | "settled" } {
  const n = r2(shown);
  if (Math.abs(n) < 0.01) return { text: "خالص", tone: "settled" };
  if (n > 0) return { text: `+${n.toLocaleString()}`, tone: "credit" };
  return { text: `−${Math.abs(n).toLocaleString()}`, tone: "debit" };
}

/** نص الرصيد بإشارته: «له +X» أخضر، «عليه −X» أحمر، «خالص» محايد. */
export function signedBalanceText(net: number): { text: string; tone: "debit" | "credit" | "settled" } {
  if (Math.abs(net) < 0.01) return { text: "خالص", tone: "settled" };
  if (net > 0) return { text: `عليه −${Math.abs(net).toLocaleString()}`, tone: "debit" };
  return { text: `له +${Math.abs(net).toLocaleString()}`, tone: "credit" };
}
