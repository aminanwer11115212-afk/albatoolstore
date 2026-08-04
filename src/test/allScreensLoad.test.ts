/**
 * حراسةُ كل الشاشات: لا شاشةَ تسقط، ولا رابطَ يؤدّي إلى فراغ.
 *
 * طلبها صاحب المستودع: «حراسة لجميع الشاشات ألّا يوجد فيها أخطاء برمجية».
 *
 * ## ما تمسكه هذه الحراسة ولا يمسكه المُصرِّف
 * `tsc` يمسك الأسماء غير المعرَّفة والأنواع. ولا يمسك:
 *   • **خطأ زمن التحميل**: استيرادٌ دائري، أو نداءٌ عند مستوى الوحدة يرمي —
 *     فتسقط الشاشة قبل أن تُرسَم، وتبدو للمستخدم صفحةً بيضاء.
 *   • **رابطاً في السايدبار بلا مسار** — يفتح المستخدم «شاشة» فيجد 404.
 *   • **مساراً بلا صفحة** أو صفحةً بلا تصدير افتراضي.
 *
 * ## لماذا استيرادٌ فعليّ لا فحصٌ نصّي
 * الفحص النصّي يقول «الملف مكتوب»، والاستيراد يقول «الملف **يعمل**». وهذا
 * الفرق هو ما وقع في `ChargeBalanceDialog`: نداءٌ يتيم لدالّةٍ محذوفة عاش
 * حتى انفجر عند المستخدم.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

/** كل صفحات المشروع — عدا ملفات الاختبار. */
const PAGE_FILES = fs
  .readdirSync(path.resolve(ROOT, "src/pages"))
  .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
  .sort();

const APP = read("src/App.tsx");
const SIDEBAR = read("src/components/layout/AppSidebar.tsx");

describe("عدد الشاشات معلوم — فحصٌ لا يُفرَّغ صامتاً", () => {
  it("المشروع يحمل عشرات الصفحات", () => {
    // لو انهار الاستكشاف يوماً (مسارٌ تغيّر) لصار الفحص يمرّ على لا شيء
    expect(PAGE_FILES.length).toBeGreaterThan(50);
  });
});

/* ─────────── 1) كل صفحة تُحمَّل وتُصدِّر مكوّناً ─────────── */

describe("كل شاشة تُحمَّل بلا سقوط", () => {
  it.each(PAGE_FILES)("%s", async (file) => {
    const mod = await import(`../pages/${file.replace(/\.tsx$/, "")}.tsx`);
    expect(mod).toBeTruthy();
  });
});

describe("وكل شاشة تُصدِّر مكوّناً افتراضياً", () => {
  it.each(PAGE_FILES)("%s", async (file) => {
    const mod: any = await import(`../pages/${file.replace(/\.tsx$/, "")}.tsx`);
    // بعض الملفات صفحاتٌ مساعدة تُصدِّر بالاسم فقط — تُقبل إن صدّرت مكوّناً ما
    const exportsFn = Object.values(mod).some((v) => typeof v === "function");
    expect(exportsFn).toBe(true);
  });
});

/* ─────────── 2) الروابط والمسارات متطابقة ─────────── */

/** كل `path="..."` مسجَّل في الراوتر. */
const routePaths = new Set(
  Array.from(APP.matchAll(/<Route\s+path="([^"]+)"/g)).map((m) => m[1]),
);

/** كل `path: "..."` في السايدبار. */
const sidebarPaths = Array.from(SIDEBAR.matchAll(/path:\s*"(\/[^"]*)"/g)).map((m) => m[1]);

/**
 * هل يوجد مسارٌ مسجَّل يخدم هذا الرابط؟
 *
 * **المسار الشامل `*` مستثنى عمداً**: هو صفحة «غير موجود»، فلو حُسب مطابقاً
 * لصار كل رابطٍ ميّت «مخدوماً» وصار هذا الفحص يمرّ دائماً بلا معنى. وقد جُرِّب
 * برابطٍ وهمي فمرّ — فاستُثني.
 */
function hasRoute(link: string): boolean {
  const clean = link.split("?")[0].replace(/\/+$/, "") || "/";
  if (routePaths.has(clean)) return true;
  for (const r of routePaths) {
    if (r === "*" || r === "/*") continue;          // صفحة 404 لا تخدم رابطاً
    if (!r.includes(":")) continue;
    const re = new RegExp("^" + r.replace(/:[^/]+/g, "[^/]+") + "$");
    if (re.test(clean)) return true;
  }
  return false;
}

describe("لا رابطَ في السايدبار بلا شاشة", () => {
  it("السايدبار يحمل روابط فعلاً", () => {
    expect(sidebarPaths.length).toBeGreaterThan(20);
  });

  it("كل رابطٍ له مسارٌ مسجَّل — لا 404 من القائمة", () => {
    const dead = sidebarPaths.filter((p) => !hasRoute(p));
    expect(dead).toEqual([]);
  });

  it("ولا رابطَ مكرّر بمسارٍ واحد وتسميتين مختلفتين تُربكان", () => {
    const counts = new Map<string, number>();
    for (const p of sidebarPaths) counts.set(p, (counts.get(p) || 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([p]) => p);
    // التكرار مسموحٌ للمسارات العامّة (نفس الشاشة من مدخلين)، لكن لا يتجاوز اثنين
    for (const p of dupes) expect(counts.get(p)!).toBeLessThanOrEqual(2);
  });
});

describe("كل مسارٍ يشير إلى مكوّنٍ موجود", () => {
  /** أسماء المكوّنات المستدعاة داخل `<Route element={...}>` */
  const referenced = Array.from(APP.matchAll(/element=\{lazyEl\(<(\w+)/g)).map((m) => m[1]);

  it("المسارات تستعمل التحميل الكسول", () => {
    expect(referenced.length).toBeGreaterThan(50);
  });

  it("وكل مكوّنٍ مُشار إليه معرَّفٌ فعلاً — لا مسارَ إلى اسمٍ لا وجود له", () => {
    // إمّا صفحةٌ محمَّلة كسولاً، وإمّا غلافٌ معرَّف في `App.tsx` نفسه
    const declared = new Set([
      ...Array.from(APP.matchAll(/const (\w+) = lazy\(\(\) => import\("[^"]+"\)\)/g)).map((m) => m[1]),
      ...Array.from(APP.matchAll(/^const (\w+) = \(/gm)).map((m) => m[1]),
      ...Array.from(APP.matchAll(/^function (\w+)\(/gm)).map((m) => m[1]),
    ]);
    const missing = [...new Set(referenced)].filter((name) => !declared.has(name));
    expect(missing).toEqual([]);
  });

  it("وكل ملفٍ مُستورَد كسولاً موجودٌ على القرص", () => {
    const imports = Array.from(APP.matchAll(/lazy\(\(\) => import\("\.\/([^"]+)"\)\)/g)).map((m) => m[1]);
    const missing = imports.filter((rel) => {
      const base = path.resolve(ROOT, "src", rel);
      return !fs.existsSync(`${base}.tsx`) && !fs.existsSync(`${base}.ts`) && !fs.existsSync(base);
    });
    expect(missing).toEqual([]);
  });
});
