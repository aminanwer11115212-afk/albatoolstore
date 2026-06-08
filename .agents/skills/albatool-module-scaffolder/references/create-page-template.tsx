// Albatool create/edit page template. Replace <Name>/<name>/<route>.
// Conventions: RHF + Zod (Arabic messages), useTable insert/update,
// shadcn Input/Textarea, design tokens, RTL.

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTable } from "@/hooks/useData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function <Name>CreatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data = [], insert, update } = useTable("<name>");
  const editing = (data as any[]).find((r) => r.id === id);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", notes: "" },
  });

  useEffect(() => {
    if (editing) form.reset({ name: editing.name ?? "", notes: editing.notes ?? "" });
  }, [editing, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (id) {
        await update.mutateAsync({ id, ...values });
        toast.success("تم التحديث بنجاح");
      } else {
        await insert.mutateAsync(values);
        toast.success("تم الحفظ بنجاح");
      }
      navigate(-1);
    } catch {
      toast.error("حدث خطأ، حاول مرة أخرى");
    }
  };

  return (
    <div dir="rtl" className="container mx-auto py-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {id ? "تعديل" : "إضافة"} <Name>
      </h1>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 bg-card border border-border rounded-lg p-6">
        <div className="space-y-2">
          <Label htmlFor="name">الاسم</Label>
          <Input id="name" {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">ملاحظات</Label>
          <Textarea id="notes" rows={4} {...form.register("notes")} />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>إلغاء</Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </form>
    </div>
  );
}
