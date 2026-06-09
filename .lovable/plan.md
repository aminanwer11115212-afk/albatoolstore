
## الوضع الحالي (جرد شامل)

### البنية التحتية الموجودة (جيدة، نبني عليها)

- جدول `user_ui_preferences (user_id, key, value, updated_at)` موجود + RLS لكل مستخدم.
- `src/hooks/useUiPrefsCloudSync.tsx` مركَّب في App ويعمل: pull عند الدخول، push debounced عند كل تغيير. يلتقط أي مفتاح يبدأ بـ`neobilling:toolbar` أو `colwidths:` أو `recent-sidebar:` أو `albatoul_` أو `ui:` أو `page:`.
- `src/lib/userScopedKey.ts` يقدّم namespacing لكل مستخدم.
- `ColumnsResetButton` جاهز ويستخدمه أكثر من صفحة.

### الهوكس المسؤولة عن التخصيص (الموجودة فعلاً)

| الهوك | يخصّ |
|---|---|
| `useColumnWidths` | عرض الأعمدة + locked + saveAsUserDefault |
| `useRowHeights`, `useQuickRowWidths` | ارتفاع الصفوف وعرضها السريع |
| `useDialogSize` | عرض/طول الحوارات المنبثقة |
| `useSuggestionsWidth` | عرض لوحة الاقتراحات |
| `useItemsZoom`, `useScreenZoom` | زوم الجدول/الشاشة |
| `useToolbarOrder` | ترتيب أزرار شريط الأدوات |
| `useToolbarLock`, `useToolbarLabels`, `useToolbarHidden` | قفل/تسميات/إخفاء الأزرار |
| `useAppearance` | السمة العامة (لون/خط/وضع) |

### الشاشات التي بها تخصيص

1. `CustomersPage` — أعمدة + ارتفاع صفوف + شريط أدوات + لوحة هيكلة جغرافية (PanelResizer).
2. `ProductsPage` — أعمدة + شريط أدوات.
3. `InvoiceCreatePage`, `QuoteCreatePage`, `PurchaseCreatePage`, `StockReturnCreatePage` — أعمدة بنود + شريط أدوات + زوم.
4. `CompanySettingsPage` — أعمدة.
5. الحوارات المنبثقة (12 حواراً): `TransportDialog`, `PackagingDialog`, `ShippingDispatchDialog`, `InvoiceRevisionsDialog`, `InvoiceAttachmentsDialog`, `CustomerFormDialog`, `QuickAddProductDialog`, `MessageImportDialog`, `FloatingSideTools`, `ExchangeRateDialog`, `ChargeBalanceDialog`, `AccountsOpeningBalanceDialog`.
6. الـ`FloatingSideTools` + `RecentItemsSidebar` (عرض/إخفاء أعمدة).

## المشاكل الجذرية (سبب الشكوى)

1. **`useToolbarOrder` يستخدم `deviceId` عشوائي** (مفتاح: `neobilling:toolbar:v1:<deviceId>:<screenKey>`)، فيتغير بين المتصفحات ويتشارك بين الهاتف وسطح المكتب على نفس المتصفح. هذا سبب رؤيتك ترتيب الهاتف في سطح المكتب.
2. **لا فصل بين Mobile و Desktop** في أي مفتاح. `useDialogSize` ينجو لأن الهاتف يذهب fullscreen.
3. **`useColumnWidths`**: لمعظم الجداول مفتاح موحّد (`SHARED_COLS_WIDTHS_KEY`)، فالعرض الذي يضبطه المستخدم على شاشة هاتف 375px قد يصل عبر السحابة إلى شاشة سطح المكتب 1920px والعكس.
4. **زر إعادة الافتراضي** غير موجود في كل الشاشات بشكل موحّد، وأحياناً غير ظاهر إلا في وضع التخصيص.
5. **الحوارات** قابلة للتكبير لكن لا يوجد زر "تثبيت الحجم" مرئي ولا "إعادة افتراضي".

## الحل المعماري (Form-Factor-Aware Prefs)

### مفهوم محوري

