import { useEffect, useRef, useState } from "react";
import { Paperclip, Trash2, Upload, X, FileText, Download, Camera, Receipt, Truck, Image as ImageIcon, Trash, RotateCcw, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveAttachmentSignedUrls } from "@/utils/signedAttachmentUrl";
import { useDialogSize } from "@/hooks/useDialogSize";
import { invalidateWorkflowAutoCache } from "@/components/invoice/WorkflowStatusBadge";
import ImageCropDialog from "@/components/shared/ImageCropDialog";
import { useCropQueue } from "@/hooks/useCropQueue";

type Category = "receipt" | "running" | "details";
type TabKey = Category | "trash";

interface Attachment {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  category: Category;
  expires_at: string;
  deleted_at: string | null;
  deleted_reason: string | null;
}

interface Props {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  /** إذا مُرِّر، تُفعَّل الأتمتة: رفع إيصال → حالة التجهيز تصبح "تم" تلقائياً */
  onWorkflowAdvanced?: () => void;
}

const CATEGORIES: { key: Category; label: string; icon: any }[] = [
  { key: "receipt", label: "صور الإيصال", icon: Receipt },
  { key: "running", label: "صور الجرد", icon: Truck },
  { key: "details", label: "صور التفاصيل", icon: ImageIcon },
];

