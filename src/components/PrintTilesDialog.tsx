import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText,
  Printer,
  FileMinus,
  List,
  Calculator,
  EyeOff,
  ListMinus,
  CalculatorIcon,
} from "lucide-react";
import type { PrintVariant } from "./PrintMenu";

interface PrintTilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (variant: PrintVariant, noHeader: boolean) => void;
  docType?: "invoice" | "quote" | "purchase" | "return";
}

const docTitle = (t: PrintTilesDialogProps["docType"]) => {
  switch (t) {
    case "quote": return "عرض السعر";
    case "purchase": return "أمر الشراء";
    case "return": return "المرتجع";
    default: return "الفاتورة";
  }
};

interface TileDef {
  variant: PrintVariant;
  noHeader: boolean;
  label: string;
  Icon: typeof Printer;
}

export default function PrintTilesDialog({
  open,
  onOpenChange,
  onPick,
  docType = "invoice",
}: PrintTilesDialogProps) {
  const t = docTitle(docType);
  const fem = docType === "invoice" || docType === "return" ? "ة" : "";

  const tiles: TileDef[] = [
    { variant: "full",         noHeader: false, label: "PDF",                  Icon: FileText },
    { variant: "full",         noHeader: false, label: `${t} كامل${fem}`,      Icon: Printer },
    { variant: "no-account",   noHeader: false, label: "بدون حساب",            Icon: EyeOff },
    { variant: "account-only", noHeader: false, label: "حساب فقط",             Icon: Calculator },
    { variant: "no-details",   noHeader: false, label: "بدون تفاصيل",          Icon: List },
    { variant: "full",         noHeader: true,  label: `${t} بدون ترويسة`,     Icon: FileMinus },
    { variant: "no-account",   noHeader: true,  label: "بدون حساب/ترويسة",     Icon: EyeOff },
    { variant: "account-only", noHeader: true,  label: "حساب/بدون ترويسة",     Icon: CalculatorIcon },
    { variant: "no-details",   noHeader: true,  label: "بدون تفاصيل/ترويسة",   Icon: ListMinus },
  ];

  const handlePick = (tile: TileDef) => {
    onOpenChange(false);
    onPick(tile.variant, tile.noHeader);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-md p-3 sm:p-4"
      >
        <DialogHeader className="mb-2">
          <DialogTitle className="text-center text-sm">خيارات الطباعة</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {tiles.map((tile, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handlePick(tile)}
              className="group flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-gradient-to-br from-primary/90 to-primary text-primary-foreground p-2 aspect-square shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:from-primary hover:to-primary/80 transition-all duration-150"
            >
              <tile.Icon className="w-5 h-5 opacity-90 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-semibold text-center leading-tight px-0.5">
                {tile.label}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
