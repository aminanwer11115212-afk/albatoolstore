# خطة توسيع الأوفلاين — 5 مسارات متوازية

الوضع الحالي: عندنا `queryPersister` (IndexedDB via `idb-keyval`) + `offlineQueue` (طابور كتابات فردية) + `RealtimeSync` + `SyncStatusIndicator`. الفجوات: لا TTL/سقف حجم، لا backoff/سجل عمليات، لا طابور مرفقات، لا حلّ تعارضات، ومستندات الإنشاء (Invoice/Quote/Purchase) ما زالت تكتب مباشرة لأنها متعددة الجداول.

## 1) سياسة تنظيف IndexedDB والكاش

- **TTL للاستعلامات**: `PersistQueryClientProvider.maxAge = 30d` (موجود). نضيف Purge دوري يمسح queries لم تُلمَس منذ 14 يوماً.
- **سقف حجم**: قياس `navigator.storage.estimate()` عند الإقلاع؛ إذا `usage/quota > 0.75` نُشغّل تنظيفاً ذكياً بترتيب الأولوية:
  1. Attachments blobs > 24h ومرفوعة
  2. Realtime cache للجداول الكبيرة (transactions, activity_log)
  3. Persisted queries الأقدم
- **Whitelist بيانات ضرورية**: `customers, products, suppliers, accounts, company_settings, currencies` لا تُمسح أبداً — من `prefetchCoreData`.
- **مؤشر تخزين** في `SyncStatusIndicator`: تلميح بنسبة الاستخدام + زر "تنظيف الكاش" يدوي.

الملفات: `src/lib/storageManager.ts` (جديد)، `src/lib/queryPersister.ts`، `src/components/SyncStatusIndicator.tsx`، `src/App.tsx` (استدعاء `initStorageManager`).

## 2) Backoff + سجل حالة العمليات

توسيع `offlineQueue.ts`:

```text
Op = { id, table, op, payload, label, attempts, lastError, nextRetryAt, status }
status: pending | in_flight | failed_retryable | failed_permanent | done
backoff: 2s → 5s → 15s → 60s → 5m (max 5 محاولات)
```

- كل عملية فاشلة تُحدَّث بـ `attempts++, nextRetryAt = now + backoff(attempts), lastError`.
- خطأ 4xx تحققي (409/422/RLS) → `failed_permanent` مباشرة (لا إعادة محاولة عمياء).
- خطأ شبكة/5xx/timeout → `failed_retryable`.
- Loop مركزي `processQueue()` كل 30s + عند `online` + عند dispatch جديد.
- شاشة سجل: `src/pages/OfflineQueuePage.tsx` تعرض جدولاً بكل عملية (label, table, op, attempts, lastError, زر "أعد المحاولة الآن"، "احذف").
- إشعار Toast مجمَّع: "N عملية تنتظر إعادة الاتصال — عرض السجل".

الملفات: `src/lib/offlineQueue.ts`، `src/pages/OfflineQueuePage.tsx` (جديد)، `src/components/SyncStatusIndicator.tsx` (رابط للسجل)، `src/App.tsx` (route جديد).

## 3) طابور رفع المرفقات أوفلاين

المشكلة: `storage.upload` غير مدعوم في `offlineQueue` الحالي (نصّي فقط).

- IndexedDB store جديد `attachment_queue` (blob + metadata + parent_table + parent_id + bucket + path_template).
- API جديد `queueAttachment({ file, bucket, pathTemplate, linkTable, linkPayload })`:
  - أوفلاين → حفظ الـ Blob محلياً + toast "الملف محفوظ، سيُرفع عند الاتصال"
  - أونلاين → رفع فوري + INSERT في جدول الربط
- عند العودة: `flushAttachmentQueue()` يرفع كل ملف ثم يُنشئ سجل الربط، مع نفس backoff.
- تحديث `InvoiceAttachmentsDialog`, `QuoteAttachmentsDialog`, `PurchaseAttachmentsDialog` لاستخدام `queueAttachment` بدل `supabase.storage.upload` المباشر.
- Preview محلي: نعرض `URL.createObjectURL(blob)` مع شارة "معلَّق".

الملفات: `src/lib/attachmentQueue.ts` (جديد)، `src/components/invoice/InvoiceAttachmentsDialog.tsx`، `src/components/quote/QuoteAttachmentsDialog.tsx`، `src/components/purchase/PurchaseAttachmentsDialog.tsx`.

## 4) حلّ تعارضات المزامنة

المبدأ: **Last-Writer-Wins مع كشف صريح للتعارض** — لأن UI متعدد المستخدمين.

