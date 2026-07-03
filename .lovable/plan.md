## الفكرة

نلغي مفهوم "وضع تنقّل / وضع تعديل" كاملاً. يصبح جدول البنود يعمل كجدول Excel/Google Sheets: تكتب مباشرة في أي حقل، بدون شارات، وبدون حجب مفاتيح، وبدون تلوين الصف.

الحذف والتحديد يصيران باختصارات صريحة لا تتعارض مع الكتابة.

## السلوك الجديد

### الكتابة والتنقّل

- كل الحقول تقبل الكتابة فور التركيز عليها. لا حجب لأي مفتاح.
- **Space**: مسافة عادية دائماً.
- **Enter**: يؤكّد القيمة وينقل التركيز للحقل التالي (كما هو الآن).
- **Tab / Shift+Tab**: انتقال عادي.
- **الأسهم**: تنقّل بين الخلايا حسب المنطق الحالي (`itemTableNav`).
- **Escape**: يُلغي التحديد الحالي للصف/الصفوف إن وُجد.

### حذف الصفوف — اختصارات صريحة

- `Delete`: حذف الصف الذي فيه التركيز فوراً (يعمل من أي حقل، بأي محتوى).
- `**Ctrl` + `Shift` + `Delete**`: حذف كل الصفوف المحدَّدة (checkboxes).
- `Delete`: نفس `Ctrl+Delete` — بديل مريح.
- التحديد المتعدّد: من خانات الاختيار في العمود الأول (موجودة أصلاً)، لا حاجة لأي "double-Space".

### إشارات بصرية

- إبراز الصف الحالي (خفيف، لون tokenized) لتعرف موقعك، بدون تعطيل أي شيء.
- الصفوف المحدَّدة عبر checkboxes تُبرز بلون التحديد المعتاد.
- تلميح صغير أسفل الجدول: "Ctrl+Delete لحذف الصف الحالي، Ctrl+Shift+Delete للمحدَّد".

## ما سيُحذَف

- كامل نظام `data-space-mode` (nav/edit).
- المستمعات العالمية في `useSpaceToDelete.ts` التي تمنع `keydown` / `beforeinput` / `paste`.
- تتبّع `editingElements` وسلوك Enter/mousedown → edit.
- منطق "ضغطتان Space لحذف الصف".
- قواعد CSS في `src/index.css` للـ `data-space-mode`.

## ما سيبقى ويُعدَّل

- `useSpaceToDelete` يُعاد تسميته إلى `useRowDeleteShortcut` ويصبح مسؤولاً عن:
  - كشف `Ctrl+Delete` / `Ctrl+Backspace` → حذف صف التركيز.
  - كشف `Ctrl+Shift+Delete` → حذف كل الصفوف المحدَّدة.
  - إبراز الصف الحالي عبر `data-active-row` (CSS خفيف).
- كل صفحات (`InvoiceCreatePage`, `QuoteCreatePage`, `PurchaseCreatePage`, `StockReturnCreatePage`, `SideQuoteCreatePage`) تستدعي الهوك الجديد وتمرّر `onDelete(uid)` و`selectedUids`.
- checkboxes التحديد تبقى كما هي وتتحكّم في `selectedUids`.

## الاختبارات

- تحديث `useSpaceToDelete.test.tsx` بالكامل ليعكس المفهوم الجديد:
  - Space في أي حقل يكتب مسافة (لا تحديد ولا حذف).
  - `Ctrl+Delete` من أي حقل داخل الصف → يستدعي `onDelete(uid)`.
  - `Ctrl+Shift+Delete` مع صفوف محدَّدة → يستدعي `onDelete` لكل uid محدَّد.
  - Enter/Tab/الأسهم لا تُطلق أي حذف.

## التفاصيل التقنية

- الملفات المتأثرة:
  - `src/hooks/useSpaceToDelete.ts` → إعادة كتابة كاملة (اسم جديد + سلوك جديد).
  - `src/index.css` → حذف قواعد `data-space-mode`، إضافة قاعدة `data-active-row` خفيفة.
  - `src/hooks/__tests__/useSpaceToDelete.test.tsx` → إعادة كتابة.
  - الصفحات: استبدال استدعاء الهوك (توقيع الاسم فقط).
- لا تغيير على `useInvoiceKeyboardNav`, `itemTableNav`, `createPageNav` (بقيت تعمل بلا `.select()` كما ضبطناها).

