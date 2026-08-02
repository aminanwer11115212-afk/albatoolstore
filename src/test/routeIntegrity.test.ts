// سلامة الربط بين الصفحات — كل رابط يصل، وكل مسار يُوصل إليه.
//
// الرابط المكسور لا يُسقط بناءً ولا نوعاً ولا اختباراً: يفتح صفحة «غير موجود»
// وقت التشغيل وحده، فيبقى شهوراً حتى يقع عليه مستخدم. تسعة كانت قائمة فعلاً
// حين كُتب هذا الملف — منها زرّ «سلة المحذوفات» في عرض الفاتورة وعرض السعر،
// و«المهام» في شريط التنبيهات، وأمر الشراء في بطاقة المورد.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== "test") walk(rel, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

const ROUTES = [...read("src/App.tsx").matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);

/** كل وجهة تنقّل مكتوبة في الكود، مع الملف الذي كتبها. */
const TARGETS: Array<{ to: string; file: string }> = [];
for (const file of walk("src")) {
  if (file.endsWith("App.tsx")) continue;
  const src = read(file);
  for (const re of [
    /navigate\(\s*[`"']([^`"'$)]+)/g,      // navigate("/x")
    /\bto=\{?["'`]([^"'`{$]+)/g,           // <Link to="/x">
    /path:\s*["']([^"']+)["']/g,           // عناصر السايدبار والتنبيهات
  ]) {
    for (const m of src.matchAll(re)) TARGETS.push({ to: m[1], file });
  }
}

const seg = (p: string) => p.split("?")[0].split("#")[0].split("/").filter(Boolean);

/**
 * الوجهة المنتهية بـ`/` قالبٌ نصّي قُطع عند `${...}` — تُطابَق كبادئة.
 * والمسار المنتهي بـ`/*` يبتلع ما بعده.
 */
function targetHasRoute(to: string): boolean {
  const t = seg(to);
  const prefix = to.endsWith("/");
  return ROUTES.some((route) => {
    if (route === "*") return false;
    const star = route.endsWith("/*");
    const r = star ? seg(route).slice(0, -1) : seg(route);
    const fits = (a: string[], b: string[]) =>
      a.every((x, i) => x.startsWith(":") || x === b[i]);
    if (prefix || star) {
      return (r.length >= t.length && fits(r.slice(0, t.length), t))
          || (star && t.length >= r.length && fits(r, t));
    }
    return t.length === r.length && fits(r, t);
  });
}

describe("سلامة الربط بين الصفحات", () => {
  it("كل رابط داخلي يصل إلى مسار مُعرَّف", () => {
    const broken = TARGETS
      .filter((t) => t.to.startsWith("/") && !t.to.startsWith("//"))
      .filter((t) => !targetHasRoute(t.to))
      .map((t) => `${t.to}  ←  ${t.file}`);
    expect([...new Set(broken)]).toEqual([]);
  });

  it("كل مسار يصل إليه رابط — لا صفحة تُبنى ولا يُفتح إليها باب", () => {
    const linked = TARGETS.map((t) => t.to).filter((t) => t.startsWith("/"));
    const unreached = ROUTES.filter((route) => {
      if (route === "*" || route === "/") return false;
      const r = seg(route);
      return !linked.some((to) => {
        const t = seg(to);
        const fits = (n: number) => r.slice(0, n).every((x, i) => x.startsWith(":") || x === t[i]);
        return to.endsWith("/") ? r.length >= t.length && fits(t.length)
                                : t.length === r.length && fits(r.length);
      });
    });
    expect(unreached).toEqual([]);
  });

  it("لا مسار مُعرَّف مرّتين — الثاني لا يُبلَغ أبداً", () => {
    const seen = new Map<string, number>();
    for (const r of ROUTES) seen.set(r, (seen.get(r) || 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([r]) => r)).toEqual([]);
  });

  it("روابط السايدبار كلها حيّة", () => {
    const sidebar = read("src/components/layout/AppSidebar.tsx");
    const paths = [...sidebar.matchAll(/path:\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(20);
    expect(paths.filter((p) => !targetHasRoute(p))).toEqual([]);
  });
});