- كل UPDATE في `offlineQueue` يحمل `expected_updated_at` (قيمة `updated_at` وقت التعديل المحلي).
- عند flush نقرأ الصف الحالي أولاً؛ إذا `remote.updated_at > expected_updated_at` → تعارض.
- Store `conflict_queue` يحفظ: `{ table, id, local_changes, remote_snapshot, base_snapshot }`.
- Dialog جديد `ConflictResolutionDialog` يعرض للمستخدم:
  - عمود "التغييرات المحلية"
  - عمود "النسخة السحابية"
  - أزرار: **احتفظ بالمحلي** / **احتفظ بالسحابي** / **دمج حقلاً حقلاً**
- Realtime يفتح الـ Dialog تلقائياً عند وصول تعارضات جديدة.

للجداول الحساسة (`invoices.paid_amount`, `customers.balance`) — منع الكتابة المباشرة أوفلاين وإجبار إعادة الحساب من triggers بعد التسجيل.

الملفات: `src/lib/conflictResolver.ts` (جديد)، `src/components/ConflictResolutionDialog.tsx` (جديد)، `src/lib/offlineQueue.ts` (hook للـ conflict check)، `src/App.tsx` (mount Dialog عالمياً).

## 5) أوفلاين لمستندات الإنشاء (متعدد الجداول)

الفجوة: `InvoiceCreatePage / QuoteCreatePage / PurchaseCreatePage` تحفظ header ثم items ثم transports ثم packaging — رحلة FKs لا يدعمها `runOrQueue` الحالي.

الحل: **saga أوفلاين** بـ optimistic UUIDs:

```text
{
  saga_id, kind: "invoice"|"quote"|"purchase",
  operations: [
    { op: insert, table: invoices, tempId: X, payload: {...} },
    { op: insert, table: invoice_items, payload: {..., invoice_id: $X} },
    { op: insert, table: invoice_transports, payload: {..., invoice_id: $X} },
  ]
}
```

- `runDocumentSaga(saga)` — أونلاين تنفّذ فوري بترتيب مع FK resolution ($X → uuid حقيقي).
- أوفلاين تُخزَّن في `document_saga_queue`؛ عند flush تُنفَّذ كوحدة ذرّية:
  - نجاح كامل → done + invalidate queries + toast + realtime broadcast
  - فشل جزئي → rollback ما أُدرج + retry مع backoff
- `duplicateDocGuard` يمتد ليعمل من الكاش المحلي أثناء الأوفلاين (نفس signature check ضد persisted queries).
- الشاشات الثلاث تستدعي `runDocumentSaga` بدل الـ multi-step insert الحالي.
- المستند يظهر في القوائم فوراً باستخدام optimistic update في React Query (`setQueryData`) مع علامة "معلَّق".

الملفات: `src/lib/documentSaga.ts` (جديد)، `src/pages/InvoiceCreatePage.tsx`، `src/pages/QuoteCreatePage.tsx`، `src/pages/PurchaseCreatePage.tsx`، `src/utils/duplicateDocGuard.ts`.

---

## تفاصيل تقنية

**Subagents (بالتوازي):**
- A: مسارات 1+2 (storage + backoff/queue log page)
- B: مسار 3 (attachments queue + integration في 3 dialogs)
- C: مسار 4 (conflict resolver + dialog + hooks)
- D: مسار 5 (document saga + 3 create pages)

**ترتيب التنفيذ:** A و B و C يمكن أن تسير معاً؛ D يعتمد على تحسينات A (backoff schema) فيبدأ بعد A بقليل.

**Migrations:** لا حاجة لتغييرات schema — الاعتماد الوحيد على `updated_at` وهو موجود في كل الجداول عبر triggers.

**اختبارات:**
- `e2e/offline-attachments.spec.ts` — رفع مرفق أوفلاين → يرجع الاتصال → يظهر في السحابة
- `e2e/offline-invoice-create.spec.ts` — إنشاء فاتورة كاملة أوفلاين + بنود + ترحيل → مزامنة
- `e2e/conflict-resolution.spec.ts` — تعارض حقيقي محاكى بجهازين
- `src/test/offlineBackoff.test.ts` — منحنى backoff + حدود المحاولات
- `src/test/storageManagerPurge.test.ts` — سياسة التنظيف

**قبول:**
- مرفق يُرفع محلياً أوفلاين ثم يظهر مع رابط سحابي بعد الاتصال ≤ 10 ثوان.
- فاتورة أوفلاين كاملة (رأس + 5 بنود) تُحفظ ثم تُزامَن دون تكرار.
- تعارض تحرير عميل من جهازين يفتح Dialog يعرض القيمتين.
- عند وصول التخزين لـ 80% يظهر تلميح، وعند 90% ينظّف تلقائياً بدون فقد بيانات whitelist.
- سجل عمليات معلّقة يعرض كل fail مع سبب واضح.
