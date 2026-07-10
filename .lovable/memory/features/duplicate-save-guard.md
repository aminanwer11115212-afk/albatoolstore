---
name: Duplicate Save Guard (كل المستندات)
description: قاعدة موحّدة تمنع تكرار الحفظ في الفواتير/عروض الأسعار/أوامر الشراء/المرتجعات — تعتمد بصمة (الطرف + التاريخ + توقيع البنود)
type: feature
---

## القاعدة الحاسمة

قبل إدراج أي مستند جديد (INSERT) في أيٍّ من الجداول التالية:
- `invoices` (عادية / كاش / POS)
- `quotes` (عادي / جانبي)
- `purchase_orders`
- `stock_returns`

يجب استدعاء `guardAgainstDuplicateSave(...)` من `src/utils/duplicateDocGuard.ts`.

الدالة تحسب **بصمة موحّدة** = `party_id + date + item_signature` حيث
`item_signature = sorted(product_id|quantity, ...)`. لو وجدت مستنداً مطابقاً:
- ترجع `{ existingId, existingNumber }` → **الصفحة تحوّل الحفظ إلى UPDATE** لنفس السجل بدل إنشاء مكرَّر.
- الرقم يبقى كما هو (لا يتغيّر).

## متى نتخطّى الحارس (INSERT جديد صريح)

- المستخدم ضغط "حفظ وجديد" (`andNew=true`) → صفّر `lastSavedIdRef` واسمح بإدراج جديد.
- المستخدم غيّر الطرف (العميل/المورد) → مستند مختلف تماماً.
- المستخدم في وضع تعديل صريح (`editId` من URL) → UPDATE عادي لنفس الـ id.

## متى نحدّث بدل الإدراج (بدون بحث)

هذا **إضافة** فوق قاعدة `albatool-update-not-duplicate` الأصلية:
- إذا في نفس الجلسة `lastSavedIdRef.current` موجود ونفس الطرف → UPDATE لنفس السجل.
- إذا الجلسة جديدة لكن البصمة تطابق سجلاً موجوداً في DB خلال آخر 24 ساعة → UPDATE لذلك السجل.

## واجهة الدالة

```ts
import { guardAgainstDuplicateSave } from "@/utils/duplicateDocGuard";

const dup = await guardAgainstDuplicateSave({
  table: "invoices" | "quotes" | "purchase_orders" | "stock_returns",
  partyColumn: "customer_id" | "supplier_id",
  partyId,
  dateISO,
  items: rows.map(r => ({ product_id: r.product_id, quantity: r.quantity })),
  excludeId: editId ?? lastSavedIdRef.current ?? null,
  withinHours: 24,
});

if (dup?.existingId) {
  // حوّل إلى UPDATE لنفس السجل + toast.info("تحديث بدل التكرار")
}
```

## سلوك واجهة المستخدم عند اكتشاف تكرار

عند وجود مطابقة:
```ts
toast.info(`تم تحديث ${dup.existingNumber} بدل إنشاء مكرَّر`, { id: "dup-guard" });
```

## القواعد الحرجة (لا تخالف)

- ❌ لا تعتمد على البحث فقط — أبقِ `isSavingRef` و `lastSavedIdRef` كخط دفاع أول (نفس الجلسة).
- ❌ لا تطبّق الحارس على مسار "andNew" أو عند تغيّر الطرف.
- ❌ لا تُطلق الحارس لمستندات بلا بنود أو بلا طرف.
- ✅ خزّن `party_id + date + item_signature` كفهرس متولّد (function index) لتسريع البحث لاحقاً إذا صار العدد كبيراً.

## Aliases

"يتكرر الحفظ", "double save", "duplicate invoice", "duplicate quote", "duplicate purchase order",
"update-not-duplicate cross session", "بصمة الفاتورة", "signature guard".
