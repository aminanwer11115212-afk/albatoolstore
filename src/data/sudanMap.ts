// بيانات خريطة السودان المبسّطة — عدّل مسار polygon لأي منطقة من هنا فقط.
// viewBox: 0 0 400 500  |  الشمال أعلى، الغرب يمين (لأن الاتجاه RTL بصرياً)
export type MapRegion = {
  id: string;          // slug ثابت
  name: string;        // اسم يُطابق regions.name في قاعدة البيانات (fallback للربط)
  aliases?: string[];  // أسماء بديلة للربط مع الـ DB
  path: string;        // مسار SVG للمنطقة
  labelXY: [number, number];
};

// مخطط تقريبي على شكل السودان مقسّم لخمس مناطق.
export const SUDAN_REGIONS: MapRegion[] = [
  {
    id: "north",
    name: "الشمالية",
    aliases: ["شمال", "الشمال", "northern"],
    path: "M120 40 L280 40 L300 120 L260 170 L170 170 L110 130 Z",
    labelXY: [200, 105],
  },
  {
    id: "east",
    name: "الشرقية",
    aliases: ["شرق", "الشرق", "eastern"],
    path: "M300 120 L370 150 L360 260 L300 300 L260 240 L260 170 Z",
    labelXY: [315, 215],
  },
  {
    id: "center",
    name: "الوسطى",
    aliases: ["وسط", "الوسط", "central", "الخرطوم"],
    path: "M170 170 L260 170 L260 240 L240 300 L170 300 L140 240 Z",
    labelXY: [205, 235],
  },
  {
    id: "west",
    name: "الغربية",
    aliases: ["غرب", "الغرب", "western", "دارفور", "كردفان"],
    path: "M40 130 L110 130 L170 170 L140 240 L170 300 L120 360 L40 320 Z",
    labelXY: [95, 235],
  },
  {
    id: "south",
    name: "الجنوبية",
    aliases: ["جنوب", "الجنوب", "southern", "النيل الأزرق"],
    path: "M120 360 L170 300 L240 300 L300 300 L280 400 L180 450 L120 420 Z",
    labelXY: [210, 380],
  },
];

// حل ربط منطقة الخريطة بصف قاعدة البيانات: تطابق slug ← name ← aliases.
export function matchRegion(dbRegions: Array<{ id: string; name: string; slug?: string | null }>, mapRegion: MapRegion) {
  const norm = (s: string) => s.trim().replace(/\s+/g, "");
  const target = [mapRegion.id, mapRegion.name, ...(mapRegion.aliases || [])].map(norm);
  return dbRegions.find(r => {
    const candidates = [r.slug || "", r.name || ""].map(norm);
    return candidates.some(c => c && target.includes(c));
  });
}
