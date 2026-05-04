import { Fragment, useMemo, useState } from "react";
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
import { ChevronDown, ChevronUp } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  supabase,
  type Booking,
  type Expense,
  type Listing,
  type Revenue,
} from "@/lib/supabase";
import { useI18n } from "@/i18n";
import { useCurrency } from "@/lib/currency";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#0369a1",
  "#0d9488",
  "#0e7490",
  "#65a30d",
  "#ca8a04",
  "#dc2626",
  "#7c3aed",
];

const EXPENSE_CATEGORIES = [
  "cleaning",
  "supplies",
  "maintenance",
  "utilities",
  "marketing",
  "platform_fees",
  "other",
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface ListingRow {
  listing: Listing;
  revenue: number;
  expenses: number;
  profit: number;
  bookingCount: number;
  avgRevPerBooking: number;
  expenseRatio: number;
}

interface DrillData {
  listing: Listing;
  revenues: Revenue[];
  expenses: Expense[];
  bookings: Booking[];
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  catBreakdown: [string, number][];
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Reports() {
  const { t } = useI18n();
  const { fmt } = useCurrency();

  // Filters
  const [rangeDays, setRangeDays] = useState(90);
  const [listingFilter, setListingFilter] = useState("all");
  const [expCategoryFilter, setExpCategoryFilter] = useState("all");
  const [drillListingId, setDrillListingId] = useState<string | null>(null);

  const start = subDays(new Date(), rangeDays);
  const startStr = format(start, "yyyy-MM-dd");

  // ── Data fetch (date range pre-filtered on server) ─────────────────────────
  const dataQuery = useQuery({
    queryKey: ["reports", rangeDays],
    queryFn: async () => {
      const [listings, bookings, revenues, expenses] = await Promise.all([
        supabase.from("listings").select("*"),
        supabase.from("bookings").select("*"),
        supabase
          .from("revenues")
          .select("*")
          .gte("received_at", startStr),
        supabase
          .from("expenses")
          .select("*")
          .gte("spent_at", startStr),
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

  // ── Client-side filtered slices ────────────────────────────────────────────
  // revenues filtered by listing
  const filteredRevenues = useMemo(() => {
    if (!dataQuery.data) return [];
    return dataQuery.data.revenues.filter(
      (r) => listingFilter === "all" || r.listing_id === listingFilter
    );
  }, [dataQuery.data, listingFilter]);

  // expenses filtered by listing + category
  const filteredExpenses = useMemo(() => {
    if (!dataQuery.data) return [];
    return dataQuery.data.expenses.filter(
      (e) =>
        (listingFilter === "all" || e.listing_id === listingFilter) &&
        (expCategoryFilter === "all" || e.category === expCategoryFilter)
    );
  }, [dataQuery.data, listingFilter, expCategoryFilter]);

  // ── Step 1: Aggregate revenues by listing (Map — no cross-product) ─────────
  const revByListing = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredRevenues) {
      if (r.listing_id)
        m.set(r.listing_id, (m.get(r.listing_id) ?? 0) + Number(r.amount));
    }
    return m;
  }, [filteredRevenues]);

  // ── Step 2: Aggregate expenses by listing (separate Map — no cross-product) ─
  const expByListing = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filteredExpenses) {
      if (e.listing_id)
        m.set(e.listing_id, (m.get(e.listing_id) ?? 0) + Number(e.amount));
    }
    return m;
  }, [filteredExpenses]);

  // ── Step 3: Join both aggregates to listings (profit = revenue − expenses) ──
  // Never joins raw revenue rows to raw expense rows; each side is already summed.
  const listingPnL = useMemo((): ListingRow[] => {
    if (!dataQuery.data) return [];
    const scope =
      listingFilter === "all"
        ? dataQuery.data.listings
        : dataQuery.data.listings.filter((l) => l.id === listingFilter);

    return scope
      .map((l) => {
        const revenue = revByListing.get(l.id) ?? 0;
        const expenses = expByListing.get(l.id) ?? 0;
        const profit = revenue - expenses;
        const confirmedBookings = dataQuery.data!.bookings.filter(
          (b) =>
            b.listing_id === l.id &&
            (b.status === "completed" || b.status === "confirmed")
        );
        const bookingCount = confirmedBookings.length;
        const avgRevPerBooking = bookingCount > 0 ? revenue / bookingCount : 0;
        const expenseRatio = revenue > 0 ? (expenses / revenue) * 100 : 0;
        return { listing: l, revenue, expenses, profit, bookingCount, avgRevPerBooking, expenseRatio };
      })
      .filter((row) => row.revenue > 0 || row.expenses > 0)
      .sort((a, b) => b.profit - a.profit);
  }, [dataQuery.data, revByListing, expByListing, listingFilter]);

  // ── Monthly trend (filtered) ───────────────────────────────────────────────
  const monthly = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) =>
      startOfMonth(subMonths(new Date(), 5 - i))
    );
    return months.map((m) => {
      const sameMonth = (d: string) => {
        const date = parseISO(d);
        return (
          date.getFullYear() === m.getFullYear() &&
          date.getMonth() === m.getMonth()
        );
      };
      const revenue = filteredRevenues
        .filter((r) => sameMonth(r.received_at))
        .reduce((s, r) => s + Number(r.amount), 0);
      const expense = filteredExpenses
        .filter((e) => sameMonth(e.spent_at))
        .reduce((s, e) => s + Number(e.amount), 0);
      return { label: format(m, "MMM"), revenue, expense, profit: revenue - expense };
    });
  }, [filteredRevenues, filteredExpenses]);

  // ── Occupancy trend (filtered by listing) ─────────────────────────────────
  const occupancyTrend = useMemo(() => {
    if (!dataQuery.data) return [];
    const scopeListings =
      listingFilter === "all"
        ? dataQuery.data.listings
        : dataQuery.data.listings.filter((l) => l.id === listingFilter);
    const listingsCount = scopeListings.length || 1;
    const months = Array.from({ length: 6 }, (_, i) =>
      startOfMonth(subMonths(new Date(), 5 - i))
    );
    return months.map((m) => {
      const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      let bookedNights = 0;
      dataQuery.data!.bookings
        .filter(
          (b) =>
            (b.status === "confirmed" || b.status === "completed") &&
            (listingFilter === "all" || b.listing_id === listingFilter)
        )
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
        occupancy: availableNights
          ? Math.round((bookedNights / availableNights) * 100)
          : 0,
      };
    });
  }, [dataQuery.data, listingFilter]);

  // ── Expense by category (uses filtered expenses) ───────────────────────────
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses)
      map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [filteredExpenses]);

  // ── Summary KPIs ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!dataQuery.data) return null;
    const revenue = filteredRevenues.reduce((s, r) => s + Number(r.amount), 0);
    const expense = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const inRange = (d: string) =>
      isWithinInterval(parseISO(d), { start, end: new Date() });
    const completed = dataQuery.data.bookings.filter(
      (b) =>
        b.status === "completed" &&
        inRange(b.check_out) &&
        (listingFilter === "all" || b.listing_id === listingFilter)
    ).length;
    return { revenue, expense, profit: revenue - expense, completedBookings: completed };
  }, [dataQuery.data, filteredRevenues, filteredExpenses, listingFilter, start]);

  // ── Drilldown data for selected listing ───────────────────────────────────
  const drillData = useMemo((): DrillData | null => {
    if (!drillListingId || !dataQuery.data) return null;
    const listing = dataQuery.data.listings.find((l) => l.id === drillListingId);
    if (!listing) return null;

    // Use raw (unfiltered by category) revenues/expenses for the drilldown
    // so the detail view always shows the full picture for that listing.
    const revs = dataQuery.data.revenues.filter((r) => r.listing_id === drillListingId);
    const exps = dataQuery.data.expenses.filter((e) => e.listing_id === drillListingId);
    const bkgs = dataQuery.data.bookings.filter((b) => b.listing_id === drillListingId);

    const totalRevenue = revs.reduce((s, r) => s + Number(r.amount), 0);
    const totalExpenses = exps.reduce((s, e) => s + Number(e.amount), 0);

    const catMap = new Map<string, number>();
    for (const e of exps)
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + Number(e.amount));

    return {
      listing,
      revenues: revs.sort((a, b) => b.received_at.localeCompare(a.received_at)),
      expenses: exps.sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
      bookings: bkgs.sort((a, b) => b.check_in.localeCompare(a.check_in)),
      totalRevenue,
      totalExpenses,
      profit: totalRevenue - totalExpenses,
      catBreakdown: Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [drillListingId, dataQuery.data]);

  const listings = dataQuery.data?.listings ?? [];
  const hasFilters = listingFilter !== "all" || expCategoryFilter !== "all";

  function clearFilters() {
    setListingFilter("all");
    setExpCategoryFilter("all");
    setDrillListingId(null);
  }

  return (
    <AppLayout
      title={t.reports.title}
      action={
        <Select
          value={String(rangeDays)}
          onValueChange={(v) => {
            setRangeDays(Number(v));
            setDrillListingId(null);
          }}
        >
          <SelectTrigger className="w-[150px]">
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
      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select
          value={listingFilter}
          onValueChange={(v) => {
            setListingFilter(v);
            setDrillListingId(null);
          }}
        >
          <SelectTrigger className="w-[210px]">
            <SelectValue placeholder="All listings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All listings</SelectItem>
            {listings.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={expCategoryFilter} onValueChange={setExpCategoryFilter}>
          <SelectTrigger className="w-[210px]">
            <SelectValue placeholder="All expense categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All expense categories</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <button
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}
      </div>

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
          {/* ── KPI cards ───────────────────────────────────────────────── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label={t.reports.totalRevenue} value={fmt(summary.revenue)} />
            <KpiCard label={t.reports.totalExpenses} value={fmt(summary.expense)} />
            <KpiCard
              label={t.reports.netProfit}
              value={fmt(summary.profit)}
              accent={summary.profit >= 0 ? "positive" : "negative"}
            />
            <KpiCard
              label={t.bookings.title}
              value={summary.completedBookings.toString()}
            />
          </div>

          {/* ── Charts ──────────────────────────────────────────────────── */}
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.reports.revVsExp}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="label"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="revenue"
                        fill={CHART_COLORS[0]}
                        name={t.reports.revenue}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="expense"
                        fill={CHART_COLORS[5]}
                        name={t.reports.expense}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="profit"
                        fill={CHART_COLORS[3]}
                        name={t.reports.profit}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t.reports.occupancyTrend}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={occupancyTrend}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="label"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
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

          {/* ── Listing financial report table ───────────────────────────── */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Listing Financial Report</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {listingPnL.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {t.reports.noData}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Listing</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead className="text-right">Avg Rev / Booking</TableHead>
                      <TableHead className="text-right">Expense Ratio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listingPnL.map((row) => {
                      const isDrill = drillListingId === row.listing.id;
                      return (
                        <Fragment key={row.listing.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/60"
                            onClick={() =>
                              setDrillListingId(isDrill ? null : row.listing.id)
                            }
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {isDrill ? (
                                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                                {row.listing.title}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-primary">
                              {fmt(row.revenue)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-destructive">
                              {fmt(row.expenses)}
                            </TableCell>
                            <TableCell
                              className={`text-right tabular-nums font-semibold ${
                                row.profit >= 0
                                  ? "text-primary"
                                  : "text-destructive"
                              }`}
                            >
                              {fmt(row.profit)}
                            </TableCell>
                            <TableCell className="text-right">
                              {row.bookingCount}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt(row.avgRevPerBooking)}
                            </TableCell>
                            <TableCell className="text-right">
                              {row.revenue > 0 ? (
                                <Badge
                                  variant={
                                    row.expenseRatio > 80
                                      ? "destructive"
                                      : row.expenseRatio > 50
                                      ? "secondary"
                                      : "outline"
                                  }
                                >
                                  {row.expenseRatio.toFixed(1)}%
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>

                          {isDrill && drillData && (
                            <TableRow>
                              <TableCell colSpan={7} className="p-0">
                                <DrilldownPanel data={drillData} fmt={fmt} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ── Bottom charts ────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.reports.topListings}</CardTitle>
              </CardHeader>
              <CardContent>
                {listingPnL.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t.reports.noData}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {listingPnL.slice(0, 5).map((row, i) => {
                      const max = listingPnL[0].revenue || 1;
                      const pct = (row.revenue / max) * 100;
                      return (
                        <div key={row.listing.id}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {i + 1}. {row.listing.title}
                            </span>
                            <span className="text-muted-foreground">
                              {fmt(row.revenue)}
                            </span>
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
                <CardTitle className="text-base">
                  {t.reports.expenseBreakdown}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {expenseByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t.reports.noData}
                  </p>
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
                            <Cell
                              key={i}
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                            />
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

// ── Drilldown panel ────────────────────────────────────────────────────────────

function DrilldownPanel({
  data,
  fmt,
}: {
  data: DrillData;
  fmt: (v: number | null | undefined) => string;
}) {
  return (
    <div className="border-t bg-muted/20 px-6 py-5">
      <p className="mb-3 text-sm font-semibold text-muted-foreground">
        {data.listing.title} — Period Detail
      </p>

      {/* Summary mini-cards */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Revenue</div>
          <div className="text-xl font-bold text-primary">
            {fmt(data.totalRevenue)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Expenses</div>
          <div className="text-xl font-bold text-destructive">
            {fmt(data.totalExpenses)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Profit</div>
          <div
            className={`text-xl font-bold ${
              data.profit >= 0 ? "text-primary" : "text-destructive"
            }`}
          >
            {fmt(data.profit)}
          </div>
        </div>
      </div>

      {/* Revenue + Expense tables side by side */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {/* Revenues */}
        <div>
          <p className="mb-2 text-sm font-medium">
            Revenues ({data.revenues.length})
          </p>
          {data.revenues.length === 0 ? (
            <p className="text-sm text-muted-foreground">None in this period.</p>
          ) : (
            <div className="overflow-hidden rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.revenues.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        {format(parseISO(r.received_at), "MMM d, yyyy")}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {r.category.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-primary">
                        {fmt(Number(r.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expenses */}
        <div>
          <p className="mb-2 text-sm font-medium">
            Expenses ({data.expenses.length})
          </p>
          {data.expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">None in this period.</p>
          ) : (
            <div className="overflow-hidden rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        {format(parseISO(e.spent_at), "MMM d, yyyy")}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {e.category.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-destructive">
                        {fmt(Number(e.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Expense category breakdown */}
      {data.catBreakdown.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Expense Category Breakdown</p>
          <div className="flex flex-wrap gap-2">
            {data.catBreakdown.map(([cat, amt]) => (
              <div
                key={cat}
                className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
              >
                <span className="capitalize text-muted-foreground">
                  {cat.replace(/_/g, " ")}
                </span>
                <span className="font-mono font-medium text-destructive">
                  {fmt(amt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────────

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
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${
            accent === "positive"
              ? "text-primary"
              : accent === "negative"
              ? "text-destructive"
              : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