export default function InvoiceAttachmentsDialog({ invoiceId, open, onClose, onWorkflowAdvanced }: Props) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("receipt");
  const { dlgRef, dlgStyle } = useDialogSize("invoice_attachments_dialog", open, { w: "min(680px, 96vw)", h: "90vh" });

  const cropQueue = useCropQueue((files) => { handleUpload(filesToList(files)); });
  const onFilesSelected = (files: FileList | null) => cropQueue.start(files);

  const filesToList = (arr: File[]): FileList => {
    const dt = new DataTransfer();
    for (const f of arr) dt.items.add(f);
    return dt.files;
  };


  const load = async () => {
    if (!invoiceId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoice_attachments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else {
      const list = ((data as any) || []) as Attachment[];
      const signed = await resolveAttachmentSignedUrls(list, "invoice-attachments");
      setItems(signed);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && invoiceId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !invoiceId || activeTab === "trash") return;
    setUploading(true);
    const failed: string[] = [];
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `${invoiceId}/${activeTab}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        try {
          const { error: upErr } = await supabase.storage
            .from("invoice-attachments")
            .upload(path, file, { contentType: file.type });
          if (upErr) throw upErr;
          const { data: pub } = supabase.storage.from("invoice-attachments").getPublicUrl(path);
          const { error: insErr } = await supabase.from("invoice_attachments").insert({
            invoice_id: invoiceId,
            file_url: pub.publicUrl,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            category: activeTab,
          } as any);
          if (insErr) {
            // تنظيف الملف من Storage لتفادي ملفات يتيمة بدون سجل DB.
            try { await supabase.storage.from("invoice-attachments").remove([path]); } catch {}
            throw insErr;
          }
          ok++;
        } catch (fileErr: any) {
          console.error("[InvoiceAttachments] upload failed for", file.name, fileErr);
          failed.push(file.name);
        }
      }
      if (ok > 0 && failed.length === 0) toast.success(`تم رفع ${ok} ملف`);
      else if (ok > 0 && failed.length) toast.message(`نجح: ${ok} — فشل: ${failed.join(", ")}`);
      else if (failed.length) toast.error(`فشل رفع كل الملفات: ${failed.join(", ")}`);
      load();
      if (activeTab === "receipt" && invoiceId && ok > 0) {
        try {
          await supabase.rpc("advance_invoice_workflow" as any, {
            _invoice_id: invoiceId,
            _target: "done",
            _reason: "رفع إيصال الدفع",
          });
          const { data: inv } = await supabase
            .from("invoices")
            .select("workflow_status")
            .eq("id", invoiceId)
            .maybeSingle();
          if ((inv as any)?.workflow_status === "done") {
            toast.success("تم تحديث حالة الفاتورة إلى: تم ✅");
          } else {
            toast.message("لم تتغير حالة التجهيز — تأكد من وجود بنود ومن أن الإجمالي أكبر من صفر.");
          }
          invalidateWorkflowAutoCache(invoiceId);
          try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
          onWorkflowAdvanced?.();
        } catch (err: any) {
          console.error("advance_invoice_workflow failed", err);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const softDelete = async (att: Attachment) => {
    if (!confirm(`نقل "${att.file_name}" إلى سلة المحذوفات؟`)) return;
    const { error } = await supabase
      .from("invoice_attachments")
      .update({ deleted_at: new Date().toISOString(), deleted_reason: "user_deleted" } as any)
      .eq("id", att.id);
    if (error) return toast.error(error.message);
    toast.success("نُقل إلى السلة");
    load();
  };

  const restore = async (att: Attachment) => {
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("invoice_attachments")
      .update({ deleted_at: null, deleted_reason: null, expires_at: newExpiry } as any)
      .eq("id", att.id);
    if (error) return toast.error(error.message);
    toast.success("تم الاسترجاع");
    load();
  };

  const hardDelete = async (att: Attachment) => {
    if (!confirm(`حذف نهائي لـ "${att.file_name}"؟ لا يمكن التراجع.`)) return;
    try {
      const marker = "/invoice-attachments/";
      const idx = att.file_url.indexOf(marker);
      if (idx !== -1) {
        const path = att.file_url.slice(idx + marker.length);
        await supabase.storage.from("invoice-attachments").remove([path]);
      }
      const { error } = await supabase.from("invoice_attachments").delete().eq("id", att.id);
      if (error) throw error;
      toast.success("حُذف نهائياً");
      setItems((prev) => prev.filter((x) => x.id !== att.id));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const fmtSize = (b: number | null) => {
    if (!b) return "-";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  const isImage = (t: string | null) => t?.startsWith("image/");

  const daysLeft = (expires: string) => {
    const ms = new Date(expires).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  };

  const filtered = activeTab === "trash"
    ? items.filter((x) => x.deleted_at !== null)
    : items.filter((x) => x.deleted_at === null && x.category === activeTab);

  const countActive = (cat: Category) =>
    items.filter((x) => x.deleted_at === null && x.category === cat).length;
  const trashCount = items.filter((x) => x.deleted_at !== null).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div ref={dlgRef} className="bg-card rounded-xl border border-border shadow-2xl flex flex-col" style={{ ...dlgStyle, maxWidth: undefined, maxHeight: undefined }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Paperclip size={18} /> مستندات الفاتورة
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded transition">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-muted/20 overflow-x-auto">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = activeTab === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setActiveTab(c.key)}
                className={`flex-1 min-w-[110px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition ${
                  active
                    ? "border-primary text-primary bg-card"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={14} />
                <span>{c.label}</span>
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{countActive(c.key)}</span>
              </button>
            );
          })}
          <button
            onClick={() => setActiveTab("trash")}
            className={`flex-1 min-w-[110px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition ${
              activeTab === "trash"
                ? "border-destructive text-destructive bg-card"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Trash size={14} />
            <span>السلة</span>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{trashCount}</span>
          </button>
        </div>

        {/* Upload area (hidden in trash tab) */}
        {activeTab !== "trash" && (
          <div className="p-3 border-b border-border">
            {!invoiceId ? (
              <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3 text-center">
                يرجى حفظ الفاتورة أولاً قبل إرفاق المستندات.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-3 cursor-pointer hover:bg-muted/30 transition">
                  <Upload size={16} className="text-primary" />
                  <span className="text-xs text-foreground">
                    {uploading ? "جاري الرفع..." : "اختيار ملفات"}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    disabled={uploading}
                    onChange={(e) => { onFilesSelected(e.target.files); e.target.value = ""; }}
                    className="hidden"
                  />
                </label>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-primary/50 bg-primary/5 rounded-lg p-3 cursor-pointer hover:bg-primary/10 transition">
                  <Camera size={16} className="text-primary" />
                  <span className="text-xs text-foreground">
                    {uploading ? "جاري الرفع..." : "كاميرا"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    disabled={uploading}
                    onChange={(e) => { onFilesSelected(e.target.files); e.target.value = ""; }}
                    className="hidden"
                  />
                </label>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
              <Clock size={11} /> يُحذف المرفق تلقائياً بعد 30 يوماً من الرفع.
            </p>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {activeTab === "trash" ? "السلة فارغة" : "لا توجد مرفقات في هذه الفئة"}
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((att) => {
                const inTrash = activeTab === "trash";
                const dleft = inTrash ? 0 : daysLeft(att.expires_at);
                return (
                  <li
                    key={att.id}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition"
                  >
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {isImage(att.file_type) ? (
                        <img src={att.file_url} alt={att.file_name} className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={18} className="text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{att.file_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtSize(att.file_size)} · {new Date(att.created_at).toLocaleDateString("ar-EG")}
                      </div>
                      {inTrash ? (
                        <div className="text-[10px] text-destructive mt-0.5">
                          {att.deleted_reason === "auto_expired" ? "حذف تلقائي" : "حذف يدوي"} ·{" "}
                          {att.deleted_at && new Date(att.deleted_at).toLocaleDateString("ar-EG")}
                        </div>
                      ) : (
                        <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${dleft <= 5 ? "text-destructive" : "text-muted-foreground"}`}>
                          <Clock size={10} /> يُحذف خلال {dleft} يوم
                        </div>
                      )}
                    </div>

                    {inTrash ? (
                      <>
                        <button
                          onClick={() => restore(att)}
                          className="p-1.5 rounded hover:bg-primary/10 text-primary"
                          title="استرجاع"
                        >
                          <RotateCcw size={15} />
                        </button>
                        <button
                          onClick={() => hardDelete(att)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                          title="حذف نهائي"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-muted text-primary"
                          title="فتح/تنزيل"
                        >
                          <Download size={15} />
                        </a>
                        <button
                          onClick={() => softDelete(att)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                          title="نقل للسلة"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/80 transition"
          >
            إغلاق
          </button>
        </div>
      </div>

      <ImageCropDialog
        open={cropOpen}
        file={cropFile}
        onCancel={() => { setCropOpen(false); setCropFile(null); }}
        onConfirm={(cropped) => {
          setCropOpen(false);
          setCropFile(null);
          handleUpload(filesFromOne(cropped));
        }}
        defaultAspect="free"
        title="قص صورة المرفق"
      />
    </div>
  );
}
