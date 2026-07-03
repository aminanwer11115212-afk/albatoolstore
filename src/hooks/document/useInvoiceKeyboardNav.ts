import { useEffect } from "react";

/** Keyboard navigation — مطابق لعرض السعر (مستخرج من InvoiceCreatePage) */
export function useInvoiceKeyboardNav(rootRef: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!target || !root.contains(target)) return;
      const tag = target.tagName;
      if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") return;
      if (tag === "TEXTAREA" && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;

      const container = target.closest(".product-search-container, .has-suggestions") as HTMLElement | null;
      const list = (container?.querySelector(".search-suggestions, .customer-suggestions")
        || document.querySelector(".search-suggestions")) as HTMLElement | null;
      if (list) {
        const items = Array.from(list.querySelectorAll<HTMLElement>("[data-sugg-item]"));
        if (items.length) {
          const currentIdx = items.findIndex((el) => el.getAttribute("data-active") === "true");
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
            items.forEach((el, i) => el.setAttribute("data-active", i === next ? "true" : "false"));
            items[next].scrollIntoView({ block: "nearest" });
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
            items.forEach((el, i) => el.setAttribute("data-active", i === next ? "true" : "false"));
            items[next].scrollIntoView({ block: "nearest" });
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const pick = currentIdx >= 0 ? items[currentIdx] : items[0];
            pick.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            return;
          }
        }
      }

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")
      ).filter((el) => el.offsetParent !== null);
      const idx = focusables.indexOf(target);
      if (idx === -1) return;

      const isEmpty = (el: HTMLElement) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          const v = String(el.value ?? "").trim();
          return v === "" || v === "0";
        }
        return false;
      };

      let nextEl: HTMLElement | null = null;

      // Up/Down داخل شريط الإضافة السريع: تنقّل بين الحقول بدل تغيير قيمة input[type=number]
      const inQuickAdd = !!target.closest(".quick-add-row");
      if (inQuickAdd && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const col = target.getAttribute("data-nav-col");
        if (e.key === "ArrowDown") {
          let candidate: HTMLElement | null = null;
          const quickAddEl = target.closest(".quick-add-row") as HTMLElement | null;
          // الخطوة 1: إن لم نكن على حقل البحث/المنتج داخل quick-add، انتقل إليه أولاً
          if (col !== "product" && quickAddEl) {
            candidate = quickAddEl.querySelector<HTMLElement>('[data-nav-col="product"]');
          }
          // الخطوة 2: على حقل المنتج (أو لم يوجد) → انزل إلى نفس العمود في جدول البنود
          if (!candidate) {
            if (col) candidate = root.querySelector<HTMLElement>(`[data-nav-table][data-nav-col="${col}"]`);
            if (!candidate) candidate = root.querySelector<HTMLElement>("[data-nav-table]");
          }
          nextEl = candidate;
        } else {
          // ArrowUp: أقرب حقل قابل للتركيز قبل شريط الإضافة (رأس الفاتورة/العميل)
          for (let i = idx - 1; i >= 0; i--) {
            if (!focusables[i].closest(".quick-add-row")) { nextEl = focusables[i]; break; }
          }
        }
        if (nextEl) {
          e.preventDefault();
          nextEl.focus();
          // لا تحديد أثناء التنقّل.
        } else {

          e.preventDefault();
        }
        return;
      }

      // Up/Down داخل صفوف جدول البنود: تنقّل عمودي بين الصفوف بنفس العمود
      const navTable = target.getAttribute("data-nav-table");
      const navRowAttr = target.getAttribute("data-nav-row");
      const navCol = target.getAttribute("data-nav-col");
      if (navTable && navRowAttr !== null && navCol && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const curRow = parseInt(navRowAttr, 10);
        let candidate: HTMLElement | null = null;
        if (e.key === "ArrowDown") {
          candidate = root.querySelector<HTMLElement>(`[data-nav-table="${navTable}"][data-nav-row="${curRow + 1}"][data-nav-col="${navCol}"]`);
        } else {
          if (curRow > 0) {
            candidate = root.querySelector<HTMLElement>(`[data-nav-table="${navTable}"][data-nav-row="${curRow - 1}"][data-nav-col="${navCol}"]`);
          } else {
            candidate = root.querySelector<HTMLElement>(`.quick-add-row [data-nav-col="${navCol}"]`);
          }
        }
        e.preventDefault();
        if (candidate) {
          candidate.focus();
          // لا تحديد أثناء التنقّل.
        }

        return;
      }

      if (e.key === "Enter") {
        for (let i = idx + 1; i < focusables.length; i++) {
          if (isEmpty(focusables[i])) { nextEl = focusables[i]; break; }
        }
        if (!nextEl && idx + 1 < focusables.length) nextEl = focusables[idx + 1];
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (tag === "INPUT") {
          const t = (target as HTMLInputElement).type;
          if (t !== "number" && t !== "date" && t !== "checkbox") return;
        }
        nextEl = e.key === "ArrowLeft" ? focusables[idx + 1] || null : focusables[idx - 1] || null;
      } else {
        return;
      }

      if (nextEl) {
        e.preventDefault();
        nextEl.focus();
        // لا تحديد أثناء التنقّل — يبدأ التحديد فقط في وضع التحرير.
      }

    };
    root.addEventListener("keydown", handler);
    return () => root.removeEventListener("keydown", handler);
  }, [rootRef]);
}
