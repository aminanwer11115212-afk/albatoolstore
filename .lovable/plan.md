# خطة التحسينات الشاملة (5 دفعات)

كل دفعة مستقلة، تُنفَّذ بالتتابع، وتُقسَّم داخلياً عبر **subagents** متوازية للفحص والتتبع قبل الكتابة. لا نبدأ الدفعة التالية قبل تحقّق البناء + قراءة نتائج الدفعة السابقة.

---

## الدفعة 1 — شاشة تسجيل الدفعة (UX + كيبورد + تثبيت)

**الهدف:** إزالة الفراغات، جعل الحوار شبه مربّع، تحكم كامل بالكيبورد، وتوسيع التثبيت ليشمل «طريقة الدفع» + الحساب مع تطبيقهما تلقائياً عند الفتح.

**Subagents (قراءة فقط، بالتوازي):**
- A1: تدقيق `CustomerPaymentDialog.tsx` الحالي — قائمة كل الحقول، ترتيب DOM، أماكن الفراغات، عرض العمود الأيمن مقابل الأيسر.
- A2: تتبّع كل الاستدعاءات لـ `CustomerPaymentDialog` (InvoiceCreate، DocumentPreview، أي مكان آخر) للتأكد من props وتوحيدها.
- A3: مسح localStorage keys الحالية للتثبيت + اقتراح مفاتيح `lov:u:{uid}:payment:pinned-method` و`lov:u:{uid}:payment:pinned-account`.

**التنفيذ:**
1. تخطيط جديد: `max-w-2xl aspect-square-ish` — grid عمودين متساويين، بدون scroll داخلي على الديسكتوب.
2. `useEffect` تركيز أول حقل عند الفتح، `tabIndex` صريح لكل حقل، `Enter` = التقدّم للحقل التالي، `Ctrl+Enter` = فتح تأكيد الحفظ، `Esc` = إغلاق.
3. زر «تثبيت الطريقة» بجانب select طريقة الدفع (نفس نمط زر تثبيت الحساب) + تأكيد قبل التغيير + زر فك تثبيت.
4. عند الفتح: قراءة كلا المثبَّتين وتطبيقهما تلقائياً إن وُجدا.

**تحقّق:** build + فتح الحوار من صفحتين مختلفتين + اختبار كيبورد.

---

## الدفعة 2 — حفظ تخصيصات الواجهة محلياً لكل جهاز إلى الأبد

**الهدف:** ضمان أن كل تخصيص (أعمدة، عرض، ترتيب، حجم، حالة dialogs، toolbar، zoom، row heights) يُحفظ محلياً لكل جهاز ولا يُمسح أبداً.

**Subagents:**
- B1: جرد كل مفاتيح `lov:*` المستخدمة (grep على المشروع) + التحقّق من أنها كلها تمر بـ `formFactorKey` + `userScopedKey`.
- B2: فحص `storageManager.ts` — التأكد أن whitelist يستثني كل مفاتيح `lov:u:*:ff:*` من التنظيف.
- B3: فحص `useUiPrefsCloudSync` — هل يحفظ محلياً أولاً ثم يحاول المزامنة (offline-first)؟

**التنفيذ:**
1. توسيع `CORE_STORAGE_PREFIXES` في `storageManager.ts` ليحمي كل ما يبدأ بـ `lov:u:` و`lov:pinned-*`.
2. إضافة migration محلي: عند البدء، لو وُجد مفتاح قديم بدون `ff:` ننسخه لكلا bucket‑ي mobile/desktop.
3. توثيق العقد في `mem://features/ui-personalization`.

**تحقّق:** unit test يشغّل `runCleanup(aggressive=true)` ويؤكّد بقاء مفاتيح `lov:u:` كلها.

---

## الدفعة 3 — Reset صفر (فواتير/حسابات/عملاء/عروض/بنوك)

