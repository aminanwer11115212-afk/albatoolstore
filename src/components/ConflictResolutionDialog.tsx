import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  subscribeConflicts, getConflicts, resolveKeepLocal, resolveKeepRemote, resolveMerge,
  type ConflictEntry,
} from "@/lib/conflictResolver";
import { toast } from "sonner";
import { AlertTriangle, Cloud, Smartphone, GitMerge } from "lucide-react";

/**
 * ConflictResolutionDialog — يعرض تعارض تحرير سجل من جهازين مختلفين.
 * يُركَّب مرة واحدة في App root ويظهر تلقائياً عند أول تعارض في الطابور.
 */
export default function ConflictResolutionDialog() {
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ConflictEntry | null>(null);
  const [merged, setMerged] = useState<Record<string, any>>({});

  useEffect(() => {
    const u = subscribeConflicts((items) => {
      setConflicts(items);
      if (items.length > 0 && !open) {
        setCurrent(items[0]);
        setMerged({ ...items[0].remote, ...items[0].local });
        setOpen(true);
      }
      if (items.length === 0) setOpen(false);
    });
    const onNew = () => {
      getConflicts().then((cs) => {
        if (cs.length > 0) {
          setCurrent(cs[0]);
          setMerged({ ...cs[0].remote, ...cs[0].local });
          setOpen(true);
        }
      });
    };
    window.addEventListener("albatool:conflict-added", onNew);
    return () => { u(); window.removeEventListener("albatool:conflict-added", onNew); };
  }, []); // eslint-disable-line

  if (!current) return null;

  const fields = Array.from(new Set([...Object.keys(current.local), ...Object.keys(current.remote)]))
    .filter((k) => !["id", "created_at", "updated_at"].includes(k));

  const advance = () => {
    const rest = conflicts.filter((c) => c.id !== current.id);
    if (rest.length > 0) {
      setCurrent(rest[0]);
      setMerged({ ...rest[0].remote, ...rest[0].local });
    } else {
      setCurrent(null);
      setOpen(false);
    }
  };

  const doKeepLocal = async () => {
    await resolveKeepLocal(current.id);
    toast.success("تم الاحتفاظ بالنسخة المحلية");
    advance();
  };
  const doKeepRemote = async () => {
    await resolveKeepRemote(current.id);
    toast.info("تم الاحتفاظ بالنسخة السحابية");
    advance();
  };
  const doMerge = async () => {
    await resolveMerge(current.id, merged);
    toast.success("تم الدمج");
    advance();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && conflicts.length > 0) return; setOpen(v); }}>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={20} />
            تعارض في المزامنة {conflicts.length > 1 && `— ${conflicts.length} إجمالاً`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            تم تعديل نفس السجل من جهاز آخر أثناء وجودك أوفلاين. اختر النسخة التي تريد الاحتفاظ بها.
          </p>
          <div className="text-xs bg-muted/50 rounded p-2">
            <span className="font-mono">{current.table}</span> · id: <span className="font-mono">{current.rowId.slice(0, 8)}...</span>
            {current.label && <> · <span>{current.label}</span></>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded">
              <thead>
                <tr className="bg-muted/40 text-xs">
                  <th className="text-right px-3 py-2">الحقل</th>
                  <th className="text-right px-3 py-2">
                    <span className="flex items-center gap-1"><Smartphone size={12} /> محلياً (تعديلك)</span>
                  </th>
                  <th className="text-right px-3 py-2">
                    <span className="flex items-center gap-1"><Cloud size={12} /> السحابة (الجهاز الآخر)</span>
                  </th>
                  <th className="text-right px-3 py-2">
                    <span className="flex items-center gap-1"><GitMerge size={12} /> الدمج</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const l = current.local[f];
                  const r = current.remote[f];
                  const diff = JSON.stringify(l) !== JSON.stringify(r);
                  return (
                    <tr key={f} className={`border-t border-border ${diff ? "bg-amber-500/5" : ""}`}>
                      <td className="px-3 py-2 font-mono text-xs">{f}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setMerged({ ...merged, [f]: l })}
                          className={`text-xs px-2 py-1 rounded ${merged[f] === l ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
                        >
                          {formatVal(l)}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setMerged({ ...merged, [f]: r })}
                          className={`text-xs px-2 py-1 rounded ${merged[f] === r ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
                        >
                          {formatVal(r)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[120px]">
                        {formatVal(merged[f])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={doKeepRemote}>
            <Cloud size={14} className="ml-1" /> احتفظ بالسحابي
          </Button>
          <Button variant="outline" onClick={doKeepLocal}>
            <Smartphone size={14} className="ml-1" /> احتفظ بالمحلي
          </Button>
          <Button onClick={doMerge}>
            <GitMerge size={14} className="ml-1" /> طبّق الدمج
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatVal(v: any): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 40);
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}
