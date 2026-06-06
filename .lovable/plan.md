
## الهدف

ضمان أن:
1. **إضافة منتج** من شاشة "إدارة المنتجات" تعمل بالكامل (مع الموردين، التجميد، الفئات والماركات المتعددة).
2. **إضافة عميل** من شاشة "إدارة العملاء" تعمل بالكامل (الواتساب، الإقليم/الولاية/المدينة/المحلية، المجموعة، الوجهة الافتراضية، الترحيل المفضّل).
3. **إضافة فاتورة** تعمل بالكامل.
4. **الأتمتة**: تحويل عرض السعر → فاتورة يُنشئ فاتورة بحالة `new`، وعند الطباعة/أول تغيير تنتقل إلى **"قيد التجهيز"** ويتم خصم المخزون مرة واحدة فقط، ثم "في الطريق" ثم "تم".

## التشخيص

فحصت الكود الحالي مقابل الـ schema الحالية في قاعدة البيانات. الكود يستدعي حقولاً وجداولاً غير موجودة:

| الجدول | الأعمدة الناقصة المطلوبة |
|---|---|
| `customers` | `whatsapp`, `region_id`, `state_id`, `city_id`, `locality_id`, `created_by_uid` |
| `products` | `supplier_id`, `is_frozen`, `barcode` |
| `invoices` | `workflow_status`, `currency_code`, `exchange_rate_to_base`, `created_by_uid`, `user_note`, `warehouse_id` |
| `invoice_items` | `foreign_price`, `unit`, `warehouse_id`, `discount_value`, `format_discount`, `tax_status` |
| `quotes` | `workflow_status`, `currency_code`, `exchange_rate_to_base`, `is_side`, `converted_to_invoice_id`, `converted_at`, `converted_by`, `user_note`, `created_by_uid` |
| `quote_items` | `foreign_price`, `unit`, `discount_value`, `format_discount`, `tax_status` |
| `company_settings` | `side_quote_prefix` |

**جداول مفقودة كلياً**: `regions`, `states`, `cities`, `localities` (هيكل الجغرافيا الهرمي للعملاء)، و `user_roles` (الأدوار).

**دوال RPC مفقودة**: `delete_invoice_items_silent`, `find_duplicate_invoice` (يستخدمهما `InvoiceCreatePage`).

## خطة التنفيذ (هجرة واحدة)

### 1) إضافة الأعمدة الناقصة (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`)
لكل جدول من الجداول أعلاه، بدون مساس بالبيانات الموجودة.

### 2) إنشاء جداول الجغرافيا الهرمية
```text
regions ──< states ──< cities ──< localities
```
كل جدول يحوي `id`, `name`, ومرجع للأب. مع RLS عام (مطابق لباقي النظام) و GRANT.

### 3) إنشاء `user_roles` بالنمط الآمن
- enum `app_role` (`admin`, `manager`, `staff`, `viewer`)
- جدول `user_roles(user_id, role)` + RLS + GRANT
- دالة `has_role(_uid, _role)` بـ `SECURITY DEFINER` لتفادي الـ recursion

### 4) إنشاء دوال RPC للفواتير
- **`delete_invoice_items_silent(p_invoice_id uuid)`** — يحذف بنود فاتورة دون تشغيل أي تريغرات خصم/إرجاع، ضرورية عند إعادة كتابة بنود الفاتورة في وضع التعديل.
- **`find_duplicate_invoice(_customer_id uuid, _date date, _items jsonb, _exclude_invoice_id uuid)`** — تعيد أول فاتورة لنفس العميل/اليوم بنفس مجموع المنتجات والكميات (لمنع التكرار العرضي).

### 5) أتمتة سير عمل الفاتورة
- إضافة CHECK لـ `workflow_status` يسمح فقط بـ: `new`, `preparing`, `ready_to_ship`, `in_transit`, `done`.
- إنشاء **trigger** `invoices_workflow_stock_deduction` على `UPDATE` للفاتورة:
  - إذا انتقلت `workflow_status` من `new` إلى أي قيمة أخرى **لأول مرة فقط** → خصم كميات بنود الفاتورة من `products.stock_quantity` وتسجيل صف في `activity_log` (`action='stock_deducted'`) لضمان الـ idempotency.
  - لا يخصم ثانية إذا أُعيد التحويل أو تغيّرت الحالات لاحقاً (يفحص وجود سجل `stock_deducted` لنفس الفاتورة).
- مزامنة الكود: `InvoiceViewPage` يقوم حالياً عند الطباعة بتغيير الحالة إلى `preparing` — هذا يبقى كما هو ويعتمد على التريغر للخصم.

### 6) تأكيد دالة تحويل عرض السعر → فاتورة
الدالة `convertQuoteToInvoice` موجودة بالفعل في `src/utils/quoteToInvoice.ts` وتنشئ فاتورة بـ `workflow_status='new'` وتربط `converted_to_invoice_id` في عرض السعر. بعد إضافة الأعمدة في الخطوة 1 ستعمل بدون تعديل كود.

### 7) بيانات بذرة بسيطة
- إقليم/ولاية افتراضية واحدة للسودان (الخرطوم) كي لا تكون قوائم الجغرافيا فارغة تماماً.
- `side_quote_prefix = 'SQ-'` في `company_settings`.

### 8) إعادة توليد types
بعد الـ migration سيُعاد توليد `src/integrations/supabase/types.ts` تلقائياً.

## ملاحظات تقنية

- جميع الـ RLS تُحافظ على نمط النظام الحالي (`USING (true) WITH CHECK (true)` للجداول التشغيلية)، باستثناء `user_roles` التي تُقفل عبر `has_role`.
- التريغر يستخدم `SECURITY DEFINER` و `SET search_path = public` ليتجاوز RLS عند الخصم.
- التحقق من الـ idempotency يتم بـ `WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE entity_type='invoice' AND entity_id=NEW.id AND action='stock_deducted')` داخل التريغر.

## التحقّق بعد التطبيق

1. فتح "إدارة المنتجات" → إضافة منتج جديد ← يُحفظ ويظهر في القائمة.
2. فتح "إدارة العملاء" → إضافة عميل مع واتساب وولاية ومدينة ← يُحفظ.
3. إنشاء فاتورة جديدة من شاشة الفاتورة ← تُحفظ بحالة `new`.
4. إنشاء عرض سعر → الضغط على "تحويل لفاتورة" ← تُنشأ فاتورة مرتبطة، عرض السعر يصبح `accepted` ومرتبط بـ `converted_to_invoice_id`.
5. فتح الفاتورة الجديدة → تغيير الحالة إلى **قيد التجهيز** ← خصم المخزون يحدث مرة واحدة (يمكن التحقق من `activity_log` و `products.stock_quantity`).
6. تغيير الحالة إلى **في الطريق** ثم **تم** ← لا خصم إضافي.
