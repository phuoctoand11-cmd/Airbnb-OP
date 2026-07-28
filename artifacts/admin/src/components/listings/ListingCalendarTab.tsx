import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Info,
  Loader2,
  X,
} from "lucide-react";

import { IcalSyncPanel } from "@/components/listings/IcalSyncPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLogActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { enUS as enLocale } from "date-fns/locale";
import {
  supabase,
  type Booking,
  type Listing,
  type ListingCalendar,
  type ListingCalStatus,
  LISTING_CAL_STATUSES,
  BLOCKING_CAL_STATUSES,
} from "@/lib/supabase";

// ── SQL migration to show when table is missing ────────────────────────────
const MIGRATION_SQL = `-- Run this in your Supabase SQL editor
create table if not exists public.listing_calendar (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  date          date not null,
  status        text not null default 'available',
  price_override numeric(14,2),
  note          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  constraint listing_calendar_listing_date_unique unique (listing_id, date)
);

create index if not exists listing_calendar_listing_id_idx
  on public.listing_calendar (listing_id);
create index if not exists listing_calendar_date_idx
  on public.listing_calendar (date);

-- Allow authenticated users to read/write their own listing calendars
alter table public.listing_calendar enable row level security;

create policy "listing_calendar_select" on public.listing_calendar
  for select using (true);
create policy "listing_calendar_upsert" on public.listing_calendar
  for all using (auth.role() = 'authenticated');`;

// ── Color map ──────────────────────────────────────────────────────────────
const STATUS_CELL_CLS: Record<"booked" | ListingCalStatus | "none", string> = {
  none:          "bg-card border-border text-foreground hover:bg-muted/40",
  available:     "bg-card border-border text-foreground hover:bg-muted/40",
  booked:        "bg-blue-600 border-blue-700 text-white",
  blocked:       "bg-gray-700 border-gray-800 text-white",
  maintenance:   "bg-orange-500 border-orange-600 text-white",
  owner_stay:    "bg-purple-600 border-purple-700 text-white",
  cleaning_hold: "bg-amber-400 border-amber-500 text-amber-900",
};

const STATUS_BADGE_CLS: Record<ListingCalStatus, string> = {
  available:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  blocked:       "bg-gray-200 text-gray-700 border-gray-300",
  maintenance:   "bg-orange-100 text-orange-700 border-orange-200",
  owner_stay:    "bg-purple-100 text-purple-700 border-purple-200",
  cleaning_hold: "bg-amber-100 text-amber-700 border-amber-200",
};

const STATUS_SWATCH: Record<ListingCalStatus | "booked", string> = {
  available:     "bg-card border border-border",
  booked:        "bg-blue-600",
  blocked:       "bg-gray-700",
  maintenance:   "bg-orange-500",
  owner_stay:    "bg-purple-600",
  cleaning_hold: "bg-amber-400",
};

/** Labels come from the dictionary at render time — see `t.listingDetail.calStatus`. */
const LEGEND_STATUSES: (ListingCalStatus | "booked")[] = [
  "available",
  "booked",
  "blocked",
  "maintenance",
  "owner_stay",
  "cleaning_hold",
];

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  listing: Listing;
  canManage: boolean;
  isSales?: boolean;
}

