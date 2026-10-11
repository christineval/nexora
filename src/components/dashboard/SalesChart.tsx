"use client";
import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { ChartTransaction } from "@/types/views";
import { useTheme } from "@/components/layout/ThemeProvider";
type Period = "daily" | "weekly" | "monthly" | "yearly";
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
function periodKey(timestamp: string, period: Period) {
  const parts = dateFormatter.formatToParts(new Date(timestamp));
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  if (period === "yearly") return day.slice(0, 4);
  if (period === "monthly") return day.slice(0, 7);
  if (period === "weekly") {
    const date = new Date(day + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return date.toISOString().slice(0, 10);
  }
  return day;
}
export default function SalesChart({ transactions }: { transactions: ChartTransaction[] }) {
  const theme = useTheme();
  const [period, setPeriod] = useState<Period>("daily");
  const grouped = new Map<string, { label: string; sales: number; purchase: number }>();
  for (const transaction of transactions) {
    const label = periodKey(transaction.timestamp, period);
    const bucket = grouped.get(label) ?? { label, sales: 0, purchase: 0 };
    bucket[transaction.type] += transaction.amount;
    grouped.set(label, bucket);
  }
  const data = [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label));
  return <div className="bg-white dark:bg-[#191919] border border-gray-200 dark:border-[#303030] shadow-sm rounded-2xl p-5 h-[400px]">
    <div className="flex justify-between items-center mb-5 gap-4"><h3 className="text-lg font-semibold">Sales &amp; Purchase</h3>
      <select aria-label="Chart period" value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="rounded border border-gray-300 bg-white p-2 dark:border-[#404040] dark:bg-[#111111]">
        <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
      </select>
    </div>
    {data.length ? <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }} barGap="-5%" barCategoryGap="20%"><CartesianGrid className="stroke-gray-200 dark:stroke-[#404040]" strokeDasharray="4 4" vertical={false} />
        <XAxis className="text-gray-500 dark:text-[#aaaaaa]" dataKey="label" tick={{ fill: "currentColor" }} />
        <YAxis width="auto" tickMargin={8} className="text-gray-500 dark:text-[#aaaaaa]" tick={{ fill: "currentColor", fontSize: 12 }} tickFormatter={(value) => formatCurrency(Number(value))} />
        <Tooltip cursor={{ className: "fill-gray-100 dark:fill-[#303030]" }} content={({ active, payload, label }) => active && payload?.length ? (
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm dark:border-[#404040] dark:bg-[#191919] dark:text-[#f5f5f5]">
            <p className="mb-2 font-medium">{label}</p>
            {payload.map((entry) => <p key={String(entry.dataKey)} className={entry.dataKey === "sales" ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}>{entry.name}: {formatCurrency(Number(entry.value))}</p>)}
          </div>
        ) : null} /><Legend />
        <Bar dataKey="purchase" fill={theme === "dark" ? "#9ca3af" : "#3A3A3A"} radius={[5, 5, 0, 0]} name="Total Purchase" />
        <Bar dataKey="sales" fill="#DC2626" radius={[5, 5, 0, 0]} name="Total Sales" />
      </BarChart>
    </ResponsiveContainer> : <div className="flex h-[280px] items-center justify-center text-gray-500 dark:text-[#aaaaaa]">No completed sales or received purchases yet.</div>}
  </div>;
}
