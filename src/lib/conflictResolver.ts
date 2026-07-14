// conflictResolver — كشف/حفظ/عرض تعارضات المزامنة
//
// عند flush لعملية UPDATE، إذا كان remote.updated_at != expectedUpdatedAt →
// نُخزّن التعارض هنا ونعرضه في ConflictResolutionDialog للمستخدم ليختار:
//   - keepLocal  → إعادة التطبيق مع override
//   - keepRemote → إسقاط التغييرات المحلية
//   - merge      → دمج حقلاً حقلاً (لاحقاً)
import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { removeItem, retryItem, type QueuedItem } from "./offlineQueue";

const KEY = "albatool:conflicts:v1";

export interface ConflictEntry {
  id: string;
  itemId: string;
  table: string;
  rowId: string;
  local: Record<string, any>;
  remote: Record<string, any>;
  createdAt: number;
  label?: string;
}

type Listener = (items: ConflictEntry[]) => void;
const listeners = new Set<Listener>();
let cache: ConflictEntry[] = [];
let loaded = false;

async function load(): Promise<ConflictEntry[]> {
  if (loaded) return cache;
  try { cache = (await get<ConflictEntry[]>(KEY)) ?? []; } catch { cache = []; }
  loaded = true;
  return cache;
}
async function save(): Promise<void> {
  try { await set(KEY, cache); } catch { /* noop */ }
  listeners.forEach((l) => { try { l([...cache]); } catch { /* noop */ } });
}

export function subscribeConflicts(l: Listener): () => void {
  listeners.add(l);
  load().then(() => l([...cache]));
  return () => { listeners.delete(l); };
}

export async function getConflicts(): Promise<ConflictEntry[]> {
  await load();
  return [...cache];
}

/** يُسجَّل من offlineQueue.setConflictHandler. */
export async function recordConflict(item: QueuedItem, remote: any): Promise<void> {
  await load();
  const entry: ConflictEntry = {
    id: (crypto as any)?.randomUUID?.() ?? String(Date.now() + Math.random()),
    itemId: item.id,
    table: item.table,
    rowId: String(item.match?.id || ""),
    local: item.payload || {},
    remote: remote || {},
    createdAt: Date.now(),
    label: item.label,
  };
  cache.push(entry);
  await save();
  try { window.dispatchEvent(new CustomEvent("albatool:conflict-added", { detail: entry })); } catch { /* noop */ }
}

export async function resolveKeepLocal(entryId: string): Promise<void> {
  await load();
  const e = cache.find((x) => x.id === entryId);
  if (!e) return;
  // اكتب مباشرة متجاوزين expectedUpdatedAt — الأولوية للمحلي
  const { error } = await (supabase as any).from(e.table).update(e.local).eq("id", e.rowId);
  if (error) return; // نبقيه للمحاولة اليدوية لاحقاً
  cache = cache.filter((x) => x.id !== entryId);
  await save();
  await removeItem(e.itemId);
}

export async function resolveKeepRemote(entryId: string): Promise<void> {
  await load();
  const e = cache.find((x) => x.id === entryId);
  if (!e) return;
  cache = cache.filter((x) => x.id !== entryId);
  await save();
  await removeItem(e.itemId);
}

export async function resolveMerge(entryId: string, merged: Record<string, any>): Promise<void> {
  await load();
  const e = cache.find((x) => x.id === entryId);
  if (!e) return;
  const { error } = await (supabase as any).from(e.table).update(merged).eq("id", e.rowId);
  if (error) return;
  cache = cache.filter((x) => x.id !== entryId);
  await save();
  await removeItem(e.itemId);
}

/** يُعيد المحاولة لعنصر (بعد تحديث expectedUpdatedAt يدوياً). */
export async function retryFromConflict(entryId: string): Promise<void> {
  await load();
  const e = cache.find((x) => x.id === entryId);
  if (!e) return;
  await retryItem(e.itemId);
}
