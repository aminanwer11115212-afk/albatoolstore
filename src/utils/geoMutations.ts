import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * أنواع الكيانات المدارة من الهيكل الجغرافي / حوار العميل.
 * geo: هرمي (اتجاه → ولاية → مدينة → محلية) — عملاء مربوطون به + أبناء مربوطون.
 * flat: مسطّح (مجموعة/ترحيل/وجهة) — عملاء فقط، بدون أبناء.
 */
export type GeoKind = "region" | "state" | "city" | "locality";
export type FlatKind = "group" | "transporter" | "destination";
export type EntityKind = GeoKind | FlatKind;

interface KindMeta {
  table: string;
  label: string;
  customerFk?: string;       // العمود في customers الذي يربط بهذا الكيان
  childKind?: GeoKind;       // الابن المباشر
  childFk?: string;          // العمود في جدول الابن الذي يشير إلى هذا الأب
  childrenLabel?: string;    // للعرض في الحوار
}

const META: Record<EntityKind, KindMeta> = {
  region:      { table: "regions",         label: "الاتجاه",  customerFk: "region_id",   childKind: "state",    childFk: "region_id", childrenLabel: "ولاية" },
  state:       { table: "states",          label: "الولاية",  customerFk: "state_id",    childKind: "city",     childFk: "state_id",  childrenLabel: "مدينة" },
  city:        { table: "cities",          label: "المدينة",  customerFk: "city_id",     childKind: "locality", childFk: "city_id",   childrenLabel: "محلية" },
  locality:    { table: "localities",      label: "المحلية",  customerFk: "locality_id" },
  group:       { table: "customer_groups", label: "المجموعة", customerFk: "group_id" },
  transporter: { table: "transporters",    label: "الترحيل" },   // مربوط عبر customer_preferred_transporter
  destination: { table: "destinations",    label: "الوجهة" },    // مربوط عبر customer_destinations
};

export const kindLabel = (k: EntityKind) => META[k].label;

/** يعدّ كل العملاء المرتبطين بهذا الكيان مباشرة أو عبر أبنائه، وعدد الأبناء المباشرين. */
export async function getGeoImpact(kind: EntityKind, id: string): Promise<{
  customers: number;
  children: number;
  childrenLabel: string;
  totalCustomers: number;
  total: number;
  customerNames: string[];
}> {
  const meta = META[kind];
  let customers = 0;
  let totalCustomers = 0;
  let children = 0;
  const childrenLabel = meta.childrenLabel || "";
  const customerIds = new Set<string>();

  // العملاء المرتبطون مباشرة
  if (meta.customerFk) {
    const { data, count } = await (supabase as any)
      .from("customers")
      .select("id", { count: "exact" })
      .eq(meta.customerFk, id);
    customers = count || 0;
    totalCustomers = customers;
    (data || []).forEach((r: any) => customerIds.add(r.id));
  } else if (kind === "transporter") {
    const { data, count } = await (supabase as any)
      .from("customer_preferred_transporter")
      .select("customer_id", { count: "exact" })
      .eq("transporter_id", id);
    customers = count || 0;
    totalCustomers = customers;
    (data || []).forEach((r: any) => r.customer_id && customerIds.add(r.customer_id));
  } else if (kind === "destination") {
    const { data, count } = await (supabase as any)
      .from("customer_destinations")
      .select("customer_id", { count: "exact" })
      .eq("destination_id", id);
    customers = count || 0;
    totalCustomers = customers;
    (data || []).forEach((r: any) => r.customer_id && customerIds.add(r.customer_id));
  }

  // الأبناء (لكيانات geo فقط) + العملاء المرتبطين ضمناً
  if (meta.childKind && meta.childFk) {
    const childMeta = META[meta.childKind];
    const { data: childRows } = await (supabase as any)
      .from(childMeta.table)
      .select("id")
      .eq(meta.childFk, id);
    const childIds = (childRows || []).map((r: any) => r.id);
    children = childIds.length;
    if (childIds.length && childMeta.customerFk) {
      const { data: cRows, count } = await (supabase as any)
        .from("customers")
        .select("id", { count: "exact" })
        .in(childMeta.customerFk, childIds);
      totalCustomers = Math.max(totalCustomers, customers + (count || 0));
      (cRows || []).forEach((r: any) => customerIds.add(r.id));
    }
  }

  // أسماء عيّنة من العملاء (أول 8)
  let customerNames: string[] = [];
  if (customerIds.size > 0) {
    const ids = Array.from(customerIds).slice(0, 20);
    const { data: names } = await (supabase as any)
      .from("customers").select("name").in("id", ids).limit(8);
    customerNames = (names || []).map((r: any) => r.name).filter(Boolean);
  }

  return {
    customers,
    children,
    childrenLabel,
    totalCustomers,
    total: totalCustomers + children,
    customerNames,
  };
}


