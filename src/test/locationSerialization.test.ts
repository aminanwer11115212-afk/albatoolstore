import { describe, it, expect } from "vitest";
import {
  encodeLocationValue,
  decodeLocationValue,
  encodeLocationForUrl,
  loadRecent,
  pushRecent,
  RECENT_KEY,
} from "@/components/location/locationSerialization";

describe("locationSerialization", () => {
  it("يشفر ويفك اختيار الموقع", () => {
    const v = { region_id: "r1", state_id: "s1", city_id: "c1", locality_id: "l1" };
    const s = encodeLocationValue(v);
    expect(decodeLocationValue(s)).toEqual(v);
  });

  it("يقبل base64 مُشفَّر من URL", () => {
    const v = { region_id: "r1", state_id: "s1", city_id: null, locality_id: null };
    const url = encodeLocationForUrl(v);
    expect(decodeLocationValue(url)).toEqual(v);
  });

  it("يعيد null للـ JSON غير الصالح", () => {
    expect(decodeLocationValue("not-json")).toBeNull();
    expect(decodeLocationValue("")).toBeNull();
    expect(decodeLocationValue(null)).toBeNull();
  });

  it("«الأحدث» يحفظ آخر 5 اختيارات ويزيل التكرار", () => {
    localStorage.removeItem(RECENT_KEY);
    for (let i = 0; i < 7; i++) {
      pushRecent({
        region_id: `r${i}`,
        state_id: `s${i}`,
        city_id: null,
        locality_id: null,
        label: `entry-${i}`,
        ts: Date.now() + i,
      });
    }
    const list = loadRecent();
    expect(list.length).toBe(5);
    expect(list[0].label).toBe("entry-6"); // الأحدث في المقدمة

    // إعادة نفس الإدخال ⇒ لا يتضاعف بل يُرفع للقمة
    pushRecent({ region_id: "r3", state_id: "s3", city_id: null, locality_id: null, label: "entry-3", ts: Date.now() + 999 });
    const after = loadRecent();
    expect(after.length).toBe(5);
    expect(after[0].label).toBe("entry-3");
  });
});
