// المتبقّي يُحسب ولا يُقرأ.
//
// عمود `due_amount` يُكتب يدوياً من كل مسار، و`settle_invoices_from_credit`
// تنساه — فتحمل فاتورةٌ خالصة ديناً وهمياً بمقدار ما سُدِّد من الرصيد. ستّ
// فواتير إنتاجية كذلك، والرقم كان يصل العميل في رسالة واتساب.
//
// هذه الاختبارات تثبّت أن الحساب يتجاهل العمود المخزَّن مهما كان منحرفاً،
// فيزول الأثر بلا هجرة ولا صلاحية على القاعدة.
import { describe, it, expect } from "vitest";
import { invoiceDue, totalInvoiceDue } from "@/utils/invoiceDue";

describe("invoiceDue — محسوب لا مقروء", () => {
  it("يتجاهل due_amount المنحرف ويحسب من الإجمالي والمدفوع", () => {
    // INV-17907 الإنتاجية: خالصة، وعمودها يحمل 640,000 وهمياً
    const broken = { total: 3_640_000, paid_amount: 3_640_000, due_amount: 640_000 };
    expect(invoiceDue(broken as any)).toBe(0);
  });

  it("الفاتورة الجزئية تُعطي المتبقّي الحقيقي", () => {
    expect(invoiceDue({ total: 500_000, paid_amount: 200_000 })).toBe(300_000);
  });

  it("الفائض يُقصّ عند الصفر — مكانه رصيد العميل لا الفاتورة", () => {
    expect(invoiceDue({ total: 300, paid_amount: 400 })).toBe(0);
  });

  it("القيم الناقصة لا تُنتج NaN", () => {
    expect(invoiceDue(null)).toBe(0);
    expect(invoiceDue(undefined)).toBe(0);
    expect(invoiceDue({})).toBe(0);
    expect(invoiceDue({ total: 100, paid_amount: null })).toBe(100);
  });

  it("الكسور تُقرّب لخانتين فلا تتسرّب أخطاء العائم", () => {
    expect(invoiceDue({ total: 0.3, paid_amount: 0.1 })).toBe(0.2);
  });

  it("المجموع يتجاهل الأعمدة المنحرفة كلها — مجاميع التقارير", () => {
    const rows = [
      { total: 3_640_000, paid_amount: 3_640_000, due_amount: 640_000 },
      { total: 2_310_000, paid_amount: 2_310_000, due_amount: 310_000 },
      { total: 500_000, paid_amount: 200_000, due_amount: 300_000 },
    ];
    // الوهم 950,000 يسقط، ويبقى المتبقّي الحقيقي وحده
    expect(totalInvoiceDue(rows as any)).toBe(300_000);
  });

  it("قائمة فارغة أو غائبة تُعطي صفراً", () => {
    expect(totalInvoiceDue([])).toBe(0);
    expect(totalInvoiceDue(null)).toBe(0);
  });
});
