---
name: albatool-global-transport-destination
description: Single source of truth for transporter and destination across the whole system (customers page, dispatch page, invoices). Any change in one place propagates after a confirmation prompt to update the customer's defaults.
---

# Albatool — الناقل والوجهة كقيمة مشتركة عالمياً

## المبدأ

الناقل (`transporters`) والوجهة (`destinations`) **كيانان مستقلّان في قاعدة البيانات**، يُشار إليهما من عدة أماكن دون تكرار:

- **صفحة إدارة العملاء** → افتراضيات العميل.
- **صفحة إدارة الترحيلات** → اختيار الناقل/الوجهة لكل فاتورة قبل التثبيت.
- **عرض الفاتورة** → الناقل/الوجهة المربوطان فعلياً (بعد التثبيت).

كل هذه الواجهات تقرأ من نفس الجداول وتكتب إليها — لا توجد نسخة مكرّرة في أي صفحة.

## الجداول الموجودة (لا تُكرَّر)

| الجدول | الغرض |
|---|---|
| `transporters` | السجل الرئيسي للناقل (الاسم، الهاتف، الشركة، …). |
| `destinations` | السجل الرئيسي للوجهة (المدينة/المنطقة). |
| `customer_transporters` | علاقة many-to-many: قائمة الناقلين المسموحين لكل عميل. |
| `customer_preferred_transporter` | الناقل **الافتراضي** للعميل (1-إلى-1). |
| `customer_destinations` | وجهات العميل + علم `is_default`. |
| `invoice_transports` | السجل الفعلي بعد تثبيت ترحيل فاتورة. |

أي قراءة/كتابة لاسم/هاتف الناقل أو الوجهة يجب أن تمر عبر هذه الجداول حصراً — ممنوع تخزين الاسم في حقل نصّي حر داخل فاتورة أو عميل.

## القاعدة الذهبية: التعديل من أي شاشة يحدّث المركز

1. تعديل بيانات ناقل في صفحة `TransportersPage` → ينعكس فوراً في كل الفواتير والعملاء الذين يستخدمونه (لأنها تقرأ بـ join).
2. تعديل بيانات وجهة في صفحة `DestinationsPage` → نفس السلوك.
3. تثبيت ناقل/وجهة لفاتورة في صفحة الترحيلات → يفتح **Dialog تأكيد**:
   - «هل تريد جعل هذا الناقل/الوجهة الافتراضي(َة) لهذا العميل في كل النظام؟»
   - **نعم** → upsert في `customer_preferred_transporter` + `customer_destinations.is_default`.
   - **لا** → يثبَّت للفاتورة الحالية فقط بدون لمس افتراضيات العميل.
4. تعديل ناقل/وجهة افتراضيين من صفحة العميل → upsert مباشر؛ لا يلمس فواتير سابقة (لأن `invoice_transports` يحفظ المرجع وقت التثبيت).

## مفاتيح React Query (الصحيحة فقط)

استخدم هذه الـ keys عند `invalidateQueries` بعد أي كتابة:

```ts
["transporters"]
["destinations"]
["customer_transporters"]
["customer_destinations"]
["customer_preferred_transporter"]
["invoices-with-customers"]
```

**ممنوع** المفاتيح القديمة `["table","transporters"]` أو `["table","destinations"]` — لا تطابق `useTable` ولن تُحدّث شيئاً.

## بث الأحداث

بعد أي كتابة على الجداول الخمسة الأولى، أضف:

```ts
try { window.dispatchEvent(new Event("customer-logistics:changed")); } catch {}
```

`ReadyToShipPanel` و`CustomerLogisticsTable` يستمعان له ويُعيدان جلب البيانات.

## واجهة الـ Dialog (موحَّدة)

استخدم `AlertDialog` من shadcn، عنوان عربي، زرّان:

```tsx
<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
  <AlertDialogContent dir="rtl">
    <AlertDialogHeader>
      <AlertDialogTitle>تحديث افتراضيات العميل؟</AlertDialogTitle>
      <AlertDialogDescription>
        هل تريد جعل <b>{transporterName}</b> الناقل المعتاد و<b>{destinationName}</b> الوجهة الافتراضية لهذا العميل في كل النظام؟
        <br />
        التغيير سيظهر في صفحة إدارة العملاء وفي كل فاتورة جديدة لهذا العميل.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => onConfirm(false)}>
        لا، فقط لهذه الفاتورة
      </AlertDialogCancel>
      <AlertDialogAction onClick={() => onConfirm(true)}>
        نعم، حدّث افتراضيات العميل
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

اعرض الـ Dialog فقط عندما **يختلف** المختار عن الافتراضي الحالي للعميل — لا تزعج المستخدم عند المطابقة.

## القواعد الحرجة

- **لا تخزّن** اسم ناقل/وجهة كـ string في `invoices` أو `customers` — استعمل foreign keys فقط.
- لا تستخدم `anon` access — الوصول مقصور على `authenticated`.
- لا تذكر "Supabase" — استخدم «Lovable Cloud».
- لا تنسخ بيانات بين الجداول؛ المرجع واحد دائماً.
- عند إضافة ناقل/وجهة من زر QuickAdd داخل أي شاشة، يُضاف إلى `transporters`/`destinations` العامين — يصبح متاحاً فوراً في كل النظام.