/** يحذف كل الأبناء تحت هذا الكيان بشكل تعاودي (nullify للعملاء أيضاً). */
async function deleteChildrenNullify(kind: EntityKind, id: string): Promise<void> {
  const meta = META[kind];
  if (!meta.childKind || !meta.childFk) return;
  const childMeta = META[meta.childKind];
  const { data: childRows } = await (supabase as any)
    .from(childMeta.table)
    .select("id")
    .eq(meta.childFk, id);
  for (const r of (childRows || [])) {
    await deleteGeoOnly(meta.childKind, r.id);
  }
}

/** حذف الكيان مع فكّ الربط عن العملاء (لا يحذف العملاء أبداً). */
export async function deleteGeoOnly(kind: EntityKind, id: string): Promise<boolean> {
  const meta = META[kind];
  try {
    // 1) فكّ الربط عن العملاء
    if (meta.customerFk) {
      const { error } = await (supabase as any)
        .from("customers")
        .update({ [meta.customerFk]: null })
        .eq(meta.customerFk, id);
      if (error) throw error;
    } else if (kind === "transporter") {
      await (supabase as any).from("customer_preferred_transporter").delete().eq("transporter_id", id);
    } else if (kind === "destination") {
      await (supabase as any).from("customer_destinations").delete().eq("destination_id", id);
    }
    // 2) احذف الأبناء (تعاودياً — يفكّ ربطهم بدورهم)
    await deleteChildrenNullify(kind, id);
    // 3) احذف السجل نفسه
    const { error } = await (supabase as any).from(meta.table).delete().eq("id", id);
    if (error) throw error;
    try { window.dispatchEvent(new CustomEvent("geo:changed")); } catch {}
    return true;
  } catch (e: any) {
    toast.error(e?.message || "فشل الحذف");
    return false;
  }
}


/** يعيد قائمة العملاء المرتبطين بهذا الكيان (مباشرة أو عبر أبنائه) الذين لديهم فواتير/عروض/معاملات. */
async function findBlockedCustomers(kind: EntityKind, id: string): Promise<{ id: string; name: string }[]> {
  const meta = META[kind];
  const ids = new Set<string>();
  // العملاء المباشرون
  if (meta.customerFk) {
    const { data } = await (supabase as any).from("customers").select("id").eq(meta.customerFk, id);
    (data || []).forEach((r: any) => ids.add(r.id));
  } else if (kind === "transporter") {
    const { data } = await (supabase as any).from("customer_preferred_transporter").select("customer_id").eq("transporter_id", id);
    (data || []).forEach((r: any) => ids.add(r.customer_id));
  } else if (kind === "destination") {
    const { data } = await (supabase as any).from("customer_destinations").select("customer_id").eq("destination_id", id);
    (data || []).forEach((r: any) => ids.add(r.customer_id));
  }
  // العملاء عبر السلسلة (لـ geo)
  const collectViaChildren = async (k: EntityKind, parentId: string) => {
    const m = META[k];
    if (!m.childKind || !m.childFk) return;
    const cm = META[m.childKind];
    const { data: rows } = await (supabase as any).from(cm.table).select("id").eq(m.childFk, parentId);
    for (const r of (rows || [])) {
      if (cm.customerFk) {
        const { data: cs } = await (supabase as any).from("customers").select("id").eq(cm.customerFk, r.id);
        (cs || []).forEach((c: any) => ids.add(c.id));
      }
      await collectViaChildren(m.childKind, r.id);
    }
  };
  await collectViaChildren(kind, id);

  if (ids.size === 0) return [];
  // افحص فواتير + عروض + معاملات
  const idArr = Array.from(ids);
  const blocked = new Set<string>();
  const [inv, qt, tx] = await Promise.all([
    (supabase as any).from("invoices").select("customer_id").in("customer_id", idArr),
    (supabase as any).from("quotes").select("customer_id").in("customer_id", idArr),
    (supabase as any).from("transactions").select("customer_id").in("customer_id", idArr),
  ]);
  (inv.data || []).forEach((r: any) => r.customer_id && blocked.add(r.customer_id));
  (qt.data  || []).forEach((r: any) => r.customer_id && blocked.add(r.customer_id));
  (tx.data  || []).forEach((r: any) => r.customer_id && blocked.add(r.customer_id));

  if (blocked.size === 0) return [];
  const { data: names } = await (supabase as any).from("customers").select("id,name").in("id", Array.from(blocked));
  return (names || []) as { id: string; name: string }[];
}

