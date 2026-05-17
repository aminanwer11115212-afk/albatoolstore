import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

interface Props {
  products: any[];
}

export default function DashboardStockAlert({ products }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="h-full">
      <CardHeader className="p-4 pb-2 border-b border-border">
        <CardTitle className="text-base font-bold">تنبيه المخزون</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border max-h-[500px] overflow-y-auto">
          {products.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-muted-foreground">
              لا توجد منتجات منخفضة المخزون
            </li>
          ) : (
            products.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors">
                <button
                  onClick={() => navigate("/products")}
                  className="text-xs text-primary hover:underline truncate max-w-[70%] text-right"
                >
                  {p.name}
                </button>
                <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-destructive text-white min-w-[32px] text-center">
                  {p.stock_quantity ?? 0}
                </span>
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
