---
name: albatool-customer-geo-grants
description: قواعد صارمة تضمن استمرار عمل حقول الاتجاه/الولاية/المدينة/المحلية/المجموعة/الناقل/الوجهة في CustomerFormDialog — إضافة وتعديل وحذف من الواجهة إلى قاعدة البيانات. تُستخدم عند أي تعديل يمسّ صفحة إدارة العملاء أو الجداول الجغرافية أو صلاحياتها.
---

# Albatool — Customer Geo/Logistics: العقد الثابت

## السبب الجذري (تاريخي — لا يجب أن يتكرر)

Supabase Data API (PostgREST) لا يمنح صلاحيات افتراضية على `public` للأدوار `anon/authenticated/service_role`. وجود RLS policy `USING (true)` **لا يكفي** — بدون `GRANT` يفشل الطلب بصمت من الواجهة. `runOrQueue` يُدخل الفشل في قائمة أوفلاين فيبدو للمستخدم أن "لا شيء يحدث".

## الجداول المشمولة (لا تُنشأ ولا تُعدَّل بدون GRANT)

جغرافية: `regions`, `states`, `cities`, `localities`
لوجستية: `customer_groups`, `destinations`, `transporters`
ربط: `customer_destinations`, `customer_preferred_transporter`, `customer_transporters`, `destination_transporters`, `locality_transporters`

## القاعدة الإلزامية (GRANT محفوظ)

كل واحد من الجداول أعلاه **يجب** أن يحمل هذه المِنَح دائماً:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
-- الجغرافية فقط تحتاج قراءة للـ anon (روابط المشاركة العامة):
GRANT SELECT ON public.regions|states|cities|localities TO anon;
```

قبل أي migration تلمس هذه الجداول، تحقّق:

```sql
SELECT table_name, grantee, string_agg(privilege_type,',') 
FROM information_schema.role_table_grants 
WHERE table_schema='public' AND table_name IN 
 ('regions','states','cities','localities','customer_groups','destinations','transporters',
  'customer_destinations','customer_preferred_transporter','customer_transporters',
  'destination_transporters','locality_transporters')
GROUP BY 1,2 ORDER BY 1,2;
```

إن نقص أي صف لدور `authenticated` → أعد المنح فوراً.

## عقد الواجهة (CustomerFormDialog)

- الحقول الجغرافية واللوجستية كلها تستخدم `InlineSearchSelect` مع `onAdd` و`onDelete`.
- كل `addRegion/addState/addCity/addLocality/...` يمرّ عبر `runOrQueue({ table, op:'insert', ... })`.
- Cascade: تغيير الأب يمسح كل الأبناء (`state_id/city_id/locality_id = null`).
- بعد الحفظ: `dispatch("geo:changed")` و`dispatch("customer-logistics:changed")`.

## اختبارات القبول (يجب النجاح كلها قبل أي شحنة)

1. من صفحة إدارة العملاء → «عميل جديد»:
   - أكتب اسم اتجاه جديد → Enter → يظهر Toast «تمت إضافة الاتجاه» وتنزل قيمته في الحقل.
   - أضف ولاية جديدة على هذا الاتجاه → تظهر مباشرة.
   - كذلك المدينة والمحلية.
   - كذلك المجموعة، الناقل، الوجهة.
2. تحديث الصفحة → القيم لا تزال محفوظة في قاعدة البيانات وتظهر في القوائم.
3. حذف عنصر غير مستخدم → يختفي ويتحدّث الحقل.
4. رسائل «تم الحفظ محلياً — سيُرفع تلقائياً…» **يجب ألاّ** تظهر إلا حين انقطاع الإنترنت الفعلي.

## ممنوعات

- ❌ إنشاء جدول جديد في `public` بدون GRANTs في نفس المهاجرة.
- ❌ اعتبار وجود policy كافياً لعمل الـ API.
- ❌ إزالة GRANT من هذه الجداول لأي سبب — حتى مؤقتاً.
- ❌ تحويل الحقول إلى `Select` من shadcn — فقدان الإضافة/البحث السريع.
- ❌ إزالة `runOrQueue` — نحتاج التخزين المؤقّت للأوفلاين.

## عند الشك

شغّل الاستعلام أعلاه على `information_schema.role_table_grants`. إن ظهر صف واحد فقط بدور `sandbox_exec` أو ما شابه دون `authenticated` → هذا بالضبط العطب — أعد المِنَح.
