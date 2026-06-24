---
name: albatool-safe-refactor
description: Safely split large Albatool files (>800 lines) into focused hooks/components without any behavior change. Use whenever the user requests refactoring, restructuring, splitting, or "تقسيم/إعادة هيكلة" of pages or components.
---

# Albatool Safe Refactor — منهجية ثابتة

تقسيم ملفات Albatool الكبيرة (`InvoiceCreatePage`, `QuoteCreatePage`, `ProductsPage`…) دون لمس السلوك. صفر تغييرات وظيفية، صفر فروقات بصرية، صفر تغييرات في DB/triggers.

## متى تُطبَّق

- المستخدم يطلب "إعادة هيكلة" / "تقسيم" / "تنظيم الكود".
- ملف React تجاوز 800 سطر.
- تكرار منطق بين صفحات Create (Invoice/Quote/Purchase/StockReturn).

## القواعد الذهبية (لا تُكسر)

1. **اقرأ الملف كاملاً قبل أي تعديل** — لا تعتمد على grep أو ذاكرة.
2. **خطوة واحدة لكل دورة** — استخراج hook واحد أو مكوّن واحد فقط، ثم تحقّق، ثم انتقل.
3. **حافظ على الأسماء** — نفس أسماء `useState`, `useEffect`, دوال handlers. مرّرها كـ props/return من hook بنفس الاسم.
4. **لا تغيّر ترتيب الاستدعاءات** — ترتيب الـ hooks في React حسّاس؛ نقل `useEffect` يكسر deps order.
5. **لا تلمس** auto-gen (`supabase/client.ts`, `types.ts`, `.env`, `config.toml`)، الـ tests، utils المستقرة.
6. **صفر تغيير بصري** — نفس JSX، نفس classes، نفس tokens. إعادة الترتيب فقط.
7. **بعد كل خطوة** انتظر إشارة الـ harness للـ build، اقرأ نتائج tsgo، أصلح فوراً إن ظهر خطأ.

## بروتوكول الخطوة الواحدة

```
1. اقرأ القسم المراد استخراجه (view بأسطر محددة).
2. حدّد:
   - الـ inputs (props/params الحالية، state الذي يقرأه).
   - الـ outputs (state setters, refs, computed values).
3. أنشئ ملف الـ hook/component في src/hooks/document/ أو src/components/document/.
4. انسخ الكود حرفياً — لا إعادة كتابة.
5. في الملف الأصلي:
   - احذف الكود المنقول.
   - استبدل بـ destructure من الـ hook الجديد، أو import للـ component.
6. تحقّق build → إن نجح، أبلغ المستخدم بجملة واحدة.
```

## الأنماط القياسية لصفحات Create

### Hooks (`src/hooks/document/`)
- `useDocumentForm` — رأس المستند (تاريخ، رقم، حالة، ملاحظات).
- `useDocumentItems` — صفوف البنود + `quickRow` + `calcTotal`.
- `useDocumentCustomer` — اختيار/بحث/إضافة عميل + الأرصدة.
- `useDocumentCurrency` — قائمة العملات + سعر الصرف.
- `useDocumentPayment` — حقول الدفع + حوار الدفع.
- `useDocumentSave` — حفظ + `savingRef` + التوجيه.

### Components (`src/components/document/`)
- `DocumentHeaderBar` — رقم، تاريخ، حالة.
- `DocumentCustomerPicker` — مربع العميل + الرصيد.
- `DocumentItemsTable` — جدول البنود.
- `DocumentTotalsPanel` — الإجماليات.
- `DocumentToolbar` — أزرار الحفظ/المسح/الطباعة.
- `DocumentPaymentDialog`, `DocumentNotesDialog`.

## الفخاخ الشائعة (تجنّبها)

| الفخ | الأثر | الحل |
|---|---|---|
| نقل `useEffect` قبل `useState` المعتمد عليه | `Cannot access before initialization` | احتفظ بنفس ترتيب الاستدعاء في الـ hook الجديد |
| تحويل state داخلي إلى ref بحجة "الأداء" | re-renders مفقودة | لا تُحسّن — انقل فقط |
| استبدال inline handlers بـ `useCallback` | تغييرات في deps + re-render diff | أبقها inline كما هي |
| فقدان `as any` casts | TS errors | انسخ الـ casts حرفياً |
| تقسيم JSX إلى أكثر من مكوّن في خطوة واحدة | يصعب تتبّع regressions | مكوّن واحد لكل خطوة |
| استخراج hook مع تغيير API الـ return | كل المستهلكين يتكسرون | حافظ على نفس أسماء return |

## التحقّق الإلزامي بعد كل خطوة

1. **Build/Type**: انتظر إشارة الـ harness.
2. **اقرأ الملف الأصلي بعد التعديل** بـ view (آخر state + أول state) للتأكد من سلامة imports وترتيب hooks.
3. **عدّ الأسطر**: `wc -l` قبل/بعد لتأكيد الانكماش.
4. **لا تشغّل tests يدوياً** إلا إذا فشل الـ build — الـ harness يفعل ذلك.

## التزامن مع المهارات الأخرى

- اقرأ `skill/albatool-system-audit` لفهم تتبّع UI → Logic → DB.
- بعد كل ملف كبير، طبّق checklist الـ system-audit للتأكد أن savingRef/invalidateQueries/triggers لم تنكسر.

## الترتيب الموصى به (الأكبر أولاً)

1. `InvoiceCreatePage` (2707) — قلب النظام.
2. `QuoteCreatePage` (2338) — مشترك مع #1، أعد استخدام نفس الـ hooks.
3. `ProductsPage` (2317).
4. `CustomersPage` (1824).
5. `StockReturnCreatePage` (1486).
6. `PurchaseCreatePage` (1422).
7. `RecentItemsSidebar` (1210).

## القاعدة النهائية

إذا في أي لحظة شعرت أن خطوة "كبيرة جداً" — قسّمها. مكوّن JSX من 200 سطر = 3 خطوات لا واحدة. الأمان > السرعة.
