// Albatool list page template. Replace <Name>/<name>/<route>/fields.
// Conventions: RTL, Arabic labels, design tokens only, startsWith search,
// useTable() hook, shadcn Table + AlertDialog for delete.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTable } from "@/hooks/useData";
import { startsWithMatch } from "@/utils/searchMatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export default function <Name>Page() {
  const navigate = useNavigate();
  const { data = [], remove } = useTable("<name>");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => (data as any[]).filter((row) =>
      !q || startsWithMatch(row.name ?? "", q) || startsWithMatch(row.notes ?? "", q)
    ),
    [data, q]
  );

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success("تم الحذف");
    } catch {
      toast.error("تعذّر الحذف");
    }
  };

  return (
    <div dir="rtl" className="container mx-auto py-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">إدارة <Name></h1>
        <Button onClick={() => navigate("/<route>/create")} className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة جديد
        </Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث..."
          className="pr-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">ملاحظات</TableHead>
              <TableHead className="text-right w-28">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                  لا توجد بيانات بعد
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-right">{row.name}</TableCell>
                <TableCell className="text-right text-muted-foreground">{row.notes}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1">
                    <Button asChild size="icon" variant="ghost">
                      <Link to={`/<route>/edit/${row.id}`}><Pencil className="h-4 w-4" /></Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                          <AlertDialogDescription>
                            هل تريد حذف "{row.name}"؟ لا يمكن التراجع.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(row.id)}>حذف</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
