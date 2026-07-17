
## الهدف
إزالة خيار رفع الملف نهائياً، وجعل زر «استيراد جهة اتصال» يفتح دائماً **منتقي جهات الاتصال الأصلي في الجهاز** بضغطة واحدة — Android و iPhone وسطح المكتب.

## الحقيقة التقنية (مهمة قبل الاختيار)

| البيئة | ما هو متاح فعلاً لفتح «جهات اتصال الجهاز» بضغطة واحدة |
|---|---|
| Android Chrome/Edge/Samsung + HTTPS | ✅ `navigator.contacts.select` — يفتح جهات اتصال Android الأصلية مباشرة |
| iOS Safari (أي إصدار حتى 2026) | ❌ لا يوجد Web API — Apple لم تضفه، لا مفرّ من هذا القيد |
| Firefox / Desktop | ❌ لا يوجد Web API |
| **تطبيق Capacitor (Android + iOS)** | ✅ يفتح جهات الاتصال الأصلية على iPhone و Android عبر `@capacitor-community/contacts` |

خلاصة: **لا توجد طريقة لفتح جهات اتصال iPhone من متصفح ويب.** الحل الوحيد للـ iPhone هو الغلاف الأصلي (Capacitor) الذي هو أصلاً متاح ومُفعَّل في المشروع.

## الخطة

### 1) تنظيف الكود — إزالة رفع الملف
- حذف: `src/utils/contactFileParser.ts`, `src/test/contactFileParser.test.ts`.
- تبسيط `ContactPickerButton.tsx`: إزالة `<input type="file">`، ومربّع اختيار الجهات المتعددة، وكل استيرادات المحلّل.

### 2) دمج Capacitor Contacts لدعم iPhone + Android الأصلي
- تثبيت `@capacitor-community/contacts` (لا يحتاج مفاتيح).
- إضافة helper `pickNativeContact()` في `src/utils/phoneNormalize.ts`:
  - إذا `Capacitor.isNativePlatform()` → استخدم `Contacts.pickContact()` (يفتح جهات iOS/Android الأصلية داخل التطبيق).
  - وإلا إذا `navigator.contacts` متاح (Android Chrome ويب) → استخدم Contact Picker API.
  - وإلا → toast واضح: «هذا الجهاز لا يدعم اختيار جهة الاتصال. ثبّت التطبيق من Play Store / App Store لتفعيل هذه الميزة»، ويبقى الحقل يدوياً.
- تحديث الأذونات:
  - Android: إضافة `<uses-permission android:name="android.permission.READ_CONTACTS"/>` في `AndroidManifest.xml` (يُضاف تلقائياً بعد `npx cap sync`).
  - iOS: إضافة `NSContactsUsageDescription` في `Info.plist` مع نص عربي: «للسماح باستيراد أرقام العملاء من جهات الاتصال.»

### 3) تجربة المستخدم الموحّدة
- زر واحد بأيقونة 📇 في كل حقول الهاتف/واتساب — نفس السلوك في كل مكان.
- بعد الاختيار: تعبئة تلقائية للاسم + الرقم المطبّع (`normalizePhoneInput`) + toast نجاح.
- عند الرفض (المستخدم منع الإذن): toast يشرح كيفية تفعيل الإذن من إعدادات الجهاز.

### 4) بعد الدمج — التعليمات للمستخدم
- في المتصفح: يعمل مباشرة على أي Android حديث.
- على iPhone: يجب تثبيت التطبيق كـ APK/IPA عبر Capacitor (خطوات موجودة في مذكرة `capacitor-mobile-development`).
- سأذكر أن على المستخدم تشغيل `git pull` ثم `npx cap sync` بعد التغيير.

## ملفات ستتغيّر
- `src/components/shared/ContactPickerButton.tsx` — تبسيط كامل، إزالة file input و dialog القائمة.
- `src/utils/phoneNormalize.ts` — إضافة `pickNativeContact()` موحّد.
- `src/utils/contactFileParser.ts` — حذف.
- `src/test/contactFileParser.test.ts` — حذف.
- `package.json` — إضافة `@capacitor-community/contacts`.
- توثيق في README حول متطلبات الأذونات.

## نقاط للموافقة قبل التنفيذ
1. هل توافق على تثبيت `@capacitor-community/contacts` (المكتبة الرسمية للمجتمع، مجانية، تدعم iOS + Android)؟
2. هل تريد إبقاء رسالة «ثبّت التطبيق من المتجر» لمستخدمي iPhone على الويب، أم إخفاء الزر كلياً هناك؟