**الهدف:** أداة آمنة تصفّر الحسابات والفواتير وعروض الأسعار وأرصدة العملاء والحسابات البنكية مع الحفاظ على الروابط (customers, products, accounts remain, only balances/documents cleared).

**Subagents:**
- C1: خريطة الجداول المتأثرة + ترتيب الحذف الصحيح احتراماً للـ FK (items قبل headers، transactions قبل accounts…).
- C2: تحديد أي RPC/triggers ستطلق أثناء الحذف الجماعي وكيف نعطّلها مؤقتاً (أو نستخدم `*_silent`).
- C3: تصميم واجهة تأكيد بثلاث مراحل (اكتب "تصفير" + password admin + checkbox لكل مجموعة).

**التنفيذ:**
1. RPC `admin_reset_transactional_data(_scope jsonb)` — SECURITY DEFINER + `has_role(auth.uid(),'admin')` + يحذف بالترتيب.
2. صفحة `SettingsPage → Danger Zone → تصفير البيانات` مع 4 checkboxes مستقلة: فواتير، عروض، معاملات/حسابات بنكية، أرصدة عملاء (recompute بعد الحذف تلقائياً).
3. زر «نسخة احتياطية قبل التصفير» (export JSON) إجباري قبل التنفيذ.

**تحقّق:** اختبار على بيانات وهمية + التأكد أن `recompute_customer_balance` يعود بصفر.

---

## الدفعة 4 — توافق كامل بين عرض السعر والفاتورة المحوَّلة

**الهدف:** أي خاصية تظهر/تُحفظ في الفاتورة يجب أن تُنقل من عرض السعر عند التحويل (customer, currency, exchange_rate, items, notes, discount, packaging refs, transport refs, attachments, custom fields).

**Subagents:**
- D1: قراءة `quoteToInvoice.ts` + مخطط جدول `invoices` vs `quotes` وإخراج جدول diff بالحقول.
- D2: فحص `QuoteCreatePage` مقابل `InvoiceCreatePage` لأي حقل UI موجود في الأولى ومفقود في التحويل.
- D3: فحص المرفقات (`quote_attachments` → `invoice_attachments`) هل تُنسخ فعلاً؟

**التنفيذ:**
1. سدّ فجوات الحقول المكتشفة في `quoteToInvoice.ts`.
2. نسخ المرفقات عبر تكرار الروابط (بدون duplication في storage — نستخدم نفس المسار مع row جديدة تشير للـ invoice).
3. اختبار تحويل شامل + مقارنة الحقول قبل/بعد.

**تحقّق:** e2e موجود `quote-to-invoice-flow.spec.ts` + توسيعه.

---

## الدفعة 5 — تدقيق شامل + إغلاق

**Subagents (متوازية، 6 قطاعات وفق `albatool-ui-audit`):**
- Sales · Inventory · Parties · Logistics · Finance · System

كل واحد يُرجع JSON بأي regressions من الدفعات 1‑4. نصلح ما يظهر ثم ننشر.

---

## القواعد أثناء التنفيذ
- بعد كل دفعة: انتظار build + قراءة تقرير subagents قبل الانتقال.
- لا تعديل ملفات auto-gen (`client.ts`, `types.ts`, `.env`, `config.toml`).
- كل جدول جديد يحصل على GRANT + RLS في نفس migration.
- كل حفظ يستخدم `savingRef` guard + `duplicateDocGuard`.
- لا hardcoded colors — tokens فقط.

## Details تقنية مختصرة
- مفاتيح التثبيت: `lov:u:{uid}:payment:pinned-method`, `lov:u:{uid}:payment:pinned-account` (بدون form-factor — عام لكل الأجهزة لأنه تفضيل مالي).
- Reset RPC يعيد `jsonb` تلخيصي (كم صف حُذف لكل جدول).
- Migration الحفظ المحلي: idempotent — يعمل مرة واحدة عبر flag `lov:migration:ff-split:v1`.