/** حذف الكيان + كل الأبناء + كل العملاء المرتبطين (شرط ألا يكون لأيّ منهم فواتير/معاملات). */
export async function deleteGeoCascade(kind: EntityKind, id: string): Promise<boolean> {
  const meta = META[kind];
  try {
    const blocked = await findBlockedCustomers(kind, id);
    if (blocked.length > 0) {
      const preview = blocked.slice(0, 5).map(b => b.name).join("، ");
      const more = blocked.length > 5 ? ` و${blocked.length - 5} آخرين` : "";
      toast.error(`لا يمكن الحذف الكامل — لدى العملاء التاليين بيانات مرتبطة (فواتير/معاملات): ${preview}${more}`);
      return false;
    }

    // اجمع كل العملاء واحذفهم
    const customerIds = new Set<string>();
    const collect = async (k: EntityKind, parentId: string) => {
      const m = META[k];
      if (m.customerFk) {
        const { data } = await (supabase as any).from("customers").select("id").eq(m.customerFk, parentId);
        (data || []).forEach((r: any) => customerIds.add(r.id));
      } else if (k === "transporter") {
        const { data } = await (supabase as any).from("customer_preferred_transporter").select("customer_id").eq("transporter_id", parentId);
        (data || []).forEach((r: any) => customerIds.add(r.customer_id));
      } else if (k === "destination") {
        const { data } = await (supabase as any).from("customer_destinations").select("customer_id").eq("destination_id", parentId);
        (data || []).forEach((r: any) => customerIds.add(r.customer_id));
      }
      if (m.childKind && m.childFk) {
        const cm = META[m.childKind];
        const { data: rows } = await (supabase as any).from(cm.table).select("id").eq(m.childFk, parentId);
        for (const r of (rows || [])) await collect(m.childKind, r.id);
      }
    };
    await collect(kind, id);

    if (customerIds.size > 0) {
      const arr = Array.from(customerIds);
      // نظّف الجداول الفرعية أولاً لتجنّب أي FK
      await (supabase as any).from("customer_preferred_transporter").delete().in("customer_id", arr);
      await (supabase as any).from("customer_destinations").delete().in("customer_id", arr);
      const { error } = await (supabase as any).from("customers").delete().in("id", arr);
      if (error) throw error;
    }

    // الآن استخدم نفس مسار deleteGeoOnly (يحذف الأبناء بعد فكّ الربط الذي فرغ أصلاً)
    await deleteChildrenNullify(kind, id);
    const { error: e2 } = await (supabase as any).from(META[kind].table).delete().eq("id", id);
    if (e2) throw e2;

    toast.success(`تم حذف ${meta.label} و ${customerIds.size} عميل مرتبط`);
    return true;
  } catch (e: any) {
    toast.error(e?.message || "فشل الحذف الكامل");
    return false;
  }
}

/** إضافة اسم جديد (تُرجع الصف الكامل). */
export async function addGeo(
  kind: EntityKind,
  name: string,
  parentId?: string | null,
): Promise<any | null> {
  const meta = META[kind];
  const payload: any = { name: name.trim() };
  if (kind === "state")    payload.region_id = parentId || null;
  if (kind === "city")     payload.state_id  = parentId || null;
  if (kind === "locality") payload.city_id   = parentId || null;
  if (kind === "region") {
    // sort_order = التالي
    const { data: rs } = await (supabase as any).from("regions").select("sort_order");
    const next = ((rs || []).reduce((m: number, r: any) => Math.max(m, r.sort_order || 0), 0)) + 1;
    payload.sort_order = next;
  }
  const { data, error } = await (supabase as any).from(meta.table).insert(payload).select().single();
  if (error) { toast.error(error.message); return null; }
  toast.success(`تمت إضافة ${meta.label}: ${data.name}`);
  window.dispatchEvent(new CustomEvent("geo:changed"));
  return data;
}

/** إعادة تسمية. */
export async function renameGeo(kind: EntityKind, id: string, newName: string): Promise<boolean> {
  const name = newName.trim();
  if (!name) { toast.error("الاسم مطلوب"); return false; }
  const meta = META[kind];
  const { error } = await (supabase as any).from(meta.table).update({ name }).eq("id", id);
  if (error) { toast.error(error.message); return false; }
  toast.success("تم تعديل الاسم");
  window.dispatchEvent(new CustomEvent("geo:changed"));
  return true;
}
