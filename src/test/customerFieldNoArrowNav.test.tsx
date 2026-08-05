/**
 * اسم العميل خارج مسار الأسهم — بالماوس وحده.
 *
 * ## ما طلبه صاحب المستودع
 * «اسحب التنقّل من اسم العميل في شاشات الإدخال كلّها، بل اضغط عليه بالماوس».
 *
 * ## العطل كما يقع عند المستخدم
 * أوّلُ سطرٍ في جدول البنود هو أكثر ما يُطرَق بالسهم لأعلى — يصحّح كميةً، ثم
 * يعود. وكان السهم يقفز منه إلى صفّ الإضافة، ثمّ ضغطةٌ زائدة تقفز به إلى
 * **اسم العميل**: حقلٌ فيه اسمٌ مضبوط، وأوّلُ حرفٍ يكتبه المستخدم — وهو يظنّ
 * نفسه في خانة كمية — يستبدله. فيُحفظ المستند باسم عميلٍ ممسوح.
 *
 * والحقلان لا يشتركان في وتيرة: العميل يُملأ مرّةً في أوّل الفاتورة ثم لا
 * يُمسّ، والبنود تُطرَق عشرات المرّات. فلا معنى لجمعهما في مسارٍ واحد.
 *
 * ## ما يفحصه هذا الملفّ
 * سلوكَ المُعالِج فعلاً — بـDOM حقيقي وأحداثِ لوحةِ مفاتيح — لا نصَّ الملف.
 * فالفحص النصّي يقول «السطر حُذف»، والسلوك يقول «السهم لم يعد يصل».
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { useCreatePageNav } from "@/utils/createPageNav";
import fs from "node:fs";
import path from "node:path";

/** شاشة إدخالٍ مصغَّرة بترتيب الشاشات الحقيقية: عميل ← صفّ إضافة ← بنود. */
function Screen({ tableId = "t1" }: { tableId?: string }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  useCreatePageNav({ rootRef: pageRef, customerRef, itemsTableId: tableId });
  return (
    <div ref={pageRef}>
      <input ref={customerRef} data-testid="customer" defaultValue="أمين اسماعيل" />
      <div data-nav-zone="quick">
        <input data-nav-col="product" data-testid="quick-product" />
        <input data-nav-col="quantity" data-testid="quick-qty" />
      </div>
      <table>
        <tbody>
          {[0, 1].map((r) => (
            <tr key={r}>
              <td>
                <input data-nav-table={tableId} data-nav-row={r} data-nav-col="product" data-testid={`row-${r}-product`} />
              </td>
              <td>
                <input data-nav-table={tableId} data-nav-row={r} data-nav-col="quantity" data-testid={`row-${r}-qty`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* حقلٌ خارج المسار — الملاحظات مثلاً */}
      <input data-testid="outside" />
    </div>
  );
}

afterEach(cleanup);

const testId = (el: Element | null) => el?.getAttribute("data-testid") || "";

describe("السهم لا يصل اسم العميل", () => {
  it("من صفّ الإضافة لأعلى: يبقى مكانه — لا يقفز إلى العميل", () => {
    const { getByTestId } = render(<Screen />);
    const quick = getByTestId("quick-product") as HTMLInputElement;
    quick.focus();
    fireEvent.keyDown(quick, { key: "ArrowUp" });
    expect(testId(document.activeElement)).toBe("quick-product");
    expect(testId(document.activeElement)).not.toBe("customer");
  });

  it("ومن أوّل سطرِ بنودٍ لأعلى مرّتين: يقف عند صفّ الإضافة", () => {
    const { getByTestId } = render(<Screen />);
    const cell = getByTestId("row-0-qty") as HTMLInputElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    expect(testId(document.activeElement)).toBe("quick-qty");
    // الضغطة الثانية كانت تُدخله حقل العميل فيمحو الاسم بأوّل حرف
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(testId(document.activeElement)).toBe("quick-qty");
  });

  it("ومن حقلٍ خارج المسار لأعلى: إلى صفّ الإضافة لا إلى العميل", () => {
    const { getByTestId } = render(<Screen />);
    const other = getByTestId("outside") as HTMLInputElement;
    other.focus();
    fireEvent.keyDown(other, { key: "ArrowUp" });
    expect(testId(document.activeElement)).toBe("quick-product");
  });
});

describe("وحقل العميل يملك أسهمه", () => {
  it("السهم لأسفل فيه لا يخطفه المُعالِج", () => {
    const { getByTestId } = render(<Screen />);
    const customer = getByTestId("customer") as HTMLInputElement;
    customer.focus();
    const ev = fireEvent.keyDown(customer, { key: "ArrowDown", cancelable: true });
    // `fireEvent` تُرجع false إن مُنع الحدث — والمنع هنا يعني اختطاف التنقّل
    expect(ev).toBe(true);
    expect(testId(document.activeElement)).toBe("customer");
  });

  it("والسهم لأعلى كذلك", () => {
    const { getByTestId } = render(<Screen />);
    const customer = getByTestId("customer") as HTMLInputElement;
    customer.focus();
    expect(fireEvent.keyDown(customer, { key: "ArrowUp", cancelable: true })).toBe(true);
    expect(testId(document.activeElement)).toBe("customer");
  });
});

describe("والمسار الباقي لم يُكسر", () => {
  it("من صفّ الإضافة لأسفل إلى أوّل بند — بنفس العمود", () => {
    const { getByTestId } = render(<Screen />);
    const qty = getByTestId("quick-qty") as HTMLInputElement;
    qty.focus();
    fireEvent.keyDown(qty, { key: "ArrowDown" });
    expect(testId(document.activeElement)).toBe("row-0-qty");
  });

  it("ومن حقلٍ خارج المسار لأسفل إلى صفّ الإضافة", () => {
    const { getByTestId } = render(<Screen />);
    const other = getByTestId("outside") as HTMLInputElement;
    other.focus();
    fireEvent.keyDown(other, { key: "ArrowDown" });
    expect(testId(document.activeElement)).toBe("quick-product");
  });
});

/**
 * والشاشات الأربع تشترك في هذا المُعالِج — فإصلاحه إصلاحٌ لها جميعاً.
 * وهذا ما يجعل الفحص السلوكي أعلاه كافياً لها كلّها.
 */
describe("الشاشات الأربع على مُعالِجٍ واحد", () => {
  const SCREENS = [
    "src/screens/InvoiceCreateScreen.tsx",
    "src/pages/QuoteCreatePage.tsx",
    "src/pages/PurchaseCreatePage.tsx",
    "src/pages/StockReturnCreatePage.tsx",
  ];

  it.each(SCREENS)("%s تستعمل useCreatePageNav", (file) => {
    const src = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
    expect(src).toContain("useCreatePageNav({");
  });

  it("ولا شاشةَ تقفز إلى حقل العميل بيدها", () => {
    for (const file of SCREENS) {
      const src = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      // قفزةٌ مكتوبةٌ في الشاشة تلتفّ على القاعدة وتُعيد العطل لها وحدها
      expect(src).not.toMatch(/ArrowUp[\s\S]{0,200}customerInputRef\.current\?\.focus\(\)/);
    }
  });
});
