import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { statusMap, QUOTE_STATUS_KEYS } from "@/pages/QuotesPage";

const ALLOWED = ["draft", "sent", "accepted", "rejected"];
const LEGACY = ["preparing", "ready", "in_transit", "done", "pending", "expired", "cancelled"];

describe("QuotesPage status configuration", () => {
  it("statusMap contains exactly the allowed status keys", () => {
    expect(Object.keys(statusMap).sort()).toEqual([...ALLOWED].sort());
  });

  it("QUOTE_STATUS_KEYS matches statusMap keys", () => {
    expect([...QUOTE_STATUS_KEYS].sort()).toEqual(Object.keys(statusMap).sort());
  });

  it("statusMap does not include any legacy workflow statuses", () => {
    for (const legacy of LEGACY) {
      expect(statusMap).not.toHaveProperty(legacy);
    }
  });

  it("filter <select> in QuotesPage.tsx exposes only allowed statuses (plus 'all')", () => {
    const src = readFileSync(
      resolve(__dirname, "../pages/QuotesPage.tsx"),
      "utf8"
    );
    // Extract the status filter <select> block
    const match = src.match(
      /value=\{statusFilter\}[\s\S]*?<\/select>/
    );
    expect(match, "status filter <select> block not found").toBeTruthy();
    const block = match![0];

    const optionValues = Array.from(
      block.matchAll(/<option\s+value="([^"]+)"/g)
    ).map((m) => m[1]);

    // Must include all allowed + "all"
    for (const v of [...ALLOWED, "all"]) {
      expect(optionValues).toContain(v);
    }
    // Must NOT include any legacy values
    for (const v of LEGACY) {
      expect(optionValues).not.toContain(v);
    }
    // No extra unexpected values
    const extras = optionValues.filter(
      (v) => v !== "all" && !ALLOWED.includes(v)
    );
    expect(extras).toEqual([]);
  });
});
