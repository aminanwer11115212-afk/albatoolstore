# خطة أوامر الشراء والموردين — Albatool

## 1. تشخيص المشكلة الحالية (لماذا لا يظهر أمر أمجد؟)

فحصت قاعدة البيانات مباشرة ووجدت:

| الفحص | النتيجة |
|---|---|
| هل المورد "امجد" موجود؟ | ✅ موجود (`717c98…`) |
| هل أمر الشراء محفوظ فعلاً؟ | ✅ نعم `PO-48438`، حالته `received`، الإجمالي `1,064,000` |
| هل صلاحيات RLS تسمح بقراءته؟ | ✅ `USING (true)` |
| هل عمود `stock_applied_at` مضبوط؟ | ❌ **NULL** رغم أن الحالة `received` |
| هل مفتاح الكاش `purchase-orders-full` ضمن قوائم "إعادة الجلب عند التركيب"؟ | ❌ **غير موجود** في `App.tsx` |

**الخلاصة:** الأمر محفوظ فعلاً، لكن صفحة `/purchase-orders` تعرض نسخة قديمة من الكاش (staleTime افتراضي = 5 دقائق) لأن مفتاحها ليس ضمن القائمة التي تُجبر على `refetchOnMount:"always"`. كذلك، مسار "حفظ واستلام" الحالي لا يمرّ عبر الـ RPC الذرّي الجديد `receive_purchase_stock_once`، لذلك `stock_applied_at` بقي فارغاً — وهذا سيسبب مشاكل مستقبلية (استلام مزدوج للمخزون).

## 2. الإصلاح الفوري (يحل مشكلة أمجد الآن)

- **إضافة مفاتيح كاش أوامر الشراء إلى قائمة إعادة الجلب** في `src/App.tsx` (السطور 185–206): `purchase-orders-full`, `purchase-orders`, `purchase-order-items` مع `staleTime: 30_000` و`refetchOnMount:"always"` — نفس معاملة الفواتير والعروض.
- **backfill لعمود `stock_applied_at`** لكل أمر حالته `received` والعمود عنده `NULL` (هجرة قصيرة).
- **إجبار PurchasePage على refetch عند التركيب** كطبقة دفاع ثانية (`refetchOnMount:"always"` على الاستعلام نفسه).
- **اشتراك Realtime في `purchase_orders`** ضمن `src/lib/realtimeSync.ts` ليتحدّث الجدول فوراً بين الأجهزة (فحصت — العائلة موجودة لكن نتأكّد من `ADD TABLE` في publication).

## 3. توحيد "حفظ واستلام" على مسار واحد آمن

`PurchaseCreatePage` عند `alsoReceive=true` يمرّ حالياً بمسار قديم (`addStockForLines` مباشرة + تحديث الحالة يدوياً). سنستبدله بـ:

```ts
// بعد INSERT/UPDATE للأمر:
const { data } = await supabase.rpc("receive_purchase_stock_once", { _po_id: savedId });
// data = { ok, reason } — إذا already_applied لا تعيد الإضافة
```

فوائد:
- ذرّي على مستوى DB (`FOR UPDATE`).
- يضبط `stock_applied_at + status='received'` معاً — استحالة أن يظهر أمر مستلَم بدون ختم.
- نفس المسار للاستلام من زر "استلام" في `/purchase-orders` (زر يستدعي `receiveStockForPurchaseOnce` الذي بدوره يستخدم RPC — موجود).

## 4. تسجيل دفعات الموردين

نستخدم جدول `transactions` الحالي (لا جدول جديد) بنفس نمط دفعات العملاء:

| حقل | القيمة |
|---|---|
| `type` | `expense` |
| `category` | `supplier_payment` |
| `supplier_id` | معرّف المورد |
| `reference_id` | معرّف أمر الشراء (اختياري — لدفعة على أمر محدد) |
| `account_id` | الحساب الذي خرج منه المبلغ (نقد/بنك/محفظة) |
| `method` | `cash`/`bank`/`card`/`mobile` — مع تحقّق `validateBankTransferPayment` عند البنك |
| `amount`, `date`, `notes` | كالمعتاد |

