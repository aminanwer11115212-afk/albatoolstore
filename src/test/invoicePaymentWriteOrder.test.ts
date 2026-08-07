/**
 * الدفعة: القيدُ يُكتب قبل الفاتورة — وإلّا رفضتها القاعدة.
 *
 * ## العطل كما رآه صاحب المستودع
 * رسالةٌ إنجليزيةٌ خام في شاشته، والدفعةُ لم تُسجَّل:
 *
 *     inconsistent_invoice_payment: paid_amount=400000.00 but Σ payments=0
 *     for invoice d88356c0-849f-4157-a9b7-907fdd9bfbfc
 *
 * ## والسبب ترتيبُ كتابتين لا حسابٌ خاطئ
 * في القاعدة حارسٌ **مؤجَّل** على `invoices`:
 *
 *     CREATE CONSTRAINT TRIGGER trg_invoices_payment_consistency
 *       AFTER INSERT OR UPDATE OF paid_amount, status ON public.invoices
 *       DEFERRABLE INITIALLY DEFERRED
 *
 * يقارن `paid_amount` بمجموع قيود `customer_payment`، ويرفض الفارق.
 * والمؤجَّل يُفحص **عند الإيداع**، وPostgREST يُودع كلَّ طلبٍ وحده. فمن رفع
 * `paid_amount` في طلبٍ ثمّ كتب القيد في طلبٍ تالٍ، أُودع الأوّلُ ومجموعُ
 * الدفعات صفر — فرُفض ورُدّ، ولم يصل القيدُ أصلاً.
 *
 * ولهذا كان `CustomerPaymentDialog` يعمل والمساران السريعان لا يعملان: هو
 * يكتب القيود أوّلاً، وهما يعكسان. لا فرقَ بينهما إلّا هذا — ولا شيء في
 * الشيفرة كان يُظهره.
 *
 * ## والمُزدوج هنا يحاكي الحارس
 * لا يُفحص الترتيبُ بعدّ الأسطر: يُبنى عميلٌ **يرفض** تحديثَ الفاتورة إن لم
 * تسبقه القيود — كما ترفض القاعدة. فالمسار القديم يسقط هنا كما سقط عند
 * صاحب المستودع، والجديد يمرّ.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { writeInvoicePayment, paymentWriteErrorMessage } from "@/utils/invoicePaymentWrite";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/* ═══════════ قاعدةٌ مزدوجةٌ بحارسها ═══════════ */

/**
 * يحاكي PostgREST ومعه الحارس المؤجَّل: كلُّ طلبٍ يُودع وحده، وتحديثُ
 * `paid_amount` يُفحص عند إيداعه ضدّ مجموع قيود `customer_payment` المكتوبة
 * **قبله فعلاً**.
 */
