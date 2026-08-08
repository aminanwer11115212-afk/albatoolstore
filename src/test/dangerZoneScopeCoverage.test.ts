/**
 * منطقةُ الخطر: ما تعرضه المعاينة هو ما تفعله الدوالّ — لا أقلّ.
 *
 * ## العطل الذي يحرسه
 * `SCOPE_TABLES` في الحوار كانت **أقصرَ ممّا تحذفه دوالُّ القاعدة**. خيارُ
 * «الفواتير» يُعلن أربعةَ جداول، و`admin_reset_transactional_data` تحذف من
 * عشرة: التغليفُ والترحيلُ وبنودُهما والمحذوفاتُ والحركاتُ المرتبطة لم تكن
 * مذكورةً في المعاينة ولا منسوخةً في النسخة الاحتياطية.
 *
 * فتذهب بلا أن يراها صاحبُها ولا أن يحتفظ بنسخةٍ منها — في أداةٍ كلُّ غرضها
 * هذان الاثنان، وحذفُها لا رجعةَ فيه.
 *
 * وأخفاها أثراً «تصفير كشف الحساب»: يكتب `paid_amount = total` على كل فاتورة
 * غير نقدية ويعلّمها «مدفوعة» — وجدولُ `invoices` لم يكن مذكوراً أصلاً.
 *
 * ## ولمَ يُقرأ من الهجرات لا من قائمةٍ مكتوبة بيد
 * لأن المصدر هو نصُّ الدالّة. فمن أضاف غداً جدولاً إلى الدالّة ونسي الحوار
 * سقط هذا الفحصُ باسم الجدول — وهو ما لا تفعله قائمةٌ تُنسخ باليد.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const MIGRATIONS = "supabase/migrations";

/** أحدثُ هجرةٍ تُعرّف الدالّة — الأخيرةُ زمنياً هي السارية. */
function latestMigrationDefining(fn: string): string {
  const files = fs.readdirSync(path.resolve(process.cwd(), MIGRATIONS))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const hits = files.filter((f) =>
    read(`${MIGRATIONS}/${f}`).includes(`FUNCTION public.${fn}`),
  );
  if (!hits.length) throw new Error(`لا هجرةَ تُعرّف ${fn}`);
  return read(`${MIGRATIONS}/${hits[hits.length - 1]}`);
}

/** جداولُ الدالّة وأثرُها، مقروءةً من نصّها. */
function tablesTouchedBy(sql: string): { deleted: Set<string>; written: Set<string> } {
  const deleted = new Set<string>();
  const written = new Set<string>();
  for (const m of sql.matchAll(/DELETE\s+FROM\s+public\.(\w+)/gi)) deleted.add(m[1]);
  for (const m of sql.matchAll(/UPDATE\s+public\.(\w+)/gi)) written.add(m[1]);
  return { deleted, written };
}

const DIALOG = read("src/components/HiddenDevResetDialog.tsx");

/** أسماءُ الجداول المذكورة في `SCOPE_TABLES` بالحوار. */
function declaredTables(): Set<string> {
  const a = DIALOG.indexOf("const SCOPE_TABLES");
  const b = DIALOG.indexOf("export const EFFECT_LABEL", a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  const block = DIALOG.slice(a, b);
  return new Set([...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
}

describe("المعاينة تغطّي كل ما تمسّه الدوالّ", () => {
  const declared = declaredTables();

  it("admin_reset_transactional_data — كل جدولٍ تحذفه مذكورٌ في الحوار", () => {
    const { deleted, written } = tablesTouchedBy(
      latestMigrationDefining("admin_reset_transactional_data"),
    );
    const missing = [...deleted, ...written].filter((t) => !declared.has(t));
    expect({ missing }).toEqual({ missing: [] });
  });

  it("admin_reset_stock_and_ledgers — كذلك، ومنها `invoices` التي يُكتب عليها", () => {
    const { deleted, written } = tablesTouchedBy(
      latestMigrationDefining("admin_reset_stock_and_ledgers"),
    );
    const missing = [...deleted, ...written].filter((t) => !declared.has(t));
    expect({ missing }).toEqual({ missing: [] });
    // الشاهدُ الصريح على العطل الذي وقع: الدالّة تكتب على الفواتير
    expect(written.has("invoices")).toBe(true);
    expect(declared.has("invoices")).toBe(true);
  });

  it("وجداولُ المسح من الواجهة مذكورةٌ هي الأخرى", () => {
    // ما يُمسح بـ`wipeTable` مكتوبٌ في `run()` — كلُّه يمرّ بالمعاينة والنسخة.
    const run = DIALOG.slice(DIALOG.indexOf("const run = async"));
    const wiped = new Set(
      [...run.matchAll(/await wipe\("(\w+)"\)|for \(const t of \[([^\]]+)\]\)/g)]
        .flatMap((m) => (m[1] ? [m[1]] : [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1]))),
    );
    expect(wiped.size).toBeGreaterThan(8);
    const missing = [...wiped].filter((t) => !declared.has(t));
    expect({ missing }).toEqual({ missing: [] });
  });
});

describe("الأثرُ مكتوبٌ على كل جدول — لا يُقرأ التصفيرُ حذفاً", () => {
  it("الحوار يميّز حذفاً وتصفيراً وتعديلاً", () => {
    expect(DIALOG).toContain('EFFECT_LABEL');
    for (const label of ["حذف", "تصفير", "تعديل"]) {
      expect({ label, has: DIALOG.includes(`"${label}"`) }).toEqual({ label, has: true });
    }
  });

  it("والمنتجاتُ والعملاءُ تصفيرٌ لا حذف — فالدوالّ تُحدّثهما ولا تحذفهما", () => {
    const stock = latestMigrationDefining("admin_reset_stock_and_ledgers");
    expect(/UPDATE\s+public\.products/i.test(stock)).toBe(true);
    expect(/DELETE\s+FROM\s+public\.products/i.test(stock)).toBe(false);

    const trans = latestMigrationDefining("admin_reset_transactional_data");
    expect(/UPDATE\s+public\.customers/i.test(trans)).toBe(true);
    expect(/DELETE\s+FROM\s+public\.customers/i.test(trans)).toBe(false);
  });
});

describe("النسخةُ الاحتياطية لا تُبتر صامتة", () => {
  it("البترُ عند الحدّ يُعدّ فشلاً — لا نسخةً ناقصة يمضي عليها الحذف", () => {
    // يُطلب صفٌّ زائدٌ عن الحدّ ليكون وجودُه دليلَ بترٍ لا احتمالَه
    expect(DIALOG).toContain("BACKUP_ROW_LIMIT + 1");
    expect(DIALOG).toMatch(/rows\.length > BACKUP_ROW_LIMIT/);
    // ويدخل في `failed` فيُلغى الحذف — القاعدةُ المكتوبة في `run()`
    expect(DIALOG).toMatch(/failed\.push\(`\$\{t\}/);
  });

  it("والوصفُ يطابق ما يفعله الكود: ملفٌّ واحد لا ملفٌّ لكل جدول", () => {
    expect(DIALOG).not.toContain("ملف CSV منفصل لكل جدول");
    expect(DIALOG).toContain("ملف CSV واحد يضمّ كل جدول");
    // والكودُ ينزّل مرّةً واحدة فعلاً
    expect((DIALOG.match(/downloadCSV\(/g) || []).length).toBe(2); // التعريف + نداءٌ واحد
  });
});
