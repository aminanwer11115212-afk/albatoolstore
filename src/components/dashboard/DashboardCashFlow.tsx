import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCashFlowChart } from "@/hooks/useData";

interface Props {
  stats: any;
}

export default function DashboardCashFlow({ stats }: Props) {
  const income = Number(stats?.totalIncome || 0);
  const expenses = Number(stats?.totalExpenses || 0);
  const regularSales = Number(stats?.regularSales ?? stats?.totalSales ?? 0);
  const posSales = Number(stats?.posSales || 0);
  const regularSalesYear = Number(stats?.regularSalesYear || 0);
  const posSalesYear = Number(stats?.posSalesYear || 0);
  const { data: chartData } = useCashFlowChart();

  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2 border-b border-border">
        <CardTitle className="text-base font-bold">تدفق مالي</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-3">عرض رسومي للدخل والمنصرفات التي تمت في آخر 30 يوما.</p>

        {/* Chart */}
        <div className="h-[250px] mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData || []} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={50} />
              <Tooltip
                labelFormatter={formatDate}
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString()}`,
                  name === "income" ? "الإيرادات" : "المصروفات"
                ]}
                contentStyle={{ fontSize: 12, direction: "rtl" }}
              />
              <Legend formatter={(value) => value === "income" ? "الإيرادات" : "المصروفات"} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" fill="#22c55e" radius={[2, 2, 0, 0]} name="income" />
              <Bar dataKey="expense" fill="#ef4444" radius={[2, 2, 0, 0]} name="expense" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Tabs */}
        <Tabs defaultValue="income" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-3">
            <TabsTrigger value="income" className="text-xs">الإيرادات</TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs">المصروفات</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">المبيعات</TabsTrigger>
          </TabsList>
          <TabsContent value="income">
            <div className="text-center py-3">
              <p className="text-2xl font-bold text-green-600">{income.toLocaleString()} </p>
              <p className="text-xs text-muted-foreground mt-1">إجمالي الإيرادات</p>
            </div>
          </TabsContent>
          <TabsContent value="expenses">
            <div className="text-center py-3">
              <p className="text-2xl font-bold text-destructive">{expenses.toLocaleString()} </p>
              <p className="text-xs text-muted-foreground mt-1">إجمالي المصروفات</p>
            </div>
          </TabsContent>
          <TabsContent value="sales">
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="text-center rounded-lg border border-primary/30 p-3">
                <p className="text-[11px] text-muted-foreground mb-1">📄 مبيعات الحسابات</p>
                <p className="text-xl font-bold text-primary">{regularSales.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-1">هذا العام: {regularSalesYear.toLocaleString()}</p>
              </div>
              <div className="text-center rounded-lg border border-amber-400/50 bg-amber-50/40 dark:bg-amber-500/5 p-3">
                <p className="text-[11px] text-amber-700 mb-1">🛒 مبيعات الكاش</p>
                <p className="text-xl font-bold text-amber-600">{posSales.toLocaleString()}</p>
                <p className="text-[10px] text-amber-700/80 mt-1">هذا العام: {posSalesYear.toLocaleString()}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
