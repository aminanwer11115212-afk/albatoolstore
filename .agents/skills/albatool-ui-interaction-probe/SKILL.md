---
name: albatool-ui-interaction-probe
description: "تشغيل سَبر تفاعلي حقيقي عبر Playwright لكل زر/حقل/قائمة منسدلة في صفحات Albatool — يتأكد من فتح/اختيار/حفظ/تنقّل لوحة المفاتيح، ويكتشف أخطاء مثل القائمة تظهر لكن لا يمكن اختيار عنصر منها. تُستخدم عند طلب جرّب الواجهة، تأكد أن كل زر شغّال، افحص الحقول، أو بعد تعديل أي Dialog/Combobox/Portal."
---

# Albatool UI Interaction Probe

هدف هذه المهارة: التحقّق الفعلي (runtime) من أن كل عنصر تفاعلي ينقر، يفتح، يحفظ، ويختار — وليس مجرد قراءة كود.

## متى تُطبَّق

- المستخدم طلب "تجربة الواجهات" / "اضغط كل زر".
- شك في خلل بـ Combobox / Popover / Dropdown / Dialog المتداخل.
- بعد تعديل مكوّن portal أو focus-trap (Radix Dialog/Popover/Select).
- ضمن `albatool-e2e-happy-path` خطوة 1–4 و14.

## الأنماط المعروفة (يجب الفحص ضدها)

| النمط | العَرَض | السبب الجذري | إصلاح |
|---|---|---|---|
| **Portal-outside-click** | القائمة تظهر، النقر على عنصر يغلقها بدلاً من اختياره | `createPortal(menu, document.body)` خارج شجرة React، فـ `wrapRef.contains(target)` يفشل و`e.stopPropagation` على React synthetic لا يوقف `document.addEventListener` لأن الحدث الأصلي لا يمر بـ React root | أضف `menuRef` ثانٍ على عنصر القائمة وافحصه أيضاً في الـ outside-click handler |
| **Radix pointer-events lock** | بعد إغلاق Dialog كل النقرات معطّلة | `body[style*="pointer-events: none"]` عالق | تأكّد من `onOpenChange` و `modal=false` عند الحاجة |
| **Cascading select stale** | اختيار ولاية لا يفلتر المدن | filteredCities لا يعتمد على state_id | اربط الـ derived list صراحةً |
| **Quick-Add no refresh** | إضافة عنصر لا يظهر فوراً | مفتاح `invalidateQueries` خاطئ | راجع `albatool-dispatch-page-audit` للمفاتيح الصحيحة |
| **Arrow keys dead in input** | Enter/Arrow لا يعمل داخل combobox مفتوح | `e.stopPropagation` ناقص فيتقاطع مع keyboard nav للجدول | أوقف الانتشار للمفاتيح الستة المعروفة |

## بروتوكول التنفيذ

اكتب سكربت Playwright تحت `/tmp/browser/ui-probe/`. التطبيق على `http://localhost:8080`.

### مصفوفة السبر (لكل صفحة)

لكل صفحة في النطاق:

1. **افتح الصفحة، التقط screenshot.**
2. **اعدّ كل الأزرار**: `await page.locator('button:visible').count()`.
3. **لكل زر "إضافة/+/جديد"**: انقر → تأكد فتح Dialog/Popover → التقط screenshot.
4. **لكل حقل ضمن Dialog**: اكتب قيمة، تابعها بـ Tab، تأكد بقاء focus داخل الحقل المتوقع.
5. **لكل قائمة منسدلة**:
   - افتحها بالماوس → تأكد ظهور menu (DOM موجود).
   - اضغط ArrowDown ثلاث مرات → تأكد تغيّر `aria-activedescendant` أو الـ highlight.
   - اضغط Enter → تأكد إغلاق القائمة + ظهور القيمة في الزر.
   - أعد فتحها، انقر على عنصر مختلف بالماوس → تأكد أنه اختير ولم تُغلق فقط.
6. **زر الحفظ**: انقر → انتظر toast نجاح → تأكد إغلاق Dialog.
7. **حالة الـ cascading**: إن كانت الصفحة فيها ولاية→مدينة→منطقة، اختر ولاية ثم افتح مدينة وتأكد أن القائمة ليست فارغة.

### مصفوفة الصفحات الأساسية (الترتيب الموصى به)

