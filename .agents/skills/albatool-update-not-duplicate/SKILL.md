---
name: albatool-update-not-duplicate
description: قاعدة موحّدة لكل صفحات الإنشاء (فاتورة عادية/كاش/POS، عرض سعر عادي/جانبي، أمر شراء، مرتجع). الضغط المتكرر على زر الحفظ يجب أن يُحدّث نفس السجل ولا يُكرّره، ويُغيّر الرقم تلقائياً (عشوائي) عند تغيّر العميل/المورد.
type: feature
---

# Update-Not-Duplicate — قاعدة الحفظ الموحّدة في Albatool

## القاعدة الواحدة

أي صفحة إنشاء مستند في النظام (فاتورة، عرض سعر، أمر شراء، مرتجع) يجب أن تلتزم بالتالي عند زر الحفظ:

1. **حارس متزامن (`isSavingRef`)** — يمنع دخول الدالة مرتين متوازياً.
2. **زر معطّل (`disabled={saving}`)** — يمنع الضغط أثناء التنفيذ.
3. **بعد أول حفظ ناجح** — احتفظ بـ `lastSavedIdRef.current = newId` و `lastSavedPartyRef.current = customerOrSupplierId`.
4. **في الضغطة التالية** قبل اتخاذ قرار INSERT/UPDATE:
   - احسب `effectiveEditId = editId ?? lastSavedIdRef.current`.
   - إذا `effectiveEditId` موجود **ونفس الطرف (العميل/المورد)** → **UPDATE** لنفس السجل.
   - إذا `effectiveEditId` موجود **والطرف تغيّر** → اعتبرها وثيقة جديدة:
     - صفّر `lastSavedIdRef`.
     - ولّد رقماً جديداً بـ `generateRandomDocNumber(...)`.
     - مرّره في الـ payload.
5. **بدون `useNavigate({replace:true})`** — استخدم `window.history.replaceState` فقط حتى لا يُعاد تركيب المكوّن، واعتمد على `lastSavedIdRef` (لأن `useParams` لا يتحدّث).
6. **POS بدون عميل** — اعتبر "اسم walk-in" مفتاح الطرف بدل `customer_id`.

## أين طُبِّقت (مرجع)

| الصفحة | المتغيّر | الطرف |
|---|---|---|
| `InvoiceCreatePage` (عادية + كاش + POS) | `lastSavedIdRef` + `savedCustomerId` + `newCustomerKey` | `customer_id` أو `walk_in_name` لـ POS |
| `QuoteCreatePage` (عادي + جانبي) | `lastSavedIdRef` + `lastSavedCustomerRef` | `customer_id` |
| `PurchaseCreatePage` | `orderId` state + `lastSavedSupplierRef` + `isSavingRef` | `supplier_id` |
| `StockReturnCreatePage` | `savingReturnRef` + redirect لـ view بعد الحفظ | لا يحتاج (تنقّل بعد الحفظ) |

## وصفة التحقّق (لأي صفحة جديدة)

```ts
// أعلى المكوّن
const isSavingRef = useRef(false);
const lastSavedIdRef = useRef<string | null>(null);
const lastSavedPartyRef = useRef<string | null>(null);

// داخل handleSave
if (isSavingRef.current) return;
isSavingRef.current = true;
try {
  let effectiveEditId = editId ?? lastSavedIdRef.current ?? undefined;
  let effectiveNumber = docNumber;
  const partyKey = currentPartyId; // customer_id أو supplier_id
  if (effectiveEditId && !editId && lastSavedPartyRef.current && lastSavedPartyRef.current !== partyKey) {
    effectiveEditId = undefined;
    lastSavedIdRef.current = null;
    effectiveNumber = await generateRandomDocNumber(table, col, prefix, { scope });
    setDocNumber(effectiveNumber);
  }
  // ... باقي الحفظ يستخدم effectiveEditId/effectiveNumber
  if (success) {
    lastSavedIdRef.current = savedId;
    lastSavedPartyRef.current = partyKey;
    if (!editId) window.history.replaceState({}, "", editPath);
  }
} finally {
  isSavingRef.current = false;
}
```

## اختبار سلوكي (Playwright)

اضغط زر الحفظ 4 مرات متتالية بسرعة على نفس النموذج بدون تغيير أي بيانات:
- النتيجة المتوقّعة: صف واحد في DB، نفس الرقم، URL واحد ثابت.

ثم غيّر العميل/المورد فقط واضغط حفظ مرة:
- النتيجة المتوقّعة: صف ثانٍ في DB برقم **مختلف** عشوائي.

اختبارات جاهزة موجودة في `e2e/repeated-save-no-duplicate.spec.ts` و `e2e/random-doc-numbers.spec.ts`.

## القواعد الحرجة (لا تخالف)

- ❌ لا تستخدم `useNavigate(... { replace: true })` بعد أول حفظ — يُسبب re-mount يخسر state البنود ويفتح باب التكرار.
- ❌ لا تعتمد على `useParams` فقط للتمييز بين edit/create بعد الحفظ — `replaceState` لا يحدّثها.
- ❌ لا توّلد الرقم العشوائي قبل إجراء فحص "نفس الطرف" — سيتغيّر الرقم بلا مبرّر.
- ✅ صفّر `lastSavedIdRef` عند نقر "حفظ وفتح فاتورة جديدة" (`andNew`) كي تبدأ وثيقة بريئة.

## Aliases (auto-trigger)

"الزر يحفظ مرتين", "تكرار فواتير عند الحفظ", "تحديث بدل التكرار", "رقم عشوائي يتغيّر", "duplicate on save", "update not duplicate".
