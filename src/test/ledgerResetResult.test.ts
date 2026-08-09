/**
 * حصيلةُ التصفير تُقرأ — فتُعرف النسخةُ في القاعدة بلا فتح لوحة Supabase.
 *
 * ## العطل الذي يحرسه
 * هجراتُ Supabase تُطبَّق يدوياً من SQL Editor، فبعد كل هجرةٍ يبقى سؤالٌ
 * بلا جواب: «هل وصلت؟». وكانت الشاشةُ تقرأ `error` وحدَه وترمي الحصيلة —
 * فلا تملك جواباً حتى وهو بين يديها.
 *
 * والنجاحُ وحدَه ليس دليلاً: النسخةُ القديمة تسقط بالحارس المؤجَّل **متى
 * وُجدت فاتورةٌ غير نقدية**، فقاعدةٌ خاليةٌ منها يمرّ فيها النداءُ القديم
 * بسلام — ويظنّ صاحبُه أن الهجرة طُبِّقت وهي لم تُطبَّق. فالفرقُ يُقرأ من
 * مفتاح `settlements_inserted`: لا تُنتجه إلا النسخةُ الجديدة.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ledgerResetVersion, ledgerResetCounts, ledgerResetLine,
  assertLedgerResetApplied, LEDGER_RESET_MIGRATION,
} from "@/utils/ledgerResetResult";

/** حصيلةُ النسخة الجديدة كما تبنيها الهجرة. */
const CURRENT = {
  customer_txs_deleted: 41,
  invoices_marked_paid: 17,
  settlements_inserted: 17,
  customers_zeroed: 9,
};

/** وحصيلةُ النسخة القديمة — بلا قيد التسوية. */
const LEGACY = {
  customer_txs_deleted: 41,
  invoices_marked_paid: 17,
  customers_zeroed: 9,
};

describe("تمييزُ نسخة الدالّة من حصيلتها", () => {
  it("مفتاحُ قيد التسوية ⇒ الهجرة مطبَّقة", () => {
    expect(ledgerResetVersion(CURRENT)).toBe("current");
  });

  it("وغيابُه مع بقيّة المفاتيح ⇒ النسخة القديمة", () => {
    expect(ledgerResetVersion(LEGACY)).toBe("legacy");
  });

  /**
   * صفرُ قيودٍ ليس غياباً: قاعدةٌ بلا فواتير تُدرج صفراً، والمفتاح موجود.
   * فالحكمُ على وجود المفتاح لا على قيمته.
   */
  it("وصفرُ قيودٍ مع وجود المفتاح ⇒ مطبَّقة كذلك", () => {
    expect(ledgerResetVersion({ ...LEGACY, settlements_inserted: 0 })).toBe("current");
  });

  it("ولا حصيلةَ ⇒ لا حكم", () => {
    for (const raw of [null, undefined, "", 0, [], [1, 2], { products_zeroed: 5 }]) {
      expect({ raw, v: ledgerResetVersion(raw) }).toEqual({ raw, v: expect.stringMatching(/unknown/) });
    }
  });
});

describe("الحكمُ يُرمى باسم العلّة لا برمزٍ من القاعدة", () => {
  it("النسخةُ القديمة ⇒ رسالةٌ تُسمّي الهجرة", () => {
    expect(() => assertLedgerResetApplied(LEGACY, true)).toThrow(LEDGER_RESET_MIGRATION);
  });

  it("والجديدةُ لا ترمي", () => {
    expect(() => assertLedgerResetApplied(CURRENT, true)).not.toThrow();
  });

  /**
   * تصفيرُ المخزون وحدَه لا يمرّ بفرع كشوف الحسابات، فلا يُنتج المفتاح في
   * النسختين — فالحكمُ عليه ظلمٌ يمنع عمليةً سليمة.
   */
  it("ونطاقُ المخزون وحدَه لا يُحكم عليه", () => {
    expect(() => assertLedgerResetApplied({ products_zeroed: 120 }, false)).not.toThrow();
  });
});

describe("ما يُعرض لصاحب النظام", () => {
  it("أرقامٌ لا كلمةُ «تمّت»", () => {
    expect(ledgerResetLine(CURRENT, true)).toBe(
      "حُذفت 41 حركة، وعُلِّمت 17 فاتورة مدفوعة، وأُدرج 17 قيد تسوية",
    );
  });

  it("والقديمةُ تُقال صراحة", () => {
    expect(ledgerResetLine(LEGACY, true)).toContain("غير مطبَّقة");
  });

  it("والأعدادُ تُنتقى أرقاماً — لا نصوصَ الحصيلة", () => {
    expect(ledgerResetCounts({ ...CURRENT, note: "x", bad: NaN })).toEqual(CURRENT);
  });
});

/**
 * المفتاحُ الذي يُحكم به موجودٌ في الهجرة نفسِها — فلو أُعيدت تسميتُه هناك
 * لصار هذا الفحصُ يحكم على شيءٍ لا وجود له.
 */
describe("المفتاحُ مشتقٌّ من الهجرة لا مُخترَع", () => {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), `supabase/migrations/${LEDGER_RESET_MIGRATION}.sql`),
    "utf8",
  );

  it("الهجرةُ موجودةٌ باسمها", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("وتُعيد `settlements_inserted` — وهو ما يُحكم به", () => {
    expect(sql).toContain("settlements_inserted");
  });

  it("وتُعيد `invoices_marked_paid` — المشترَك بين النسختين", () => {
    expect(sql).toContain("invoices_marked_paid");
  });
});
