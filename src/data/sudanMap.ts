// مصدر بيانات خريطة السودان.
// ⚠️ لا تعدّل الأشكال أو الأسماء من هنا — عدّل `sudanMap.config.json` مباشرة.
// راجع `sudanMap.schema.md` للتوثيق الكامل.

import config from "./sudanMap.config.json";

export type MapRegion = {
  id: string;
  name: string;
  aliases?: string[];
  path: string;
  labelXY: [number, number];
};

export const SUDAN_VIEWBOX: string = (config as any).viewBox || "0 0 400 500";
export const SUDAN_REGIONS: MapRegion[] = ((config as any).regions || []).map((r: any) => ({
  id: r.id,
  name: r.name,
  aliases: r.aliases || [],
  path: r.path,
  labelXY: [r.labelXY?.[0] ?? 0, r.labelXY?.[1] ?? 0] as [number, number],
}));

const norm = (s: string) => (s || "").trim().replace(/\s+/g, "");

export function matchRegion(
  dbRegions: Array<{ id: string; name: string; slug?: string | null }>,
  mapRegion: MapRegion,
) {
  const target = [mapRegion.id, mapRegion.name, ...(mapRegion.aliases || [])].map(norm);
  return dbRegions.find((r) => {
    const candidates = [r.slug || "", r.name || ""].map(norm);
    return candidates.some((c) => c && target.includes(c));
  });
}
