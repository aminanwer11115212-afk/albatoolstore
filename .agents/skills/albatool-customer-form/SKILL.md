---
name: albatool-customer-form
description: Rules and invariants for the "Add/Edit Customer" form (CustomerFormDialog). Triggers whenever a user or audit touches the customer dialog, the "عميل جديد" / "إضافة عميل جديد" button anywhere in the app (quotes, invoices, cash POS, purchase, dispatch, customers page, F9 shortcut), or any of its cascading fields (الاتجاه/الولاية/المدينة/المحلية/المجموعة/الترحيلات/الوجهة/الناقل).
---

# Albatool — Customer Form Dialog (المرجع الوحيد)

الملف: `src/components/CustomerFormDialog.tsx`. يُستخدم من:
- `CustomersPage` (زر «عميل جديد» + اختصار F9)
- `QuoteCreatePage`, `InvoiceCreatePage`, `InvoiceCashNew` (POS)
- أي صفحة تحتوي زر إضافة عميل جديد (نفس المكوّن دائماً).

## قواعد إلزامية — لا يجوز كسرها

### 1) كل حقل قائمة يستخدم `InlineSearchSelect` — لا Select/Popover مخصّص
الحقول القياسية: الاتجاه، الولاية، المدينة، المحلية، المجموعة، الترحيلات (الناقل)، الوجهة.
كلها **يجب** أن تدعم:
- **الكتابة/البحث** (يظهر عند فتح القائمة عبر Enter/F2/الماوس).
- **الإضافة** (`onAdd`) — بما فيها الاتجاه والولاية.
- **الحذف** (`onDelete`) — بما فيها الاتجاه والولاية، مع منع الحذف إن كانت هناك عناصر تابعة.
- **الاختيار من القائمة** بالماوس أو بلوحة المفاتيح.

قاعدة: **إذا رأيت `InlineSearchSelect` بدون `onAdd`/`onDelete` فذلك خطأ** — أضفهما حتى لو كان الجدول لا يحوي عناصر بعد.

### 2) التدفّق بلوحة المفاتيح
- Enter داخل input نصي → `focusAt(k+1)`.
- Enter داخل InlineSearchSelect (بدون قيمة) → يفتح القائمة.
- Enter داخل InlineSearchSelect (بقيمة) → `onNavigateNext` → الحقل التالي.
- `focus()` الافتراضي على `InlineSearchSelectHandle` **يفتح القائمة تلقائياً** — لهذا حين ينتقل الفوكس بلوحة المفاتيح إلى الاتجاه/الولاية/... تفتح القائمة مباشرة دون Enter إضافي.
- استخدم `focusOnly()` إن أردت تركيز الزر دون فتح القائمة.
- ArrowUp/ArrowDown/Enter/Escape/Tab/Backspace كلها تعمل داخل القائمة (راجع `InlineSearchSelect.tsx`).

### 3) Cascade محكم
الاتجاه → الولاية → المدينة → المحلية. تغيير الأب يمسح جميع الأبناء (`state_id/city_id/locality_id = null`).

### 4) Portal + pointer-events
القائمة تُرسم عبر `createPortal(..., document.body)` مع `pointerEvents: "auto"` صراحةً. راجع مهارة `radix-portal-pointer-events`. لا تغيّر هذا.

### 5) Duplicate name/phone warnings
اسم/هاتف مكرّر يُظهر تحذيراً أصفر لا يمنع الحفظ (السلوك مقصود). لا تحوّله لخطأ.

### 6) الحفظ
- `name.trim()` مطلوب.
- بعد الحفظ: dispatch `customers:changed` و `customer-logistics:changed`.
- ربط `preferred_transporter_id` في جدول `customer_preferred_transporter` (delete-then-insert).
- ربط `destination_id` في `customer_destinations` كافتراضي.

## اختبارات القبول (يجب أن تنجح كلها)

افتح الحوار (من أي صفحة أو F9) وتحقق:

1. الانتقال بـ Enter من «اسم العميل» عبر جميع الحقول حتى «الوجهة»، وعند كل حقل InlineSearchSelect تفتح القائمة تلقائياً.
2. في «الاتجاه» يمكن الكتابة وإضافة اتجاه جديد وحذف اتجاه غير مستخدم.
3. نفس الشيء لكل من: الولاية، المدينة، المحلية، المجموعة، الترحيلات، الوجهة.
4. الحذف يُمنَع مع رسالة عربية إن كان العنصر يحوي أبناء.
5. تغيير الاتجاه يمسح الولاية/المدينة/المحلية.
6. النقر بالماوس على أي عنصر في القائمة يختاره ويُغلقها دون إغلاق الحوار الأم.
7. `Escape` يُغلق القائمة فقط لا الحوار (إن كانت مفتوحة)، ثم Escape ثانية يُغلق الحوار.

## الفخاخ التاريخية (لا تعِدها)

- ❌ `InlineSearchSelect` بلا `onAdd/onDelete` على الاتجاه/الولاية → المستخدم عاجز عن الكتابة.
- ❌ `focus()` يركّز الزر فقط دون فتح القائمة → المستخدم يظنّ أن Enter لا يعمل.
- ❌ استخدام `Select` من shadcn بدلاً من `InlineSearchSelect` → يفقد البحث والإضافة السريعة.
- ❌ حذف `pointer-events: auto` من portal → القائمة تظهر لكن غير قابلة للنقر داخل Dialog.
- ❌ نسيان تحديث الـ cascade عند تغيير الأب → المدينة تبقى مع ولاية جديدة.

## عند تعديل هذا الحوار

1. اقرأ الملف كاملاً أولاً.
2. طبّق الاختبارات السبعة أعلاه ذهنياً قبل الحفظ.
3. لا تنقل الحوار إلى `Sheet` بدون طلب صريح — الحجم مُدار عبر `useDialogSize`.
4. لا تلمس `handleEnter` أو `focusAt` — التدفّق حسّاس.
