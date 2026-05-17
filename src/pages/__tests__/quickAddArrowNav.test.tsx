import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * اختبار سلوك ↑/↓ داخل .quick-add-row:
 * - ↓ ينقل التركيز إلى نفس العمود في جدول البنود [data-nav-table]
 * - ↑ ينقل التركيز إلى أقرب حقل خارج quick-add-row (الحقول العلوية)
 * - في الحالتين لا تتغيّر قيمة input[type=number]
 *
 * يعيد تركيب نفس handler المستخدم في InvoiceCreatePage/QuoteCreatePage/PurchaseCreatePage
 * (الجزء الخاص بـ inQuickAdd) على DOM حقيقي عبر jsdom.
 */

function attachHandler(root: HTMLElement) {
  const handler = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (!target || !root.contains(target)) return;
    const tag = target.tagName;
    if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") return;

    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")
    );
    const idx = focusables.indexOf(target);
    if (idx === -1) return;

    const inQuickAdd = !!target.closest(".quick-add-row");
    if (inQuickAdd && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      let nextEl: HTMLElement | null = null;
      const col = target.getAttribute("data-nav-col");
      if (e.key === "ArrowDown") {
        const quickAddEl = target.closest(".quick-add-row") as HTMLElement | null;
        if (col !== "product" && quickAddEl) {
          nextEl = quickAddEl.querySelector<HTMLElement>('[data-nav-col="product"]');
        }
        if (!nextEl) {
          if (col) nextEl = root.querySelector<HTMLElement>(`[data-nav-table][data-nav-col="${col}"]`);
          if (!nextEl) nextEl = root.querySelector<HTMLElement>("[data-nav-table]");
        }
      } else {
        for (let i = idx - 1; i >= 0; i--) {
          if (!focusables[i].closest(".quick-add-row")) { nextEl = focusables[i]; break; }
        }
      }
      e.preventDefault();
      if (nextEl) {
        nextEl.focus();
        if (nextEl instanceof HTMLInputElement && (nextEl.type === "text" || nextEl.type === "number")) nextEl.select();
      }
    }
  };
  root.addEventListener("keydown", handler);
  return () => root.removeEventListener("keydown", handler);
}

function press(el: HTMLElement, key: "ArrowUp" | "ArrowDown") {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

let root: HTMLDivElement;
let detach: () => void;

beforeEach(() => {
  root = document.createElement("div");
  root.innerHTML = `
    <input id="client" type="text" value="عميل" />
    <div class="quick-add-row">
      <input id="qa-product" type="text" data-nav-col="product" value="" />
      <input id="qty" type="number" data-nav-col="quantity" value="5" />
      <input id="price" type="number" data-nav-col="price" value="100" />
    </div>
    <table>
      <tbody>
        <tr>
          <td><input id="row-product" type="text" data-nav-table="invoice-items" data-nav-col="product" value="منتج" /></td>
          <td><input id="row-qty" type="number" data-nav-table="invoice-items" data-nav-col="quantity" value="2" /></td>
          <td><input id="row-price" type="number" data-nav-table="invoice-items" data-nav-col="price" value="50" /></td>
        </tr>
      </tbody>
    </table>
  `;
  document.body.appendChild(root);
  detach = attachHandler(root);
});

afterEach(() => {
  detach();
  document.body.removeChild(root);
});

describe("quick-add-row arrow navigation (two-step ↓)", () => {
  it("الضغطة الأولى ↓ من الكمية تنقل إلى حقل المنتج في نفس quick-add", () => {
    const qty = root.querySelector<HTMLInputElement>("#qty")!;
    const qaProduct = root.querySelector<HTMLInputElement>("#qa-product")!;
    qty.focus();
    const ev = press(qty, "ArrowDown");
    expect(ev.defaultPrevented).toBe(true);
    expect(qty.value).toBe("5");
    expect(document.activeElement).toBe(qaProduct);
  });

  it("الضغطة الثانية ↓ من حقل المنتج تنقل إلى نفس العمود في جدول البنود", () => {
    const qaProduct = root.querySelector<HTMLInputElement>("#qa-product")!;
    const rowProduct = root.querySelector<HTMLInputElement>("#row-product")!;
    qaProduct.focus();
    press(qaProduct, "ArrowDown");
    expect(document.activeElement).toBe(rowProduct);
  });

  it("↓ من السعر تنقل إلى حقل المنتج (الخطوة 1) دون تغيير القيمة", () => {
    const price = root.querySelector<HTMLInputElement>("#price")!;
    const qaProduct = root.querySelector<HTMLInputElement>("#qa-product")!;
    price.focus();
    press(price, "ArrowDown");
    expect(document.activeElement).toBe(qaProduct);
    expect(price.value).toBe("100");
  });

  it("ArrowUp ينقل التركيز إلى الحقل العلوي (العميل) ولا يغيّر القيمة", () => {
    const qty = root.querySelector<HTMLInputElement>("#qty")!;
    const client = root.querySelector<HTMLInputElement>("#client")!;
    qty.focus();
    const ev = press(qty, "ArrowUp");
    expect(ev.defaultPrevented).toBe(true);
    expect(qty.value).toBe("5");
    expect(document.activeElement).toBe(client);
  });
});
