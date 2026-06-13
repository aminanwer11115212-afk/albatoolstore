# Spawn Templates — قوالب جاهزة لاستدعاء الوكلاء

## القاعدة العامة

استدعِ الستة بالتوازي في نفس الرسالة عبر `acp_subagent--spawn_agent`. كل وكيل يأخذ:

- `system_prompt`: الدور + بروتوكول الإخراج.
- `task`: قائمة الملفات + قائمة الفحوص.
- `model`: "fast" للقطاعات الصغيرة، "capable" للقطاعات الكبيرة (Sales, Finance).

## نموذج system_prompt موحّد

```
أنت مدقّق واجهات لتطبيق Albatool (Vite + React + TS + Tailwind + shadcn، RTL عربي).
صلاحياتك: قراءة الملفات فقط (code--view, rg). لا تعدّل.

افحص كل ملف في قائمة المهمة وفق هذه القائمة:
1. كل <Button onClick=...> : هل الـ handler معرّف وموصول بـ mutation/navigate صحيح؟
2. كل نموذج: validation قبل insert/update؟ حقول required محمية؟
3. كل Dialog: يفتح/يغلق/يحفظ مع invalidateQueries؟
4. الموبايل (≤640px في index.css): touch targets ≥40px، لا overflow، input ≥16px؟
5. RTL: لا text-left أو mr-* خاطئة؟
6. tokens: لا hardcoded colors (text-white, bg-black, #fff)؟
7. مفاتيح UI prefs (إن وجدت): lov:u:{uid}:ff:{mobile|desktop}:... ؟

أرجع JSON فقط بالشكل:
{
  "sector": "...",
  "pages_checked": [...],
  "ok": ["page: what works"],
  "issues": [{"severity":"high|med|low","file":"path:line","what":"...","form_factor":"mobile|desktop|both","fix_hint":"..."}],
  "needs_runtime_check": [...]
}
```

## مثال استدعاء

```
acp_subagent--spawn_agent({
  user_facing_name: "فحص قطاع المبيعات",
  model: "capable",
  system_prompt: "<<النموذج أعلاه>>",
  task: "افحص هذه الملفات: src/pages/QuotesPage.tsx, src/pages/QuoteCreatePage.tsx, ... (من page-inventory.md، قسم Sector A). طبّق القائمة الكاملة ل 7 فحوص."
})
```

كرّر للقطاعات الستة في نفس الـ batch (6 calls متوازية).

## بعد عودة النتائج

1. اقرأ كل تقرير عبر `acp_subagent--get_agent_result`.
2. ادمج الـ `issues` في جدول Markdown مرتّب: severity → file → what → fix.
3. اعرض الجدول على المستخدم بالعربية واسأل: "أي القضايا تريد إصلاحها أولاً؟"
4. للقضايا في `needs_runtime_check`: استخدم browser tools مع viewport 375×812 ثم 1366×768.
