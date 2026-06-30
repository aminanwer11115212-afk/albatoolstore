---
name: radix-portal-popups
description: Any createPortal-to-body popup inside a Radix Dialog/Sheet MUST set pointerEvents:"auto" inline. Radix sets body{pointer-events:none} and the property inherits.
type: constraint
---
عند استخدام `createPortal(node, document.body)` داخل Radix Dialog/Sheet/AlertDialog، يجب وضع `pointerEvents: "auto"` صراحةً في style العنصر المُرسَل. Radix يضبط `body { pointer-events: none }` أثناء الفتح وخاصية pointer-events تُورَّث، فالنقرات تمرّ عبر القائمة وتصل لـ DialogFooter. الـ z-index لا علاقة له. التطبيق الأبرز: `src/components/InlineSearchSelect.tsx`.
**Why:** يمنع تكرار خطأ "القائمة تفتح لكن النقر يُغلق الحوار" في InlineSearchSelect وأي popup مخصّص.
**How to apply:** على كل مكوّن portal جديد + راجع المهارة `radix-portal-pointer-events` قبل أي شحنة.
