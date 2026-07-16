// أدوات تصدير/استيراد اختيار الموقع كنص JSON قابل للمشاركة عبر props أو query param.
export type LocationSnapshot = {
  region_id: string | null;
  state_id: string | null;
  city_id: string | null;
  locality_id?: string | null;
};

const b64encode = (s: string) => {
  try {
    return typeof window !== "undefined"
      ? window.btoa(unescape(encodeURIComponent(s)))
      : Buffer.from(s, "utf-8").toString("base64");
  } catch { return ""; }
};
const b64decode = (s: string) => {
  try {
    return typeof window !== "undefined"
      ? decodeURIComponent(escape(window.atob(s)))
      : Buffer.from(s, "base64").toString("utf-8");
  } catch { return ""; }
};

export function encodeLocationValue(v: LocationSnapshot): string {
  const clean: LocationSnapshot = {
    region_id: v.region_id ?? null,
    state_id: v.state_id ?? null,
    city_id: v.city_id ?? null,
    locality_id: v.locality_id ?? null,
  };
  return JSON.stringify(clean);
}

export function decodeLocationValue(raw: string | null | undefined): LocationSnapshot | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text) return null;
  // إن كان مُشفَّراً base64 (بدون أقواس)، فك التشفير أولاً.
  if (!text.startsWith("{")) {
    const decoded = b64decode(text);
    if (decoded.startsWith("{")) text = decoded;
  }
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object") return null;
    return {
      region_id: obj.region_id ?? null,
      state_id: obj.state_id ?? null,
      city_id: obj.city_id ?? null,
      locality_id: obj.locality_id ?? null,
    };
  } catch {
    return null;
  }
}

export function encodeLocationForUrl(v: LocationSnapshot): string {
  return b64encode(encodeLocationValue(v));
}

export const LOCATION_QUERY_PARAM = "loc";

export type RecentLocationEntry = LocationSnapshot & {
  label: string;
  ts: number;
};

export const RECENT_KEY = "lov:location-picker:recent";
const RECENT_LIMIT = 5;

export function loadRecent(): RecentLocationEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && typeof e === "object" && e.region_id && e.state_id).slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentLocationEntry): RecentLocationEntry[] {
  if (typeof window === "undefined") return [];
  const key = (e: RecentLocationEntry) =>
    `${e.region_id}|${e.state_id}|${e.city_id ?? ""}|${e.locality_id ?? ""}`;
  const list = loadRecent();
  const filtered = list.filter((e) => key(e) !== key(entry));
  const next = [entry, ...filtered].slice(0, RECENT_LIMIT);
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  return next;
}
