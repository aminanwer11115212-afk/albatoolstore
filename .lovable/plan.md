
# خطة: صفحة "تتبع المخزون" (Stock Tracking)

صفحة جديدة داخل قسم **مدير المنتجات** تعرض جميع حركات المخزون (بيع/مرتجع/شراء/تحويل) في خط زمني واحد قابل للبحث والفلترة.

## 1) الموقع والمسار
- ملف جديد: `src/pages/StockTrackingPage.tsx`
- المسار: `/stock-tracking` — يُسجَّل في `src/App.tsx` بـ `lazyEl(...)`
- رابط في الشريط الجانبي ضمن قسم "مدير المنتجات / المخزون" بعد صفحة المنتجات.

## 2) مصادر البيانات (قراءة فقط — لا تعديل للمخططات)
- `invoice_items` + `invoices(date, invoice_number, customer_id, status)` → خصم بيع
- `stock_return_items` + `stock_returns(date, return_number, customer_id)` → إرجاع (إضافة للمخزون)
- `purchase_order_items` + `purchase_orders(date, order_number, supplier_id, status)` → شراء (إضافة للمخزون)
- `stock_transfers` → تحويل بين المخازن
- `products(id, name, stock_quantity, min_stock, unit, sku)` للحالة الحالية

يُجلب الكل بـ React Query (`useQuery`) ويُدمج محلياً في مصفوفة موحّدة:
```
{ id, date, type: 'sale'|'return'|'purchase'|'transfer',
  product_id, product_name, qty (موقّعة: - بيع/+ شراء وإرجاع),
  doc_number, party_name (عميل/مورد), warehouse, current_stock }
```

## 3) واجهة الصفحة (RTL، Arabic-first، Cairo، Bold)
- عنوان `<h1>تتبع المخزون</h1>` + شارة "اليوم: 17 يونيو 2026" تعرض التاريخ الحالي ديناميكياً (`new Date()` بصيغة عربية).
- صف فلاتر علوي:
  - بحث منتج (`InlineSearchSelect` أو `startsWithMatch`)
  - نوع الحركة (الكل/بيع/إرجاع/شراء/تحويل) — `Select` shadcn
  - مدى التاريخ: أزرار سريعة (اليوم، أمس، آخر 7 أيام، الشهر) + تقويم مخصص (من/إلى)
  - المخزن (إن وُجد)
- بطاقات ملخّص (4): إجمالي المبيعات (كمية)، إجمالي المرتجعات، إجمالي المشتريات، صافي الحركة — للفترة المحدّدة.
- جدول shadcn رئيسي بأعمدة:
  - التاريخ • النوع (Badge ملوّن من tokens) • المنتج • الكمية (± مع لون) • رقم المستند (رابط) • العميل/المورد • المخزون الحالي
- ترتيب افتراضي: الأحدث أولاً. صفحات (Pagination) 50/صفحة.
- حالة فارغة عربية: "لا توجد حركات في هذه الفترة".

## 4) سلوك
- الافتراضي عند الفتح: فلتر "اليوم" = 2026-06-17 لإظهار آخر المنتجات المخصومة فوراً.
- النقر على رقم المستند يفتح صفحة عرض الفاتورة/المرتجع/الشراء المناسبة.
- النقر على اسم المنتج يفلتر الصفحة على هذا المنتج فقط (لعرض كل حركاته).
- تحديث تلقائي عند `products:changed` / `customers:changed` (الموجودة فعلاً في `useData.ts`).

## 5) قيود/التزام بمعايير المشروع
- بدون أي تعديل DB — قراءة فقط من جداول قائمة.
- ألوان من tokens فقط (`bg-primary`, `text-destructive`, `bg-muted`...).
- موبايل ≤640: touch ≥44px، خط الحقول ≥16px، لا overflow أفقي (الجدول يتحوّل إلى بطاقات على الموبايل عبر `MobileDocList` نمط).
- RTL: `dir="rtl"`، استخدام `ms-*/me-*` لا `ml/mr`.
- التواريخ تُنسّق عبر دالة موحّدة `formatArabicDate(new Date())` — يومياً تعرض التاريخ الحالي تلقائياً (17/06/2026 اليوم).

## تفاصيل تقنية مختصرة
- لا حاجة لـ migration.
- يمكن إعادة استخدام `useInvoicesWithCustomers`, `usePurchaseOrders`, `useStockReturns`, `useProducts` الموجودة.
- البحث: `startsWithMatch` من `@/utils/searchMatch`.
- التواريخ: `Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'long' })`.

## ما لن يتم في هذه الجولة
- لا تصدير CSV/PDF (يمكن إضافته لاحقاً).
- لا تعديل أرصدة أو خصم يدوي — الصفحة عرض فقط.

هل أنفّذ الخطة كما هي؟