**واجهة المستخدم:**
- في `/purchase-orders`: زر "💳 تسجيل دفعة" على كل صف (يظهر فقط إذا `due_amount > 0`) → يفتح Dialog بسيط.
- في `/suppliers`: زر "دفعة سريعة" يفتح نفس الـ Dialog بدون أمر محدد (دفعة على الرصيد العام).
- بعد الحفظ: `recompute_supplier_balance(_supplier_id)` يعمل تلقائياً عبر `trg_po_recompute_supp_balance` — لكن الدفعات في `transactions` لا تحرّكه حالياً. **نضيف تريجر جديد** `trg_tx_recompute_supp_balance` مطابق لتريجر العميل.

**تعديل `recompute_supplier_balance`** ليطرح `Σ(supplier_payment)` من إجمالي المتبقّي:
```sql
balance = Σ GREATEST(po.total - po.paid_amount, 0) - Σ(transactions.amount WHERE category='supplier_payment')
```
أو الأنظف: نُحدّث `purchase_orders.paid_amount` مباشرة عند الدفعة (كما نفعل مع الفواتير)، ونترك التريجر الحالي يعمل كما هو.

## 5. صفحة كشف حساب مورد `/reports/supplier-statement`

مطابقة تصميمياً لـ `CustomerStatementPage` لكن الاتجاه معكوس:

| العمود | المصدر |
|---|---|
| التاريخ | `po.date` أو `transaction.date` |
| البيان | "أمر شراء #PO-XXXX" / "دفعة نقدية" / "تحويل بنكي" |
| مدين (له علينا) | `po.total` (يزيد ما لدينا للمورد) |
| دائن (دفعنا) | `transaction.amount` (يقلّل ما لدينا) |
| الرصيد الجاري | تراكمي |

- فترة قابلة للاختيار (from/to).
- إجماليات في الأسفل: إجمالي المشتريات، إجمالي المدفوع، الرصيد النهائي.
- زر طباعة A4 RTL بنفس تصميم كشف العميل.
- زر مشاركة WhatsApp (اختياري لاحقاً).

## 6. التحقق (بعد التنفيذ)

- فتح `/purchase-orders` → **يظهر PO-48438 لأمجد فوراً**.
- إنشاء أمر شراء جديد + "حفظ واستلام" → يظهر في القائمة والمخزون ويُختم `stock_applied_at`.
- تسجيل دفعة 500,000 على PO-48438 → `paid_amount=500,000`، `due_amount=564,000`، ورصيد المورد يعكس ذلك.
- فتح `/reports/supplier-statement?supplier=717c98…` → يعرض الأمر + الدفعة + الرصيد.

## ملاحظات تقنية

- **الهجرة (Migration واحدة):**
  1. `UPDATE purchase_orders SET stock_applied_at = COALESCE(stock_applied_at, updated_at) WHERE status='received' AND stock_applied_at IS NULL` — backfill.
  2. إضافة `trg_tx_recompute_supp_balance` على `transactions` بحيث كل INSERT/UPDATE/DELETE بفئة `supplier_payment` يستدعي `recompute_supplier_balance(NEW.supplier_id)`.
  3. تعديل `recompute_supplier_balance` ليخصم دفعات الموردين من الرصيد (أو الاعتماد على تحديث `paid_amount` مباشرة — أختار النهج الثاني الأنظف).
- **ملفات جديدة:**
  - `src/components/purchase/SupplierPaymentDialog.tsx`
  - `src/pages/SupplierStatementPage.tsx`
  - `src/utils/supplierStatementPrint.ts` (نسخة معدّلة من `statementPrintTemplate.ts`)
- **ملفات معدّلة:**
  - `src/App.tsx` — إضافة كاش overrides + مسار الصفحة الجديدة.
  - `src/pages/PurchasePage.tsx` — زر "تسجيل دفعة" + refetchOnMount:"always" على الاستعلام.
  - `src/pages/PurchaseCreatePage.tsx` — استبدال مسار `alsoReceive` بـ RPC.
  - `src/pages/SuppliersPage.tsx` — زر "دفعة سريعة" + رابط "كشف حساب".
  - `src/lib/realtimeSync.ts` — تأكيد `purchase_orders` ضمن العائلات النشطة.

## خطة التنفيذ (ثلاث دفعات)

1. **الآن (إصلاح ظهور أمر أمجد):** كاش overrides + backfill `stock_applied_at` + refetchOnMount على PurchasePage.
2. **الدفعة الثانية:** توحيد "حفظ واستلام" على RPC + Dialog دفعات المورد + تريجر `trg_tx_recompute_supp_balance`.
3. **الدفعة الثالثة:** صفحة `SupplierStatementPage` كاملة مع الطباعة.

هل أبدأ بالدفعة الأولى؟