function db(opts: { paidAmount?: number; total?: number } = {}) {
  const state = { paid: opts.paidAmount ?? 0, total: opts.total ?? 400000 };
  const payments: number[] = [];
  const log: string[] = [];

  const client = {
    from(table: string) {
      return {
        async insert(row: any) {
          log.push(`insert:${table}:${row.category}`);
          if (table === "transactions" && row.category === "customer_payment") {
            payments.push(Number(row.amount || 0));
          }
          return { error: null };
        },
        update(patch: any) {
          return {
            async eq(_c: string, _v: string) {
              log.push("update:invoices");
              if ("paid_amount" in patch) {
                const next = Number(patch.paid_amount || 0);
                const sum = payments.reduce((s, n) => s + n, 0);
                // الحارس المؤجَّل — يُفحص عند إيداع هذا الطلب وحده
                if (Math.abs(sum - next) > 0.01) {
                  return { error: {
                    code: "23514",
                    message: `inconsistent_invoice_payment: paid_amount=${next.toFixed(2)} but Σ payments=${sum} for invoice d88356c0-849f-4157-a9b7-907fdd9bfbfc`,
                  } };
                }
                if (state.total > 0 && next - state.total > 0.01) {
                  return { error: {
                    code: "23514",
                    message: `inconsistent_invoice_payment: paid_amount=${next} exceeds total=${state.total} for invoice d88356c0`,
                  } };
                }
                state.paid = next;
              }
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client: client as any, state, payments, log };
}

const PAYMENT = {
  type: "income" as const, category: "customer_payment" as const,
  amount: 400000, date: "2026-08-07", account_id: null,
  customer_id: "c1", reference_id: "inv-1",
};

/* ═══════════ ١) المسار القديم يسقط — كما سقط عنده ═══════════ */

/** الفاتورةُ أوّلاً ثمّ القيد، كما كان مكتوباً في المسارين السريعين. */
async function legacyOrder(client: any) {
  const { error } = await client.from("invoices")
    .update({ paid_amount: 400000, due_amount: 0, status: "paid" }).eq("id", "inv-1");
  if (error) throw new Error(error.message);
  await client.from("transactions").insert(PAYMENT);
}

describe("الترتيبُ القديم", () => {
  it("يُرفض بنصّ الحارس نفسِه الذي رآه صاحب المستودع", async () => {
    const { client } = db();
    await expect(legacyOrder(client))
      .rejects.toThrow(/inconsistent_invoice_payment: paid_amount=400000\.00 but Σ payments=0/);
  });

  it("ولا يصل القيدُ أصلاً — فلا الفاتورةُ تغيّرت ولا الدفعةُ سُجّلت", async () => {
    const { client, state, payments } = db();
    await expect(legacyOrder(client)).rejects.toThrow();
    expect(state.paid).toBe(0);
    expect(payments).toEqual([]);
  });
});

/* ═══════════ ٢) والترتيب الجديد يمرّ ═══════════ */

describe("writeInvoicePayment", () => {
  it("يكتب القيدَ ثمّ الفاتورة — بهذا الترتيب", async () => {
    const { client, log, state } = db();
    await writeInvoicePayment(client, {
      invoiceId: "inv-1",
      rows: [PAYMENT],
      patch: { paid_amount: 400000, due_amount: 0, status: "paid" },
    });
    expect(log).toEqual(["insert:transactions:customer_payment", "update:invoices"]);
    expect(state.paid).toBe(400000);
  });

  it("والفائضُ يُكتب قيدَ رصيدٍ دائن لا دفعة — فلا يرفع المجموع", async () => {
    const { client, state } = db({ total: 300000 });
    await writeInvoicePayment(client, {
      invoiceId: "inv-1",
      rows: [
        { ...PAYMENT, amount: 300000 },
        { ...PAYMENT, category: "customer_credit", amount: 100000 },
      ],
      patch: { paid_amount: 300000, due_amount: 0, status: "paid" },
    });
    // لو حُسب الفائضُ دفعةً لصار المجموع 400000 ورُفض التحديث
    expect(state.paid).toBe(300000);
  });

  it("ودفعةٌ جزئيةٌ على دفعةٍ سابقة تُجمع لا تُستبدل", async () => {
    const { client, state } = db();
    await writeInvoicePayment(client, {
      invoiceId: "inv-1", rows: [{ ...PAYMENT, amount: 150000 }],
      patch: { paid_amount: 150000, due_amount: 250000, status: "partial" },
    });
    await writeInvoicePayment(client, {
      invoiceId: "inv-1", rows: [{ ...PAYMENT, amount: 250000 }],
      patch: { paid_amount: 400000, due_amount: 0, status: "paid" },
    });
    expect(state.paid).toBe(400000);
  });

  it("وصفرُ المبلغ لا يُكتب قيداً فارغاً", async () => {
    const { client, log } = db();
    await writeInvoicePayment(client, {
      invoiceId: "inv-1",
      rows: [{ ...PAYMENT, amount: 0 }],
      patch: { status: "pending" },
    });
    expect(log).toEqual(["update:invoices"]);
  });
});

/* ═══════════ ٣) ولا كتابةَ يُبتلع خطؤها ═══════════ */

describe("الأخطاء تُرمى مترجَمة", () => {
  it("فشلُ القيد يمنع تحديثَ الفاتورة — لا نصفَ دفعة", async () => {
    const log: string[] = [];
    const c: any = {
      from: (t: string) => ({
        insert: async () => (log.push(`insert:${t}`), { error: { message: "permission denied" } }),
        update: () => ({ eq: async () => (log.push("update"), { error: null }) }),
      }),
    };
    await expect(writeInvoicePayment(c, {
      invoiceId: "inv-1", rows: [PAYMENT], patch: { paid_amount: 400000 },
    })).rejects.toThrow(/permission denied/);
    expect(log).toEqual(["insert:transactions"]);   // ولم تُلمس الفاتورة
  });

  it("ورفضُ الحارس يصل المستخدمَ بالعربية لا بنصّه الإنجليزي", async () => {
    const { client } = db();
    await expect(writeInvoicePayment(client, {
      invoiceId: "inv-1", rows: [], patch: { paid_amount: 400000 },
    })).rejects.toThrow(/لم يتغيّر شيء/);
  });

  it("والرسالةُ تدلّ على موضع الإصلاح", () => {
    const msg = paymentWriteErrorMessage({
      message: "inconsistent_invoice_payment: paid_amount=400000.00 but Σ payments=0 for invoice d88356c0",
    });
    expect(msg).toContain("بوت سلامة الحسابات");
    expect(msg).not.toContain("d88356c0");     // لا معرّفَ تقنيّ في وجه المستخدم
    expect(msg).not.toContain("paid_amount");
  });

  it("وتجاوزُ الإجمالي له رسالتُه — سببان مختلفان لا رسالةٌ واحدة", () => {
    const msg = paymentWriteErrorMessage({
      message: "inconsistent_invoice_payment: paid_amount=500 exceeds total=400 for invoice x",
    });
    expect(msg).toMatch(/يتجاوز إجمالي الفاتورة/);
  });

  it("وخطأٌ آخر يمرّ كما هو — لا تُبتلع رسالةٌ لا نعرفها", () => {
    expect(paymentWriteErrorMessage({ message: "network error" })).toBe("network error");
  });
});

/* ═══════════ ٤) والنمطُ يُبحث عنه في المشروع كلّه ═══════════ */

/**
 * العطلُ هنا يتكرّر لأنّ كتابة الدفعة مكتوبةٌ في مواضع متفرّقة. فلا يكفي
 * إصلاحُ موضعه: يُفحص **كلُّ** موضعٍ يرفع `paid_amount`.
 */
describe("كلُّ مسارِ دفعٍ يكتب القيدَ قبل الفاتورة", () => {
  /** المساران السريعان — كانا معكوسين، وصارا يمرّان بالوحدة الواحدة. */
  const VIA_HELPER = [
    "src/pages/InvoiceViewPage.tsx",
    "src/screens/InvoiceCreateScreen.tsx",
  ];

  it.each(VIA_HELPER)("%s يمرّ بـwriteInvoicePayment", (f) => {
    expect(read(f)).toMatch(/from "@\/utils\/invoicePaymentWrite"/);
  });

  it.each(VIA_HELPER)("%s لا يكتب الدفعةَ بيده", (f) => {
    const src = read(f);
    /* لا قيدَ `customer_payment` يُكتب مباشرةً خارج الوحدة: من كتبه بيده
       كتبه بترتيبٍ لا يحرسه أحد. */
    expect(src).not.toMatch(/from\("transactions"\)\s*\.insert\([\s\S]{0,400}?customer_payment/);
  });

  /**
   * و«مدفوعة» من قائمة الحالة كانت أسوأ من معكوسة الترتيب: ترفع المدفوع إلى
   * الإجمالي **بلا قيدٍ أصلاً**، ولا تفحص خطأ التحديث — فتُعلن «تم تغيير
   * الوضع» ولا شيء تغيّر. وهي أرجحُ ما أنتج الفاتورةَ التي صوّرها صاحبُ
   * المستودع.
   */
  it("و«مدفوعة» من قائمة الحالة تكتب قيدَ تسويةٍ لا ترفع المدفوع وحده", () => {
    const src = read("src/pages/InvoiceViewPage.tsx");
    const fn = src.slice(src.indexOf("handleStatusChange"), src.indexOf("const handlePrint"));
    expect(fn).toContain("sumInvoicePayments");
    expect(fn).toContain("writeInvoicePayment");
    expect(fn, "تحديثٌ مباشرٌ بلا فحص خطأ").not.toMatch(/await supabase\.from\("invoices"\)\.update/);
  });

  /**
   * وحوارُ الدفع كان صحيحاً قبل هذا كلّه — يكتب قيودَه ثمّ الفاتورة. فيُثبَّت
   * ترتيبُه كي لا ينقلب يوماً بتعديلٍ لا يعرف الحارس.
   */
  it("وحوارُ الدفع يُحدّث الفاتورة بعد قيوده", () => {
    const src = read("src/components/invoice/CustomerPaymentDialog.tsx");
    const firstPaymentRow = src.indexOf('category: "customer_payment"');
    /* الكتابةُ وحدها: للملفّ ثلاثةُ `from("invoices")` أوّلُها قراءةُ
       الإجماليات — فلو قيس بها لقيس الترتيبُ من موضعٍ لا يكتب شيئاً. */
    const writes = [...src.matchAll(/\.from\("invoices"\)\s*\.update\(/g)].map((m) => m.index!);
    expect(firstPaymentRow).toBeGreaterThan(-1);
    expect(writes.length, "لا تحديثَ للفاتورة في الملفّ").toBeGreaterThan(0);
    expect(firstPaymentRow, "الفاتورةُ تُحدَّث قبل قيد الدفعة")
      .toBeLessThan(Math.min(...writes));
  });

  /**
   * ولا مسارَ ثالثٌ يفوت: يُمشى المصدرُ كلُّه، وكلُّ ملفٍّ يرفع `paid_amount`
   * يجب أن يمرّ بالوحدة أو يكون معروفاً بسببه.
   */
  it("ولا موضعَ ثالثٌ يكتب paid_amount بلا حارس", () => {
    /* مواضعُ تكتب `paid_amount` ولا تسجّل دفعةً — لكلٍّ سببُه: */
    const KNOWN = new Map<string, string>([
      ["src/pages/InvoiceViewPage.tsx", "يمرّ بالوحدة — الدفعةُ و«مدفوعة» كلتاهما"],
      ["src/screens/InvoiceCreateScreen.tsx", "يمرّ بالوحدة، وإنشاءُ الفاتورة يكتب مدفوعَ الكاش"],
      ["src/components/invoice/CustomerPaymentDialog.tsx", "قيودُه قبل فاتورته — مفحوصٌ أعلاه"],
      ["src/pages/DocumentPreviewPage.tsx", "الخصمُ الحيّ يغيّر المدفوع ولا يسجّل دفعة — يترجم رفضَ الحارس"],
      ["src/utils/purchaseSave.ts", "المشترياتُ لا فواتيرُ بيع — حارسٌ آخر"],
      ["src/components/purchase/SupplierPaymentDialog.tsx", "دفعةُ مورّدٍ لا عميل"],
    ]);
    const offenders: string[] = [];
    /**
     * كتابةُ `paid_amount` **على جدول الفواتير** لا أيَّ ذكرٍ للاسم.
     *
     * فالاسمُ يظهر في لقطات سجلّ التدقيق أيضاً: `deleteInvoice` ينسخ حالة
     * الفاتورة قبل حذفها في `old_data`. وتلك قراءةٌ تُنسخ لا كتابةٌ توقظ
     * الحارس — فيُشترط الجدولُ صراحةً.
     *
     * والنافذةُ تُقطع عند الاستدعاء التالي ولا تُشترط نهايتُها: اشتراطُها
     * أسقط الفحصَ صامتاً — آخرُ كتابةٍ في الملفّ لا يتلوها استدعاءٌ آخر،
     * فكان النمطُ يفشل عندها فيمرّ الملفُّ بريئاً وفيه الكتابة.
     */
    const writesInvoicePaid = (src: string) =>
      [...src.matchAll(/\.from\(\s*["']invoices["']\s*(?:as any)?\)/g)].some((m) => {
        const win = src.slice(m.index!, m.index! + 400);
        const cut = win.indexOf(".from(", 1);
        const body = cut > 0 ? win.slice(0, cut) : win;
        return /\.(update|insert|upsert)\(/.test(body) && /paid_amount/.test(body);
      });

    /* والنمطُ نفسُه يُثبَت أنّه يرى: ملفٌّ يكتبها يُكشف، وملفٌّ ينسخها في
       سجلٍّ لا يُكشف. فلا يمرّ الفحصُ لأنّه أعمى. */
    expect(writesInvoicePaid(read("src/pages/DocumentPreviewPage.tsx")), "النمطُ لا يرى كتابةً قائمة").toBe(true);
    expect(writesInvoicePaid(read("src/utils/deleteInvoice.ts")), "النمطُ يخلط اللقطةَ بالكتابة").toBe(false);

    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "test") walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
        if (KNOWN.has(rel)) continue;
        if (writesInvoicePaid(fs.readFileSync(full, "utf8"))) offenders.push(rel);
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(offenders, "مواضعُ تكتب paid_amount خارج القائمة").toEqual([]);
  });
});
