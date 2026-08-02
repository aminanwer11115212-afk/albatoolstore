// قواعد أمر الشراء — ما يدخل كشف حساب المورد وما لا يدخله.
//
// «حفظ»         → شراء على الحساب: المبلغ دَينٌ علينا يظهر في كشف المورد.
// «حفظ واستلام» → البضاعة تدخل المخزن، ولا يُسجَّل الأمر في كشف المورد.
//
// **«لا يُسجَّل» ليست «مدفوعة».** محاولةٌ أولى صفّرت الأثر بكتابة
// `paid_amount = total` — تسقط الأمر من معادلة الرصيد في القاعدة بلا هجرة،
// لكنها تكذب على الدفاتر: تُعلن أن المال دُفع وهو لم يُدفع، فتضيع مطالبةٌ
// قائمة لو استُلمت البضاعة اليوم ودُفع ثمنها بعد شهر.
//
// فالاستبعاد في **القراءة** لا في الكتابة.
import { describe, it, expect } from "vitest";
import {
  decidePurchaseSave,
  countsInSupplierStatement,
  supplierBalanceOf,
} from "@/utils/purchaseSave";

describe("الحالة المكتوبة عند الحفظ", () => {
  it("الحفظ العادي يكتب حالة الشاشة كما هي", () => {
    expect(decidePurchaseSave({ alsoReceive: false, prevStatusInDb: null, formStatus: "ordered" }).status)
      .toBe("ordered");
  });

  it("الاستلام لأول مرة يكتب pending حتى ينجح إدخال المخزون", () => {
    // «received» قبل نجاح الإضافة تترك أمراً مستلَماً بلا بضاعة دخلت، فيُحسب
    // الفارق خطأً في الحفظ التالي ولا يُعوَّض أبداً.
    expect(decidePurchaseSave({ alsoReceive: true, prevStatusInDb: null, formStatus: "pending" }).status)
      .toBe("pending");
  });

  it("أمرٌ مستلَم أصلاً يبقى received", () => {
    expect(decidePurchaseSave({ alsoReceive: true, prevStatusInDb: "received", formStatus: "pending" }).status)
      .toBe("received");
  });
});

describe("ما يدخل كشف المورد", () => {
  it("المستلَم لا يدخل", () => {
    expect(countsInSupplierStatement({ status: "received" })).toBe(false);
  });

  it("الملغى لا يدخل", () => {
    expect(countsInSupplierStatement({ status: "cancelled" })).toBe(false);
  });

  it.each(["pending", "ordered", "partial", ""])("«%s» يدخل", (status) => {
    expect(countsInSupplierStatement({ status })).toBe(true);
  });

  it("الغائب يُعامَل كأمرٍ قائم فلا يسقط صامتاً", () => {
    expect(countsInSupplierStatement(null)).toBe(true);
    expect(countsInSupplierStatement({})).toBe(true);
  });
});

describe("رصيد المورد محسوباً من أوامره", () => {
  it("المستلَم لا يزيد الرصيد ولو كان بلا مدفوع", () => {
    const bal = supplierBalanceOf([
      { status: "received", total: 5000, paid_amount: 0 },
      { status: "pending", total: 1000, paid_amount: 0 },
    ]);
    expect(bal).toBe(1000);
  });

  it("المدفوع الجزئي يُنقص الدَّين ولا يُلغيه", () => {
    expect(supplierBalanceOf([{ status: "pending", total: 1000, paid_amount: 300 }])).toBe(700);
  });

  it("المدفوع الزائد لا يُنتج رصيداً سالباً", () => {
    expect(supplierBalanceOf([{ status: "pending", total: 1000, paid_amount: 1200 }])).toBe(0);
  });

  it("الملغى مستبعَد", () => {
    expect(supplierBalanceOf([{ status: "cancelled", total: 900, paid_amount: 0 }])).toBe(0);
  });

  it("قائمة فارغة أو غائبة تُعطي صفراً", () => {
    expect(supplierBalanceOf([])).toBe(0);
    expect(supplierBalanceOf(null)).toBe(0);
  });

  it("الكسور تُقرّب لخانتين فلا تتسرّب أخطاء العائم", () => {
    expect(supplierBalanceOf([{ status: "pending", total: 0.3, paid_amount: 0.1 }])).toBe(0.2);
  });

  it("الاستلام لا يمحو ما دُفع — المدفوع واقعة مستقلّة عن الظهور في الكشف", () => {
    // أمرٌ دُفع له 400 ثم استُلم: يخرج من الكشف، والمدفوع باقٍ في السجل.
    const order = { status: "received", total: 1000, paid_amount: 400 };
    expect(supplierBalanceOf([order])).toBe(0);
    expect(order.paid_amount).toBe(400);
  });
});
