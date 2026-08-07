/**
 * منطقةُ الخطر (Ctrl+Shift+9): الحذفُ يحذف حقّاً، أو يفشل صراحةً.
 *
 * ## العطل
 * كان المسحُ مكتوباً داخل `HiddenDevResetDialog` بشرطٍ معكوس:
 *
 *     if (error && !/id.*does not exist/.test(error.message)) { …created_at… }
 *
 * فالسقوطُ إلى `created_at` كُتب لجدولٍ **لا عمود id فيه**، ثمّ مُنع من العمل
 * في تلك الحالة بالذات. ولمّا لم يُرمَ الخطأُ أيضاً، مضى التنفيذُ إلى آخره
 * وأعلن «تم التنفيذ بنجاح» — والجدولُ كما هو.
 *
 * ووجهُه الثاني: خطأٌ حقيقي (رفضُ صلاحية، قيدُ مفتاح أجنبي) كان يقود إلى
 * `created_at`، فإن نجحت ابتُلع الخطأُ ولم يعرف به أحد.
 *
 * ## ولمَ يُفحص هذا خاصّة
 * أداةٌ تحذف بلا رجعة، ونتيجتُها الوحيدةُ المرئيةُ للمستخدم رسالةُ نجاح. فإن
 * كذبت الرسالةُ لم يبقَ ما يكشف الكذب: المستخدمُ يظنّ الجداولَ فارغةً ويبني
 * عليه. والفشلُ الصريحُ أهونُ من نجاحٍ كاذب.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { wipeTable } from "@/utils/wipeTable";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/* ═══════════ عميلُ قاعدةٍ مزدوج ═══════════ */

type Call = { table: string; by: "id" | "created_at" };

/**
 * يحاكي PostgREST بصفوفٍ حقيقية:
 *   • `noIdColumn` — جداولُ ترفض الفلترَ على id بخطأ الخادم الحقيقي.
 *   • `denied`     — جداولُ ترفض الحذفَ بخطأٍ صريح.
 *   • `rlsSilent`  — **جداولُ سياسةُ الصفوف تمنع حذفَها بلا خطأ**: يُرجع
 *     الطلبُ نجاحاً والصفوفُ باقية. وهي الحالةُ التي وثّقها المستودعُ في
 *     `deleteSilentFailure.test.ts` لزرّ حذف العرض.
 *
 * والعدُّ يُقرأ من الصفوف الباقية لا من رقمٍ مُملى — فلا يمكن أن يقول العدُّ
 * غيرَ ما فعله الحذف.
 */
function fakeClient(opts: {
  noIdColumn?: string[];
  denied?: string[];
  rlsSilent?: string[];
  rows?: Record<string, number>;
} = {}) {
  const noId = new Set(opts.noIdColumn || []);
  const denied = new Set(opts.denied || []);
  const silent = new Set(opts.rlsSilent || []);
  const calls: Call[] = [];
  /** عددُ الصفوف الباقي في كل جدول — يبدأ بثلاثة ما لم يُملَ غيرُه. */
  const rows: Record<string, number> = { ...(opts.rows || {}) };
  const rowsOf = (t: string) => (t in rows ? rows[t] : (rows[t] = 3));

  const doDelete = (table: string, by: "id" | "created_at") => {
    calls.push({ table, by });
    if (denied.has(table)) {
      return { error: { message: 'permission denied for table "' + table + '"' } };
    }
    if (by === "id" && noId.has(table)) {
      return { error: { message: 'column "id" does not exist' } };
    }
    // سياسةُ الصفوف الصامتة: نجاحٌ بلا حذف
    if (!silent.has(table)) rows[table] = 0;
    else rowsOf(table);
    return { error: null };
  };

  const client = {
    from(table: string) {
      return {
        delete: () => ({
          not: async () => doDelete(table, "id"),
          gte: async () => doDelete(table, "created_at"),
        }),
        select: async () => ({ count: rowsOf(table), error: null }),
      };
    },
  };
  /** الجداولُ التي فرغت فعلاً. */
  const wiped = {
    has: (t: string) => t in rows && rows[t] === 0,
    get list() { return Object.keys(rows).filter((t) => rows[t] === 0); },
  };
  return { client: client as any, calls, wiped, rows };
}

/* ═══════════ ١) العطلُ مُعادُ إنتاجه بالمنطق القديم ═══════════ */

/** نصُّ ما كان مكتوباً في النافذة — حرفاً بحرف في شرطه. */
async function legacyWipe(client: any, t: string) {
  const { error } = await client.from(t).delete().not("id", "is", null);
  if (error && !/id.*does not exist/i.test(error.message)) {
    const { error: e2 } = await client.from(t).delete().gte("created_at", "1900-01-01");
    if (e2) throw e2;
  }
}

