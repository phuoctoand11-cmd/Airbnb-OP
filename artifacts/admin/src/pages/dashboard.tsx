import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  differenceInCalendarDays,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock,
  DollarSign,
  Home,
  Percent,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  supabase,
  type Booking,
  type Expense,
  type Listing,
  type Revenue,
  type Task,
} from "@/lib/supabase";

export default function Dashboard() {
  const dataQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [listings, bookings, revenues, expenses, tasks, calendar] = await Promise.all([
        supabase.from("listings").select("*"),
        supabase.from("bookings").select("*"),
        supabase.from("revenues").select("*"),
        supabase.from("expenses").select("*"),
        supabase.from("tasks").select("*"),
        supabase.from("calendar_entries").select("listing_id, date, is_available"),
      ]);
      if (listings.error) throw listings.error;
      if (bookings.error) throw bookings.error;
      if (revenues.error) throw revenues.error;
      if (expenses.error) throw expenses.error;
      if (tasks.error) throw tasks.error;
      if (calendar.error) throw calendar.error;
      return {
        listings: (listings.data ?? []) as Listing[],
        bookings: (bookings.data ?? []) as Booking[],
        revenues: (revenues.data ?? []) as Revenue[],
        expenses: (expenses.data ?? []) as Expense[],
        tasks: (tasks.data ?? []) as Task[],
        calendar: (calendar.data ?? []) as { listing_id: string; date: string; is_available: boolean }[],
      };
    },
  });

  const stats = useMemo(() => {
    if (!dataQuery.data) return null;
    const now = new Date();
    const last30Start = subDays(now, 30);

    const revenue = dataQuery.data.revenues.reduce((s, r) => s + Number(r.amount), 0);
    const expense = dataQuery.data.expenses.reduce((s, e) => s + Number(e.amount), 0);
    const completed = dataQuery.data.bookings.filter((b) => b.status === "completed").length;
    const cancelled = dataQuery.data.bookings.filter((b) => b.status === "cancelled").length;

    const listingsCount = dataQuery.data.listings.length || 1;
    let bookedNights = 0;
    dataQuery.data.bookings
      .filter((b) => b.status !== "cancelled")
      .forEach((b) => {
        const ci = parseISO(b.check_in);
        const co = parseISO(b.check_out);
        const overlapStart = ci > last30Start ? ci : last30Start;
        const overlapEnd = co < now ? co : now;
        const nights = differenceInCalendarDays(overlapEnd, overlapStart);
        if (nights > 0) bookedNights += nights;
      });
    const blockedNights = dataQuery.data.calendar.filter(
      (c) => c.is_available === false && isWithinInterval(parseISO(c.date), { start: last30Start, end: now })
    ).length;
    const availableNights = listingsCount * 30;
    const occupancyRate = availableNights
      ? Math.min(100, Math.round(((bookedNights + blockedNights) / availableNights) * 100))
      : 0;

    const tasksLast30 = dataQuery.data.tasks.filter((t) =>
      isWithinInterval(parseISO(t.created_at), { start: last30Start, end: now })
    );
    const taskCompletion = tasksLast30.length
      ? Math.round(
          (tasksLast30.filter((t) => t.status === "done").length / tasksLast30.length) * 100
        )
      : 0;

    return {
      listings: dataQuery.data.listings.length,
      bookings: dataQuery.data.bookings.length,
      completed,
      cancelled,
      revenue,
      expense,
      profit: revenue - expense,
      occupancyRate,
      taskCompletion,
    };
  }, [dataQuery.data]);

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
      return { label: format(m, "MMM"), revenue, expense };
    });
  }, [dataQuery.data]);

  const upcoming = useMemo(() => {
    if (!dataQuery.data) return [];
    const now = new Date();
    const week = subDays(now, -7);
    return dataQuery.data.bookings
      .filter(
        (b) =>
          (b.status === "confirmed" || b.status === "pending") &&
          isWithinInterval(parseISO(b.check_in), { start: now, end: week })
      )
      .sort((a, b) => a.check_in.localeCompare(b.check_in))
      .slice(0, 5);
  }, [dataQuery.data]);

  const recentBookings = useMemo(() => {
    if (!dataQuery.data) return [];
    return [...dataQuery.data.bookings]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5);
  }, [dataQuery.data]);

  const listingTitle = (id: string) =>
    dataQuery.data?.listings.find((l) => l.id === id)?.title ?? "—";

  return (
    <AppLayout title="Dashboard">
      {dataQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load dashboard</AlertTitle>
          <AlertDescription>
            {(dataQuery.error as Error).message}
            <div className="mt-2 text-xs">
              If this is the first run, make sure you've executed{" "}
              <code>artifacts/admin/supabase/schema.sql</code> in the Supabase SQL editor.
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Active listings"
              icon={<Home className="h-4 w-4" />}
              value={stats?.listings}
              loading={!stats}
            />
            <KpiCard
              label="Total bookings"
              icon={<Users className="h-4 w-4" />}
              value={stats?.bookings}
              loading={!stats}
            />
            <KpiCard
              label="Revenue"
              icon={<DollarSign className="h-4 w-4" />}
              value={stats ? `$${stats.revenue.toLocaleString()}` : undefined}
              loading={!stats}
              accent="positive"
            />
            <KpiCard
              label="Net profit"
              icon={<TrendingUp className="h-4 w-4" />}
              value={stats ? `$${stats.profit.toLocaleString()}` : undefined}
              loading={!stats}
              accent={stats && stats.profit >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Completed bookings"
              icon={<CheckCircle2 className="h-4 w-4" />}
              value={stats?.completed}
              loading={!stats}
            />
            <KpiCard
              label="Cancelled bookings"
              icon={<XCircle className="h-4 w-4" />}
              value={stats?.cancelled}
              loading={!stats}
            />
            <KpiCard
              label="Expenses"
              icon={<TrendingDown className="h-4 w-4" />}
              value={stats ? `$${stats.expense.toLocaleString()}` : undefined}
              loading={!stats}
            />
            <KpiCard
              label="Occupancy (30d)"
              icon={<Percent className="h-4 w-4" />}
              value={stats ? `${stats.occupancyRate}%` : undefined}
              loading={!stats}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Task completion (30d)"
              icon={<Activity className="h-4 w-4" />}
              value={stats ? `${stats.taskCompletion}%` : undefined}
              loading={!stats}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Revenue vs expenses (last 6 months)</CardTitle>
              </CardHeader>
              <CardContent>
                {dataQuery.isLoading ? (
                  <Skeleton className="h-72 w-full" />
                ) : (
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
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expense" fill="hsl(var(--destructive))" name="Expense" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Upcoming check-ins</CardTitle>
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {dataQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : upcoming.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No check-ins in the next 7 days.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {upcoming.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                        <div>
                          <div className="font-medium">{b.guest_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {listingTitle(b.listing_id)}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {format(parseISO(b.check_in), "MMM d")}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent bookings</CardTitle>
                <Link
                  href="/bookings"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  All bookings <ArrowRight className="inline h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {dataQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : recentBookings.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No bookings yet.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {recentBookings.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{b.guest_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {listingTitle(b.listing_id)} ·{" "}
                              {format(parseISO(b.check_in), "MMM d")} →{" "}
                              {format(parseISO(b.check_out), "MMM d")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">${Number(b.total_amount).toFixed(0)}</span>
                          <Badge variant="outline" className="capitalize">
                            {b.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
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
  icon,
  value,
  loading,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  value: number | string | undefined;
  loading?: boolean;
  accent?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div
            className={`text-2xl font-bold ${
              accent === "positive" ? "text-primary" : accent === "negative" ? "text-destructive" : ""
            }`}
          >
            {value ?? "—"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
