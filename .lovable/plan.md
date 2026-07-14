# خطة: تشغيل النظام كاملاً أوفلاين + مزامنة تلقائية

## الوضع الحالي (ما هو موجود بالفعل)
- `src/lib/queryPersister.ts` — يحفظ كل استعلامات React Query في IndexedDB (idb-keyval).
- `src/lib/offlineQueue.ts` — طابور IndexedDB لعمليات الكتابة (insert/update/delete/upsert) + `runOrQueue` + `flushQueue` + إعادة محاولة كل دقيقتين + `online` event.
- `src/lib/realtimeSync.ts` + `RealtimeSync.tsx` — يستقبل تغييرات كل الجداول من Supabase Realtime ويطلق invalidate.
- `OfflineBanner.tsx` + `useOnlineStatus` — شريط علوي يوضّح انقطاع الاتصال وعدد العمليات المعلّقة.
- `initOfflineFlush` مُهيّأ في `main.tsx`.

## الفجوات التي يجب سدّها
1. **`OfflineBanner` غير مركّب في `AppLayout`** — الشريط لا يظهر فعلياً.
2. **معظم handlers ما تزال تستدعي `supabase.from().insert/update/delete` مباشرة** — عند عدم الاتصال ترمي خطأ بدلاً من الحفظ في الطابور.
3. **الاستعلامات (`useQuery`) لا تُخبر المستخدم أنها من الكاش** — لا مؤشر واضح.
4. **`PersistQueryClientProvider` ليس مؤكداً في `main.tsx`** — يجب التحقق من ربط `createIDBPersister`.
5. **Realtime + إعادة الجلب عند العودة** — بعد `online` يجب:
   - flush الطابور أولاً
   - ثم `queryClient.invalidateQueries()` شامل
   - ثم إظهار toast "تمت المزامنة".
6. **prefetch مُسبق للبيانات الأساسية** (customers, products, invoices) عند أول تحميل + في الخلفية دورياً، حتى لو المستخدم لم يزر الصفحة، تُصبح متاحة أوفلاين.

## التنفيذ عبر SUBAGENTS (بالتوازي)

### Subagent 1 — طبقة الكتابة الأوفلاين
- المهمة: تحويل كل استدعاءات `supabase.from(...).insert/update/delete/upsert` في `src/` إلى `runOrQueue` من `offlineQueue`.
- يستثني: قراءات `select`، edge functions، storage، auth.
- ينتج قائمة الملفات المعدّلة ويضيف toast "تم الحفظ محلياً وسيُرفع عند عودة الاتصال" عند `queued: true`.

### Subagent 2 — تحسين طبقة القراءة والمزامنة
- تأكيد `PersistQueryClientProvider` في `main.tsx` مع `createIDBPersister` و`maxAge: 30 يوم`.
- إضافة `prefetchCoreData()` (customers, products, suppliers, invoices, quotes, accounts) عند `AppLayout` mount + refetch دوري كل 5 دقائق في الخلفية.
- ربط `online` event ليُشغّل `flushQueue → invalidateQueries → toast نجاح`.
- تفعيل `refetchOnReconnect: true` + `networkMode: 'offlineFirst'` على `queryClient`.

### Subagent 3 — واجهة المستخدم + الشريط + الاختبارات
- تركيب `<OfflineBanner />` في `AppLayout.tsx` أعلى `<main>`.
- إضافة `<SyncStatusIndicator />` صغير في `AppNavbar` (أيقونة سحابة + عدّاد pending).
- اختبار E2E `e2e/offline-mode.e2e.py`: يقطع الشبكة عبر Playwright `context.set_offline(true)`، ينشئ عميل، يعيد الاتصال، يتحقق من رفع البيانات.
- اختبار وحدة `src/test/offlineQueueFlush.test.ts` لتفريغ الطابور والتعامل مع الأخطاء.

## الملفات المتوقعة
```
src/main.tsx                          # PersistQueryClientProvider مؤكد
src/lib/queryClient.ts (جديد)         # networkMode offlineFirst + refetchOnReconnect
src/lib/prefetchCoreData.ts (جديد)    # prefetch للبيانات الأساسية
src/components/layout/AppLayout.tsx   # OfflineBanner
src/components/layout/AppNavbar.tsx   # SyncStatusIndicator
src/components/SyncStatusIndicator.tsx (جديد)
src/pages/**/*                        # تحويل mutations إلى runOrQueue (Subagent 1)
e2e/offline-mode.e2e.py (جديد)
src/test/offlineQueueFlush.test.ts (جديد)
```

## معايير القبول
- قطع الإنترنت → التنقل بين الصفحات يعمل والبيانات تظهر من الكاش.
- إضافة عميل/فاتورة أوفلاين → toast "محفوظ محلياً" + عدّاد pending يزيد.
- عودة الإنترنت → toast "تمت مزامنة N عملية" خلال ≤ 3 ثوانٍ + بيانات المستخدمين الآخرين تصل عبر Realtime تلقائياً.
- لا خطأ في console، `tsgo` نظيف، جميع الاختبارات تنجح.