كل تفضيل = `(userId, formFactor, screenKey, prefKey)` حيث `formFactor ∈ {mobile, desktop}`.

- `mobile` = viewport ≤ 640px CSS px (مطابق للقاعدة الحالية في `useDialogSize`).
- `desktop` = خلاف ذلك (يشمل tablet — لا حاجة لـ form factor ثالث الآن).
- المستخدم يعدّل من الهاتف → يُخزن تحت `mobile`. يفتح سطح المكتب → يقرأ من `desktop` (مختلف تماماً).
- يبقى `userId` هو الذي يتنقل عبر الأجهزة الفيزيائية (لو فتح المتصفح من حاسوب آخر، يجد نفس تخصيص سطح المكتب). أنظف من `deviceId` الحالي.

### الطبقات الجديدة (utility صغير + ترقية الهوكس تدريجياً)

1. هوك `useFormFactor()` يرجع `'mobile' | 'desktop'` تفاعلياً.
2. دالة `formFactorKey(scope, base)` تبني: `lov:u:{uid}:{formFactor}:{scope}:{base}` (تمتد على `userScopedKey` الحالي).
3. ترحيل ذكي: عند أول قراءة لمستخدم بمفتاحه الجديد الفارغ، نُحاول قراءة المفتاح القديم (legacy / deviceId-based) وننسخه إلى مفتاح `formFactor` الحالي. لا نحذف القديم (للأمان). هذا يضمن صفر فقدان لتخصيصات المستخدمين الحاليين.
4. `useUiPrefsCloudSync` تتم توسعتها لمزامنة المفاتيح الجديدة (تلقائياً ستلتقطها بفضل البادئات).

### السلوك الموحّد لكل شاشة قابلة للتخصيص

- وضع تخصيص (موجود بالفعل عبر `ToolbarCustomizationContext`).
- زر **"حفظ كافتراضي لي"** (icon-only) — يلتقط الحالة الحالية ويخزنها (هذا هو "زر تم/قفل السجل" الذي طلبته).
- زر **"إعادة افتراضي"** (الـ`ColumnsResetButton` الموجود) — يمسح تخصيص المستخدم لهذه الشاشة ويعود لـ defaults.
- زر **"قفل/فتح"** (إن لم يكن موجوداً) — يثبّت العرض ويمنع التغيير العرضي.
- مؤشر صغير "آخر تحديث محلي/سحابي" اختياري على هامش الـtoolbar.

## خطة التنفيذ — دفعة أساس + دفعة لكل شاشة

> **القاعدة الذهبية**: لا أمسّ أكثر من شاشة واحدة لكل دفعة (بعد دفعة الأساس). كل دفعة تُختبر يدوياً في الـpreview قبل الانتقال للتالية.

### دفعة 0 — الأساس (Foundation) — لا تغيير مرئي

ملفات جديدة فقط، بدون لمس صفحات:
- `src/hooks/useFormFactor.ts` — هوك تفاعلي يرجع `mobile|desktop`.
- `src/lib/formFactorKey.ts` — `formFactorKey(scope, base)` + `useFormFactorScopedKey(legacyKey, scope)` (الترحيل التلقائي من المفتاح القديم).
- تحديث `useUiPrefsCloudSync` ليضيف بادئة `lov:u:` إلى قائمة المزامنة (إن لم تكن موجودة).
- اختبارات وحدة لـ `useFormFactor` و `formFactorKey` (Vitest).
- توثيق `mem://features/ui-personalization` يصف العقد.

تحقّق الدفعة 0: تشغيل الـunit tests + التأكد أن النظام لم يتأثر.

### دفعة 1 — Skill ثابتة "user-prefs-architecture"

skill في `.agents/skills/albatool-user-prefs/` تحوي:
- خريطة الهوكس + متى يُستخدم كل واحد.
- صيغة المفتاح الموحّدة `lov:u:{uid}:{formFactor}:{scope}:{base}`.
- وصفة "كيف أضيف تخصيصاً لعنصر جديد" (3 خطوات).
- قائمة QA لكل شاشة قبل اعتمادها (زر افتراضي، زر تثبيت، يحفظ، يقرأ، لا يتسرّب بين الأجهزة).
- قائمة بالـ12 حواراً والـ7 صفحات للتتبع.

