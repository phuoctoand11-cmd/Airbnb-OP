import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  differenceInCalendarDays,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  supabase,
  type Booking,
  type Expense,
  type Listing,
  type Revenue,
} from "@/lib/supabase";
import { useI18n } from "@/i18n";

const CHART_COLORS = ["#0369a1", "#0d9488", "#0e7490", "#65a30d", "#ca8a04", "#dc2626", "#7c3aed"];

export default function Reports() {
  const { t } = useI18n();
  const [rangeDays, setRangeDays] = useState(90);
  const start = subDays(new Date(), rangeDays);

  const dataQuery = useQuery({
    queryKey: ["reports", rangeDays],
    queryFn: async () => {
      const [listings, bookings, revenues, expenses] = await Promise.all([
        supabase.from("listings").select("*"),
        supabase.from("bookings").select("*"),
        supabase.from("revenues").select("*").gte("received_at", format(start, "yyyy-MM-dd")),
        supabase.from("expenses").select("*").gte("spent_at", format(start, "yyyy-MM-dd")),
      ]);
      if (listings.error) throw listings.error;
      if (bookings.error) throw bookings.error;
      if (revenues.error) throw revenues.error;
      if (expenses.error) throw expenses.error;
      return {
        listings: (listings.data ?? []) as Listing[],
        bookings: (bookings.data ?? []) as Booking[],
        revenues: (revenues.data ?? []) as Revenue[],
        expenses: (expenses.data ?? []) as Expense[],
      };
    },
  });

  const monthly = useMemo(() => {
    if (!dataQuery.data) return [];
    const months = Array.from({ length: 6 }, (_, i) =>
      startOfMonth(subMonths(new Date(), 5 - i))
    );
    return months.map((m) => {
      const sameMonth = (d: string) => {
        const date = parseISO(d);
        return date.getFullYear() === m.getFullYear() && date.getMonth() === m.getMonth();
      };
      const revenue = dataQuery.data!.revenues
        .filter((r) => sameMonth(r.received_at))
        .reduce((s, r) => s + Number(r.amount), 0);
      const expense = dataQuery.data!.expenses
        .filter((e) => sameMonth(e.spent_at))
        .reduce((s, e) => s + Number(e.amount), 0);
      return {
        label: format(m, "MMM"),
        revenue,
        expense,
        profit: revenue - expense,
      };
    });
  }, [dataQuery.data]);

  const occupancyTrend = useMemo(() => {
    if (!dataQuery.data) return [];
    const listingsCount = dataQuery.data.listings.length || 1;
    const months = Array.from({ length: 6 }, (_, i) =>
      startOfMonth(subMonths(new Date(), 5 - i))
    );
    return months.map((m) => {
      const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      let bookedNights = 0;
      dataQuery.data!.bookings
        .filter((b) => b.status === "confirmed" || b.status === "completed")
        .forEach((b) => {
          const ci = parseISO(b.check_in);
          const co = parseISO(b.check_out);
          const overlapStart = ci > m ? ci : m;
          const overlapEnd = co < monthEnd ? co : monthEnd;
          const nights = differenceInCalendarDays(overlapEnd, overlapStart);
          if (nights > 0) bookedNights += nights;
        });
      const availableNights = listingsCount * monthEnd.getDate();
      return {
        label: format(m, "MMM"),
        occupancy: availableNights ? Math.round((bookedNights / availableNights) * 100) : 0,
      };
    });
  }, [dataQuery.data]);

  const topListings = useMemo(() => {
    if (!dataQuery.data) return [];
    const totals = new Map<string, number>();
    dataQuery.data.revenues.forEach((r) => {
      if (!r.listing_id) return;
      totals.set(r.listing_id, (totals.get(r.listing_id) ?? 0) + Number(r.amount));
    });
    return dataQuery.data.listings
      .map((l) => ({ name: l.title, revenue: totals.get(l.id) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [dataQuery.data]);

  const expenseByCategory = useMemo(() => {
    if (!dataQuery.data) return [];
    const map = new Map<string, number>();
    dataQuery.data.expenses.forEach((e) => {
      map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
    }));
  }, [dataQuery.data]);

  const summary = useMemo(() => {
    if (!dataQuery.data) return null;
    const revenue = dataQuery.data.revenues.reduce((s, r) => s + Number(r.amount), 0);
    const expense = dataQuery.data.expenses.reduce((s, e) => s + Number(e.amount), 0);
    const inRange = (d: string) =>
      isWithinInterval(parseISO(d), { start, end: new Date() });
    const completed = dataQuery.data.bookings.filter(
      (b) => b.status === "completed" && inRange(b.check_out)
    ).length;
    return {
      revenue,
      expense,
      profit: revenue - expense,
      completedBookings: completed,
    };
  }, [dataQuery.data, start]);

  return (
    <AppLayout
      title={t.reports.title}
      action={
        <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">{t.reports.last30}</SelectItem>
            <SelectItem value="90">{t.reports.last90}</SelectItem>
            <SelectItem value="180">{t.reports.last180}</SelectItem>
            <SelectItem value="365">{t.reports.last365}</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {dataQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t.reports.couldNotLoad}</AlertTitle>
          <AlertDescription>{(dataQuery.error as Error).message}</AlertDescription>
        </Alert>
      ) : dataQuery.isLoading || !summary ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label={t.reports.totalRevenue} value={`$${summary.revenue.toLocaleString()}`} />
            <KpiCard label={t.reports.totalExpenses} value={`$${summary.expense.toLocaleString()}`} />
            <KpiCard
              label={t.reports.netProfit}
              value={`$${summary.profit.toLocaleString()}`}
              accent={summary.profit >= 0 ? "positive" : "negative"}
            />
            <KpiCard label={t.bookings.title} value={summary.completedBookings.toString()} />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.reports.revVsExp}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Legend />
                      <Bar dataKey="revenue" fill={CHART_COLORS[0]} name={t.reports.revenue} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" fill={CHART_COLORS[5]} name={t.reports.expense} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="profit" fill={CHART_COLORS[3]} name={t.reports.profit} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.reports.occupancyTrend}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={occupancyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        domain={[0, 100]}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="occupancy"
                        stroke={CHART_COLORS[1]}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.reports.topListings}</CardTitle>
              </CardHeader>
              <CardContent>
                {topListings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.reports.noData}</p>
                ) : (
                  <div className="space-y-3">
                    {topListings.map((l, i) => {
                      const max = topListings[0].revenue || 1;
                      const pct = (l.revenue / max) * 100;
                      return (
                        <div key={l.name}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {i + 1}. {l.name}
                            </span>
                            <span className="text-muted-foreground">${l.revenue.toFixed(0)}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.reports.expenseBreakdown}</CardTitle>
              </CardHeader>
              <CardContent>
                {expenseByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.reports.noData}</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseByCategory}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {expenseByCategory.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </AppLayout>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${
            accent === "positive" ? "text-primary" : accent === "negative" ? "text-destructive" : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
