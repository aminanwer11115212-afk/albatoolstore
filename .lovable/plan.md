## الهدف
عند حذف أي فاتورة من أي شاشة (قائمة الفواتير، شاشة عرض الفاتورة، شاشة تعديل الفاتورة) يتم:
1. إرجاع كميات بنود الفاتورة بالكامل إلى مخزون المنتجات.
2. حذف الفاتورة وكل توابعها (بنود، مرفقات، تغليف، نقل) فعلياً من قاعدة البيانات.
3. ضمان أن المخزون الذي يظهر في شاشات الإدخال الأربع (فاتورة، عرض سعر، شراء، مرتجع) هو المخزون الفعلي الحالي بعد التحديث.

---

## الوضع الحالي (ما يعمل وما لا يعمل)

| الشاشة | الحذف يعمل؟ | يُرجع المخزون؟ | المشكلة |
|---|---|---|---|
| `InvoicesPage` (القائمة) | ✅ | ⚠️ جزئياً | يُرجع دائماً حتى لو الفاتورة لم تُخصم أصلاً (حالة "جديدة") → تضخّم مخزون وهمي |
| `InvoiceCreatePage` (زر حذف داخل التعديل) | ✅ | ⚠️ جزئياً | نفس المشكلة أعلاه + يبتلع أخطاء إرجاع المخزون بصمت (`console.warn`) ويكمل الحذف |
| `InvoiceViewPage` (شاشة عرض الفاتورة) | ❌ | ❌ | يضع `status='cancelled'` فقط — لا يحذف ولا يُرجع مخزون |
| عرض المخزون في 4 شاشات الإدخال | ✅ | — | يقرأ من `products.stock_quantity` مباشرة عبر `fetchAllProducts` — سليم |

السياسة الموجودة في `stockDeduction.ts` واضحة:
- خصم المخزون يحدث **مرة واحدة فقط** عند نقل الفاتورة من حالة "جديدة" إلى أي حالة تجهيز، ويُسجَّل بـ `invoices.stock_deduction_id` كحارس (guard) idempotent.
- إذن: إرجاع المخزون عند الحذف يجب أن يكون **مشروطاً بوجود `stock_deduction_id`** فقط.

---

## الخطوات

### 1) دالة موحّدة `deleteInvoiceWithStockRestore`
ملف جديد `src/utils/deleteInvoice.ts` يحتوي على دالة واحدة تُستدعى من كل شاشات الحذف:

```text
deleteInvoiceWithStockRestore(invoiceId)
  ├─ يقرأ الفاتورة: stock_deduction_id, invoice_number
  ├─ يقرأ بنود invoice_items
  ├─ إذا (stock_deduction_id موجود وبنود > 0):
  │     يُرجع الكميات عبر applyStockDeltaForLines(oldItems, [])
  │     إن فشل → يوقف العملية ويُلقي خطأ (لا يحذف)
  ├─ يحذف توابع الفاتورة بالترتيب الآمن:
  │     invoices_packaging_items → invoice_packaging
  │     invoices_transports_items → invoice_transports
  │     invoice_items, invoice_attachments
  ├─ يحذف الفاتورة نفسها من invoices
  ├─ يطلق window event "products:changed" لتحديث الكاشات
  └─ يُرجع { restoredStock: boolean, invoiceNumber }
```

هذا يضمن سلوكاً موحّداً في كل مكان ويمنع تكرار المنطق.

### 2) تحديث مواقع الحذف الثلاثة لتستدعي الدالة الجديدة

**أ. `src/pages/InvoicesPage.tsx`** (دالة `handleDelete` السطر 65-94):
- إزالة الكود اليدوي لإرجاع المخزون والاستبدال باستدعاء `deleteInvoiceWithStockRestore`.
- رسالة النجاح تتغير بحسب `restoredStock` (إن لم تكن مُخصومة: "تم الحذف" فقط؛ وإلا: "تم الحذف وإرجاع الكميات").

**ب. `src/pages/InvoiceCreatePage.tsx`** (مربع تأكيد المسح/الحذف، السطر 2386-2470):
- استبدال الـ 5 خطوات اليدوية باستدعاء `deleteInvoiceWithStockRestore`.
- في حال فشل إرجاع المخزون → عرض الخطأ في toast وإيقاف العملية (بدل ابتلاع الخطأ بـ `console.warn`).
- الإبقاء على تنظيف كاش React Query والانتقال إلى `/invoices/create`.

**ج. `src/pages/InvoiceViewPage.tsx`** (دالة `handleDelete` السطر 252-259):
- استبدال `update({status:'cancelled'})` بحذف فعلي عبر `deleteInvoiceWithStockRestore`.
- تغيير نص التأكيد إلى: "هل أنت متأكد من حذف هذه الفاتورة؟ سيتم إرجاع الكميات إلى المخزون."
- بعد النجاح: `navigate("/invoices", { replace: true })`.

### 3) التحقق من شاشات الإدخال (لا تغيير، فقط فحص)
الشاشات الأربع التالية تقرأ المخزون عبر `fetchAllProducts` الذي يستعلم مباشرة من جدول `products` (مع pagination صحيح):

- `InvoiceCreatePage` ← `products.stock_quantity`
- `QuoteCreatePage` ← `products.stock_quantity`
- `StockReturnCreatePage` ← `products.stock_quantity`
- `PurchaseCreatePage` ← `products.stock_quantity`

كل شاشة منها مُشتركة في حدث `products:changed` (يُطلق تلقائياً من `applyDeltas` داخل `stockDeduction.ts` وأيضاً سنُطلقه من دالة الحذف الجديدة). أيضاً `ProductsCacheSync` يستمع لهذا الحدث ويُبطل الكاش.

سأتحقق أثناء التنفيذ من أن كل شاشة من الأربع تستمع للحدث وتُعيد الجلب — وأُصلح أي شاشة لا تفعل.

---

## ملاحظات تقنية

- **Idempotency محفوظ**: حقل `stock_deduction_id` هو الحارس الوحيد لقرار "هل أُرجع المخزون أم لا" — لا توجد حالة double-restore.
- **عدم التراجع عند الفشل**: إذا فشل إرجاع المخزون لأي سبب (مثلاً منتج محذوف)، لا تُحذف الفاتورة، ويظهر للمستخدم خطأ واضح بدل خسارة صامتة.
- **الفواتير الملغاة (`status='cancelled'`) القديمة**: لن تتأثر بهذا التغيير — السلوك الجديد يطبق فقط على عمليات حذف جديدة.
- **عروض الأسعار والمرتجعات**: خارج نطاق هذا الطلب (المستخدم طلب الفواتير تحديداً). عروض الأسعار لا تخصم مخزوناً أصلاً وفق `stockDeduction.ts`.

## الملفات المتأثرة
- جديد: `src/utils/deleteInvoice.ts`
- تعديل: `src/pages/InvoicesPage.tsx`
- تعديل: `src/pages/InvoiceCreatePage.tsx`
- تعديل: `src/pages/InvoiceViewPage.tsx`