### دفعة 2 — `useToolbarOrder` (الأخطر، يصلح الشكوى الرئيسية)

استبدال `deviceId` بـ `formFactor` في كل مفاتيح ترتيب الأزرار + ترحيل تلقائي:
- مفتاح جديد: `neobilling:toolbar:v2:{formFactor}:{screenKey}` (داخل scope `lov:u:{uid}`).
- عند القراءة الأولى: إن لم يوجد المفتاح الجديد، نقرأ القديم (`v1:{deviceId}:...` ثم `toolbar-order:...`) وننسخ.
- نفس الترقية لـ `useToolbarLock`, `useToolbarLabels`, `useToolbarHidden`.

تحقّق الدفعة 2: تخصيص أزرار في الهاتف لا يظهر في سطح المكتب والعكس، مع الحفاظ على التخصيص لكل form factor عند تسجيل خروج/دخول.

### دفعات 3..N — شاشة لكل دفعة

ترتيب مقترح (من الأقل خطورة إلى الأكثر):

3. `CustomersPage` (المرجع المعماري — أكثرها كمالاً)
4. `ProductsPage`
5. `InvoiceCreatePage`
6. `QuoteCreatePage`
7. `PurchaseCreatePage`
8. `StockReturnCreatePage`
9. `CompanySettingsPage`
10. مجموعة الحوارات الـ12 (يمكن دفعة واحدة لأنها متشابهة جداً وكلها تستخدم `useDialogSize` نفسه — نضيف فقط form-factor و"زر تثبيت/إعادة افتراضي").
11. `RecentItemsSidebar` + `FloatingSideTools` (أعمدة جانبية + ترتيب).

كل دفعة من 3 إلى 11:
- ترقّي مفاتيح الشاشة لتشمل `formFactor`.
- تتأكد أن زر **"إعادة افتراضي"** و**"حفظ كافتراضي لي"** و**"قفل/فتح"** موجودة وظاهرة.
- ترحيل صامت من القيم القديمة لكل مستخدم.
- اختبار يدوي في الـpreview على هاتف ثم على سطح مكتب.

### دفعة الختام — مراجعة + تثبيت

12. تشغيل سيناريو شامل: مستخدم A على هاتف يخصّص → يفتح سطح مكتب يجد الافتراضي الـDesktop (أو تخصيصه الـDesktop السابق). مستخدم B لا يرى شيئاً من تخصيص A.
13. تحديث memory `mem://features/architecture` و `mem://index.md`.

## ما لن أفعله (إلا إذا طلبت)

- لن أمسّ الـDB schema لـ`user_ui_preferences` (الشكل الحالي `(user_id, key, value)` كافٍ — `formFactor` يصبح جزءاً من `key`).
- لن أحذف أي قيمة قديمة من `localStorage` أو السحابة — الترحيل نسخ فقط.
- لن أتلامس مع منطق الأتمتة (workflow_status) أو طباعة A4 — موضوع مستقل.
- لن أضيف form factor ثالث (tablet) الآن — سنفصل مستقبلاً إن احتجنا.
- لن أبدأ التنفيذ قبل اعتماد هذه الخطة.

## ملخص الدفعات (للمتابعة)

```text
دفعة 0  → بنية تحتية (هوك + utility + tests)
دفعة 1  → Skill مرجعية
دفعة 2  → useToolbarOrder (يصلح الشكوى الرئيسية)
دفعة 3  → CustomersPage
دفعة 4  → ProductsPage
دفعة 5  → InvoiceCreatePage
دفعة 6  → QuoteCreatePage
دفعة 7  → PurchaseCreatePage
دفعة 8  → StockReturnCreatePage
دفعة 9  → CompanySettingsPage
دفعة 10 → كل الحوارات الـ12
دفعة 11 → RecentItemsSidebar + FloatingSideTools
دفعة 12 → اختبار شامل + تحديث الذاكرة
```