describe("المنطقُ القديم — نجاحٌ كاذب", () => {
  it("جدولٌ بلا عمود id: لا يُمسح، ولا يُرمى خطأ", async () => {
    const { client, wiped } = fakeClient({ noIdColumn: ["locality_transporters"] });
    // لا يرمي — وهذا وجهُ العطل
    await expect(legacyWipe(client, "locality_transporters")).resolves.toBeUndefined();
    // والجدولُ لم يُمسّ
    expect(wiped.has("locality_transporters")).toBe(false);
  });

  it("وخطأٌ حقيقي يُبتلع إن نجح المسارُ الثاني", async () => {
    /* الفلترُ على id مرفوضٌ (عمودٌ محميّ بسياسة صفوف)، والفلترُ على created_at
       يمرّ. فالمنطقُ القديم يجرّب الثاني وينجح، ويضيع الأوّل بلا أثر. */
    let firstError: any = null;
    const c: any = {
      from: () => ({
        delete: () => ({
          not: async () => (firstError = { message: "permission denied" }, { error: firstError }),
          gte: async () => ({ error: null }),
        }),
      }),
    };
    await expect(legacyWipe(c, "activity_log")).resolves.toBeUndefined();
    expect(firstError, "وقع خطأٌ ولم يصل إلى أحد").not.toBeNull();
  });
});

/* ═══════════ ٢) والمنطقُ الجديد ═══════════ */

describe("wipeTable", () => {
  it("جدولٌ عاديّ: يُمسح بـid ولا يُجرَّب غيرُه", async () => {
    const { client, calls, wiped } = fakeClient();
    await expect(wipeTable(client, "invoice_revisions")).resolves.toEqual({ via: "id" });
    expect(wiped.has("invoice_revisions")).toBe(true);
    expect(calls).toEqual([{ table: "invoice_revisions", by: "id" }]);
  });

  it("وجدولٌ بلا عمود id: يُمسح بـcreated_at — وهذا ما كان يسقط", async () => {
    const { client, calls, wiped } = fakeClient({ noIdColumn: ["locality_transporters"] });
    await expect(wipeTable(client, "locality_transporters"))
      .resolves.toEqual({ via: "created_at" });
    expect(wiped.has("locality_transporters")).toBe(true);
    expect(calls.map((c) => c.by)).toEqual(["id", "created_at"]);
  });

  it("وخطأٌ حقيقي يُرمى ولا يُبتلع", async () => {
    const { client, calls } = fakeClient({ denied: ["bot_audit_log"] });
    await expect(wipeTable(client, "bot_audit_log")).rejects.toMatchObject({
      message: expect.stringContaining("permission denied"),
    });
    // ولا محاولةَ ثانيةً تُخفيه
    expect(calls).toEqual([{ table: "bot_audit_log", by: "id" }]);
  });

  it("وفشلُ المسار الثاني يُرمى كذلك", async () => {
    const c: any = {
      from: () => ({
        delete: () => ({
          not: async () => ({ error: { message: 'column "id" does not exist' } }),
          gte: async () => ({ error: { message: "foreign key violation" } }),
        }),
        select: async () => ({ count: 0, error: null }),
      }),
    };
    await expect(wipeTable(c, "stock_returns")).rejects.toMatchObject({
      message: expect.stringContaining("foreign key"),
    });
  });
});

/* ═══════════ ٢-ب) الحذفُ الذي لا يحذف ولا يُخطئ ═══════════ */

/**
 * سياسةُ الصفوف حين تمنع الحذف تُرجع **نجاحاً** بصفر صفوفٍ محذوفة — لا خطأ.
 * وقد وقع هذا في هذا المستودع من قبل في زرّ حذف العرض، ووُثّق في
 * `deleteSilentFailure.test.ts`. وهو هنا أخطر: أداةٌ لا رجعةَ فيها.
 */
