## المشكلة في الصورة

من الصورة على شاشة /products (375px) ألاحظ مشكلتين حقيقيتين، وليست واحدة:

1. **أزرار شريط الأدوات مهروسة** — الحروف العربية تظهر مكدّسة عمودياً (ح/ي/ل…) لأن العرض أقل من حرف واحد. السبب: قواعد `desktop-on-mobile .legacy-dt-toolbar` في `src/index.css` تجعل الشريط `flex-wrap: nowrap` و`overflow-x: auto`، لكنها تطبّق `flex: 0 0 auto` و`white-space: nowrap` **على input/select/label فقط**، وليس على الأزرار `.btn-xxs` / `.btn-xs` / `<a>`. النتيجة flex يضغط الأزرار إلى pixel واحد ويلفّ النص داخلها.

2. **منطقة الجدول فارغة تماماً** بين "2 منتج" والترقيم رغم وجود منتجين. الحاوية `.desktop-table-wrap` لها `maxHeight: calc(100vh - 280px)` و`overflowY: auto`. على ارتفاع جوال 669px تصبح ~389px، لكن مع أشرطة شريط الأدوات + الـ chips + الصور المرسومة قد تصبح الحاوية بارتفاع موجب صغير جداً أو تحجب الجدول بصرياً. كما أن `min-width: 1100px` على `.legacy-table` مع `tableLayout: fixed` وقيم `colWidths` المخزّنة من الديسكتوب قد تجعل التمرير الأفقي لا يبدأ من بداية الجدول.

## الخطة

### 1) `src/index.css` — توسيع قاعدة الشريط لتشمل الأزرار

داخل `@media (max-width: 767px)`، أُضيف للأزرار نفس معاملة input/select:

```css
.desktop-on-mobile .legacy-dt-toolbar button,
.desktop-on-mobile .legacy-dt-toolbar a {
  flex: 0 0 auto !important;
  white-space: nowrap !important;
  min-width: auto !important;
  width: auto !important;
}
.desktop-on-mobile .legacy-dt-toolbar > * {
  flex-shrink: 0 !important;
}
```

كذلك أزيل `marginInlineStart: "auto"` على زر "+ منتج جديد" بصرياً ضمن نفس الميديا (لأنه يجبر باقي العناصر إلى أقصى اليمين فيُسرّع الانهيار):

```css
.desktop-on-mobile .legacy-dt-toolbar button[style*="margin-inline-start: auto"] {
  margin-inline-start: 8px !important;
}
```

### 2) `src/index.css` — تأكيد ظهور الجدول

أضيف `.desktop-table-wrap` إلى قائمة الحاويات التي تأخذ `overflow-x: auto`، وأُلغي `maxHeight` المحسوبة على الجوال لتترك الجدول يأخذ ارتفاعه الطبيعي:

```css
.desktop-on-mobile .desktop-table-wrap {
  max-height: none !important;
  overflow-x: auto !important;
  overflow-y: visible !important;
  -webkit-overflow-scrolling: touch;
}
```

هكذا يصبح التمرير الأفقي للجدول صفحياً (داخل `.desktop-on-mobile`) ولا يُخفى ارتفاعه.

### 3) `src/index.css` — احترام `tableLayout: fixed` مع min-width

نضمن أن الجدول ذو الأعمدة الثابتة لا يُكسر `colgroup`:

```css
.desktop-on-mobile .legacy-table[style*="table-layout: fixed"] {
  width: max-content !important;
  min-width: 1100px !important;
}
```

### 4) لا تغييرات على ملفات الصفحات

لا حاجة لتعديل `ProductsPage.tsx` ولا `CustomersPage.tsx`؛ كل الإصلاح في CSS العالمي ضمن نفس قسم `desktop-on-mobile`، فينطبق تلقائياً على الشاشتين.

### 5) التحقق

- زيارة `/products` على viewport 375 والتأكد من:
  - أن أزرار شريط الأدوات تظهر بنصها كاملاً على سطر واحد قابل للتمرير أفقياً.
  - أن صفوف المنتجين تظهر فعلاً في الجدول.
- زيارة `/customers` للتأكد من عدم تكسّر التخطيط (نفس القواعد).
- التأكد من أن نسخة الديسكتوب (≥768px) لم تتأثر — كل التعديلات داخل `@media (max-width: 767px)` فقط.

## الملفات المتأثرة

- `src/index.css` (إضافة ~15 سطر داخل ميديا الجوال الحالية)
