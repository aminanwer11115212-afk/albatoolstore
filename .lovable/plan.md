## تحليل الملفات

### ملف المنتجات (`المنتجات🛒📦 [ عطبرة ]`)
- **638 صف**، عمودان فقط:
  - `اسم الصنف` → اسم المنتج (1 صف فارغ، 1 مكرر سيُتجاهلان)
  - `تنشيط`: `[x]` = نشط (554 صنف), `[ ]` = غير نشط/مجمَّد (84 صنف)
- لا أسعار، لا كميات، لا أكواد. كل المنتجات ستُدخل بالقيم الافتراضية: `purchase_price=0`, `sale_price=0`, `stock_quantity=0`, `unit='قطعة'`.

### ملف العملاء (`دليل الاسماء 👥`)
- **306 صف**، عمودان:
  - `اسم العميل١` → اسم العميل (لا فراغات، 2 اسم مكرر سيُتجاهل أحدها)
  - `رقم هاتف العميل١` → الهاتف (82 صف بدون رقم، الباقي يحوي علامة LTR `‎` ومسافات سيتم تنظيفها)
- الأرقام أمثلة: `‎+249 11 492 4180`, `‎012 200 8065`, `‎0907984666`. سأطبّع: إزالة U+200E والمسافات.

### الموجود حالياً في قاعدة البيانات
- `products`: 2 صف فقط
- `customers`: 3 صفوف فقط
- منع التكرار: لكل صف نتحقق `NOT EXISTS` على الاسم قبل الإدخال.

## خطة الإدخال

### 1) استخراج وتنظيف البيانات (سكربت محلي)
- قراءة الملفين بـ `pandas`.
- المنتجات: حذف الفراغات والتكرار، توليد قائمة `(name, is_frozen)` حيث `is_frozen = (تنشيط != '[x]')`.
- العملاء: حذف الفراغات والتكرار، تنظيف الهاتف:
  - حذف U+200E، المسافات، الواصلات
  - الاحتفاظ بـ `+` في البداية إن وُجد
  - `whatsapp` = نفس الهاتف
- إخراج ملفين CSV مؤقتين في `/mnt/documents/import_products.csv` و `/mnt/documents/import_customers.csv` لمعاينتهما قبل الإدخال.

### 2) الإدخال الفعلي عبر SQL على Lovable Cloud
نفّذ عبر أداة `supabase--insert` على دفعتين كبيرتين (637 منتج + 305 عميل) باستخدام `INSERT ... SELECT ... WHERE NOT EXISTS`:

```sql
-- منتجات
INSERT INTO public.products (name, is_frozen, unit, purchase_price, sale_price, stock_quantity)
SELECT v.name, v.is_frozen, 'قطعة', 0, 0, 0
FROM (VALUES ('اسم1', false), ('اسم2', true), ...) AS v(name, is_frozen)
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.name = v.name);

-- عملاء
INSERT INTO public.customers (name, phone, whatsapp)
SELECT v.name, NULLIF(v.phone,''), NULLIF(v.phone,'')
FROM (VALUES ('عميل1','249114924180'), ...) AS v(name, phone)
WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.name = v.name);
```

سيتم بناء الـ VALUES تلقائياً من السكربت مع escape صحيح للنصوص العربية وعلامات الاقتباس.

### 3) التحقق بعد الإدخال
- `SELECT count(*) FROM products;` (يجب ≈ 639)
- `SELECT count(*) FROM customers;` (يجب ≈ 308)
- عرض 10 صفوف عينة من كل جدول.

## ما لن يتغير
- بنية الجداول (لا migration مطلوبة — الجداول جاهزة).
- لا تعديل على واجهات الإدخال أو صفحات `ProductsPage` / `CustomersPage`.

## مخرجات للمراجعة قبل الإدخال
سأولّد ملفين CSV في `/mnt/documents/` لمعاينة البيانات النهائية قبل الكتابة في قاعدة البيانات.
