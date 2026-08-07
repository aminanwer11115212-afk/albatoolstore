/**
 * كتابةُ دفعةٍ على فاتورة — القيدُ أوّلاً ثمّ الفاتورة.
 *
 * ## العطل كما رآه صاحب المستودع
 * رسالةٌ إنجليزيةٌ خام في الشاشة:
 *
 *     inconsistent_invoice_payment: paid_amount=400000.00 but Σ payments=0
 *     for invoice d88356c0-…
 *
 * والدفعةُ لم تُسجَّل.
 *
 * ## والسبب: ترتيبُ كتابتين
 * في القاعدة حارسٌ مؤجَّل على `invoices`:
 *
 *     CREATE CONSTRAINT TRIGGER trg_invoices_payment_consistency
 *       AFTER INSERT OR UPDATE OF paid_amount, status ON public.invoices
 *       DEFERRABLE INITIALLY DEFERRED
 *
 * يقارن `paid_amount` بمجموع قيود `customer_payment` المرتبطة بالفاتورة،
 * ويرفض الفارق. و**المؤجَّل يُفحص عند الإيداع لا عند الجملة** — وPostgREST
 * يُودع كلَّ طلبٍ وحده. فمن رفع `paid_amount` في طلبٍ ثمّ كتب القيد في طلبٍ
 * تالٍ، أُودع الأوّلُ ومجموعُ الدفعات ما زال صفراً، فرُفض ورُدّ.
 *
 * ولهذا كان `CustomerPaymentDialog` يعمل والمساران السريعان لا يعملان: هو
 * يكتب القيود أوّلاً ثمّ الفاتورة، وهما يعكسان الترتيب. لا فرقَ بينهما إلّا
 * هذا.
 *
 * ## والترتيبُ ليس تفصيلاً يُترك للذاكرة
 * فهو غيرُ مرئيّ في موضعه: السطران يبدوان مستقلَّين، ولا شيء في أحدهما يشير
 * إلى الآخر. ولهذا جُمعا هنا في دالّةٍ واحدة — من كتب دفعةً بها كتبها
 * بالترتيب الصحيح ولو لم يعرف بالحارس.
 *
 * ## وثالثةٌ ظهرت معهما
 * كان القيدُ مشروطاً باختيار حساب: `if (payAccount && applied > 0)`. فمن دفع
 * بلا حسابٍ مختار رُفع مدفوعُ فاتورته بلا قيدٍ أصلاً — وهو ما يرفضه الحارسُ
 * الآن، وكان قبله يمرّ فيختلّ الحساب صامتاً. و`account_id` يقبل الفراغ،
 * وحوارُ الدفع يكتبه فارغاً منذ البداية، فكُتب مثله.
 *
 * يحرسه `src/test/invoicePaymentWriteOrder.test.ts`.
 */

/** قيدُ معاملةٍ يُكتب مع الدفعة. */
export interface PaymentTxRow {
  type: "income" | "expense";
  category: "customer_payment" | "customer_credit";
  amount: number;
  date: string;
  description?: string | null;
  account_id?: string | null;
  customer_id?: string | null;
  reference_id: string;
  method?: string | null;
  allocation?: unknown;
}

export interface InvoicePaymentWriteArgs {
  invoiceId: string;
  /** القيودُ التي تُكتب قبل الفاتورة — بترتيبها. */
  rows: PaymentTxRow[];
  /** ما يُحدَّث في الفاتورة بعدها (`paid_amount` و`due_amount` و`status` …). */
  patch: Record<string, unknown>;
}

export interface PaymentWriteClient {
  from(table: string): any;
}

/**
 * رسالةٌ عربية لخطأ الحارس.
 *
 * نصُّه إنجليزيٌّ فيه معرّف الفاتورة — لا يفيد المستخدم بشيء. وما يفيده أنّ
 * دفعته **لم تُسجَّل** وأنّ حسابه لم يتغيّر.
 */
export function paymentWriteErrorMessage(e: any): string {
  const raw = String(e?.message || e || "");
  if (/inconsistent_invoice_payment/i.test(raw)) {
    if (/exceeds total/i.test(raw)) {
      return "المبلغ المدفوع يتجاوز إجمالي الفاتورة — لم تُسجَّل الدفعة ولم يتغيّر شيء.";
    }
    return "تعذّر تسجيل الدفعة: المبلغ المدفوع لا يطابق قيود الدفعات المسجّلة على الفاتورة. لم يتغيّر شيء — أعد المحاولة، وإن تكرّر فافحص الفاتورة في «بوت سلامة الحسابات».";
  }
  return raw || "تعذّر تسجيل الدفعة";
}

/**
 * تكتب قيودَ الدفعة ثمّ تُحدّث الفاتورة — بهذا الترتيب لا غيره.
 *
 * وكلُّ كتابةٍ يُفحص خطؤها: كتابةٌ لا يُفحص خطؤها في مسار مالٍ تُنتج نصفَ
 * دفعة — قيدٌ بلا فاتورة أو فاتورةٌ بلا قيد.
 */
/**
 * مجموعُ قيود الدفع المسجّلة على فاتورة — بنفس شرط الحارس.
 *
 * تُقرأ ولا تُستنتج من `paid_amount`: من استنتجها منه افترض أنّهما متساويان،
 * وهو بالضبط ما نحن بصدد التحقّق منه.
 */
export async function sumInvoicePayments(
  client: PaymentWriteClient,
  invoiceId: string,
): Promise<number> {
  const { data, error } = await client
    .from("transactions")
    .select("amount")
    .eq("reference_id", invoiceId)
    .eq("category", "customer_payment");
  if (error) throw new Error(paymentWriteErrorMessage(error));
  return (data || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
}

export async function writeInvoicePayment(
  client: PaymentWriteClient,
  { invoiceId, rows, patch }: InvoicePaymentWriteArgs,
): Promise<void> {
  for (const row of rows) {
    if (!(Number(row.amount) > 0) && !(Number(row.amount) < 0)) continue;
    const { error } = await client.from("transactions").insert(row as any);
    if (error) throw new Error(paymentWriteErrorMessage(error));
  }

  const { error: upErr } = await client.from("invoices").update(patch).eq("id", invoiceId);
  if (upErr) throw new Error(paymentWriteErrorMessage(upErr));
}
