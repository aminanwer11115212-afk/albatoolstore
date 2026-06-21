# إصلاح جدول البنود عند zoom 100%

## المشكلة

في صفحة إنشاء الفاتورة (وعرض السعر/المشتريات/مرتجع المخزون التي تشاركها نفس البنية)، عند ضبط zoom البنود على **100%**:

1. يظهر **scrollbar عمودي** داخل جدول البنود لأن ارتفاع الصفوف يصبح أكبر فيتجاوز المساحة المتاحة (عند 80% المحتوى يقصُر فلا scrollbar).
2. الأهم: عند التمرير تظهر البنود **أسفل/فوق header الجدول** بدل أن يبقى الـ header ثابتاً يغطّيها بالكامل.
3. عند 80% المشهد مثالي لأن لا scroll أصلاً → لا تظهر المشكلة.

## التحليل

`src/pages/InvoiceCreatePage.tsx:1780` يُعرّف:

```tsx
<thead style={{ position: "sticky", top: 0, zIndex: 5, background: "hsl(var(--primary))" }}>
```

بينما `src/components/items/ItemsScroll.tsx:30-39` يحقن CSS بـ:

```css
.items-scroll thead    { position: sticky; top: 0; z-index: 30; background: hsl(var(--background)); }
.items-scroll thead th { position: sticky; top: 0; z-index: 30; background: hsl(var(--background)); }
.items-scroll tbody tr { position: relative; z-index: 0; }
```

نقاط الخلل:

- **تعارض background:** الـ inline يضع `--primary` على `<thead>`، لكن CSS الـ ItemsScroll يضع `--background` على نفس `<thead>` و `<th>`. مع `border-collapse: collapse` بعض المتصفحات لا تطبع خلفية `<thead>` فوق البنود — فقط خلفية كل `<th>` تعمل بثقة.
- **z-index inline = 5** أقل من 30 في الـ CSS — وفقاً للأولوية inline يفوز فيُصبح 5، وما زال أكبر من 0 لـ tbody، لكن أي ancestor بـ transform أو filter قد يلتهم سياق sticky.
- **scroll عند 100%:** الخلايا تتمدد عبر `var(--items-zoom)`، وارتفاع `.items-table-wrap` ثابت → الحل: تقليل ارتفاع الصف الواحد بمقدار صغير عند 100% غير ممكن دون كسر التصميم؛ الأفضل **إخفاء الـ scrollbar بصرياً** مع إبقائه يعمل بعجلة الفأرة/لوحة المفاتيح، وضمان أن sticky header يغطّي البنود تماماً.

## الخطة

### 1) توحيد سلوك الـ sticky header في `ItemsScroll.tsx`

- إزالة الـ inline style من `<thead>` في `InvoiceCreatePage.tsx` (وأيضاً في `QuoteCreatePage`, `PurchaseCreatePage`, `StockReturnCreatePage` إن تكرّر) والاعتماد على CSS موحّد.
- تعديل CSS داخل `ItemsScroll`:
  - وضع `background: hsl(var(--primary))` على **`thead th`** (وليس `thead`) لأن الخلفية على cell-level هي الموثوقة مع `border-collapse: collapse`.
  - رفع `z-index` على `thead th` إلى `40` للأمان فوق tfoot و tbody.
  - إضافة `box-shadow: 0 1px 0 hsl(var(--border))` للـ `thead th` ليُظهر فاصلاً واضحاً عن أول صف.

### 2) إخفاء الـ scrollbar البصري دون تعطيل التمرير

- داخل `.items-scroll`:
  - `scrollbar-width: thin` على Firefox و `::-webkit-scrollbar { width: 6px }` على WebKit لتقليل عرضه (وليس إخفاؤه كلياً حتى يبقى مرئياً للمستخدم عند الحاجة).
  - بديل لمن يفضّل إخفاءه كلياً: خيار CSS `scrollbar-width: none` و `::-webkit-scrollbar { display: none }` — يُفعَّل عبر class اختياري.

### 3) ضمان أن الخلايا td في tbody ذات خلفية صريحة

- إضافة `background: #ffffff` على `.excel-row > td` في `src/index.css` (إن لم تكن موجودة) ليمنع شفافيّة السطر التي تجعله "يتسرّب" خلف header شفاف.

### 4) تطبيق نفس التعديل على الصفحات المشابهة

- التحقق من `QuoteCreatePage`, `PurchaseCreatePage`, `StockReturnCreatePage` وإزالة أي inline style مكرّر على `<thead>` ليرث السلوك الموحّد من `ItemsScroll`.

## الملفات المتأثرة

- `src/components/items/ItemsScroll.tsx` — توحيد CSS الـ sticky وإخفاء scrollbar.
- `src/pages/InvoiceCreatePage.tsx` — إزالة inline style من `<thead>`.
- `src/pages/QuoteCreatePage.tsx`, `src/pages/PurchaseCreatePage.tsx`, `src/pages/StockReturnCreatePage.tsx` — نفس التنظيف.
- `src/index.css` — إضافة `background: #ffffff` على `.excel-row > td` إذا غير موجود.

## التحقق بعد التنفيذ

1. فتح صفحة فاتورة جديدة، ضبط zoom على 100%، إضافة 15+ بند → التمرير يجب أن يُبقي header مرئياً وكاملاً فوق البنود.
2. اختبار zoom 80% و 120% للتأكد من عدم كسر التصميم.
3. تكرار الاختبار على عرض السعر / المشتريات / مرتجع المخزون.

## ملاحظة

إن أمكن، يرجى إرفاق screenshot من الفيديو الذي ذكرته للتأكد من الفهم الصحيح للمشكلة قبل التنفيذ — قد تكون هناك تفاصيل بصرية إضافية لم تظهر في تحليل الكود.
