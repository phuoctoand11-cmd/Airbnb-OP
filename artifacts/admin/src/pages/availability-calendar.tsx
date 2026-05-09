import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  Ban,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Loader2,
  Plus,
  StretchHorizontal,
  Wrench,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { hasPermission, useAuth } from "@/lib/auth-context";
import {
  supabase,
  type Booking,
  type Listing,
  type ListingBlock,
} from "@/lib/supabase";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

type CalendarView = "timeline" | "month" | "week";

const CELL_W = 40;    // px per day column in timeline
const ROW_H  = 54;    // px per listing row
const HEADER_H = 44;  // px for date/day-name header
const SIDEBAR_W = 210; // px for listing name sidebar

const ALL_STATUSES: Booking["status"][] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
];

const STATUS_LABELS: Record<Booking["status"], string> = {
  pending:   "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

// Full Tailwind class strings — NO dynamic concatenation (purge-safe)
const STATUS_BLOCK_CLS: Record<Booking["status"], string> = {
  confirmed: "bg-blue-600 border-blue-700 text-white",
  pending:   "bg-amber-500 border-amber-600 text-white",
  completed: "bg-emerald-600 border-emerald-700 text-white",
  cancelled: "bg-slate-300 border-slate-400 text-slate-600",
};

const STATUS_BADGE_CLS: Record<Booking["status"], string> = {
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

const ALL_SOURCES = ["Airbnb", "Vrbo", "Booking.com", "Direct", "Other"];

const SOURCE_DOT: Record<string, string> = {
  Airbnb:        "bg-rose-400",
  Vrbo:          "bg-blue-400",
  "Booking.com": "bg-sky-400",
  Direct:        "bg-emerald-400",
  Other:         "bg-violet-400",
};

// ── Helper: clamp offset to visible period ────────────────────────────────────

function clampToPeriod(
  checkIn: string,
  checkOut: string,
  periodStart: Date,
  periodDays: number,
) {
  const checkInDate  = parseISO(checkIn);
  const checkOutDate = parseISO(checkOut);
  const nights = differenceInCalendarDays(checkOutDate, checkInDate);
  const startOffset = differenceInCalendarDays(checkInDate, periodStart);
  const endOffset   = differenceInCalendarDays(checkOutDate, periodStart);
  const visStart = Math.max(0, startOffset);
  const visEnd   = Math.min(periodDays, endOffset);
  return { visStart, visEnd, nights, startOffset, endOffset };
}

// ── MultiSelectFilter ─────────────────────────────────────────────────────────

function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isActive = selected.length > 0 && selected.length < options.length;
  const displayLabel =
    selected.length === 0
      ? label
      : selected.length === options.length
      ? `${label}: Tất cả`
      : `${label} (${selected.length})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-sm font-normal whitespace-nowrap",
            isActive && "border-primary/50 text-primary font-medium",
          )}
        >
          {displayLabel}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start" sideOffset={6}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <button
            className="text-xs font-medium text-primary hover:underline"
            onClick={onSelectAll}
          >
            Chọn tất cả
          </button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={onClear}
          >
            Xóa lọc
          </button>
        </div>
        <div className="p-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-muted/60 select-none"
            >
              <Checkbox
                checked={selected.includes(opt.value)}
                onCheckedChange={() => onToggle(opt.value)}
              />
              <span className={selected.includes(opt.value) ? "font-medium" : ""}>
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Booking Detail Modal ──────────────────────────────────────────────────────

function BookingDetailModal({
  booking,
  listing,
  open,
  onClose,
  onStatusChange,
  isUpdating,
  canManage,
}: {
  booking: Booking | null;
  listing: Listing | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: Booking["status"]) => void;
  isUpdating: boolean;
  canManage: boolean;
}) {
  const { fmt } = useCurrency();
  const [, setLocation] = useLocation();
  if (!booking) return null;

  const nights = differenceInCalendarDays(
    parseISO(booking.check_out),
    parseISO(booking.check_in),
  );
  const remaining = booking.total_amount - (booking.deposit_amount ?? 0);
  const sourceDot = booking.source ? (SOURCE_DOT[booking.source] ?? SOURCE_DOT.Other) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            {sourceDot && (
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", sourceDot)} />
            )}
            <span className="truncate">{booking.guest_name}</span>
            <span
              className={cn(
                "ml-auto shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                STATUS_BADGE_CLS[booking.status],
              )}
            >
              {STATUS_LABELS[booking.status]}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Listing */}
          {listing && (
            <p className="text-sm text-muted-foreground truncate">
              📍 {listing.title}
            </p>
          )}

          {/* Dates */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Check-in", value: format(parseISO(booking.check_in), "dd/MM/yyyy") },
              { label: "Check-out", value: format(parseISO(booking.check_out), "dd/MM/yyyy") },
              { label: "Số đêm", value: `${nights} đêm` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="mt-0.5 font-semibold text-sm">{value}</p>
              </div>
            ))}
          </div>

          {/* Source + Guests */}
          <div className="flex gap-2">
            {booking.source && (
              <div className="flex-1 rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">Nguồn</p>
                <p className="mt-0.5 font-semibold text-sm">{booking.source}</p>
              </div>
            )}
            <div className="flex-1 rounded-lg bg-muted/50 p-2.5">
              <p className="text-[11px] text-muted-foreground">Số khách</p>
              <p className="mt-0.5 font-semibold text-sm">{booking.guests} người</p>
            </div>
          </div>

          {/* Financials */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Tổng tiền", value: fmt(booking.total_amount), cls: "" },
              { label: "Tiền cọc", value: fmt(booking.deposit_amount ?? 0), cls: "" },
              {
                label: "Còn lại",
                value: fmt(remaining),
                cls: remaining > 0 ? "text-amber-600" : "text-emerald-600",
              },
            ].map(({ label, value, cls }) => (
              <div key={label} className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className={cn("mt-0.5 font-semibold text-sm tabular-nums", cls)}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Deposit note */}
          {booking.deposit_paid_at && (
            <p className="text-xs text-muted-foreground">
              Nhận cọc: {format(parseISO(booking.deposit_paid_at), "dd/MM/yyyy")}
              {booking.deposit_note && ` — ${booking.deposit_note}`}
            </p>
          )}

          {/* Notes */}
          {booking.notes && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground mb-1">Ghi chú</p>
              <p className="text-sm">{booking.notes}</p>
            </div>
          )}

          {/* Contact */}
          {(booking.guest_email || booking.guest_phone) && (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              {booking.guest_email && <p>✉ {booking.guest_email}</p>}
              {booking.guest_phone && <p>📞 {booking.guest_phone}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-wrap gap-2 pt-2">
          {/* Always show — navigate to bookings page to edit full details */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mr-auto"
            onClick={() => { onClose(); setLocation("/bookings"); }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Xem trong Bookings
          </Button>

          {canManage && (
            <>
              {booking.status === "pending" && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={isUpdating}
                  onClick={() => onStatusChange(booking.id, "confirmed")}
                >
                  <Check className="h-3.5 w-3.5" />
                  Xác nhận
                </Button>
              )}
              {booking.status === "confirmed" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isUpdating}
                  onClick={() => onStatusChange(booking.id, "completed")}
                >
                  Hoàn thành
                </Button>
              )}
              {(booking.status === "pending" || booking.status === "confirmed") && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  disabled={isUpdating}
                  onClick={() => onStatusChange(booking.id, "cancelled")}
                >
                  <X className="h-3.5 w-3.5" />
                  Hủy booking
                </Button>
              )}
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin self-center" />}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Block Modal ───────────────────────────────────────────────────────────

function AddBlockModal({
  open,
  onClose,
  listings,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  listings: Listing[];
  onSave: (block: Omit<ListingBlock, "id" | "created_at">) => void;
  isSaving: boolean;
}) {
  const [listingId, setListingId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setListingId("");
      setStartDate("");
      setEndDate("");
      setReason("");
    }
  }, [open]);

  const canSave = Boolean(listingId && startDate && endDate && endDate >= startDate);

  function handleSave() {
    if (!canSave) return;
    onSave({
      listing_id: listingId,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Thêm bảo trì / Khóa phòng
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Căn hộ</label>
            <Select value={listingId} onValueChange={setListingId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Chọn căn hộ..." />
              </SelectTrigger>
              <SelectContent>
                {listings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Từ ngày</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Đến ngày</label>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Lý do</label>
            <Textarea
              placeholder="Sửa chữa, vệ sinh tổng thể, giữ phòng..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button
            size="sm"
            disabled={!canSave || isSaving}
            onClick={handleSave}
            className="gap-1.5"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Timeline View ─────────────────────────────────────────────────────────────

function TimelineView({
  listings,
  bookings,
  blocks,
  periodStart,
  periodDays,
  onBookingClick,
}: {
  listings: Listing[];
  bookings: Booking[];
  blocks: ListingBlock[];
  periodStart: Date;
  periodDays: number;
  onBookingClick: (b: Booking) => void;
}) {
  const dates = useMemo(
    () => Array.from({ length: periodDays }, (_, i) => addDays(periodStart, i)),
    [periodStart, periodDays],
  );

  // Indices where a new month starts (for divider lines)
  const monthBoundaries = useMemo(() => {
    const set = new Set<number>();
    dates.forEach((d, i) => {
      if (i > 0 && d.getDate() === 1) set.add(i);
    });
    return set;
  }, [dates]);

  const todayOffset = differenceInCalendarDays(new Date(), periodStart);
  const showToday = todayOffset >= 0 && todayOffset < periodDays;

  // Per-listing computed data
  const rows = useMemo(() => {
    return listings.map((listing) => {
      const lBookings = bookings.filter(
        (b) => b.listing_id === listing.id && b.status !== "cancelled",
      );
      const lBlocks = blocks.filter((bl) => bl.listing_id === listing.id);

      // Background state per date cell
      const dateStates = dates.map((d) => {
        const ds = format(d, "yyyy-MM-dd");
        const blocked = lBlocks.some(
          (bl) => ds >= bl.start_date && ds < bl.end_date,
        );
        if (blocked) return "blocked" as const;
        const ci = lBookings.some((b) => b.check_in === ds);
        const co = lBookings.some((b) => b.check_out === ds);
        if (ci && co) return "turnaround" as const;
        if (ci) return "checkin" as const;
        if (co) return "checkout" as const;
        const mid = lBookings.some((b) => ds > b.check_in && ds < b.check_out);
        if (mid) return "booked" as const;
        return "available" as const;
      });

      // Booking overlay segments
      const bookingSegs = lBookings
        .map((b) => {
          const { visStart, visEnd, nights, startOffset } = clampToPeriod(
            b.check_in,
            b.check_out,
            periodStart,
            periodDays,
          );
          if (visStart >= visEnd) return null;
          return {
            booking: b,
            left: visStart * CELL_W + 1,
            width: (visEnd - visStart) * CELL_W - 2,
            nights,
            clippedLeft: startOffset < 0,
            clippedRight: visEnd === periodDays && visEnd < differenceInCalendarDays(parseISO(b.check_out), periodStart),
          };
        })
        .filter(Boolean) as NonNullable<ReturnType<typeof clampToPeriod> & { booking: Booking; left: number; width: number; nights: number; clippedLeft: boolean; clippedRight: boolean }>[];

      // Block overlay segments
      const blockSegs = lBlocks
        .map((bl) => {
          const startOffset = differenceInCalendarDays(parseISO(bl.start_date), periodStart);
          const endOffset   = differenceInCalendarDays(parseISO(bl.end_date), periodStart);
          const visStart = Math.max(0, startOffset);
          const visEnd   = Math.min(periodDays, endOffset);
          if (visStart >= visEnd) return null;
          return {
            block: bl,
            left: visStart * CELL_W,
            width: (visEnd - visStart) * CELL_W - 1,
          };
        })
        .filter(Boolean) as { block: ListingBlock; left: number; width: number }[];

      // Occupancy %
      const bookedCount = dateStates.filter(
        (s) => s === "booked" || s === "checkin" || s === "turnaround",
      ).length;
      const occupancyPct = Math.round((bookedCount / periodDays) * 100);

      return { listing, dateStates, bookingSegs, blockSegs, occupancyPct };
    });
  }, [listings, bookings, blocks, dates, periodStart, periodDays]);

  const CELL_BG: Record<string, string> = {
    available: "bg-background",
    booked: "bg-blue-50/40 dark:bg-blue-950/10",
    checkin: "bg-emerald-50/60 dark:bg-emerald-950/15",
    checkout: "bg-orange-50/60 dark:bg-orange-950/15",
    turnaround: "bg-yellow-50/60 dark:bg-yellow-950/15",
    blocked: "bg-slate-100 dark:bg-slate-800/40",
  };

  return (
    <div className="rounded-lg border overflow-hidden shadow-sm">
      <div className="flex">
        {/* Sticky listing sidebar */}
        <div
          className="sticky left-0 z-20 flex-none shrink-0 border-r bg-background"
          style={{ width: SIDEBAR_W }}
        >
          {/* Header spacer */}
          <div
            className="flex items-center border-b bg-muted/50 px-3"
            style={{ height: HEADER_H }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Căn hộ
            </span>
          </div>

          {/* Listing rows */}
          {rows.map(({ listing, occupancyPct }) => (
            <div
              key={listing.id}
              className="flex items-center justify-between border-b px-3 last:border-b-0"
              style={{ height: ROW_H }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">
                  {listing.title}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div
                    className="h-1 flex-1 rounded-full bg-muted overflow-hidden"
                    style={{ maxWidth: 64 }}
                  >
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${occupancyPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {occupancyPct}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable date grid */}
        <div className="overflow-x-auto flex-1">
          <div style={{ width: periodDays * CELL_W, position: "relative" }}>
            {/* Today vertical highlight behind header */}
            {showToday && (
              <div
                className="absolute top-0 bottom-0 bg-blue-500/5 pointer-events-none z-0"
                style={{
                  left: todayOffset * CELL_W,
                  width: CELL_W,
                }}
              />
            )}

            {/* Date header */}
            <div
              className="sticky top-0 z-10 flex border-b bg-muted/60 backdrop-blur-sm"
              style={{ height: HEADER_H }}
            >
              {dates.map((date, i) => {
                const isMonth = monthBoundaries.has(i);
                return (
                  <div
                    key={i}
                    className={cn(
                      "relative flex-none flex flex-col items-center justify-center border-r text-xs",
                      isMonth && "border-l-2 border-l-primary/30",
                    )}
                    style={{ width: CELL_W }}
                  >
                    {isMonth && (
                      <span className="absolute -top-px left-1 text-[9px] font-bold uppercase text-primary/60 leading-none">
                        {format(date, "MMM")}
                      </span>
                    )}
                    <span
                      className={cn(
                        "font-semibold leading-none",
                        isToday(date)
                          ? "flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-[11px]"
                          : "text-foreground",
                      )}
                    >
                      {format(date, "d")}
                    </span>
                    <span className="mt-0.5 text-[10px] text-muted-foreground leading-none">
                      {format(date, "EEE")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Listing rows */}
            {rows.map(({ listing, dateStates, bookingSegs, blockSegs }) => (
              <div
                key={listing.id}
                className="relative flex border-b last:border-b-0"
                style={{ height: ROW_H }}
              >
                {/* Background cells */}
                {dateStates.map((state, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-none border-r last:border-r-0",
                      monthBoundaries.has(i) && "border-l-2 border-l-primary/15",
                      CELL_BG[state] ?? "bg-background",
                    )}
                    style={{ width: CELL_W, height: ROW_H }}
                  />
                ))}

                {/* Maintenance block overlays */}
                {blockSegs.map((seg, idx) => (
                  <div
                    key={`bl-${idx}`}
                    title={seg.block.reason ?? "Bảo trì / Khóa phòng"}
                    className="absolute flex items-center gap-1.5 overflow-hidden rounded border border-slate-400/60 text-slate-500 text-[11px] px-2 select-none cursor-default"
                    style={{
                      left: seg.left + 1,
                      top: 7,
                      width: seg.width - 2,
                      height: ROW_H - 14,
                      backgroundImage:
                        "repeating-linear-gradient(-45deg,transparent,transparent 5px,rgba(0,0,0,0.04) 5px,rgba(0,0,0,0.04) 10px)",
                      backgroundColor: "rgb(241 245 249 / 0.9)",
                    }}
                  >
                    <Wrench className="h-3 w-3 shrink-0 opacity-70" />
                    <span className="truncate">{seg.block.reason ?? "Bảo trì"}</span>
                  </div>
                ))}

                {/* Booking overlays */}
                {bookingSegs.map((seg, idx) => {
                  const nights = seg.nights;
                  const showNights = seg.width > 72;
                  const showSource = seg.width > 100 && seg.booking.source;
                  return (
                    <button
                      key={`bk-${idx}`}
                      onClick={() => onBookingClick(seg.booking)}
                      className={cn(
                        "absolute flex items-center gap-1.5 border text-[11px] font-medium px-2 overflow-hidden transition-all duration-150",
                        "hover:brightness-110 hover:shadow-lg active:scale-[0.99] select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        seg.clippedLeft ? "" : "rounded-l-md",
                        seg.clippedRight ? "" : "rounded-r-md",
                        STATUS_BLOCK_CLS[seg.booking.status],
                      )}
                      style={{
                        left: seg.left,
                        top: 7,
                        width: seg.width,
                        height: ROW_H - 14,
                      }}
                      title={`${seg.booking.guest_name} • ${nights} đêm • ${STATUS_LABELS[seg.booking.status]}`}
                    >
                      {showSource && seg.booking.source && (
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0 bg-white/70",
                          )}
                        />
                      )}
                      <span className="truncate">{seg.booking.guest_name}</span>
                      {showNights && (
                        <span className="shrink-0 opacity-75 text-[10px]">
                          {nights}đ
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Today marker line */}
                {showToday && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-blue-500/40 pointer-events-none z-10"
                    style={{ left: todayOffset * CELL_W + CELL_W / 2 }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Month View ────────────────────────────────────────────────────────────────

function MonthView({
  listings,
  bookings,
  blocks,
  viewDate,
  onBookingClick,
}: {
  listings: Listing[];
  bookings: Booking[];
  blocks: ListingBlock[];
  viewDate: Date;
  onBookingClick: (b: Booking) => void;
}) {
  const monthStart = startOfMonth(viewDate);
  const monthEnd   = endOfMonth(viewDate);
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd     = endOfWeek(monthEnd,    { weekStartsOn: 1 });
  const allDays    = eachDayOfInterval({ start: calStart, end: calEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const DAY_NAMES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

  return (
    <div className="rounded-lg border overflow-hidden shadow-sm">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-semibold text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day) => {
            const ds = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, viewDate);
            const today   = isToday(day);

            // All bookings touching this day
            const dayBookings = bookings
              .filter(
                (b) =>
                  b.listing_id &&
                  listings.some((l) => l.id === b.listing_id) &&
                  b.status !== "cancelled" &&
                  ds >= b.check_in &&
                  ds < b.check_out,
              )
              .slice(0, 4);

            const blocked = blocks.some(
              (bl) =>
                listings.some((l) => l.id === bl.listing_id) &&
                ds >= bl.start_date &&
                ds < bl.end_date,
            );

            return (
              <div
                key={ds}
                className={cn(
                  "min-h-[100px] border-b border-r p-1.5 last:border-r-0",
                  !inMonth && "bg-muted/25",
                  today && "bg-blue-50/60 dark:bg-blue-950/10",
                  blocked && "bg-slate-50 dark:bg-slate-900/20",
                )}
              >
                {/* Day number */}
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-sm",
                      today
                        ? "bg-blue-600 text-white font-bold"
                        : !inMonth
                        ? "text-muted-foreground/40 text-xs"
                        : "font-medium",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {blocked && (
                    <Wrench className="h-3 w-3 text-slate-400" />
                  )}
                </div>

                {/* Booking chips */}
                <div className="space-y-0.5">
                  {dayBookings.map((b) => {
                    const isStart = b.check_in === ds;
                    const isEnd   = format(addDays(parseISO(b.check_out), -1), "yyyy-MM-dd") === ds;
                    return (
                      <button
                        key={b.id}
                        onClick={() => onBookingClick(b)}
                        className={cn(
                          "flex w-full items-center gap-1 overflow-hidden px-1.5 py-px text-[11px] font-medium text-white transition-all hover:brightness-110 focus:outline-none",
                          isStart ? "rounded-l-sm" : "",
                          isEnd ? "rounded-r-sm" : "",
                          STATUS_BLOCK_CLS[b.status].split(" ")[0],
                        )}
                        title={b.guest_name}
                      >
                        {isStart && (
                          <span className="truncate">{b.guest_name}</span>
                        )}
                        {!isStart && <span className="truncate opacity-0 select-none">·</span>}
                      </button>
                    );
                  })}
                  {dayBookings.length === 0 && blocked && (
                    <p className="text-[10px] text-slate-400 px-1">Bảo trì</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Occupancy Analytics Strip ─────────────────────────────────────────────────

function OccupancyStrip({
  listings,
  bookings,
  blocks,
  periodStart,
  periodDays,
}: {
  listings: Listing[];
  bookings: Booking[];
  blocks: ListingBlock[];
  periodStart: Date;
  periodDays: number;
}) {
  const data = useMemo(() => {
    const dates = Array.from({ length: periodDays }, (_, i) =>
      format(addDays(periodStart, i), "yyyy-MM-dd"),
    );

    return listings.map((listing) => {
      const lBookings = bookings.filter(
        (b) => b.listing_id === listing.id && b.status !== "cancelled",
      );
      const lBlocks = blocks.filter((bl) => bl.listing_id === listing.id);

      const bookedDays = dates.filter(
        (ds) =>
          lBookings.some((b) => ds >= b.check_in && ds < b.check_out) ||
          lBlocks.some((bl) => ds >= bl.start_date && ds < bl.end_date),
      ).length;

      return {
        listing,
        pct: Math.round((bookedDays / periodDays) * 100),
        bookedDays,
      };
    });
  }, [listings, bookings, blocks, periodStart, periodDays]);

  if (data.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      {data.map(({ listing, pct, bookedDays }) => (
        <div
          key={listing.id}
          className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm"
        >
          <div>
            <p className="text-xs text-muted-foreground truncate max-w-28">
              {listing.title}
            </p>
            <p className="text-sm font-bold tabular-nums">{pct}%</p>
          </div>
          <div className="w-12 h-12 relative">
            <svg viewBox="0 0 36 36" className="rotate-[-90deg]">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-muted/30"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${(pct / 100) * 87.96} 87.96`}
                className="text-blue-500"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
              {bookedDays}d
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Migration notice ──────────────────────────────────────────────────────────

const MIGRATION_SQL = `-- Run once in Supabase SQL editor to enable blocks:
CREATE TABLE IF NOT EXISTS listing_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE listing_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_blocks_all" ON listing_blocks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);`;

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AvailabilityCalendar() {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission(role, "manageCalendar");

  // ── View & navigation ────────────────────────────────────────────────────
  const [view, setView] = useState<CalendarView>("timeline");
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));

  // ── Filters ──────────────────────────────────────────────────────────────
  const [listingFilter, setListingFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter]   = useState<string[]>(["pending", "confirmed"]);
  const [sourceFilter, setSourceFilter]   = useState<string[]>([]);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [blockModalOpen, setBlockModalOpen]   = useState(false);
  const [showMigration, setShowMigration]     = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const listingsQuery = useQuery({
    queryKey: ["listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, status")
        .order("title");
      if (error) throw error;
      return data as Pick<Listing, "id" | "title" | "status">[];
    },
  });

  const bookingsQuery = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("check_in");
      if (error) throw error;
      return data as Booking[];
    },
  });

  const blocksQuery = useQuery({
    queryKey: ["listing_blocks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("listing_blocks").select("*");
      if (error) {
        // Table may not exist yet — show migration notice once
        setShowMigration(true);
        return [] as ListingBlock[];
      }
      return data as ListingBlock[];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Booking["status"] }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Cập nhật thành công" });
      setSelectedBooking(null);
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Lỗi cập nhật", description: err.message }),
  });

  const addBlockMutation = useMutation({
    mutationFn: async (block: Omit<ListingBlock, "id" | "created_at">) => {
      const { error } = await supabase.from("listing_blocks").insert(block);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Đã thêm lịch bảo trì" });
      setBlockModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["listing_blocks"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Lỗi", description: err.message }),
  });

  // ── Derived data ─────────────────────────────────────────────────────────
  const allListings = (listingsQuery.data ?? []) as Listing[];

  const listings = useMemo((): Listing[] => {
    const actives = allListings.filter((l) => l.status !== "inactive");
    if (listingFilter.length === 0) return actives;
    return actives.filter((l) => listingFilter.includes(l.id));
  }, [allListings, listingFilter]);

  const bookings = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    return all.filter((b) => {
      if (statusFilter.length > 0 && !statusFilter.includes(b.status)) return false;
      if (sourceFilter.length > 0) {
        const src = b.source ?? "Other";
        if (!sourceFilter.includes(src)) return false;
      }
      return true;
    });
  }, [bookingsQuery.data, statusFilter, sourceFilter]);

  const blocks = blocksQuery.data ?? [];

  // ── Period helpers ────────────────────────────────────────────────────────
  const TIMELINE_DAYS = 42; // ~6 weeks

  const periodStart = useMemo(() => {
    if (view === "week") return startOfWeek(viewDate, { weekStartsOn: 1 });
    return startOfMonth(viewDate);
  }, [view, viewDate]);

  const periodDays = view === "week" ? 7 : TIMELINE_DAYS;

  // ── Navigation ────────────────────────────────────────────────────────────
  function prev() {
    if (view === "week") setViewDate((d) => subWeeks(d, 1));
    else setViewDate((d) => subMonths(d, 1));
  }
  function next() {
    if (view === "week") setViewDate((d) => addWeeks(d, 1));
    else setViewDate((d) => addMonths(d, 1));
  }
  function goToday() {
    setViewDate(startOfMonth(new Date()));
  }

  const periodLabel = useMemo(() => {
    if (view === "week") {
      const ws = startOfWeek(viewDate, { weekStartsOn: 1 });
      const we = endOfWeek(viewDate, { weekStartsOn: 1 });
      return `${format(ws, "dd/MM")} – ${format(we, "dd/MM/yyyy")}`;
    }
    return format(viewDate, "MMMM yyyy");
  }, [view, viewDate]);

  const isLoading = listingsQuery.isLoading || bookingsQuery.isLoading;

  const selectedListing = selectedBooking
    ? (allListings.find((l) => l.id === selectedBooking.listing_id) as Listing | undefined) ?? null
    : null;

  const toggleFilter = (arr: string[], setFn: (v: string[]) => void, val: string) =>
    setFn(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  return (
    <AppLayout
      title="Lịch Tình Trạng"
      action={
        canManage ? (
          <Button size="sm" onClick={() => setBlockModalOpen(true)} className="gap-1.5">
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">Thêm bảo trì</span>
          </Button>
        ) : null
      }
    >
      {/* ── Migration notice ──────────────────────────────────────────────── */}
      {showMigration && canManage && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                Cần chạy migration để dùng tính năng bảo trì
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                Chạy SQL dưới đây trong Supabase SQL Editor:
              </p>
              <pre className="mt-2 overflow-x-auto rounded bg-amber-100 dark:bg-amber-900/30 p-2 text-[11px] text-amber-900 dark:text-amber-300">
                {MIGRATION_SQL}
              </pre>
            </div>
            <button
              onClick={() => setShowMigration(false)}
              className="shrink-0 text-amber-600 hover:text-amber-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* View switcher */}
        <div className="flex items-center rounded-lg border overflow-hidden bg-background shadow-sm">
          {(
            [
              { key: "timeline" as CalendarView, Icon: StretchHorizontal, label: "Timeline" },
              { key: "month"    as CalendarView, Icon: LayoutGrid,        label: "Tháng"    },
              { key: "week"     as CalendarView, Icon: CalendarDays,      label: "Tuần"     },
            ] as const
          ).map(({ key, Icon, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                view === key
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Period navigation */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8 shadow-sm" onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 min-w-[9rem] px-3 font-medium shadow-sm"
            onClick={goToday}
          >
            {periodLabel}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 shadow-sm" onClick={next}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1" />

        {/* Filters */}
        <MultiSelectFilter
          label="Căn hộ"
          options={allListings.map((l) => ({ value: l.id, label: l.title }))}
          selected={listingFilter}
          onToggle={(v) => toggleFilter(listingFilter, setListingFilter, v)}
          onSelectAll={() => setListingFilter(allListings.map((l) => l.id))}
          onClear={() => setListingFilter([])}
        />
        <MultiSelectFilter
          label="Trạng thái"
          options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          selected={statusFilter}
          onToggle={(v) => toggleFilter(statusFilter, setStatusFilter, v)}
          onSelectAll={() => setStatusFilter([...ALL_STATUSES])}
          onClear={() => setStatusFilter([])}
        />
        <MultiSelectFilter
          label="Nguồn"
          options={ALL_SOURCES.map((s) => ({ value: s, label: s }))}
          selected={sourceFilter}
          onToggle={(v) => toggleFilter(sourceFilter, setSourceFilter, v)}
          onSelectAll={() => setSourceFilter([...ALL_SOURCES])}
          onClear={() => setSourceFilter([])}
        />
      </div>

      {/* ── Occupancy analytics strip ──────────────────────────────────────── */}
      {!isLoading && listings.length > 0 && (
        <OccupancyStrip
          listings={listings}
          bookings={bookingsQuery.data ?? []}
          blocks={blocks}
          periodStart={periodStart}
          periodDays={view === "month" ? getDaysInMonth(viewDate) : periodDays}
        />
      )}

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {[
          { cls: "bg-white border border-border", label: "Trống" },
          { cls: "bg-blue-600", label: "Đã xác nhận" },
          { cls: "bg-amber-500", label: "Chờ xác nhận" },
          { cls: "bg-emerald-600", label: "Hoàn thành" },
          { cls: "bg-emerald-50 border border-emerald-200", label: "Check-in" },
          { cls: "bg-orange-50 border border-orange-200", label: "Check-out" },
        ].map(({ cls, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 shrink-0 rounded-sm", cls)} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 shrink-0 rounded-sm border border-slate-400/60 bg-slate-100"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)",
            }}
          />
          Bảo trì
        </span>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CalendarRange className="mb-3 h-10 w-10 opacity-25" />
          <p className="text-sm">Không có căn hộ nào để hiển thị</p>
          {listingFilter.length > 0 && (
            <Button
              variant="link"
              size="sm"
              className="mt-2"
              onClick={() => setListingFilter([])}
            >
              Xóa bộ lọc căn hộ
            </Button>
          )}
        </div>
      ) : view === "month" ? (
        <MonthView
          listings={listings}
          bookings={bookings}
          blocks={blocks}
          viewDate={viewDate}
          onBookingClick={setSelectedBooking}
        />
      ) : (
        <TimelineView
          listings={listings}
          bookings={bookings}
          blocks={blocks}
          periodStart={periodStart}
          periodDays={periodDays}
          onBookingClick={setSelectedBooking}
        />
      )}

      {/* ── Booking detail modal ──────────────────────────────────────────── */}
      <BookingDetailModal
        booking={selectedBooking}
        listing={selectedListing}
        open={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        onStatusChange={(id, status) => updateStatusMutation.mutate({ id, status })}
        isUpdating={updateStatusMutation.isPending}
        canManage={canManage}
      />

      {/* ── Add block modal ───────────────────────────────────────────────── */}
      <AddBlockModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        listings={allListings}
        onSave={(block) => addBlockMutation.mutate(block)}
        isSaving={addBlockMutation.isPending}
      />
    </AppLayout>
  );
}

// helper used in OccupancyStrip
function getDaysInMonth(date: Date): number {
  return endOfMonth(date).getDate();
}
