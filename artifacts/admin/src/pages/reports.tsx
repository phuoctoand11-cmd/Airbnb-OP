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
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns";
import { AlertCircle, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DateRangePicker } from "@/components/ui/date-range-picker";
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
  type Payment,
  type Revenue,
} from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n";
import { useCurrency } from "@/lib/currency";
import {
  exportExcel,
  exportCSVMain,
  exportCSVRevenue,
  exportCSVExpense,
  exportCSVCashflow,
  type ExportData,
} from "@/lib/export-reports";

// ── Constants ──────────────────────────────────────────────────────────────────

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

// Only these categories count as recognised P&L revenue.
// Old categories ("booking", "deposit", "refund", "booking_balance") are excluded.
const RECOGNIZED_REVENUE_CATEGORIES = ["booking_revenue", "cancellation_revenue", "extra", "other"];

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
  payments: Payment[];
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  catBreakdown: [string, number][];
  totalCashIn: number;
  totalRefunds: number;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Reports() {
  const { t } = useI18n();
  const { fmt } = useCurrency();
  const { role } = useAuth();

  const canExport =
    role === "admin" || role === "manager" || role === "accountant";

  // ── Filter state ───────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState<Date>(() => subDays(new Date(), 90));
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const [listingFilter, setListingFilter] = useState("all");
  const [expCategoryFilter, setExpCategoryFilter] = useState("all");
  const [drillListingId, setDrillListingId] = useState<string | null>(null);
  const [cashflowModalOpen, setCashflowModalOpen] = useState(false);
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [profitModalOpen, setProfitModalOpen] = useState(false);
  const [bookingsModalOpen, setBookingsModalOpen] = useState(false);
  const [listingDetailModalId, setListingDetailModalId] = useState<string | null>(null);

  // ── Derived date strings ───────────────────────────────────────────────────
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  // ── Data fetch ─────────────────────────────────────────────────────────────
  // revenues filtered by received_at BETWEEN startStr AND endStr
  // expenses filtered by spent_at    BETWEEN startStr AND endStr
  // bookings fetched unfiltered (client-side date checks apply)
  const dataQuery = useQuery({
    queryKey: ["reports", startStr, endStr],
    queryFn: async () => {
      const [listings, bookings, revenues, expenses, payments] = await Promise.all([
        supabase.from("listings").select("*"),
        supabase.from("bookings").select("*"),
        supabase
          .from("revenues")
          .select("*")
          .gte("received_at", startStr)
          .lte("received_at", endStr),
        supabase
          .from("expenses")
          .select("*")
          .gte("spent_at", startStr)
          .lte("spent_at", endStr),
        supabase
          .from("payments")
          .select("*")
          .gte("paid_at", `${startStr}T00:00:00`)
          .lte("paid_at", `${endStr}T23:59:59`),
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
        payments: (payments.data ?? []) as Payment[],
      };
    },
  });

  // ── Client-side filtered slices ────────────────────────────────────────────

  const filteredRevenues = useMemo(() => {
    if (!dataQuery.data) return [];
    return dataQuery.data.revenues.filter(
      (r) =>
        RECOGNIZED_REVENUE_CATEGORIES.includes(r.category) &&
        (listingFilter === "all" || r.listing_id === listingFilter)
    );
  }, [dataQuery.data, listingFilter]);

  const filteredExpenses = useMemo(() => {
    if (!dataQuery.data) return [];
    return dataQuery.data.expenses.filter(
      (e) =>
        (listingFilter === "all" || e.listing_id === listingFilter) &&
        (expCategoryFilter === "all" || e.category === expCategoryFilter)
    );
  }, [dataQuery.data, listingFilter, expCategoryFilter]);

  const filteredPayments = useMemo(() => {
    if (!dataQuery.data) return [];
    return (dataQuery.data.payments ?? []).filter(
      (p) => listingFilter === "all" || p.listing_id === listingFilter
    );
  }, [dataQuery.data, listingFilter]);

  const filteredBookings = useMemo(() => {
    if (!dataQuery.data) return [];
    return dataQuery.data.bookings.filter(
      (b) =>
        isWithinInterval(parseISO(b.check_in), { start: startDate, end: endDate }) &&
        (listingFilter === "all" || b.listing_id === listingFilter)
    );
  }, [dataQuery.data, listingFilter, startDate, endDate]);

  // ── Monthly cashflow trend (actual cash in/out from payments table) ────────
  const cashflow = useMemo(() => {
    const months: Date[] = [];
    let m = startOfMonth(startDate);
    const endMonth = startOfMonth(endDate);
    while (m <= endMonth && months.length < 12) {
      months.push(m);
      m = addMonths(m, 1);
    }
    if (months.length === 0) months.push(startOfMonth(startDate));

    return months.map((mo) => {
      const sameMonth = (d: string) => {
        const date = new Date(d);
        return (
          date.getFullYear() === mo.getFullYear() &&
          date.getMonth() === mo.getMonth()
        );
      };
      const cash_in = filteredPayments
        .filter(
          (p) =>
            p.status === "paid" &&
            (p.payment_type === "deposit" || p.payment_type === "balance") &&
            sameMonth(p.paid_at)
        )
        .reduce((s, p) => s + Number(p.amount), 0);
      const refunds = filteredPayments
        .filter((p) => p.payment_type === "refund" && sameMonth(p.paid_at))
        .reduce((s, p) => s + Number(p.amount), 0);
      return {
        label: format(mo, months.length > 6 ? "MMM yy" : "MMM"),
        cash_in,
        refunds,
        net: cash_in - refunds,
      };
    });
  }, [filteredPayments, startDate, endDate]);

  // ── Step 1: Aggregate revenues by listing (Map — no cross-product) ─────────
  const revByListing = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredRevenues) {
      if (r.listing_id)
        m.set(r.listing_id, (m.get(r.listing_id) ?? 0) + Number(r.amount));
    }
    return m;
  }, [filteredRevenues]);

  // ── Step 2: Aggregate expenses by listing (separate Map) ───────────────────
  const expByListing = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filteredExpenses) {
      if (e.listing_id)
        m.set(e.listing_id, (m.get(e.listing_id) ?? 0) + Number(e.amount));
    }
    return m;
  }, [filteredExpenses]);

  // ── Step 3: Join both aggregates to listings (profit = revenue − expenses) ──
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
            (b.status === "completed" || b.status === "confirmed") &&
            isWithinInterval(parseISO(b.check_in), { start: startDate, end: endDate })
        );
        const bookingCount = confirmedBookings.length;
        const avgRevPerBooking = bookingCount > 0 ? revenue / bookingCount : 0;
        const expenseRatio = revenue > 0 ? (expenses / revenue) * 100 : 0;
        return { listing: l, revenue, expenses, profit, bookingCount, avgRevPerBooking, expenseRatio };
      })
      .filter((row) => row.revenue > 0 || row.expenses > 0)
      .sort((a, b) => b.profit - a.profit);
  }, [dataQuery.data, revByListing, expByListing, listingFilter, startDate, endDate]);

  // ── Monthly trend (months within selected range, max 12) ──────────────────
  const monthly = useMemo(() => {
    const months: Date[] = [];
    let m = startOfMonth(startDate);
    const endMonth = startOfMonth(endDate);
    while (m <= endMonth && months.length < 12) {
      months.push(m);
      m = addMonths(m, 1);
    }
    if (months.length === 0) months.push(startOfMonth(startDate));

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
      return {
        label: format(m, months.length > 6 ? "MMM yy" : "MMM"),
        revenue,
        expense,
        profit: revenue - expense,
      };
    });
  }, [filteredRevenues, filteredExpenses, startDate, endDate]);

  // ── Occupancy trend (months within selected range, max 12) ────────────────
  const occupancyTrend = useMemo(() => {
    if (!dataQuery.data) return [];
    const scopeListings =
      listingFilter === "all"
        ? dataQuery.data.listings
        : dataQuery.data.listings.filter((l) => l.id === listingFilter);
    const listingsCount = scopeListings.length || 1;

    const months: Date[] = [];
    let m = startOfMonth(startDate);
    const endMonth = startOfMonth(endDate);
    while (m <= endMonth && months.length < 12) {
      months.push(m);
      m = addMonths(m, 1);
    }
    if (months.length === 0) months.push(startOfMonth(startDate));

    return months.map((m) => {
      const monthEnd = endOfMonth(m);
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
      const daysInMonth = monthEnd.getDate();
      const availableNights = listingsCount * daysInMonth;
      return {
        label: format(m, months.length > 6 ? "MMM yy" : "MMM"),
        occupancy: availableNights
          ? Math.round((bookedNights / availableNights) * 100)
          : 0,
      };
    });
  }, [dataQuery.data, listingFilter, startDate, endDate]);

  // ── Expense by category (filtered) ────────────────────────────────────────
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
    const cashIn = filteredPayments
      .filter(
        (p) =>
          p.status === "paid" &&
          (p.payment_type === "deposit" ||
            p.payment_type === "balance" ||
            p.payment_type === "cancellation_fee")
      )
      .reduce((s, p) => s + Number(p.amount), 0);
    const inRange = (d: string) =>
      isWithinInterval(parseISO(d), { start: startDate, end: endDate });
    const completed = dataQuery.data.bookings.filter(
      (b) =>
        b.status === "completed" &&
        inRange(b.check_out) &&
        (listingFilter === "all" || b.listing_id === listingFilter)
    ).length;
    return { revenue, expense, profit: revenue - expense, completedBookings: completed, cashIn };
  }, [dataQuery.data, filteredRevenues, filteredExpenses, filteredPayments, listingFilter, startDate, endDate]);

  // ── Drilldown data ─────────────────────────────────────────────────────────
  const drillData = useMemo((): DrillData | null => {
    if (!drillListingId || !dataQuery.data) return null;
    const listing = dataQuery.data.listings.find((l) => l.id === drillListingId);
    if (!listing) return null;
    // Revenues: only recognised P&L categories (booking_revenue, cancellation_revenue, extra, other)
    const revs = dataQuery.data.revenues.filter(
      (r) => r.listing_id === drillListingId && RECOGNIZED_REVENUE_CATEGORIES.includes(r.category)
    );
    const exps = dataQuery.data.expenses.filter((e) => e.listing_id === drillListingId);
    const bkgs = dataQuery.data.bookings.filter(
      (b) =>
        b.listing_id === drillListingId &&
        isWithinInterval(parseISO(b.check_in), { start: startDate, end: endDate })
    );
    const pmts = (dataQuery.data.payments ?? []).filter(
      (p) => p.listing_id === drillListingId
    );
    const totalRevenue = revs.reduce((s, r) => s + Number(r.amount), 0);
    const totalExpenses = exps.reduce((s, e) => s + Number(e.amount), 0);
    const totalCashIn = pmts
      .filter((p) => p.status === "paid" && (p.payment_type === "deposit" || p.payment_type === "balance"))
      .reduce((s, p) => s + Number(p.amount), 0);
    const totalRefunds = pmts
      .filter((p) => p.payment_type === "refund")
      .reduce((s, p) => s + Number(p.amount), 0);
    const catMap = new Map<string, number>();
    for (const e of exps)
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + Number(e.amount));
    return {
      listing,
      revenues: revs.sort((a, b) => b.received_at.localeCompare(a.received_at)),
      expenses: exps.sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
      bookings: bkgs.sort((a, b) => b.check_in.localeCompare(a.check_in)),
      payments: pmts.sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
      totalRevenue,
      totalExpenses,
      profit: totalRevenue - totalExpenses,
      catBreakdown: Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]),
      totalCashIn,
      totalRefunds,
    };
  }, [drillListingId, dataQuery.data, startDate, endDate]);

  // ── Export payload (respects all active filters) ───────────────────────────
  const exportPayload = useMemo((): ExportData | null => {
    if (!dataQuery.data || !summary) return null;
    return {
      startDate,
      endDate,
      listings: dataQuery.data.listings,
      bookings: dataQuery.data.bookings,
      revenues: filteredRevenues,
      expenses: filteredExpenses,
      payments: filteredPayments,
      listingPnL,
      summary,
    };
  }, [
    dataQuery.data,
    summary,
    startDate,
    endDate,
    filteredRevenues,
    filteredExpenses,
    filteredPayments,
    listingPnL,
  ]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const listings = dataQuery.data?.listings ?? [];
  const hasContentFilters = listingFilter !== "all" || expCategoryFilter !== "all";

  function clearContentFilters() {
    setListingFilter("all");
    setExpCategoryFilter("all");
    setDrillListingId(null);
  }

  return (
    <AppLayout title={t.reports.title}>
      {/* ── Date range picker + listing + category filter bar ──────────────── */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {/* Calendar date-range picker */}
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onApply={(s, e) => {
            setStartDate(s);
            setEndDate(e);
            setDrillListingId(null);
          }}
        />

        {/* Listing filter */}
        <Select
          value={listingFilter}
          onValueChange={(v) => {
            setListingFilter(v);
            setDrillListingId(null);
          }}
        >
          <SelectTrigger className="w-[210px]">
            <SelectValue placeholder={t.reports.allListings} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.reports.allListings}</SelectItem>
            {listings.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Expense category filter */}
        <Select value={expCategoryFilter} onValueChange={setExpCategoryFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t.reports.allCategories} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.reports.allCategories}</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasContentFilters && (
          <button
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={clearContentFilters}
          >
            {t.reports.clearFilters}
          </button>
        )}

        {/* ── Export buttons (admin / manager / accountant only) ── */}
        {canExport && (
          <div className="ml-auto flex items-center gap-2">
            {/* Excel export */}
            <Button
              size="sm"
              variant="outline"
              disabled={!exportPayload}
              onClick={() => exportPayload && exportExcel(exportPayload)}
              className="gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
              Excel
            </Button>

            {/* CSV export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!exportPayload}
                  className="gap-1.5"
                >
                  <FileText className="h-4 w-4 text-blue-600" />
                  CSV
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Xuất file CSV</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => exportPayload && exportCSVMain(exportPayload)}
                >
                  Báo cáo theo căn hộ
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportPayload && exportCSVRevenue(exportPayload)}
                >
                  Chi tiết doanh thu
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportPayload && exportCSVExpense(exportPayload)}
                >
                  Chi tiết chi phí
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportPayload && exportCSVCashflow(exportPayload)}
                >
                  Dòng tiền
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* ── Active range display ──────────────────────────────────────────────── */}
      <p className="mb-6 text-sm text-muted-foreground">
        Báo cáo từ{" "}
        <span className="font-medium text-foreground">
          {format(startDate, "dd/MM/yyyy")}
        </span>
        {" đến "}
        <span className="font-medium text-foreground">
          {format(endDate, "dd/MM/yyyy")}
        </span>
      </p>

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
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label={t.reports.totalRevenue}
              value={fmt(summary.revenue)}
              onClick={() => setRevenueModalOpen(true)}
            />
            <KpiCard
              label={t.reports.totalExpenses}
              value={fmt(summary.expense)}
              onClick={() => setExpenseModalOpen(true)}
            />
            <KpiCard
              label={t.reports.netProfit}
              value={fmt(summary.profit)}
              accent={summary.profit >= 0 ? "positive" : "negative"}
              onClick={() => setProfitModalOpen(true)}
            />
            <KpiCard
              label="Tiền thực thu"
              value={fmt(summary.cashIn)}
              accent="positive"
              onClick={() => setCashflowModalOpen(true)}
            />
            <KpiCard
              label={t.bookings.title}
              value={summary.completedBookings.toString()}
              onClick={() => setBookingsModalOpen(true)}
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
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
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

          {/* ── Cashflow chart ───────────────────────────────────────────── */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Dòng tiền thực tế (Cashflow)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashflow}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="cash_in"
                      fill={CHART_COLORS[1]}
                      name="Tiền vào (cọc + thanh toán)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="refunds"
                      fill={CHART_COLORS[5]}
                      name="Hoàn tiền"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="net"
                      fill={CHART_COLORS[3]}
                      name="Net cashflow"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

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
                                row.profit >= 0 ? "text-primary" : "text-destructive"
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
                                <DrilldownPanel
                                  data={drillData}
                                  fmt={fmt}
                                  onOpenFull={() =>
                                    setListingDetailModalId(drillData.listing.id)
                                  }
                                />
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

      {/* ── Drill-down modals ─────────────────────────────────────────────── */}
      {dataQuery.data && (
        <>
          <RevenueDrilldownModal
            open={revenueModalOpen}
            onClose={() => setRevenueModalOpen(false)}
            revenues={filteredRevenues}
            bookings={dataQuery.data.bookings}
            listings={dataQuery.data.listings}
            fmt={fmt}
            canExport={canExport}
            startDate={startDate}
            endDate={endDate}
          />
          <ExpenseDrilldownModal
            open={expenseModalOpen}
            onClose={() => setExpenseModalOpen(false)}
            expenses={filteredExpenses}
            listings={dataQuery.data.listings}
            fmt={fmt}
            canExport={canExport}
          />
          <ProfitDrilldownModal
            open={profitModalOpen}
            onClose={() => setProfitModalOpen(false)}
            revenues={filteredRevenues}
            expenses={filteredExpenses}
            listings={dataQuery.data.listings}
            fmt={fmt}
            canExport={canExport}
          />
          <CashflowDrilldownModal
            open={cashflowModalOpen}
            onClose={() => setCashflowModalOpen(false)}
            payments={filteredPayments}
            bookings={dataQuery.data.bookings}
            listings={dataQuery.data.listings}
            fmt={fmt}
            canExport={canExport}
            startDate={startDate}
            endDate={endDate}
            listingFilter={listingFilter}
          />
          <BookingsDrilldownModal
            open={bookingsModalOpen}
            onClose={() => setBookingsModalOpen(false)}
            bookings={filteredBookings}
            listings={dataQuery.data.listings}
            revenues={dataQuery.data.revenues}
            payments={dataQuery.data.payments ?? []}
            fmt={fmt}
            canExport={canExport}
          />
          <ListingDetailModal
            listingId={listingDetailModalId}
            listings={dataQuery.data.listings}
            bookings={dataQuery.data.bookings}
            revenues={dataQuery.data.revenues}
            expenses={dataQuery.data.expenses}
            payments={dataQuery.data.payments ?? []}
            fmt={fmt}
            canExport={canExport}
            startDate={startDate}
            endDate={endDate}
            onClose={() => setListingDetailModalId(null)}
          />
        </>
      )}
    </AppLayout>
  );
}