// ── Main component ─────────────────────────────────────────────────────────
export function ListingCalendarTab({ listing, canManage, isSales = false }: Props) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [lastClickedDate, setLastClickedDate] = useState<string | null>(null);
  const [tableNotFound, setTableNotFound] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [sqlExpanded, setSqlExpanded] = useState(false);

  const start = startOfMonth(cursor);
  const end   = endOfMonth(cursor);
  const days  = eachDayOfInterval({ start, end });

  // date-fns' vi locale renders MMMM as "tháng 08"; write it the way Vietnamese
  // actually does. Matches the availability calendar header.
  const monthLabel =
    lang === "vi"
      ? `Tháng ${cursor.getMonth() + 1}, ${cursor.getFullYear()}`
      : format(cursor, "MMMM yyyy", { locale: enLocale });

  // ── Data fetching ─────────────────────────────────────────────────────
  const calQuery = useQuery({
    queryKey: ["listing_calendar", listing.id, format(start, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_calendar")
        .select(isSales ? "id,listing_id,date,status,note" : "*")
        .eq("listing_id", listing.id)
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(end, "yyyy-MM-dd"));
      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          setTableNotFound(true);
          return [] as ListingCalendar[];
        }
        throw error;
      }
      setTableNotFound(false);
      // The select string is a ternary, so supabase-js cannot parse it at the
      // type level and infers ParserError. Runtime shape is correct either way.
      return (data ?? []) as unknown as ListingCalendar[];
    },
  });

  const bookingsQuery = useQuery({
    queryKey: ["calendar-bookings", listing.id, format(start, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,listing_id,check_in,check_out,status,guest_name")
        .eq("listing_id", listing.id)
        .in("status", ["confirmed", "completed", "pending"])
        .lte("check_in", format(end, "yyyy-MM-dd"))
        .gte("check_out", format(start, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });

  const blocksQuery = useQuery({
    queryKey: ["calendar-blocks", listing.id, format(start, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_blocks")
        .select("id,listing_id,start_date,end_date,reason")
        .eq("listing_id", listing.id)
        .lt("start_date", format(addDays(end, 1), "yyyy-MM-dd"))
        .gt("end_date", format(start, "yyyy-MM-dd"));
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Derived lookups ───────────────────────────────────────────────────
  const calByDate = useMemo(() => {
    const m = new Map<string, ListingCalendar>();
    (calQuery.data ?? []).forEach((e) => m.set(e.date.slice(0, 10), e));
    return m;
  }, [calQuery.data]);

  const bookings = bookingsQuery.data ?? [];

  const bookedDates = useMemo(() => {
    const s = new Set<string>();
    bookings.forEach((b) => {
      const ci = parseISO(b.check_in);
      const co = parseISO(b.check_out);
      let d = ci;
      while (d < co) {
        s.add(format(d, "yyyy-MM-dd"));
        d = addDays(d, 1);
      }
    });
    return s;
  }, [bookings]);

  const blockedDates = useMemo(() => {
    const s = new Set<string>();
    (blocksQuery.data ?? []).forEach((b: any) => {
      let d = parseISO(b.start_date);
      const e = parseISO(b.end_date);
      while (d < e) { s.add(format(d, "yyyy-MM-dd")); d = addDays(d, 1); }
    });
    return s;
  }, [blocksQuery.data]);

  function getDayDisplayStatus(ds: string): "booked" | ListingCalStatus | "none" {
    if (bookedDates.has(ds)) return "booked";
    if (blockedDates.has(ds)) return "blocked";
    const entry = calByDate.get(ds);
    return entry ? entry.status : "none";
  }

  // ── Selection ─────────────────────────────────────────────────────────
  const clearSelection = useCallback(() => {
    setSelectedDates(new Set());
    setLastClickedDate(null);
  }, []);

  function handleDayClick(ds: string, shiftKey: boolean) {
    if (!canManage) return;
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedDate) {
        // Range: select all days between lastClickedDate and ds
        const a = lastClickedDate < ds ? lastClickedDate : ds;
        const b = lastClickedDate < ds ? ds : lastClickedDate;
        const rangeStart = parseISO(a);
        const rangeEnd   = parseISO(b);
        eachDayOfInterval({ start: rangeStart, end: rangeEnd }).forEach((d) => {
          next.add(format(d, "yyyy-MM-dd"));
        });
      } else {
        if (next.has(ds)) next.delete(ds);
        else next.add(ds);
      }
      return next;
    });
    setLastClickedDate(ds);
  }

  // Clear selection when month changes
  useEffect(() => {
    clearSelection();
  }, [cursor, clearSelection]);

  const log = useLogActivity();

  // ── Bulk upsert mutation ──────────────────────────────────────────────
  const bulkMutation = useMutation({
    mutationFn: async (rows: {
      listing_id: string;
      date: string;
      status: ListingCalStatus;
      price_override: number | null;
      note: string | null;
    }[]) => {
      const { error } = await supabase
        .from("listing_calendar")
        .upsert(rows, { onConflict: "listing_id,date" });
      if (error) throw error;
    },
    onSuccess: (_, rows) => {
      log({
        action: "calendar_status_updated",
        entityType: "listing_calendar",
        entityId: listing.id,
        metadata: {
          module: "calendar",
          label: `${listing.title} — ${rows.length} ngày`,
          new_data: {
            listing_id: listing.id,
            dates: rows.map((r) => r.date),
            status: rows[0]?.status ?? null,
            count: rows.length,
          },
        },
      });
      toast({ title: `${rows.length} ${t.listingDetail.calUpdatedDays}` });
      qc.invalidateQueries({ queryKey: ["listing_calendar", listing.id] });
      clearSelection();
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: t.listingDetail.calSaveFailed,
        description: err.message,
      }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────
  const copySql = async () => {
    await navigator.clipboard.writeText(MIGRATION_SQL);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2000);
  };

  const isLoading = calQuery.isLoading || bookingsQuery.isLoading;
  const queryError = calQuery.error || bookingsQuery.error;

  // Number of blank cells before the 1st of the month (Mon-first week)
  const blanksBefore = (start.getDay() + 6) % 7; // Mon=0

  const selectedArray = Array.from(selectedDates).sort();

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── iCal sync panel (admin / manager only) ────────────────────── */}
      {canManage && <IcalSyncPanel listingId={listing.id} canManage={canManage} />}

      {/* ── Migration notice ──────────────────────────────────────────── */}
      {tableNotFound && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-800">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">{t.listingDetail.calTableMissing}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">
              {t.listingDetail.calTableMissingBody1}{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs">listing_calendar</code>{" "}
              {t.listingDetail.calTableMissingBody2}{" "}
              {t.listingDetail.calTableMissingBody3}
            </p>
            <button
              className="text-xs font-medium underline underline-offset-2"
              onClick={() => setSqlExpanded((v) => !v)}
            >
              {sqlExpanded ? t.listingDetail.calHideSql : t.listingDetail.calViewMigration}
            </button>
            {sqlExpanded && (
              <div className="relative mt-2 rounded-lg border border-amber-300 bg-white/70">
                <pre className="max-h-56 overflow-auto p-3 text-[11px] font-mono text-gray-700 whitespace-pre-wrap">
                  {MIGRATION_SQL}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute right-2 top-2 h-7 gap-1.5 text-xs"
                  onClick={copySql}
                >
                  <ClipboardCopy className="h-3 w-3" />
                  {sqlCopied ? t.listingDetail.calCopied : t.listingDetail.calCopy}
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* ── Calendar grid ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-5">
            {/* Month nav */}
            <div className="mb-4 flex items-center justify-between">
              <Button size="icon" variant="outline" onClick={() => setCursor(addMonths(cursor, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-base font-semibold">{monthLabel}</h3>
              <Button size="icon" variant="outline" onClick={() => setCursor(addMonths(cursor, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {queryError && !tableNotFound ? (
              <Alert variant="destructive">
                <AlertTitle>{t.listingDetail.calLoadError}</AlertTitle>
                <AlertDescription>{(queryError as Error).message}</AlertDescription>
              </Alert>
            ) : isLoading ? (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* Day header row */}
                <div className="mb-1 grid grid-cols-7 gap-1">
                  {t.listingDetail.weekdaysShort.map((d, i) => (
                    <div
                      key={d}
                      className={cn(
                        "py-1.5 text-center text-[11px] font-semibold tracking-wide",
                        i >= 5 ? "text-amber-600/80" : "text-muted-foreground",
                      )}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: blanksBefore }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}

                  {days.map((d) => {
                    const ds = format(d, "yyyy-MM-dd");
                    const displayStatus = getDayDisplayStatus(ds);
                    const entry = calByDate.get(ds);
                    const isSelected = selectedDates.has(ds);
                    const isWeekend  = d.getDay() === 0 || d.getDay() === 6;

                    return (
                      <button
                        key={ds}
                        onClick={(e) => handleDayClick(ds, e.shiftKey)}
                        disabled={!canManage || tableNotFound}
                        className={cn(
                          "relative flex h-14 flex-col items-start justify-between rounded-lg border p-1.5 text-left text-xs transition-all",
                          canManage && !tableNotFound && "cursor-pointer",
                          !canManage && "cursor-default",
                          STATUS_CELL_CLS[displayStatus],
                          isSelected && "ring-2 ring-primary ring-offset-1",
                          !isSelected && isWeekend && displayStatus === "none" && "bg-amber-50/60",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                            displayStatus !== "none" && displayStatus !== "available"
                              ? "text-inherit"
                              : isWeekend
                              ? "text-amber-700"
                              : "text-foreground",
                          )}
                        >
                          {format(d, "d")}
                        </span>
                        <div className="w-full space-y-0.5">
                          {displayStatus !== "none" && displayStatus !== "available" && (
                            <span className="block truncate text-[9px] font-bold uppercase tracking-wide opacity-90">
                              {displayStatus === "booked"
                                ? "Booked"
                                : t.listingDetail.calStatus[displayStatus as ListingCalStatus]}
                            </span>
                          )}
                          {!isSales && entry?.price_override != null && (
                            <span className="block text-[9px] font-medium opacity-80">
                              ${Number(entry.price_override).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 border-t pt-3">
              {LEGEND_STATUSES.map((status) => (
                <span key={status} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={cn("h-3 w-3 shrink-0 rounded-sm", STATUS_SWATCH[status])} />
                  {t.listingDetail.calStatus[status]}
                </span>
              ))}
              {canManage && !tableNotFound && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {t.listingDetail.calShiftHint}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Right panel ──────────────────────────────────────────── */}
        <div>
          {selectedDates.size > 0 ? (
            <BulkEditor
              selectedDates={selectedArray}
              calByDate={calByDate}
              bookedDates={bookedDates}
              isSales={isSales}
              saving={bulkMutation.isPending}
              listingId={listing.id}
              onApply={(status, price, note) => {
                const rows = selectedArray.map((ds) => ({
                  listing_id: listing.id,
                  date: ds,
                  status,
                  price_override: price,
                  note,
                }));
                bulkMutation.mutate(rows);
              }}
              onClear={clearSelection}
            />
          ) : (
            <Card className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 text-center">
              <CardContent className="flex flex-col items-center gap-3 p-8">
                <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  {canManage && !tableNotFound
                    ? t.listingDetail.calPickDays
                    : t.listingDetail.calViewDayStatus}
                </p>
                {canManage && !tableNotFound && (
                  <p className="text-xs text-muted-foreground/70">
                    {t.listingDetail.calClickHint}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── BulkEditor panel ───────────────────────────────────────────────────────
interface BulkEditorProps {
  selectedDates: string[];
  calByDate: Map<string, ListingCalendar>;
  bookedDates: Set<string>;
  isSales: boolean;
  saving: boolean;
  listingId: string;
  onApply: (status: ListingCalStatus, price: number | null, note: string | null) => void;
  onClear: () => void;
}

function BulkEditor({
  selectedDates,
  calByDate,
  bookedDates,
  isSales,
  saving,
  onApply,
  onClear,
}: BulkEditorProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ListingCalStatus>("blocked");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  // Detect conflicts: selected dates that have bookings AND new status is blocking
  const isBlockingStatus = BLOCKING_CAL_STATUSES.includes(status);
  const conflictDates = isBlockingStatus
    ? selectedDates.filter((ds) => bookedDates.has(ds))
    : [];
  const applyDates = selectedDates.filter((ds) => !conflictDates.includes(ds));

  // Populate fields from single selection
  useEffect(() => {
    if (selectedDates.length === 1) {
      const entry = calByDate.get(selectedDates[0]);
      if (entry) {
        setStatus(entry.status);
        setPrice(entry.price_override != null ? String(entry.price_override) : "");
        setNote(entry.note ?? "");
      } else {
        setStatus("blocked");
        setPrice("");
        setNote("");
      }
    }
  }, [selectedDates, calByDate]);

  const handleApply = () => {
    if (applyDates.length === 0) return;
    onApply(
      status,
      !isSales && price.trim() !== "" ? Number(price) : null,
      note.trim() !== "" ? note.trim() : null,
    );
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">
              {t.listingDetail.calSelected}{" "}
              <span className="text-primary">{selectedDates.length}</span>{" "}
              {t.listingDetail.calDays}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {selectedDates.length <= 3
                ? selectedDates.map((ds) => format(parseISO(ds), "d/M")).join(", ")
                : `${format(parseISO(selectedDates[0]), "d/M")} → ${format(parseISO(selectedDates[selectedDates.length - 1]), "d/M")}`}
            </p>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onClear}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Conflict warning */}
        {conflictDates.length > 0 && (
          <Alert className="border-red-200 bg-red-50 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <AlertDescription className="text-xs text-red-700">
              <span className="font-semibold">
                {conflictDates.length} {t.listingDetail.calDays}
              </span>{" "}
              {t.listingDetail.calConflictSuffix}{" "}
              {applyDates.length > 0 &&
                t.listingDetail.calConflictApply.replace("{n}", String(applyDates.length))}
            </AlertDescription>
          </Alert>
        )}

        {/* Status select */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{t.listingDetail.calStatusLabel}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ListingCalStatus)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LISTING_CAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_SWATCH[s])}
                    />
                    {t.listingDetail.calStatus[s]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Price override */}
        {!isSales && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t.listingDetail.calPricePerNight}</Label>
            <Input
              type="number"
              step="1"
              min="0"
              placeholder={t.listingDetail.calPricePlaceholder}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Note */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{t.listingDetail.calNote}</Label>
          <Input
            placeholder={t.listingDetail.calNotePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Status badge preview */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t.listingDetail.calPreview}</span>
          <Badge
            variant="outline"
            className={cn("text-[11px] font-medium", STATUS_BADGE_CLS[status])}
          >
            {t.listingDetail.calStatus[status]}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            size="sm"
            disabled={saving || applyDates.length === 0}
            onClick={handleApply}
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t.dateRange.apply}{applyDates.length !== selectedDates.length ? ` (${applyDates.length})` : ""}
          </Button>
          <Button variant="outline" size="sm" onClick={onClear} disabled={saving}>
            {t.listingDetail.calClear}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
