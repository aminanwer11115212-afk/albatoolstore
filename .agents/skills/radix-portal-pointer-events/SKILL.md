---
name: radix-portal-pointer-events
description: Fix and prevent the "menu opens but clicks pass through to dialog footer" bug. Apply whenever a custom popover/menu/combobox is portaled to document.body while a Radix Dialog/Sheet/AlertDialog is open. Covers InlineSearchSelect and any hand-rolled portal popup.
type: constraint
---

# Radix Dialog + Custom Portal Popup — Pointer-Events Trap

## السبب الجذري (احفظه)

Radix Dialog/Sheet يثبّت `body { pointer-events: none }` أثناء الفتح، ويعيد `pointer-events: auto` على `DialogContent` فقط. خاصية **`pointer-events` تُورَّث** في CSS — فأيّ عنصر تضعه عبر `createPortal(node, document.body)` يصبح ابناً مباشراً لـ body ويرث `none`، فيظهر مرئياً لكن النقرات تمرّ من خلاله إلى ما تحته (عادة DialogFooter أو الـ overlay).

النتيجة المرصودة: المستخدم يفتح القائمة، يرى الخيارات، ينقر — ولا يحدث شيء أو يُغلق الحوار. تشخيص خاطئ شائع: "Portal-outside-click bug" أو "z-index". الـ z-index ليس المشكلة.

## القاعدة (إلزامية)

أيّ عنصر يُرسم عبر `createPortal(..., document.body)` **يجب** أن يحمل `pointerEvents: "auto"` صريحًا في الـ inline style (أو class مكافئ) — حتى لو كان `z-index` عالياً.

```tsx
const menuStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 10000,
  pointerEvents: "auto", // ⚠️ إلزامي — يلغي وراثة none من body عند فتح Radix Dialog
  // ...
};
return createPortal(<div style={menuStyle}>...</div>, document.body);
```

## كيف تكشف الخطأ (Playwright probe)

داخل Dialog مفتوح، افتح القائمة ثم نفّذ:

```js
const menu = document.querySelector('div.bg-popover'); // أو محدّد قائمتك
const cs = getComputedStyle(menu);
console.log(cs.pointerEvents); // إن كانت "none" فالقاعدة منتهَكة
```

إذا أعطى `"none"` فهذه نفس العلّة — أضف `pointerEvents: "auto"` فوراً.

## مواضع التطبيق في Albatool

افحص قبل أي شحنة أن المكوّنات التالية تطبّق القاعدة:

- `src/components/InlineSearchSelect.tsx` (مرجع الإصلاح)
- `src/components/product/QuickAddProductDialog.tsx` (يستخدم InlineSearchSelect)
- `src/components/CustomerFormDialog.tsx` (يستخدم InlineSearchSelect لـ الاتجاه/الولاية/المدينة/المحلية/المجموعة/الترحيل/الوجهة)
- أيّ مكوّن جديد يستخدم `createPortal` يدويًّا

## لا تستعمل بدلاً من الإصلاح

- ❌ رفع `z-index` فقط — لا يحلّ المشكلة لأن النقرة تمر من خلال العنصر، لا تختفي وراءه.
- ❌ إزالة `position: fixed` — يجب الإبقاء عليه؛ Radix يستخدم `transform` على DialogContent وهو يكسر `fixed` لو لم نبتعد إلى body.
- ❌ إيقاف الـ Portal — سيُحبس الـ menu داخل box الحوار (Radix يطبّق `translate(-50%,-50%)`).
- ✅ الإصلاح الوحيد الصحيح: `pointerEvents: "auto"` على عنصر الـ portal.

## اختبار قبول واحد

داخل أي Dialog يفتح InlineSearchSelect:
1. افتح القائمة.
2. انقر بالماوس على أي خيار.
3. الحوار يبقى مفتوحًا، القائمة تُغلق، القيمة تظهر على الزر.
إن لم تتحقّق الثلاث → القاعدة منتهَكة.
