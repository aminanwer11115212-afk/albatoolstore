# E2E Tests (Playwright)

سيناريو شامل لتدفق: عرض سعر → ترحيل → تحويل لفاتورة → دفعة → طباعة.

## التشغيل المحلي

1. شغّل التطبيق: `bun run dev` (افتراضياً على http://localhost:8080).
2. سجّل دخولاً يدوياً واحفظ الجلسة:
   ```bash
   bunx playwright codegen http://localhost:8080 --save-storage=auth.json
   ```
   سجّل دخولاً ثم أغلق النافذة.
3. شغّل الاختبار:
   ```bash
   PLAYWRIGHT_STORAGE_STATE=auth.json bunx playwright test
   ```

## التشغيل ضد بيئة المعاينة

```bash
PLAYWRIGHT_BASE_URL=https://<your-preview>.lovable.app \
PLAYWRIGHT_STORAGE_STATE=auth.json \
bunx playwright test
```

## ملاحظات

- يحتاج المشروع لبيانات تجريبية على الأقل: عميل واحد ومنتج واحد.
- الاختبار يقبل dialog التأكيد آلياً ولا يطبع فعلياً (يكتفي بفتح حوار الطباعة).
- الـ Selectors مرنة (placeholder/role/name) لمقاومة تغييرات DOM البسيطة.
