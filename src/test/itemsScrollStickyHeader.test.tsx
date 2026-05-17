/**
 * اختبار بصري/بنيوي لـ ItemsScroll:
 * يتأكد أن الـ thead لاصق (sticky) بخلفية صلبة وz-index أعلى من tbody/tfoot
 * بحيث لا يختفي أي بند خلف الهيدر عند التمرير في صفحات الإدخال
 * (QuoteCreatePage / InvoiceCreatePage / PurchaseCreatePage).
 *
 * ملاحظة: jsdom لا يحاكي sticky فعلياً، لذا نتحقق من قواعد CSS المُحقَنة
 * ومن وجود البنية الصحيحة بدلاً من تشغيل scroll حقيقي.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ItemsScroll } from "@/components/items/ItemsScroll";

describe("ItemsScroll sticky header", () => {
  const renderTable = (rowCount = 30) =>
    render(
      <ItemsScroll>
        <table>
          <thead>
            <tr>
              <th data-testid="th-name">المنتج</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, i) => (
              <tr key={i} data-testid={`row-${i}`}>
                <td>منتج {i + 1}</td>
                <td>1</td>
                <td>100</td>
                <td>100</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>الإجمالي</td>
              <td>{rowCount * 100}</td>
            </tr>
          </tfoot>
        </table>
      </ItemsScroll>
    );

  it("يحقن قواعد sticky على thead/th بخلفية صلبة", () => {
    const { container } = renderTable();
    const styleTag = container.querySelector("style");
    expect(styleTag, "يجب أن يحقن وسم <style>").toBeTruthy();
    const css = styleTag!.textContent || "";

    // thead و th كلاهما sticky (لتغطية Safari)
    expect(css).toMatch(/\.items-scroll thead\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.items-scroll thead th\s*\{[^}]*position:\s*sticky/);

    // خلفية صلبة لمنع شفافية الهيدر فوق الصفوف
    expect(css).toMatch(/\.items-scroll thead\s*\{[^}]*background:/);
    expect(css).toMatch(/\.items-scroll thead tr\s*\{[^}]*background:/);
    expect(css).toMatch(/\.items-scroll thead th\s*\{[^}]*background:/);
  });

  it("z-index الهيدر أعلى من tfoot وtbody (سُلَّم طبقات صحيح)", () => {
    const { container } = renderTable();
    const css = container.querySelector("style")!.textContent!;

    const headZ = Number(/thead\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    const footZ = Number(/tfoot\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    const bodyZ = Number(/tbody tr\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);

    expect(headZ).toBeGreaterThan(footZ);
    expect(footZ).toBeGreaterThan(bodyZ);
  });

  it("الحاوية تنشئ stacking context مستقلاً (isolation: isolate)", () => {
    const { container } = renderTable();
    const wrapper = container.querySelector(".items-scroll") as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.style.isolation).toBe("isolate");
    expect(wrapper.style.overflowY).toBe("hidden");
  });

  it("جميع البنود (مهما كثرت) موجودة في DOM ولا يحجبها الهيدر بنيوياً", () => {
    const { container, getByTestId } = renderTable(50);
    // الصف الأول قابل للوصول (لا يُحذف من DOM)
    expect(getByTestId("row-0")).toBeInTheDocument();
    expect(getByTestId("row-49")).toBeInTheDocument();
    // عدد صفوف tbody = 50
    expect(container.querySelectorAll("tbody tr").length).toBe(50);
  });
});
