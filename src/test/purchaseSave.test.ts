// قواعد حفظ أمر الشراء — ما يدخل كشف المورد وما لا يدخله.
//
// «حفظ»         → شراء على الحساب: المبلغ دَينٌ علينا يظهر في كشف المورد.
// «حفظ واستلام» → شراء نقدي: البضاعة تدخل المخزن ولا يُسجَّل شيء على المورد.
//
// رصيد المورد محسوبٌ في القاعدة بـ Σ GREATEST(total − paid_amount, 0)، فتسويةُ
// الأمر لحظةَ الاستلام تُصفّر حصّته دون لمس المعادلة ولا التريغر.
import { describe, it, expect } from "vitest";
import { decidePurchaseSave } from "@/utils/purchaseSave";

const base = { formStatus: "pending", grandTotal: 1000, prevStatusInDb: null as string | null };

describe("حفظ عادي — المبلغ دَينٌ على الحساب", () => {
  it("لا يُسجَّل مدفوع، فيدخل الإجمالي كشف المورد", () => {
    const d = decidePurchaseSave({ ...base, alsoReceive: false });
    expect(d.paidAmount).toBe(0);
    expect(d.supplierDebt).toBe(1000);
    expect(d.status).toBe("pending");
  });

  it("الحالة المختارة في الشاشة تُكتب كما هي", () => {
    expect(decidePurchaseSave({ ...base, alsoReceive: false, formStatus: "ordered" }).status)
      .toBe("ordered");
  });
});

describe("حفظ واستلام — لا شيء على المورد", () => {
  it("يُسوّى الأمر فلا يظهر في كشف المورد", () => {
    const d = decidePurchaseSave({ ...base, alsoReceive: true });
    expect(d.paidAmount).toBe(1000);
    expect(d.supplierDebt).toBe(0);
  });

  it("الحالة تبقى pending حتى ينجح إدخال المخزون", () => {
    // «received» قبل نجاح الإضافة تترك أمراً مستلَماً بلا بضاعة دخلت، فيُحسب
    // الفارق خطأً في الحفظ التالي ولا يُعوَّض أبداً.
    expect(decidePurchaseSave({ ...base, alsoReceive: true }).status).toBe("pending");
  });

  it("أمرٌ مستلَم أصلاً يبقى received عند إعادة الحفظ", () => {
    const d = decidePurchaseSave({ ...base, alsoReceive: true, prevStatusInDb: "received" });
    expect(d.status).toBe("received");
    expect(d.supplierDebt).toBe(0);
  });

  it("تعديل أمرٍ مستلَم يُبقيه خارج كشف المورد ولو تغيّر الإجمالي", () => {
    const d = decidePurchaseSave({
      ...base, alsoReceive: false, prevStatusInDb: "received", grandTotal: 1500,
    });
    expect(d.paidAmount).toBe(1500);
    expect(d.supplierDebt).toBe(0);
  });
});

describe("الدفع واقعةٌ لا يمحوها تغيير الحالة", () => {
  it("مدفوعٌ جزئي ثم استلام: يصير مسدَّداً بالكامل", () => {
    const d = decidePurchaseSave({ ...base, alsoReceive: true, existingPaid: 800 });
    expect(d.paidAmount).toBe(1000);
    expect(d.supplierDebt).toBe(0);
  });

  it("مدفوعٌ جزئي بلا استلام: يبقى الباقي دَيناً", () => {
    const d = decidePurchaseSave({ ...base, alsoReceive: false, existingPaid: 300 });
    expect(d.paidAmount).toBe(300);
    expect(d.supplierDebt).toBe(700);
  });

  it("مدفوعٌ يفوق الإجمالي لا يُنقَص", () => {
    const d = decidePurchaseSave({ ...base, alsoReceive: true, existingPaid: 1200 });
    expect(d.paidAmount).toBe(1200);
    expect(d.supplierDebt).toBe(0);
  });
});

describe("حدود رقمية", () => {
  it("إجمالي صفر لا يُنتج ديناً", () => {
    expect(decidePurchaseSave({ ...base, alsoReceive: false, grandTotal: 0 }).supplierDebt).toBe(0);
  });

  it("القيم السالبة تُقصّ عند الصفر", () => {
    const d = decidePurchaseSave({ ...base, alsoReceive: false, grandTotal: -50, existingPaid: -9 });
    expect(d.paidAmount).toBe(0);
    expect(d.supplierDebt).toBe(0);
  });

  it("الكسور تُقرّب لخانتين فلا تتسرّب أخطاء العائم", () => {
    const d = decidePurchaseSave({ ...base, alsoReceive: false, grandTotal: 0.3, existingPaid: 0.1 });
    expect(d.supplierDebt).toBe(0.2);
  });
});