// ── Drilldown panel ────────────────────────────────────────────────────────────

function DrilldownPanel({
  data,
  fmt,
  onOpenFull,
}: {
  data: DrillData;
  fmt: (v: number | null | undefined) => string;
  onOpenFull?: () => void;
}) {
  const depositIn = data.payments
    .filter((p) => p.payment_type === "deposit" && p.status === "paid")
    .reduce((s, p) => s + Number(p.amount), 0);
  const balanceIn = data.payments
    .filter((p) => p.payment_type === "balance" && p.status === "paid")
    .reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="border-t bg-muted/20 px-6 py-5">
      <p className="mb-3 text-sm font-semibold text-muted-foreground">
        {data.listing.title} — Period Detail
      </p>

      {/* ── Revenue / Expense / Profit summary ── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Doanh thu (Revenue)</div>
          <div className="text-xl font-bold text-primary">
            {fmt(data.totalRevenue)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Chi phí (Expenses)</div>
          <div className="text-xl font-bold text-destructive">
            {fmt(data.totalExpenses)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">Lợi nhuận (Profit)</div>
          <div
            className={`text-xl font-bold ${
              data.profit >= 0 ? "text-primary" : "text-destructive"
            }`}
          >
            {fmt(data.profit)}
          </div>
        </div>
      </div>

      {/* ── Cashflow section ── */}
      <div className="mb-5">
        <p className="mb-2 text-sm font-semibold">Dòng tiền (Cashflow)</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Cọc nhận được</div>
            <div className="text-lg font-bold text-primary">{fmt(depositIn)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Thanh toán còn lại</div>
            <div className="text-lg font-bold text-primary">{fmt(balanceIn)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Hoàn tiền</div>
            <div className="text-lg font-bold text-destructive">
              {fmt(data.totalRefunds)}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Net cashflow</div>
            <div
              className={`text-lg font-bold ${
                data.totalCashIn - data.totalRefunds >= 0
                  ? "text-primary"
                  : "text-destructive"
              }`}
            >
              {fmt(data.totalCashIn - data.totalRefunds)}
            </div>
          </div>
        </div>
        {data.payments.length > 0 && (
          <div className="mt-2 overflow-hidden rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Ngày</th>
                  <th className="px-3 py-2 text-left font-medium">Loại</th>
                  <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                  <th className="px-3 py-2 text-right font-medium">Số tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.payments.map((p) => {
                  const isOut = p.payment_type === "refund";
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        {format(new Date(p.paid_at), "dd/MM/yyyy")}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {p.payment_type.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">
                        {p.status}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-medium ${
                          isOut ? "text-destructive" : "text-primary"
                        }`}
                      >
                        {isOut ? "−" : "+"}{fmt(Number(p.amount))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Revenue / Expense detail tables ── */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">
            Doanh thu ghi nhận ({data.revenues.length})
          </p>
          {data.revenues.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có doanh thu được ghi nhận.</p>
          ) : (
            <div className="overflow-hidden rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Ngày</th>
                    <th className="px-3 py-2 text-left font-medium">Danh mục</th>
                    <th className="px-3 py-2 text-right font-medium">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.revenues.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        {format(parseISO(r.received_at), "dd/MM/yyyy")}
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

        <div>
          <p className="mb-2 text-sm font-medium">
            Chi phí ({data.expenses.length})
          </p>
          {data.expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có chi phí.</p>
          ) : (
            <div className="overflow-hidden rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Ngày</th>
                    <th className="px-3 py-2 text-left font-medium">Danh mục</th>
                    <th className="px-3 py-2 text-right font-medium">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        {format(parseISO(e.spent_at), "dd/MM/yyyy")}
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

      {data.catBreakdown.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Phân tích chi phí</p>
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

      {onOpenFull && (
        <div className="mt-4 flex justify-end border-t pt-3">
          <Button size="sm" variant="outline" onClick={onOpenFull}>
            Xem chi tiết đầy đủ →
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const REVENUE_CATEGORY_LABELS: Record<string, string> = {
  booking_revenue: "Doanh thu đặt phòng",
  cancellation_revenue: "Phí hủy (DT)",
  extra: "Phụ thu",
  other: "Khác",
};

function makeCSV(header: string[], rows: (string | number)[][]): Blob {
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function WarnRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </div>
  );
}

// ── Revenue drill-down modal ───────────────────────────────────────────────────

function RevenueDrilldownModal({
  open,
  onClose,
  revenues,
  bookings,
  listings,
  fmt,
  canExport,
  startDate,
  endDate,
}: {
  open: boolean;
  onClose: () => void;
  revenues: Revenue[];
  bookings: Booking[];
  listings: Listing[];
  fmt: (v: number | null | undefined) => string;
  canExport: boolean;
  startDate: Date;
  endDate: Date;
}) {
  const [listingF, setListingF] = useState("all");
  const [categoryF, setCategoryF] = useState("all");
  const [search, setSearch] = useState("");

  const bookingMap = useMemo(
    () => new Map(bookings.map((b) => [b.id, b])),
    [bookings]
  );
  const listingMap = useMemo(
    () => new Map(listings.map((l) => [l.id, l])),
    [listings]
  );
  const categories = useMemo(
    () => [...new Set(revenues.map((r) => r.category))].sort(),
    [revenues]
  );

  const display = useMemo(() => {
    return revenues
      .filter((r) => {
        if (listingF !== "all" && r.listing_id !== listingF) return false;
        if (categoryF !== "all" && r.category !== categoryF) return false;
        if (search.trim()) {
          const b = r.booking_id ? bookingMap.get(r.booking_id) : null;
          const name = b?.guest_name ?? "";
          const desc = r.description ?? "";
          const q = search.toLowerCase();
          if (!name.toLowerCase().includes(q) && !desc.toLowerCase().includes(q))
            return false;
        }
        return true;
      })
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
  }, [revenues, listingF, categoryF, search, bookingMap]);

  const total = useMemo(
    () => display.reduce((s, r) => s + Number(r.amount), 0),
    [display]
  );

  const warnings = useMemo(() => {
    const warns: string[] = [];
    const revBookingIds = new Set(
      revenues
        .filter((r) => r.category === "booking_revenue")
        .map((r) => r.booking_id)
    );
    bookings
      .filter(
        (b) =>
          b.status === "completed" &&
          isWithinInterval(parseISO(b.check_in), {
            start: startDate,
            end: endDate,
          }) &&
          !revBookingIds.has(b.id)
      )
      .forEach((b) =>
        warns.push(`${b.guest_name}: Booking hoàn thành nhưng thiếu booking_revenue`)
      );
    const dupMap = new Map<string, number>();
    revenues.forEach((r) => {
      if (!r.booking_id) return;
      const key = `${r.booking_id}__${r.category}`;
      dupMap.set(key, (dupMap.get(key) ?? 0) + 1);
    });
    dupMap.forEach((count, key) => {
      if (count > 1) {
        const [bid, cat] = key.split("__");
        const b = bookingMap.get(bid);
        warns.push(
          `${b?.guest_name ?? bid}: Trùng lặp doanh thu danh mục "${cat}" (${count} dòng)`
        );
      }
    });
    return warns;
  }, [revenues, bookings, startDate, endDate, bookingMap]);

  function handleExport() {
    const blob = makeCSV(
      ["Ngày", "Listing", "Khách", "TT Booking", "Danh mục", "Số tiền", "Mô tả"],
      display.map((r) => {
        const b = r.booking_id ? bookingMap.get(r.booking_id) : null;
        const l = r.listing_id ? listingMap.get(r.listing_id) : null;
        return [
          format(parseISO(r.received_at), "dd/MM/yyyy"),
          l?.title ?? "",
          b?.guest_name ?? "",
          BOOKING_STATUS_LABELS[b?.status ?? ""] ?? b?.status ?? "",
          REVENUE_CATEGORY_LABELS[r.category] ?? r.category,
          Number(r.amount),
          r.description ?? "",
        ];
      })
    );
    downloadBlob(
      blob,
      `revenue_${format(startDate, "yyyyMMdd")}_${format(endDate, "yyyyMMdd")}.csv`
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Chi tiết doanh thu</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Tổng doanh thu</div>
            <div className="text-xl font-bold text-primary">{fmt(total)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Số giao dịch</div>
            <div className="text-xl font-bold">{display.length}</div>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <WarnRow key={i} text={w} />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={listingF} onValueChange={setListingF}>
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue placeholder="Tất cả căn hộ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả căn hộ</SelectItem>
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryF} onValueChange={setCategoryF}>
            <SelectTrigger className="h-8 w-[200px] text-sm">
              <SelectValue placeholder="Tất cả danh mục" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả danh mục</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {REVENUE_CATEGORY_LABELS[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Tìm khách / mô tả..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[200px] text-sm"
          />
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 gap-1.5"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              Xuất CSV
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-auto rounded border">
          {display.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Không có dữ liệu.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Ngày</th>
                  <th className="px-3 py-2 text-left font-medium">Listing</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Khách</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">TT Booking</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Danh mục</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 text-left font-medium">Mô tả</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {display.map((r) => {
                  const b = r.booking_id ? bookingMap.get(r.booking_id) : null;
                  const l = r.listing_id ? listingMap.get(r.listing_id) : null;
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(parseISO(r.received_at), "dd/MM/yyyy")}
                      </td>
                      <td className="max-w-[130px] truncate px-3 py-2 text-muted-foreground">
                        {l?.title ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {b?.guest_name ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {b ? (
                          <Badge
                            variant={
                              b.status === "completed"
                                ? "default"
                                : b.status === "cancelled"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {BOOKING_STATUS_LABELS[b.status] ?? b.status}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {REVENUE_CATEGORY_LABELS[r.category] ?? r.category}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-medium text-primary">
                        +{fmt(Number(r.amount))}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-xs text-muted-foreground">
                        {r.description ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/50">
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-sm font-semibold">
                    Tổng ({display.length} dòng)
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-primary">
                    {fmt(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Expense drill-down modal ───────────────────────────────────────────────────

function ExpenseDrilldownModal({
  open,
  onClose,
  expenses,
  listings,
  fmt,
  canExport,
}: {
  open: boolean;
  onClose: () => void;
  expenses: Expense[];
  listings: Listing[];
  fmt: (v: number | null | undefined) => string;
  canExport: boolean;
}) {
  const [listingF, setListingF] = useState("all");
  const [categoryF, setCategoryF] = useState("all");
  const [search, setSearch] = useState("");

  const listingMap = useMemo(
    () => new Map(listings.map((l) => [l.id, l])),
    [listings]
  );
  const categories = useMemo(
    () => [...new Set(expenses.map((e) => e.category))].sort(),
    [expenses]
  );

  const display = useMemo(() => {
    return expenses
      .filter((e) => {
        if (listingF !== "all" && e.listing_id !== listingF) return false;
        if (categoryF !== "all" && e.category !== categoryF) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const desc = (e.description ?? "").toLowerCase();
          const vendor = (e.vendor ?? "").toLowerCase();
          if (!desc.includes(q) && !vendor.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.spent_at.localeCompare(a.spent_at));
  }, [expenses, listingF, categoryF, search]);

  const total = useMemo(
    () => display.reduce((s, e) => s + Number(e.amount), 0),
    [display]
  );

  const catTotals = useMemo(() => {
    const m = new Map<string, number>();
    display.forEach((e) =>
      m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount))
    );
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [display]);

  function handleExport() {
    const blob = makeCSV(
      ["Ngày", "Listing", "Danh mục", "Vendor", "Số tiền", "Mô tả"],
      display.map((e) => {
        const l = e.listing_id ? listingMap.get(e.listing_id) : null;
        return [
          format(parseISO(e.spent_at), "dd/MM/yyyy"),
          l?.title ?? "",
          e.category,
          e.vendor ?? "",
          Number(e.amount),
          e.description ?? "",
        ];
      })
    );
    downloadBlob(blob, `expenses.csv`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Chi tiết chi phí</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Tổng chi phí</div>
            <div className="text-xl font-bold text-destructive">{fmt(total)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Số giao dịch</div>
            <div className="text-xl font-bold">{display.length}</div>
          </div>
          {catTotals.slice(0, 2).map(([cat, amt]) => (
            <div key={cat} className="rounded-lg border bg-card p-3">
              <div className="truncate text-xs capitalize text-muted-foreground">
                {cat.replace(/_/g, " ")}
              </div>
              <div className="text-xl font-bold text-destructive">{fmt(amt)}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={listingF} onValueChange={setListingF}>
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue placeholder="Tất cả căn hộ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả căn hộ</SelectItem>
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryF} onValueChange={setCategoryF}>
            <SelectTrigger className="h-8 w-[200px] text-sm">
              <SelectValue placeholder="Tất cả danh mục" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả danh mục</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Tìm vendor / mô tả..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[200px] text-sm"
          />
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 gap-1.5"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              Xuất CSV
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-auto rounded border">
          {display.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Không có dữ liệu.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Ngày</th>
                  <th className="px-3 py-2 text-left font-medium">Listing</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Danh mục</th>
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 text-left font-medium">Mô tả</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {display.map((e) => {
                  const l = e.listing_id ? listingMap.get(e.listing_id) : null;
                  return (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(parseISO(e.spent_at), "dd/MM/yyyy")}
                      </td>
                      <td className="max-w-[130px] truncate px-3 py-2 text-muted-foreground">
                        {l?.title ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 capitalize">
                        {e.category.replace(/_/g, " ")}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-muted-foreground">
                        {e.vendor ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-medium text-destructive">
                        −{fmt(Number(e.amount))}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-2 text-xs text-muted-foreground">
                        {e.description ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/50">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm font-semibold">
                    Tổng ({display.length} dòng)
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-destructive">
                    {fmt(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Profit drill-down modal ────────────────────────────────────────────────────

function ProfitDrilldownModal({
  open,
  onClose,
  revenues,
  expenses,
  listings,
  fmt,
  canExport,
}: {
  open: boolean;
  onClose: () => void;
  revenues: Revenue[];
  expenses: Expense[];
  listings: Listing[];
  fmt: (v: number | null | undefined) => string;
  canExport: boolean;
}) {
  const [tab, setTab] = useState<"summary" | "revenue" | "expense">("summary");
  const [search, setSearch] = useState("");

  const listingMap = useMemo(
    () => new Map(listings.map((l) => [l.id, l])),
    [listings]
  );

  const totalRevenue = useMemo(
    () => revenues.reduce((s, r) => s + Number(r.amount), 0),
    [revenues]
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount), 0),
    [expenses]
  );
  const netProfit = totalRevenue - totalExpenses;

  const profitByListing = useMemo(() => {
    const revMap = new Map<string, number>();
    const expMap = new Map<string, number>();
    revenues.forEach((r) => {
      if (r.listing_id)
        revMap.set(r.listing_id, (revMap.get(r.listing_id) ?? 0) + Number(r.amount));
    });
    expenses.forEach((e) => {
      if (e.listing_id)
        expMap.set(e.listing_id, (expMap.get(e.listing_id) ?? 0) + Number(e.amount));
    });
    const ids = new Set([...revMap.keys(), ...expMap.keys()]);
    return Array.from(ids)
      .map((id) => {
        const l = listingMap.get(id);
        const rev = revMap.get(id) ?? 0;
        const exp = expMap.get(id) ?? 0;
        return { id, title: l?.title ?? id, rev, exp, profit: rev - exp };
      })
      .sort((a, b) => b.profit - a.profit);
  }, [revenues, expenses, listingMap]);

  const filteredRevenues = useMemo(
    () =>
      revenues.filter((r) => {
        const q = search.toLowerCase();
        if (!q) return true;
        const l = r.listing_id ? listingMap.get(r.listing_id) : null;
        return (
          (l?.title ?? "").toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q)
        );
      }),
    [revenues, search, listingMap]
  );

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const q = search.toLowerCase();
        if (!q) return true;
        const l = e.listing_id ? listingMap.get(e.listing_id) : null;
        return (
          (l?.title ?? "").toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q) ||
          (e.vendor ?? "").toLowerCase().includes(q)
        );
      }),
    [expenses, search, listingMap]
  );

  function handleExport() {
    const rows: (string | number)[][] = [
      ["Loại", "Ngày", "Listing", "Danh mục", "Số tiền", "Mô tả"],
      ...revenues.map((r) => {
        const l = r.listing_id ? listingMap.get(r.listing_id) : null;
        return [
          "Doanh thu",
          format(parseISO(r.received_at), "dd/MM/yyyy"),
          l?.title ?? "",
          REVENUE_CATEGORY_LABELS[r.category] ?? r.category,
          Number(r.amount),
          r.description ?? "",
        ];
      }),
      ...expenses.map((e) => {
        const l = e.listing_id ? listingMap.get(e.listing_id) : null;
        return [
          "Chi phí",
          format(parseISO(e.spent_at), "dd/MM/yyyy"),
          l?.title ?? "",
          e.category,
          -Number(e.amount),
          e.description ?? "",
        ];
      }),
    ];
    downloadBlob(makeCSV(rows[0] as string[], rows.slice(1)), "profit_detail.csv");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Chi tiết lợi nhuận</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Tổng doanh thu</div>
            <div className="text-xl font-bold text-primary">{fmt(totalRevenue)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Tổng chi phí</div>
            <div className="text-xl font-bold text-destructive">{fmt(totalExpenses)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Lợi nhuận ròng</div>
            <div
              className={`text-xl font-bold ${
                netProfit >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {fmt(netProfit)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(["summary", "revenue", "expense"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "summary"
                ? "Theo căn hộ"
                : t === "revenue"
                ? `Doanh thu (${revenues.length})`
                : `Chi phí (${expenses.length})`}
            </button>
          ))}
          {tab !== "summary" && (
            <Input
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-auto h-8 w-[200px] text-sm"
            />
          )}
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 gap-1.5"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              Xuất CSV
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-auto rounded border">
          {tab === "summary" && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Listing</th>
                  <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                  <th className="px-3 py-2 text-right font-medium">Chi phí</th>
                  <th className="px-3 py-2 text-right font-medium">Lợi nhuận</th>
                  <th className="px-3 py-2 text-right font-medium">Tỷ lệ CP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {profitByListing.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{row.title}</td>
                    <td className="px-3 py-2 text-right font-mono text-primary">
                      {fmt(row.rev)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-destructive">
                      {fmt(row.exp)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${
                        row.profit >= 0 ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {fmt(row.profit)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.rev > 0 ? `${((row.exp / row.rev) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Tổng</td>
                  <td className="px-3 py-2 text-right font-mono text-primary">
                    {fmt(totalRevenue)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-destructive">
                    {fmt(totalExpenses)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      netProfit >= 0 ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {fmt(netProfit)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          {tab === "revenue" && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Ngày</th>
                  <th className="px-3 py-2 text-left font-medium">Listing</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Danh mục</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 text-left font-medium">Mô tả</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRevenues.map((r) => {
                  const l = r.listing_id ? listingMap.get(r.listing_id) : null;
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(parseISO(r.received_at), "dd/MM/yyyy")}
                      </td>
                      <td className="max-w-[130px] truncate px-3 py-2 text-muted-foreground">
                        {l?.title ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {REVENUE_CATEGORY_LABELS[r.category] ?? r.category}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-medium text-primary">
                        {fmt(Number(r.amount))}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-2 text-xs text-muted-foreground">
                        {r.description ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {tab === "expense" && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Ngày</th>
                  <th className="px-3 py-2 text-left font-medium">Listing</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Danh mục</th>
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 text-left font-medium">Mô tả</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredExpenses.map((e) => {
                  const l = e.listing_id ? listingMap.get(e.listing_id) : null;
                  return (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(parseISO(e.spent_at), "dd/MM/yyyy")}
                      </td>
                      <td className="max-w-[130px] truncate px-3 py-2 text-muted-foreground">
                        {l?.title ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 capitalize">
                        {e.category.replace(/_/g, " ")}
                      </td>
                      <td className="max-w-[100px] truncate px-3 py-2 text-muted-foreground">
                        {e.vendor ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-medium text-destructive">
                        {fmt(Number(e.amount))}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-2 text-xs text-muted-foreground">
                        {e.description ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Bookings drill-down modal ──────────────────────────────────────────────────

function BookingsDrilldownModal({
  open,
  onClose,
  bookings,
  listings,
  revenues,
  payments,
  fmt,
  canExport,
}: {
  open: boolean;
  onClose: () => void;
  bookings: Booking[];
  listings: Listing[];
  revenues: Revenue[];
  payments: Payment[];
  fmt: (v: number | null | undefined) => string;
  canExport: boolean;
}) {
  const [statusF, setStatusF] = useState("all");
  const [listingF, setListingF] = useState("all");
  const [search, setSearch] = useState("");

  const listingMap = useMemo(
    () => new Map(listings.map((l) => [l.id, l])),
    [listings]
  );

  const display = useMemo(() => {
    return bookings
      .filter((b) => {
        if (statusF !== "all" && b.status !== statusF) return false;
        if (listingF !== "all" && b.listing_id !== listingF) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const l = listingMap.get(b.listing_id);
          if (
            !b.guest_name.toLowerCase().includes(q) &&
            !(l?.title ?? "").toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => b.check_in.localeCompare(a.check_in));
  }, [bookings, statusF, listingF, search, listingMap]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    bookings.forEach((b) => {
      m[b.status] = (m[b.status] ?? 0) + 1;
    });
    return m;
  }, [bookings]);

  const totalAmount = useMemo(
    () => display.reduce((s, b) => s + Number(b.total_amount ?? 0), 0),
    [display]
  );

  const warnings = useMemo(() => {
    const warns: string[] = [];
    const revBookingIds = new Set(
      revenues
        .filter((r) => r.category === "booking_revenue")
        .map((r) => r.booking_id)
    );
    const depositsByBooking = new Set(
      payments
        .filter((p) => p.payment_type === "deposit" && p.status === "paid")
        .map((p) => p.booking_id)
    );
    const balanceByBooking = new Set(
      payments
        .filter((p) => p.payment_type === "balance" && p.status === "paid")
        .map((p) => p.booking_id)
    );
    bookings.forEach((b) => {
      if (b.status === "completed" && !revBookingIds.has(b.id))
        warns.push(`${b.guest_name}: Booking hoàn thành nhưng thiếu booking_revenue`);
      if (
        b.status === "confirmed" &&
        Number(b.deposit_amount ?? 0) > 0 &&
        !depositsByBooking.has(b.id)
      )
        warns.push(`${b.guest_name}: Thiếu dòng cọc trong payments`);
      if (b.status === "completed") {
        const balance =
          Number(b.total_amount ?? 0) - Number(b.deposit_amount ?? 0);
        if (balance > 0 && !balanceByBooking.has(b.id))
          warns.push(`${b.guest_name}: Thiếu dòng thanh toán còn lại`);
      }
    });
    return warns;
  }, [bookings, revenues, payments]);

  function handleExport() {
    const blob = makeCSV(
      [
        "Khách",
        "Listing",
        "Check-in",
        "Check-out",
        "Số đêm",
        "Trạng thái",
        "Tổng tiền",
        "Cọc",
        "Nguồn",
      ],
      display.map((b) => {
        const l = listingMap.get(b.listing_id);
        const nights = differenceInCalendarDays(
          parseISO(b.check_out),
          parseISO(b.check_in)
        );
        return [
          b.guest_name,
          l?.title ?? "",
          format(parseISO(b.check_in), "dd/MM/yyyy"),
          format(parseISO(b.check_out), "dd/MM/yyyy"),
          nights,
          BOOKING_STATUS_LABELS[b.status] ?? b.status,
          Number(b.total_amount ?? 0),
          Number(b.deposit_amount ?? 0),
          b.source ?? "",
        ];
      })
    );
    downloadBlob(blob, "bookings.csv");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Chi tiết đặt phòng</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {Object.entries(statusCounts).map(([st, cnt]) => (
            <div key={st} className="rounded-lg border bg-card px-3 py-2">
              <div className="text-xs capitalize text-muted-foreground">
                {BOOKING_STATUS_LABELS[st] ?? st}
              </div>
              <div className="text-lg font-bold">{cnt}</div>
            </div>
          ))}
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-xs text-muted-foreground">Tổng tiền (hiển thị)</div>
            <div className="text-lg font-bold text-primary">{fmt(totalAmount)}</div>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <WarnRow key={i} text={w} />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue placeholder="Tất cả trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="pending">Chờ xác nhận</SelectItem>
              <SelectItem value="confirmed">Đã xác nhận</SelectItem>
              <SelectItem value="completed">Hoàn thành</SelectItem>
              <SelectItem value="cancelled">Đã hủy</SelectItem>
            </SelectContent>
          </Select>
          <Select value={listingF} onValueChange={setListingF}>
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue placeholder="Tất cả căn hộ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả căn hộ</SelectItem>
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Tìm khách / căn hộ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[200px] text-sm"
          />
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 gap-1.5"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              Xuất CSV
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-auto rounded border">
          {display.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Không có dữ liệu.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Khách</th>
                  <th className="px-3 py-2 text-left font-medium">Listing</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Check-in</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Check-out</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Đêm</th>
                  <th className="px-3 py-2 text-left font-medium">TT</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Tổng tiền</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Cọc</th>
                  <th className="px-3 py-2 text-left font-medium">Nguồn</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {display.map((b) => {
                  const l = listingMap.get(b.listing_id);
                  const nights = differenceInCalendarDays(
                    parseISO(b.check_out),
                    parseISO(b.check_in)
                  );
                  return (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {b.guest_name}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-muted-foreground">
                        {l?.title ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(parseISO(b.check_in), "dd/MM/yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(parseISO(b.check_out), "dd/MM/yyyy")}
                      </td>
                      <td className="px-3 py-2 text-right">{nights}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            b.status === "completed"
                              ? "default"
                              : b.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {BOOKING_STATUS_LABELS[b.status] ?? b.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-medium">
                        {fmt(Number(b.total_amount ?? 0))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                        {Number(b.deposit_amount ?? 0) > 0
                          ? fmt(Number(b.deposit_amount))
                          : "—"}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">
                        {b.source ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/50">
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-sm font-semibold">
                    Tổng ({display.length} booking)
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {fmt(totalAmount)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Listing detail modal ───────────────────────────────────────────────────────

function ListingDetailModal({
  listingId,
  listings,
  bookings,
  revenues,
  expenses,
  payments,
  fmt,
  canExport,
  startDate,
  endDate,
  onClose,
}: {
  listingId: string | null;
  listings: Listing[];
  bookings: Booking[];
  revenues: Revenue[];
  expenses: Expense[];
  payments: Payment[];
  fmt: (v: number | null | undefined) => string;
  canExport: boolean;
  startDate: Date;
  endDate: Date;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"bookings" | "revenue" | "expenses" | "payments">(
    "bookings"
  );
  const [search, setSearch] = useState("");

  const listing = useMemo(
    () => listings.find((l) => l.id === listingId),
    [listings, listingId]
  );

  const listingRevenues = useMemo(
    () =>
      revenues
        .filter(
          (r) =>
            r.listing_id === listingId &&
            RECOGNIZED_REVENUE_CATEGORIES.includes(r.category)
        )
        .sort((a, b) => b.received_at.localeCompare(a.received_at)),
    [revenues, listingId]
  );
  const listingExpenses = useMemo(
    () =>
      expenses
        .filter((e) => e.listing_id === listingId)
        .sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
    [expenses, listingId]
  );
  const listingBookings = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.listing_id === listingId &&
            isWithinInterval(parseISO(b.check_in), { start: startDate, end: endDate })
        )
        .sort((a, b) => b.check_in.localeCompare(a.check_in)),
    [bookings, listingId, startDate, endDate]
  );
  const listingPayments = useMemo(
    () =>
      payments
        .filter((p) => p.listing_id === listingId)
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
    [payments, listingId]
  );

  const totalRevenue = useMemo(
    () => listingRevenues.reduce((s, r) => s + Number(r.amount), 0),
    [listingRevenues]
  );
  const totalExpenses = useMemo(
    () => listingExpenses.reduce((s, e) => s + Number(e.amount), 0),
    [listingExpenses]
  );
  const totalCashIn = useMemo(
    () =>
      listingPayments
        .filter(
          (p) =>
            p.status === "paid" &&
            (p.payment_type === "deposit" ||
              p.payment_type === "balance" ||
              p.payment_type === "cancellation_fee")
        )
        .reduce((s, p) => s + Number(p.amount), 0),
    [listingPayments]
  );

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    if (!q)
      return {
        bookings: listingBookings,
        revenues: listingRevenues,
        expenses: listingExpenses,
        payments: listingPayments,
      };
    return {
      bookings: listingBookings.filter(
        (b) =>
          b.guest_name.toLowerCase().includes(q) ||
          (b.source ?? "").toLowerCase().includes(q)
      ),
      revenues: listingRevenues.filter(
        (r) =>
          r.category.includes(q) || (r.description ?? "").toLowerCase().includes(q)
      ),
      expenses: listingExpenses.filter(
        (e) =>
          e.category.includes(q) ||
          (e.description ?? "").toLowerCase().includes(q) ||
          (e.vendor ?? "").toLowerCase().includes(q)
      ),
      payments: listingPayments.filter(
        (p) =>
          p.payment_type.includes(q) || (p.note ?? "").toLowerCase().includes(q)
      ),
    };
  }, [search, listingBookings, listingRevenues, listingExpenses, listingPayments]);

  function handleExport() {
    const rows: (string | number)[][] = [];
    const header = ["Tab", "Ngày", "Chi tiết", "Số tiền", "Ghi chú"];
    listingBookings.forEach((b) =>
      rows.push([
        "Booking",
        format(parseISO(b.check_in), "dd/MM/yyyy"),
        `${b.guest_name} (${b.status})`,
        Number(b.total_amount ?? 0),
        b.notes ?? "",
      ])
    );
    listingRevenues.forEach((r) =>
      rows.push([
        "Doanh thu",
        format(parseISO(r.received_at), "dd/MM/yyyy"),
        REVENUE_CATEGORY_LABELS[r.category] ?? r.category,
        Number(r.amount),
        r.description ?? "",
      ])
    );
    listingExpenses.forEach((e) =>
      rows.push([
        "Chi phí",
        format(parseISO(e.spent_at), "dd/MM/yyyy"),
        e.category,
        -Number(e.amount),
        e.description ?? "",
      ])
    );
    listingPayments.forEach((p) =>
      rows.push([
        "Thanh toán",
        format(new Date(p.paid_at), "dd/MM/yyyy"),
        PAYMENT_TYPE_LABELS[p.payment_type] ?? p.payment_type,
        p.payment_type === "refund" ? -Number(p.amount) : Number(p.amount),
        p.note ?? "",
      ])
    );
    downloadBlob(
      makeCSV(header, rows),
      `listing_${listing?.title ?? listingId}_detail.csv`
    );
  }

  return (
    <Dialog open={!!listingId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{listing?.title ?? "Chi tiết căn hộ"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Doanh thu</div>
            <div className="text-lg font-bold text-primary">{fmt(totalRevenue)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Chi phí</div>
            <div className="text-lg font-bold text-destructive">{fmt(totalExpenses)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Lợi nhuận</div>
            <div
              className={`text-lg font-bold ${
                totalRevenue - totalExpenses >= 0
                  ? "text-primary"
                  : "text-destructive"
              }`}
            >
              {fmt(totalRevenue - totalExpenses)}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Tiền thực thu</div>
            <div className="text-lg font-bold text-primary">{fmt(totalCashIn)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["bookings", `Bookings (${listingBookings.length})`],
              ["revenue", `Doanh thu (${listingRevenues.length})`],
              ["expenses", `Chi phí (${listingExpenses.length})`],
              ["payments", `Thanh toán (${listingPayments.length})`],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <Input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto h-8 w-[180px] text-sm"
          />
          {canExport && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              Xuất CSV
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-auto rounded border">
          {tab === "bookings" && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Khách</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Check-in</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Check-out</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Đêm</th>
                  <th className="px-3 py-2 text-left font-medium">TT</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Tổng tiền</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Cọc</th>
                  <th className="px-3 py-2 text-left font-medium">Nguồn</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.bookings.map((b) => {
                  const nights = differenceInCalendarDays(
                    parseISO(b.check_out),
                    parseISO(b.check_in)
                  );
                  return (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {b.guest_name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(parseISO(b.check_in), "dd/MM/yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(parseISO(b.check_out), "dd/MM/yyyy")}
                      </td>
                      <td className="px-3 py-2 text-right">{nights}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            b.status === "completed"
                              ? "default"
                              : b.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {BOOKING_STATUS_LABELS[b.status] ?? b.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                        {fmt(Number(b.total_amount ?? 0))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                        {Number(b.deposit_amount ?? 0) > 0
                          ? fmt(Number(b.deposit_amount))
                          : "—"}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">
                        {b.source ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {tab === "revenue" && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Ngày</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Danh mục</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 text-left font-medium">Mô tả</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.revenues.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">
                      {format(parseISO(r.received_at), "dd/MM/yyyy")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {REVENUE_CATEGORY_LABELS[r.category] ?? r.category}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-medium text-primary">
                      {fmt(Number(r.amount))}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground">
                      {r.description ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "expenses" && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Ngày</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Danh mục</th>
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 text-left font-medium">Mô tả</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">
                      {format(parseISO(e.spent_at), "dd/MM/yyyy")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 capitalize">
                      {e.category.replace(/_/g, " ")}
                    </td>
                    <td className="max-w-[100px] truncate px-3 py-2 text-muted-foreground">
                      {e.vendor ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-medium text-destructive">
                      {fmt(Number(e.amount))}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground">
                      {e.description ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "payments" && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Ngày</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Loại tiền</th>
                  <th className="px-3 py-2 text-left font-medium">TT</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 text-left font-medium">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.payments.map((p) => {
                  const isOut = p.payment_type === "refund";
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(new Date(p.paid_at), "dd/MM/yyyy")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {PAYMENT_TYPE_LABELS[p.payment_type] ?? p.payment_type}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">
                        {p.status}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right font-mono font-medium ${
                          isOut ? "text-destructive" : "text-primary"
                        }`}
                      >
                        {isOut ? "−" : "+"}
                        {fmt(Number(p.amount))}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-xs text-muted-foreground">
                        {p.note ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Cashflow drill-down modal ──────────────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  deposit: "Cọc nhận được",
  balance: "Thanh toán còn lại",
  refund: "Hoàn tiền",
  cancellation_fee: "Phí hủy / giữ cọc",
};

const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

function CashflowDrilldownModal({
  open,
  onClose,
  payments,
  bookings,
  listings,
  fmt,
  canExport,
  startDate,
  endDate,
  listingFilter,
}: {
  open: boolean;
  onClose: () => void;
  payments: Payment[];
  bookings: Booking[];
  listings: Listing[];
  fmt: (v: number | null | undefined) => string;
  canExport: boolean;
  startDate: Date;
  endDate: Date;
  listingFilter: string;
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [listingModalFilter, setListingModalFilter] = useState(listingFilter);
  const [guestSearch, setGuestSearch] = useState("");

  const bookingMap = useMemo(
    () => new Map(bookings.map((b) => [b.id, b])),
    [bookings]
  );
  const listingMap = useMemo(
    () => new Map(listings.map((l) => [l.id, l])),
    [listings]
  );

  const displayPayments = useMemo(() => {
    return payments.filter((p) => {
      if (typeFilter !== "all" && p.payment_type !== typeFilter) return false;
      if (listingModalFilter !== "all" && p.listing_id !== listingModalFilter)
        return false;
      if (guestSearch.trim()) {
        const booking = p.booking_id ? bookingMap.get(p.booking_id) : null;
        const name = booking?.guest_name ?? "";
        if (!name.toLowerCase().includes(guestSearch.toLowerCase()))
          return false;
      }
      return true;
    });
  }, [payments, typeFilter, listingModalFilter, guestSearch, bookingMap]);

  const totalIn = useMemo(
    () =>
      displayPayments
        .filter((p) => p.status === "paid" && p.payment_type !== "refund")
        .reduce((s, p) => s + Number(p.amount), 0),
    [displayPayments]
  );
  const totalRefunds = useMemo(
    () =>
      displayPayments
        .filter((p) => p.payment_type === "refund")
        .reduce((s, p) => s + Number(p.amount), 0),
    [displayPayments]
  );
  const netCashflow = totalIn - totalRefunds;

  const warnings = useMemo(() => {
    const warns: string[] = [];
    const paymentsByBooking = new Map<string, Payment[]>();
    payments.forEach((p) => {
      if (p.booking_id) {
        const arr = paymentsByBooking.get(p.booking_id) ?? [];
        arr.push(p);
        paymentsByBooking.set(p.booking_id, arr);
      }
    });
    const relevant = bookings.filter(
      (b) =>
        isWithinInterval(parseISO(b.check_in), { start: startDate, end: endDate }) &&
        (listingModalFilter === "all" || b.listing_id === listingModalFilter)
    );
    for (const b of relevant) {
      const pmts = paymentsByBooking.get(b.id) ?? [];
      if (b.status === "confirmed" && Number(b.deposit_amount ?? 0) > 0) {
        const hasDeposit = pmts.some(
          (p) => p.payment_type === "deposit" && p.status === "paid"
        );
        if (!hasDeposit)
          warns.push(`${b.guest_name}: Thiếu dòng cọc trong payments`);
      }
      if (b.status === "completed") {
        const balance =
          Number(b.total_amount ?? 0) - Number(b.deposit_amount ?? 0);
        const hasBalance = pmts.some(
          (p) => p.payment_type === "balance" && p.status === "paid"
        );
        if (balance > 0 && !hasBalance)
          warns.push(`${b.guest_name}: Thiếu dòng thanh toán còn lại`);
      }
      if (b.status === "cancelled") {
        const hasRefund = pmts.some((p) => p.payment_type === "refund");
        const hadDeposit = pmts.some(
          (p) => p.payment_type === "deposit" && p.status === "paid"
        );
        if (hadDeposit && !hasRefund)
          warns.push(`${b.guest_name}: Thiếu dòng hoàn tiền`);
      }
    }
    return warns;
  }, [bookings, payments, startDate, endDate, listingModalFilter]);

  function handleExportCSV() {
    const header = [
      "Ngày",
      "Listing",
      "Khách",
      "Loại tiền",
      "Trạng thái booking",
      "Trạng thái thanh toán",
      "Số tiền",
      "Ghi chú",
    ];
    const rows = displayPayments.map((p) => {
      const booking = p.booking_id ? bookingMap.get(p.booking_id) : null;
      const listing = p.listing_id ? listingMap.get(p.listing_id) : null;
      const isOut = p.payment_type === "refund";
      return [
        format(new Date(p.paid_at), "dd/MM/yyyy"),
        listing?.title ?? "",
        booking?.guest_name ?? "",
        PAYMENT_TYPE_LABELS[p.payment_type] ?? p.payment_type,
        BOOKING_STATUS_LABELS[booking?.status ?? ""] ?? booking?.status ?? "",
        p.status,
        isOut ? -Number(p.amount) : Number(p.amount),
        p.note ?? "",
      ];
    });
    const csv = [header, ...rows]
      .map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cashflow_${format(startDate, "yyyyMMdd")}_${format(endDate, "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Chi tiết tiền thực thu</DialogTitle>
        </DialogHeader>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Tổng tiền vào</div>
            <div className="text-xl font-bold text-primary">{fmt(totalIn)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Tổng hoàn tiền</div>
            <div className="text-xl font-bold text-destructive">
              {fmt(totalRefunds)}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Net cashflow</div>
            <div
              className={`text-xl font-bold ${
                netCashflow >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {fmt(netCashflow)}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Số giao dịch</div>
            <div className="text-xl font-bold">{displayPayments.length}</div>
          </div>
        </div>

        {/* ── Warnings ── */}
        {warnings.length > 0 && (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[200px] text-sm">
              <SelectValue placeholder="Loại giao dịch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại</SelectItem>
              <SelectItem value="deposit">Cọc nhận được</SelectItem>
              <SelectItem value="balance">Thanh toán còn lại</SelectItem>
              <SelectItem value="refund">Hoàn tiền</SelectItem>
              <SelectItem value="cancellation_fee">Phí hủy / giữ cọc</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={listingModalFilter}
            onValueChange={setListingModalFilter}
          >
            <SelectTrigger className="h-8 w-[200px] text-sm">
              <SelectValue placeholder="Tất cả căn hộ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả căn hộ</SelectItem>
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Tìm theo tên khách..."
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
            className="h-8 w-[200px] text-sm"
          />

          {canExport && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 gap-1.5"
              onClick={handleExportCSV}
            >
              <Download className="h-3.5 w-3.5" />
              Xuất CSV
            </Button>
          )}
        </div>

        {/* ── Detailed table ── */}
        <ScrollArea className="flex-1 overflow-auto rounded border">
          {displayPayments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Không có giao dịch nào.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    Ngày
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Listing</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    Khách
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    Loại tiền
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    TT Booking
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    TT Thanh toán
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    Số tiền
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayPayments.map((p) => {
                  const booking = p.booking_id
                    ? bookingMap.get(p.booking_id)
                    : null;
                  const listing = p.listing_id
                    ? listingMap.get(p.listing_id)
                    : null;
                  const isOut = p.payment_type === "refund";
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">
                        {format(new Date(p.paid_at), "dd/MM/yyyy")}
                      </td>
                      <td className="max-w-[130px] truncate px-3 py-2 text-muted-foreground">
                        {listing?.title ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {booking?.guest_name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {PAYMENT_TYPE_LABELS[p.payment_type] ?? p.payment_type}
                      </td>
                      <td className="px-3 py-2">
                        {booking ? (
                          <Badge
                            variant={
                              booking.status === "completed"
                                ? "default"
                                : booking.status === "cancelled"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {BOOKING_STATUS_LABELS[booking.status] ??
                              booking.status}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 capitalize text-muted-foreground">
                        {p.status}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right font-mono font-medium ${
                          isOut ? "text-destructive" : "text-primary"
                        }`}
                      >
                        {isOut ? "−" : "+"}
                        {fmt(Number(p.amount))}
                      </td>
                      <td className="max-w-[130px] truncate px-3 py-2 text-xs text-muted-foreground">
                        {p.note ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative";
  onClick?: () => void;
}) {
  return (
    <Card
      className={
        onClick
          ? "cursor-pointer transition-colors hover:bg-accent/50 active:scale-[0.98]"
          : ""
      }
      onClick={onClick}
    >
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
        {onClick && (
          <p className="mt-1 text-xs text-muted-foreground">
            Nhấn để xem chi tiết →
          </p>
        )}
      </CardContent>
    </Card>
  );
}
