---
name: albatool-ui-audit
description: Comprehensive audit mechanism for verifying every button, screen, dialog, and interaction in the Albatool ERP across desktop and mobile form factors. Triggers when the user asks to "test all buttons/screens", "تحقق من جميع الأزرار", "audit the UI", "تأكد أن كل شيء شغّال", or wants a full system health check across both viewports. Uses a tree of subagents (orchestrator + module workers) running in parallel.
---

# Albatool UI Audit — آلية فحص شاملة

نظام Albatool ضخم (60+ صفحة، عشرات الـ dialogs، نسختان: ديسكتوب وموبايل ≤640px). فحصه يدوياً مستحيل. هذه المهارة تحدد آلية موحّدة باستخدام شجرة وكلاء فرعيين متوازيين.

## متى تُستخدم

- المستخدم يطلب "تأكد أن كل شيء شغّال" / "اختبر كل الأزرار" / "فحص شامل".
- بعد تغييرات معمارية كبيرة (auth, routing, layout, theme).
- قبل إصدار / نشر مهم.

## البنية: شجرة وكلاء بمستويين

```
المستوى 0: أنت (Orchestrator)
   ├── المستوى 1 (متوازي): 6 وكلاء قطاع
   │     ├── Sector A: Sales (quotes, invoices, side-quotes)
   │     ├── Sector B: Inventory (products, stock, transfers, returns, warehouses)
   │     ├── Sector C: Parties (customers, suppliers, employees, staff portal)
   │     ├── Sector D: Logistics (packaging, transports, dispatch)
   │     ├── Sector E: Finance (accounts, transactions, reports, statements)
   │     └── Sector F: System (settings, backup, currencies, ui-prefs, auth, layout)
   └── كل وكيل قطاع يستدعي عند الحاجة وكلاء أصغر للديسكتوب/الموبايل
```

استخدم `acp_subagent--spawn_agent` لتشغيل الستة بالتوازي. كل وكيل يستلم system prompt محدّد + قائمة الصفحات/الأزرار المسؤول عنها.

## ما يفحصه كل وكيل قطاع

لكل صفحة ضمن قطاعه:

1. **التوجيه (Routing)**: المسار موجود في `src/App.tsx`، lazy import صحيح، لا 404.
2. **الزرار الرئيسية**: كل `<Button onClick=...>` — هل الـ handler معرّف؟ هل يستدعي mutation/navigate موجود؟ هل يعطي toast feedback؟
3. **النماذج (Forms)**: validation موجود قبل الـ insert/update، حقول required محمية.
4. **الـ Dialogs**: تفتح، تغلق، تحفظ، تستدعي `onSuccess`/`invalidateQueries`.
5. **الموبايل (≤640px)**: لا overflow أفقي، touch targets ≥40px، input font-size ≥16px، الأزرار لا تتراكب، الجداول تتحول إلى `MobileDocList` حيث ينطبق.
6. **التخصيص**: مفاتيح `lov:u:{uid}:ff:{mobile|desktop}:...` صحيحة، زر "إعادة افتراضي" موجود إن كان فيه customization.
7. **الـ RTL**: لا `text-left`/`mr-*` خاطئة، الـ direction يحترم Cairo + RTL.
8. **الـ tokens**: لا hardcoded colors في JSX.

## بروتوكول الإخراج لكل وكيل

كل وكيل قطاع يُرجع JSON بهذا الشكل (وكأنه تقرير):

```json
{
  "sector": "Sales",
  "pages_checked": ["QuotesPage", "QuoteCreatePage", "InvoicesPage", ...],
  "ok": ["QuotesPage: list+filters+open", "InvoiceCreatePage: items+save"],
  "issues": [
    {
      "severity": "high|med|low",
      "file": "src/pages/X.tsx:123",
      "what": "زر الحفظ لا يستدعي validation",
      "form_factor": "mobile|desktop|both",
      "fix_hint": "أضف فحص name/price قبل insert.mutateAsync"
    }
  ],
  "needs_runtime_check": ["X feature requires preview verification"]
}
```

## بعد جمع التقارير

1. ادمج كل `issues` في جدول واحد مرتّب حسب الـ severity.
2. اعرض على المستخدم الجدول واسأله أيها يُصلح.
3. للقضايا التي تحتاج runtime: استخدم `browser--view_preview` + `set_viewport_size` لاختبار 375×812 (mobile) و 1366×768 (desktop).

## القائمة المرجعية للصفحات

اقرأ `references/page-inventory.md` للحصول على القائمة الكاملة الموزّعة على القطاعات الستة.

## بروتوكول استدعاء الوكلاء (نسخ-لصق)

اقرأ `references/spawn-template.md` للحصول على نماذج system_prompt جاهزة لكل قطاع.

## القواعد الحرجة

- **لا تعدّل** أي ملف من داخل وكيل فرعي — هم قراءة فقط.
- بعد الفحص قدّم للمستخدم قائمة الإصلاحات وانتظر موافقته.
- لا تشغّل أكثر من 6 وكلاء بالتوازي (حد المنصة).
- لا تفترض أن صفحة عاملة لأنها تُحمَّل — افحص الـ handlers فعلياً.
- التزم باللغة العربية في تقاريرك للمستخدم؛ الوكلاء يردّون JSON بالإنجليزية للسهولة.
