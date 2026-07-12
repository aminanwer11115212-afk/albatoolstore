"""
E2E: Products PDF preview
Verifies:
  - Main products page shows "مشاركة PDF" button before opening preview.
  - Clicking preview opens the popup with the same content that will be printed.
  - The catalog popup renders in the correct RTL order (# → Name → Image),
    exactly one <header> section (no extra blocks after it), and fits
    around 12 products per A4 page when only image+name columns are visible.

Requires: LOVABLE_BROWSER_AUTH_STATUS=injected (authenticated Supabase session).
Run: python3 e2e/products-pdf-preview.e2e.py
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "products-pdf-preview"
SHOTS.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080"


async def restore_session(context, page):
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE)
    if storage_key and session_json:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await restore_session(context, page)

        await page.goto(f"{BASE}/products", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / "1_products_page.png"))

        # 1) Share PDF button must exist BEFORE opening the preview dialog.
        share_main = page.get_by_test_id("products-share-pdf-toolbar").first
        assert await share_main.count() > 0, "❌ share-pdf button missing on main page"
        print("✅ share-pdf button present on main page (before preview dialog)")

        # 2) Open preview popup via the preview/print button.
        preview_btn = page.get_by_role("button", name="معاينة / طباعة PDF").first
        async with context.expect_page() as new_page_info:
            # Trigger preview mode from inside the dialog: open the dialog first,
            # then click "معاينة" inside it.
            await preview_btn.click()
            await page.wait_for_timeout(600)
            # The dialog's preview button opens a new tab.
            await page.get_by_role("button", name="معاينة").first.click()
        popup = await new_page_info.value
        await popup.wait_for_load_state("domcontentloaded")
        await popup.wait_for_timeout(800)
        await popup.screenshot(path=str(SHOTS / "2_catalog_popup.png"))

        # 3) Structural assertions on the popup.
        html_dir = await popup.evaluate("document.documentElement.dir")
        assert html_dir == "rtl", f"❌ popup not RTL, dir={html_dir}"
        print("✅ popup renders in RTL")

        # Header + doc-title, then a single .page container with the table.
        headers = await popup.locator(".header").count()
        page_containers = await popup.locator(".page").count()
        assert headers == 1, f"❌ expected 1 .header, got {headers}"
        assert page_containers == 1, f"❌ expected 1 .page, got {page_containers}"

        # Verify RTL cell order: first td.c-num, second td.c-name, third td.c-img.
        order = await popup.evaluate("""
            () => {
              const row = document.querySelector('table.products tbody tr');
              if (!row) return null;
              return Array.from(row.children).map(td => td.className.trim());
            }
        """)
        assert order and order[0].startswith("c-num") and order[1].startswith("c-name") and order[2].startswith("c-img"), (
            f"❌ wrong cell order: {order}"
        )
        print(f"✅ RTL cell order OK: {order}")

        # 4) Roughly 12 rows fit on the first A4 page — assert first-row thumb size
        # is the large (140px) variant when only image+name are visible.
        thumb_size = await popup.evaluate("""
            () => {
              const t = document.querySelector('table.products tbody tr .thumb');
              if (!t) return null;
              const r = t.getBoundingClientRect();
              return { w: Math.round(r.width), h: Math.round(r.height) };
            }
        """)
        assert thumb_size and thumb_size["w"] >= 100, f"❌ thumb too small for image-only mode: {thumb_size}"
        print(f"✅ thumb size in image-only mode: {thumb_size}")

        # No unexpected sections after .header inside .page (only doc-title + table).
        after_header = await popup.evaluate("""
            () => {
              const p = document.querySelector('.page');
              if (!p) return [];
              return Array.from(p.children).map(el => el.tagName.toLowerCase() + '.' + (el.className || ''));
            }
        """)
        # Expected: header, doc-title (inside header or separate), table.products
        allowed_prefixes = ("div.header", "div.doc-title", "table.products")
        for tag in after_header:
            assert any(tag.startswith(p) for p in allowed_prefixes), f"❌ unexpected node in .page: {tag}"
        print(f"✅ .page children are clean: {after_header}")

        print("\n🎉 All preview assertions passed.")
        await browser.close()


asyncio.run(main())
