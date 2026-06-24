---
name: albatool-system-audit
description: Mandatory pre/post-change auditor for Albatool. Before any modification, trace the affected feature end-to-end (UI button/search → React handler/hook → Supabase table/RLS/trigger → derived UI state) and verify the change keeps the three layers synchronized. Use on every code change, bug fix, refactor, or new feature — not only on explicit "audit" requests.
---

# Albatool System Audit — منهجية ثابتة

نظام Albatool متعدد الطبقات (React + React Query + Supabase Cloud + triggers + RLS + per-user UI prefs + RTL/Arabic + mobile/desktop). أي تعديل بدون فحص الطبقات الثلاث يكسر التزامن. هذه المهارة تفرض روتيناً صارماً قبل وبعد كل تغيير.

## متى تُطبَّق

**على كل** تعديل كود، إصلاح خطأ، إضافة ميزة، أو إعادة هيكلة — وليس فقط حين يطلب المستخدم "فحص". إذا كان التغيير يلمس زراً، حقلاً، جدولاً، RLS، أو hook فالمنهجية إلزامية.

## الطبقات الثلاث (3-Layer Trace)

لكل تغيير حدِّد المسار كاملاً قبل الكتابة:

```
[UI Layer]                 [Logic Layer]              [Data Layer]
button/input/search   →    handler/hook/mutation  →   table + RLS + GRANT + triggers
disabled/loading      ←    useState/useQuery      ←   computed columns / balances
mobile vs desktop     ←    form-factor prefs      ←   user_ui_preferences
```

كل سهم يجب أن يُذكر صراحة في الذهن قبل التعديل. إن انقطع أحدها → كتابة ناقصة.

## Checklist إلزامي قبل أي تعديل

1. **اقرأ المصدر الفعلي** للملف/الجدول قبل الكتابة (لا تعتمد على الذاكرة).
2. **تتبّع زر الإجراء**: `onClick` → الدالة → `supabase.from(...)` → الجدول → RLS/GRANT → triggers تعيد حساب أعمدة (مثل `recompute_customer_balance`, `advance_invoice_workflow`).
3. **افحص التزامن**:
   - هل القيمة المعروضة مشتقّة من trigger؟ لا تُحدّثها يدوياً من الواجهة.
   - هل `invalidateQueries` يغطي كل المفاتيح المتأثرة (قائمة + تفاصيل + بطاقات الإحصاء)؟
   - هل هناك ref/state يمنع double-submit (مثل `savingRef` في صفحات الإنشاء)؟
4. **افحص الصلاحيات**: أي جدول جديد في `public` يحتاج `GRANT` + `ENABLE RLS` + سياسات قبل الاستخدام.
5. **افحص العاملَين (mobile/desktop)**: مفاتيح `lov:u:{uid}:ff:{mobile|desktop}:...` منفصلة؛ أي تخصيص يلمس واحدة لا يتسرّب للأخرى.
6. **افحص RTL/Arabic**: لا `text-left`/`ml-*`/`mr-*` ثابتة تكسر الاتجاه؛ لا hardcoded colors.
7. **افحص رقم المستند**: عند الإنشاء استخدم `generateRandomDocNumber(...)` مع `scope` المناسب، ولفّ الحفظ بـ `savingRef` + `setSaving(true)` + try/finally، وعطّل الزر بـ `disabled={saving}`.

## Checklist إلزامي بعد التعديل

1. **Build/Type**: انتظر إشارة الـ harness — أصلح أي TS error فوراً.
2. **تحقّق دلالي**:
   - زر الحفظ معطَّل أثناء التنفيذ؟
   - `invalidateQueries` يشمل كل القوائم المتأثرة؟
   - الفلترة/البحث يطابق الأعمدة الفعلية في DB؟
3. **runtime عند الشك**: شغّل Playwright على `localhost` للتأكد من السلوك (انظر `<browser-use>`).
4. **اكتب جملة ختامية واحدة** للمستخدم تصف الأثر، بدون سرد الخطوات.

## أنماط معروفة لازِم التزامها

| الموقف | النمط الصحيح |
|---|---|
| حفظ مستند جديد | `savingRef.current` guard + `setSaving(true)` + try/finally + `disabled={saving}` + `generateRandomDocNumber` |
| تحديث رصيد عميل/مورد | لا تكتب `balance` يدوياً — تُحسب عبر triggers بعد INSERT في `invoices`/`transactions`/`purchase_orders` |
| تقدم workflow الفاتورة | استخدم `advance_invoice_workflow(_id,_target,_reason)` — لا تُحدِّث `workflow_status` مباشرة |
| حذف بنود فاتورة/عرض | استخدم `delete_invoice_items_silent` / `delete_quote_items_silent` لتجنّب triggers جانبية |
| تخصيص UI لكل مستخدم | مفتاح `lov:u:{uid}:ff:{mobile|desktop}:{scope}:{base}` — لا تشارك بين الأشكال |
| رابط واتساب | `shareDocumentWhatsApp` + رقم مفلتر من صفحة العملاء فقط |
| طباعة A4 RTL | عبر `printTemplate` بمتغيرات (`full|no-account|account-only|no-details|noHeader`) |

## فحص أعمق (عند الحاجة)

- **تتبّع كامل لميزة**: استخدم `acp_subagent--explore` بسؤال محدد لا فحص يدوي يدوي.
- **فحص قطاعي شامل**: راجع المهارة الأخت `albatool-ui-audit` (شجرة 6 وكلاء قطاع).
- **حالة الـ Cloud**: عند فشل غامض في DB شغّل `supabase--cloud_status` قبل تعديل الكود.
- **سياسات/أعمدة فعلية**: `supabase--read_query` على `information_schema` أو `pg_policies` بدل التخمين.

## القواعد الحرجة

- لا تعدّل ملفات auto-gen (`src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml`).
- لا تذكر "Supabase" للمستخدم — استخدم "Lovable Cloud / قاعدة البيانات".
- لا تكتب CHECK constraints على قيم تعتمد على الوقت — استخدم triggers.
- أي `CREATE TABLE public.X` بدون `GRANT` في نفس migration = خطأ runtime.
- لا تفترض أن الزر يعمل لأنه يُعرض — تتبّع handler فعلياً.
