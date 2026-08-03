---
name: albatool-integration-tests
description: Write the integration test that must accompany every Albatool change — one that exercises the real path end to end (screen → helper → totals → balance) instead of a single pure function. Use after any edit to invoices, quotes, payments, statements, print/share templates, or delete paths, and before every commit.
---

# Albatool Integration Tests — اختبارُ تكاملٍ بعد كل تعديل

اختبارُ الوحدة يفحص دالّةً صحيحةً في نفسها. وأعطال Albatool لا تسكن الدوالّ،
بل **المسافة بينها**: شاشةٌ لا تنادي الحارس، وقالبٌ يقرأ حقلاً لا يُمرَّر،
وقيدان صحيحان يُجمعان خطأً. فبعد كل تعديل: اختبارٌ يقطع المسار كاملاً.

## متى تُطبَّق

بعد أي تعديل يمسّ: الفواتير، عروض الأسعار، الدفعات والأرصدة، كشف الحساب،
قوالب الطباعة والمشاركة، مسارات الحذف، أو المخزون. أي: كل تعديلٍ تقريباً.

## اختر النوع الصحيح

| العطل | الاختبار الذي يمسكه | لا يمسكه |
|---|---|---|
| شاشةٌ لا تنادي الحارس | **بنيوي** — يقرأ ملف الشاشة نصّاً | فحص الدالّة وحدها |
| رقمٌ يختلف بين شاشتين | **تكامل** — يمرّ بالمسارين ويقارن | فحص أحدهما |
| رصيدٌ ينزاح بعد سلسلة عمليات | **تراكمي** — عشرُ عمليات ثم يقارن الثابت | فحص عملية واحدة |
| نجاحٌ كاذب من الخادم | **محاكاة الردّ** — بلا خطأ وبصفر صفوف | فحصٌ يفترض نجاح الشبكة |

## الأنماط الأربعة

### 1) تكامل المسار — من المدخل إلى الرقم المعروض

```ts
const view = buildCustomerAccountView({ invoices, transactions });
const payment = view.blocks[0].movements.find((m) => m.kind === "payment")!;
expect(payment.label).toContain("5,000");   // ما يقرؤه المستخدم
expect(payment.effect).toBe(-4000);         // وما يدخل الحساب
expect(view.accountTotal).toBe(-1000);      // والثابت الذي يقفل الكشف
```

**القاعدة:** كل اختبارٍ يغيّر عرضاً يجب أن يُثبت أيضاً أن **المجاميع لم
تتحرّك** (`accountTotal`, `drift`, `closing`). وإلا فقد يُصلح النصَّ ويكسر
المحاسبة بلا أن يشعر أحد.

### 2) بنيوي — يمنع عودة النمط لا الرقم

العطل يتكرّر لأن الحساب مكتوبٌ في مواضع متفرّقة، فيُصلَح موضعٌ ويبقى مثيله:

```ts
const ENTRY_SCREENS = ["src/screens/InvoiceCreateScreen.tsx", "src/pages/QuoteCreatePage.tsx"];
it.each(ENTRY_SCREENS)("%s ينادي المصدر الواحد", (file) => {
  expect(read(file)).toContain("effectiveRowRate");
});
```

احصر الفحص في الدوالّ المعنيّة. الفحص الواسع يُنذر كاذباً، والإنذار الكاذب
يُعلّم تجاهل الحارس.

### 3) تطابق قالبَين — الطباعة ورابط العميل

القالبان في بيئتين (Node وDeno) فلا يستوردان بعضهما. العقد مفحوصٌ من الجانبين:
`src/test/shareVsPrintTemplate.test.ts` و`supabase/functions/document-share/index_test.ts`.
قارن **النصّ حرفياً** لا القيمة — الإشارة واللون جزءٌ من المعنى:

```ts
expect(pickRaw(shareHtml, "final-total")).toBe(pickRaw(printHtml, "final-total"));
```

### 4) الردّ الكاذب من الخادم

`delete`/`update` ينجحان بصفر صفوف حين تمنع RLS الصفَّ — بلا خطأ:

```ts
const chain = { delete: () => chain, eq: () => chain, select: () => Promise.resolve({ data: [], error: null }) };
await expect(removeRow({ from: () => chain }, "quotes", "q1")).rejects.toThrow(/لم يُحذف/);
```

## أين يُكتب

`src/test/<الموضوع>.test.ts` — اسمٌ يصف العطل لا الملف المُعدَّل
(`quoteRateParity` لا `invoiceCreateHelpers`). ورأس الملف يشرح **العطل الذي
عالجَه** بمثالٍ برقمَين، فيفهم قارئه بعد سنة لماذا وُجد.

## قبل الدفع — الثلاثة كلّها

```bash
npx vitest run
npx tsc -p tsconfig.app.json --noEmit   # الراية `-p` ليست زينة
npm run build
```

`npx tsc --noEmit` وحده **لا يفحص شيئاً**: `tsconfig.json` ملفُّ حلٍّ
(`"files": []`) فيُصرِّف صفر ملف ويخرج ناجحاً ولو كان في الكود اسمٌ غير معرَّف.

## الفخاخ

- **اختبارٌ يوثّق العطل بدل أن يمنعه** — إن غيّرت سلوكاً عمداً فحدّث الاختبار
  ليصف السلوك الجديد وسببه، ولا تحذفه.
- **محاكاةٌ تعيد صياغة المنطق** — تنجح على منطق المحاكاة لا على منطق الكود.
- **`toBeCloseTo` على النقود** — يخفي انحرافاً حقيقياً؛ المال يُقارن بـ`toBe`
  بعد تدويرٍ صريح.
- **اختبارٌ راسبٌ من قبل** — شغّل `git stash` وتحقّق: إن كان راسباً قبل عملك
  فأصلحه أو صحّح ما صار يفحصه، ولا تدفع فوق سقوطٍ قائم.
