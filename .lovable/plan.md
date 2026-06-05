
## الهدف
1) كل النوافذ المنبثقة (إضافة منتج / إضافة عميل / إضافة فئة / إضافة ماركة / ترحيلات … إلخ) تظهر بشكل صحيح على الهواتف بدون قص أو خروج عن الشاشة.
2) شاشتا "إدارة المنتجات" و"إدارة العملاء" تعرضان نفس تجربة اللابتوب على الجوال (نفس الأعمدة والجدول) مع دعم كامل للمس: تمرير أفقي/عمودي بإصبع، تكبير الأعمدة بسحب الحواف باللمس، نقر مطوّل = تحديد، إلخ.

---

## المشكلة الجذرية (مكتشفة)
الملف `src/hooks/useDialogSize.ts` يفرض على كل المنبثقات:
```
minWidth: 480, minHeight: 360, resize: both
```
بينما عرض الجوال 375px فقط → كل المنبثقات تخرج عن الشاشة.
كما أن المقاس المحفوظ من اللابتوب (مثلاً 900×700) يُعاد استخدامه حرفياً على الجوال.

المنبثقات المتأثرة (نموذج): `QuickAddProductDialog`, `CustomerFormDialog`, `TransportDialog`, `PackagingDialog`, `ChargeBalanceDialog`, `ExchangeRateDialog`, `AccountsOpeningBalanceDialog`, `QuoteAttachmentsDialog`, `PurchaseAttachmentsDialog`, `PrintTilesDialog`, `MessageImportDialog`, `InstallPwaDialog`, `UnsavedChangesDialog`، …

---

## الخطة

### 1) إصلاح `useDialogSize` (إصلاح مركزي = يصلح كل المنبثقات دفعة واحدة)
- اكتشاف الجوال (`window.innerWidth ≤ 640` + `matchMedia`).
- على الجوال:
  - `minWidth: 0`, `minHeight: 0`
  - `width: 100vw`, `height: 100dvh` (شاشة كاملة)
  - `maxWidth: 100vw`, `maxHeight: 100dvh`
  - `resize: none` (لا يوجد سحب لتغيير الحجم باللمس)
  - تجاهل المقاس المحفوظ من اللابتوب (مفتاح تخزين مختلف للجوال أو تخطي القراءة).
  - `borderRadius: 0`, `overflow: auto` للمحتوى.
- على اللابتوب: السلوك الحالي يبقى كما هو.
- تحديث `dlgStyle` ليُرجع `overflowY: "auto"` افتراضياً على الجوال حتى لا تختفي أزرار الحفظ.

### 2) جعل `DialogContent` الافتراضي محترماً لشاشة الجوال
- مراجعة `src/components/ui/dialog.tsx`: التأكد من أن الـ overlay و content يستخدمان `inset-0` على الجوال وبدون `translate-x/y` يسبب القص.
- إضافة class شرطي `sm:rounded-lg rounded-none` و`sm:max-w-lg w-full` ليكون متجاوباً.

### 3) أزرار الإغلاق/الحفظ مرئية دائماً على الجوال
- في كل منبثق: footer ثابت `sticky bottom-0 bg-background border-t` بحيث لا يضيع زر "حفظ" أسفل المحتوى.
- الإدخالات بحجم 16px+ (مطبّق مسبقاً في `index.css`).

### 4) شاشة "إدارة المنتجات" و"إدارة العملاء" على الجوال = نسخة اللابتوب + لمس
حالياً يوجد توجيه إلى `MobileDocList` أو CSS يخفي أعمدة. سنوقف هذا التحويل في الشاشتين فقط:
- **`ProductsPage.tsx`** و **`CustomersPage.tsx`**:
  - إزالة أي شرط `useIsMobile()` يبدّل العرض إلى قائمة بطاقات.
  - تغليف الجدول بـ `<div className="overflow-auto touch-pan-x touch-pan-y -webkit-overflow-scrolling-touch">` للتمرير الكامل بإصبعين.
  - الحفاظ على نفس الأعمدة وعرضها كما اللابتوب (لا `hidden sm:table-cell`).
- في `src/index.css`: استثناء هاتين الصفحتين من قواعد إخفاء الأعمدة على الجوال عبر selector `body[data-page="products"]` / `body[data-page="customers"]` (نضيف `data-page` في الصفحتين).

### 5) دعم اللمس في تغيير عرض الأعمدة
`useColumnWidths` يستخدم `mousedown/mousemove`. سنضيف معالجات `pointerdown/pointermove/pointerup` (Pointer Events تغطي الفأرة واللمس) في `ColumnResizeHandle` مع `touch-action: none` على المقبض حتى لا يتعارض مع تمرير الجدول.

### 6) فحص نهائي
- فتح المعاينة على 375×668 والتأكد من:
  - زر "+ منتج جديد" داخل شاشة إنشاء فاتورة يفتح المنبثق ملء الشاشة، حقوله واضحة، الحفظ مرئي.
  - نفس الشيء لإضافة عميل / فئة / ماركة / ترحيلات.
  - `/products` و `/customers` تعرضان الجدول الكامل قابلاً للتمرير باللمس وتغيير عرض الأعمدة بإصبع.

---

## ملفات سيتم تعديلها (تقريبياً)
- `src/hooks/useDialogSize.ts` (الإصلاح المركزي)
- `src/components/ui/dialog.tsx` (responsive classes)
- `src/index.css` (استثناء صفحتي products/customers من قواعد إخفاء الأعمدة)
- `src/pages/ProductsPage.tsx` و `src/pages/CustomersPage.tsx` (إلغاء تبديل عرض الجوال + إضافة `data-page` + غلاف تمرير لمسي)
- `src/hooks/useColumnWidths.tsx` (Pointer Events + `touch-action`)
- لا حاجة لتعديل كل منبثق على حدة — الإصلاح المركزي في #1 يكفي.

---

## خارج النطاق (سيُنفّذ في طلب لاحق إن طلبت)
- إعادة تصميم بصري للمنبثقات (ألوان/تخطيط).
- نقل بيانات النظام القديم.
- شاشات إدارة جديدة للفئات/الماركات (الموجودة حالياً ستستفيد تلقائياً من إصلاح #1).

هل أبدأ التنفيذ؟