| # | المسار | زر الإضافة | الحاوية | ملاحظات |
|---|---|---|---|---|
| 1 | `/customers` | **«عميل جديد»** (ليس «إضافة عميل») — `src/pages/CustomersPage.tsx:783` | **`Sheet`** على الموبايل، panel inline على الديسكتوب (ليس `[role="dialog"]`) — أيضاً اختصار **F9** يفتحها | حقول cascading: ولاية→مدينة→منطقة + مجموعة/ناقل/وجهة. F9 = طريق احتياطي مضمون. |
| 2 | `/products` | **«+ منتج جديد»** — `ProductsPage.tsx:1173` | `[role="dialog"]` قياسي | فئة/ماركة/شركة |
| 3 | `/invoices/create` و `/quotes/create` | الصفحة نفسها نموذج (no-Dialog) | inline | جدول بنود + InlineSearchSelect لكل خلية |
| 4 | `/invoices/cash/new` | inline | inline | POS — تأكد من عزل الدفعات |
| 5 | `/purchase/create` و `/stock-return/create` | inline | inline | InlineSearchSelect للمورد/المنتج |
| 6 | `/dispatch` | تابات + اختيار صف | inline | راجع `albatool-dispatch-page-audit` |
| 7 | `/suppliers`, `/employees`, `/warehouses` | Dialog | `[role="dialog"]` | |
| 8 | `/finance/*` | — | — | حقول تواريخ وحسابات فقط |

### قاعدة كشف زر الإضافة (لتجنّب الالتباس مع "Add")

استخدم محاولات مرتّبة، أولها يفلح أوّلاً:

1. مطابقة دقيقة بالاسم العربي المُوثَّق أعلاه (مثل `name="عميل جديد"`).
2. fallback: `page.locator('button:visible:has-text("جديد"), button:visible:has-text("إضافة")').first`.
3. fallback أخير على الصفحات ذات الاختصار: أرسل `F9` (للعملاء) — هذا هو المسار الرسمي وموثّق في `CustomersPage.tsx:128`.
4. بعد النقر، تحقّق من ظهور إحدى الحاويات الثلاث: `[role="dialog"]:visible`, `[role="alertdialog"]:visible`, أو `[data-state="open"][role="region"]:visible` (Sheet). إن لم تظهر أيٌّ منها → ابحث عن نموذج inline يحوي `input[name],[placeholder*="اسم"]` ظهر حديثاً.



### Skeleton الجاهز

```python
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/ui-probe"); OUT.mkdir(parents=True, exist_ok=True)
RESULTS = []

async def probe_dropdown(page, button_locator, label):
    issues = []
    try:
        await button_locator.click(timeout=2000)
        await page.wait_for_timeout(200)
        # هل ظهرت قائمة (portal)?
        menu = page.locator('[role="listbox"], [role="menu"], div.fixed:has(input[placeholder*="ابحث"])').first
        if await menu.count() == 0:
            issues.append(f"{label}: القائمة لم تظهر")
            return issues
        # اختبار النقر بالماوس
        first_item = menu.locator('button, [role="option"]').nth(1)
        if await first_item.count():
            await first_item.click(timeout=2000)
            await page.wait_for_timeout(150)
            if await menu.is_visible():
                issues.append(f"{label}: النقر على عنصر لم يُغلق القائمة (Portal-outside-click bug)")
        # اختبار لوحة المفاتيح
        await button_locator.click()
        await page.wait_for_timeout(150)
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("Enter")
    except Exception as e:
        issues.append(f"{label}: {e}")
    return issues

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width":1280,"height":1800})
        # سجّل جلسة Lovable Cloud إن وُجدت — راجع <browser-use>
        page = await ctx.new_page()
        for path in ["/customers", "/products", "/dispatch"]:
            await page.goto(f"http://localhost:8080{path}", wait_until="domcontentloaded")
            await page.wait_for_timeout(800)
            await page.screenshot(path=str(OUT/f"{path.strip('/')}.png"))
            # افتح أوّل Dialog إضافة
            add_btn = page.get_by_role("button", name=lambda n: n and ("إضافة" in n or "جديد" in n)).first
            if await add_btn.count():
                await add_btn.click()
                await page.wait_for_timeout(400)
                # سَبر كل القوائم داخل Dialog
                comboboxes = page.locator('[role="dialog"] button[aria-haspopup], [role="dialog"] button:has-text("—")')
                for i in range(await comboboxes.count()):
                    RESULTS.extend(await probe_dropdown(page, comboboxes.nth(i), f"{path}#combo{i}"))
                await page.keyboard.press("Escape")
        await browser.close()
    Path(OUT/"report.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2))
    print(json.dumps(RESULTS, ensure_ascii=False, indent=2))

asyncio.run(main())
```

## بروتوكول الإخراج

أعد للمستخدم:

```
🧪 سَبر الواجهة — N صفحات / M تفاعل
✅ تمرّ: ...
❌ تفشل (شدّة): <page> — <element> — <ما حدث> — <الإصلاح المقترح>
📸 لقطات: /tmp/browser/ui-probe/*.png
```

## قواعد صارمة

- **قراءة فقط** على الكود أثناء السَبر. أي إصلاح يُعرض على المستخدم أولاً.
- استخدم viewport ديسكتوب وموبايل (1280×1800 و 375×812).
- لا تتجاوز 6 صفحات في تشغيل واحد — قسّم على دفعات.
- اعتمد على `LOVABLE_BROWSER_SUPABASE_*` لإحياء الجلسة قبل أي مسار محمي.
- إن وجدت "Portal-outside-click" أبلِغ بالنمط بالاسم — هذا خلل متكرّر في `InlineSearchSelect` و مشابهاته.