describe("سياسةُ صفوفٍ تمنع بلا خطأ", () => {
  it("جدولٌ بقيت صفوفُه ⇒ خطأٌ صريح لا نجاحٌ كاذب", async () => {
    const { client, rows } = fakeClient({ rlsSilent: ["invoices"], rows: { invoices: 41 } });
    await expect(wipeTable(client, "invoices")).rejects.toThrow(/لم يُحذف شيءٌ من invoices/);
    expect(rows.invoices, "الصفوفُ باقيةٌ فعلاً").toBe(41);
  });

  it("والرسالةُ تسمّي الجدولَ وعددَه وسببَه — لا عطلٌ مبهم", async () => {
    const { client } = fakeClient({ rlsSilent: ["activity_log"], rows: { activity_log: 7 } });
    await expect(wipeTable(client, "activity_log"))
      .rejects.toThrow(/activity_log.*بقي 7 صفاً.*الصلاحيات/s);
  });

  it("وجدولٌ فارغٌ أصلاً يمرّ — الفراغُ ليس عطلاً", async () => {
    const { client } = fakeClient({ rows: { bot_scan_snapshots: 0 } });
    await expect(wipeTable(client, "bot_scan_snapshots")).resolves.toEqual({ via: "id" });
  });

  /**
   * والعدُّ شاهدٌ لا حارس: إن تعذّر العدُّ نفسُه (سياسةُ قراءةٍ تحجب الجدول)
   * لا يُدَّعى فشلٌ — الحذفُ نجح ولا شاهدَ ينقضه.
   */
  it("وتعذُّرُ العدّ لا يُفشل حذفاً نجح", async () => {
    const c: any = {
      from: () => ({
        delete: () => ({ not: async () => ({ error: null }), gte: async () => ({ error: null }) }),
        select: async () => ({ count: null, error: { message: "permission denied" } }),
      }),
    };
    await expect(wipeTable(c, "discount_audit_log")).resolves.toEqual({ via: "id" });
  });

  it("والمنطقُ القديم كان يمرّ عليها بنجاحٍ تامّ", async () => {
    const { client, rows } = fakeClient({ rlsSilent: ["invoices"], rows: { invoices: 41 } });
    await expect(legacyWipe(client, "invoices")).resolves.toBeUndefined();
    expect(rows.invoices).toBe(41);   // «تم التنفيذ بنجاح» وأربعون فاتورةً باقية
  });
});

/* ═══════════ ٣) والمسارُ كاملاً كما تمشيه النافذة ═══════════ */

/**
 * لا فحصَ دالّةٍ منعزلة: تُمشى قائمةُ جداول «الناقلون والترحيلات» كما تمشيها
 * النافذة، وفيها جدولٌ بلا عمود id. فالمطلوب أن **يُمسح كلُّ جدولٍ** — لا أن
 * يُتخطّى واحدٌ بصمت ثمّ تُعلن النافذةُ النجاح.
 */
describe("مسارُ منطقةِ الخطر كاملاً", () => {
  const TRANSPORT_TABLES = [
    "invoices_transports_items", "invoice_transports", "quote_transports",
    "customer_preferred_transporter", "customer_transporters",
    "destination_transporters", "locality_transporters",
    "transporters",
  ];

  it("كلُّ جداول الترحيل تُمسح ولو خلا أحدُها من عمود id", async () => {
    const { client, wiped } = fakeClient({
      noIdColumn: ["locality_transporters", "customer_preferred_transporter"],
    });
    for (const t of TRANSPORT_TABLES) await wipeTable(client, t);
    expect(wiped.list.sort()).toEqual([...TRANSPORT_TABLES].sort());
  });

  it("وبالمنطق القديم كان يفوت جدولان بلا أثر", async () => {
    const { client, wiped } = fakeClient({
      noIdColumn: ["locality_transporters", "customer_preferred_transporter"],
    });
    for (const t of TRANSPORT_TABLES) await legacyWipe(client, t);
    expect(wiped.list.sort()).toEqual(
      TRANSPORT_TABLES
        .filter((t) => t !== "locality_transporters" && t !== "customer_preferred_transporter")
        .sort(),
    );
  });

  it("ورفضُ الصلاحية يوقف المسار — فلا تُعلن النافذةُ نجاحاً", async () => {
    const { client } = fakeClient({ denied: ["quote_transports"] });
    await expect((async () => {
      for (const t of TRANSPORT_TABLES) await wipeTable(client, t);
    })()).rejects.toMatchObject({ message: expect.stringContaining("permission denied") });
  });
});

/* ═══════════ ٤) والنافذةُ تقرأ من المصدر الواحد ═══════════ */

describe("HiddenDevResetDialog", () => {
  const src = read("src/components/HiddenDevResetDialog.tsx");

  it("يستورد wipeTable ولا يكتب مسحاً بيده", () => {
    expect(src).toMatch(/from "@\/utils\/wipeTable"/);
    // لا نسخةَ ثانيةٍ من الشرط المعكوس
    expect(src).not.toMatch(/id\.\*does not exist/);
  });

  it("ولا حذفَ مباشرٌ يلتفّ على الوحدة", () => {
    expect(src, "حذفٌ مباشرٌ بـsupabase — يفوته السقوطُ إلى created_at")
      .not.toMatch(/supabase\s*\.from\([^)]*\)\s*\.delete\(\)/);
  });

  /**
   * ومن علّم «نسخة احتياطية قبل التنفيذ» لا يُحذف له شيءٌ إن فشلت النسخة.
   * فالخيارُ وعدٌ لا زينة.
   */
  it("والحذفُ يمتنع إن فشلت النسخةُ الاحتياطية", () => {
    expect(src).toMatch(/const b = await exportBackup\(\)/);
    expect(src).toMatch(/if \(b\.failed\.length\)/);
    // ورسالةُ النجاح لا تُطلق إلا بعد اجتياز ذلك
    expect(src.indexOf("if (b.failed.length)"))
      .toBeLessThan(src.indexOf("تم التنفيذ بنجاح"));
  });
});
