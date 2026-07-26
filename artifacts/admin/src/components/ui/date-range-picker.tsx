import { useState } from "react";
import {
  endOfMonth,
  endOfQuarter,
  format,
  isBefore,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subQuarters,
} from "date-fns";
import { CalendarRange, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

// ── Quick presets ──────────────────────────────────────────────────────────────

/** `id` is the stable identity used for the active-preset check; the visible
 *  label is looked up from the dictionary at render time. */
const PRESETS: {
  id: "today" | "thisMonth" | "lastMonth" | "thisQuarter" | "lastQuarter" | "thisYear";
  getRange: () => { from: Date; to: Date };
}[] = [
  {
    id: "today",
    getRange: () => { const d = new Date(); return { from: d, to: d }; },
  },
  {
    id: "thisMonth",
    getRange: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    id: "lastMonth",
    getRange: () => {
      const lm = subMonths(new Date(), 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    },
  },
  {
    id: "thisQuarter",
    getRange: () => ({ from: startOfQuarter(new Date()), to: new Date() }),
  },
  {
    id: "lastQuarter",
    getRange: () => {
      const lq = subQuarters(new Date(), 1);
      return { from: startOfQuarter(lq), to: endOfQuarter(lq) };
    },
  },
  {
    id: "thisYear",
    getRange: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
];

// ── Selection phase ────────────────────────────────────────────────────────────
// 0 = nothing selected
// 1 = start date selected, waiting for end date
// 2 = full range selected (next click resets)

type Phase = 0 | 1 | 2;

// ── Component ──────────────────────────────────────────────────────────────────

export interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onApply: (start: Date, end: Date) => void;
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onApply,
  className,
}: DateRangePickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // Pending selection (inside popover — not yet applied)
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>(startDate);
  const [pendingTo, setPendingTo] = useState<Date | undefined>(endDate);
  const [phase, setPhase] = useState<Phase>(2);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // ── Open / close ───────────────────────────────────────────────────────────
  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setPendingFrom(startDate);
      setPendingTo(endDate);
      setPhase(2);
      setActivePreset(null);
    }
    setOpen(isOpen);
  }

  // ── Day click — 3-phase state machine (DO NOT CHANGE) ────────────────────
  function handleDayClick(day: Date) {
    setActivePreset(null);
    if (phase === 0 || phase === 2) {
      setPendingFrom(day);
      setPendingTo(undefined);
      setPhase(1);
    } else {
      const from = pendingFrom!;
      if (isBefore(day, from)) {
        setPendingFrom(day);
        setPendingTo(from);
      } else {
        setPendingTo(day);
      }
      setPhase(2);
    }
  }

  // ── Preset click ──────────────────────────────────────────────────────────
  function applyPreset(label: string, getRange: () => { from: Date; to: Date }) {
    const r = getRange();
    setPendingFrom(r.from);
    setPendingTo(r.to);
    setPhase(2);
    setActivePreset(label);
  }

  // ── Apply / Cancel ────────────────────────────────────────────────────────
  function handleApply() {
    if (!pendingFrom) return;
    const to = pendingTo ?? pendingFrom;
    onApply(pendingFrom, to);
    setOpen(false);
  }

  function handleCancel() {
    setPendingFrom(startDate);
    setPendingTo(endDate);
    setPhase(2);
    setActivePreset(null);
    setOpen(false);
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  const triggerLabel = `${format(startDate, "dd/MM/yyyy")} – ${format(endDate, "dd/MM/yyyy")}`;

  let selectionLine: string;
  if (phase === 1 && pendingFrom) {
    selectionLine = `${format(pendingFrom, "dd/MM/yyyy")} → ${t.dateRange.pickEndDate}`;
  } else if (phase === 2 && pendingFrom && pendingTo) {
    selectionLine = `${format(pendingFrom, "dd/MM/yyyy")} – ${format(pendingTo, "dd/MM/yyyy")}`;
  } else {
    selectionLine = t.dateRange.pickStartDate;
  }

  const canApply = phase !== 0 && !!pendingFrom;

  const calendarSelected =
    pendingFrom && pendingTo
      ? { from: pendingFrom, to: pendingTo }
      : pendingFrom
      ? { from: pendingFrom, to: undefined }
      : undefined;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {/* ── Trigger button ──────────────────────────────────────────────────── */}
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 gap-1.5 px-3 font-normal border-border/70",
            "hover:bg-muted/50 hover:border-border",
            "data-[state=open]:border-primary/60 data-[state=open]:ring-2 data-[state=open]:ring-primary/20",
            className
          )}
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-primary/80" />
          <span className="text-sm font-semibold tabular-nums">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>

      {/* ── Popover ─────────────────────────────────────────────────────────── */}
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(
          "p-0 rounded-xl border border-border/40 shadow-2xl bg-background overflow-hidden",
          // Mobile: nearly full viewport width; desktop: auto
          "w-[calc(100vw-1rem)] sm:w-auto",
          "max-h-[calc(100dvh-5rem)] overflow-y-auto"
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* ── Mobile: horizontal preset scroll strip ────────────────────────── */}
        <div className="sm:hidden border-b border-border/40 bg-muted/20 px-3 py-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {PRESETS.map((p) => {
              const isActive = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id, p.getRange)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border/60 text-foreground/70 hover:border-primary/50 hover:text-primary"
                  )}
                >
                  {t.dateRange[p.id]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main layout: sidebar (desktop) + calendar ─────────────────────── */}
        <div className="flex flex-col sm:flex-row">

          {/* ── Desktop preset sidebar (hidden on mobile) ─────────────────── */}
          <div
            className="hidden sm:flex flex-col border-r border-border/40 bg-muted/25"
            style={{ minWidth: 160 }}
          >
            <div className="px-4 py-3 border-b border-border/30">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t.dateRange.quick}
              </p>
            </div>
            <div className="flex flex-col gap-px p-2">
              {PRESETS.map((p) => {
                const isActive = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id, p.getRange)}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "text-foreground/80 hover:bg-primary/8 hover:text-primary"
                    )}
                  >
                    <span>{t.dateRange[p.id]}</span>
                    {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-70" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Calendar + footer ───────────────────────────────────────────── */}
          <div className="flex flex-col min-w-0 flex-1">
            {/* Calendar
                Mobile: 1 month, larger touch targets via classNames override
                Desktop: 2 months side by side */}
            <div className="p-1">
              {/* Mobile calendar — 1 month, 44px touch targets */}
              <div className="sm:hidden">
                <Calendar
                  mode="range"
                  selected={calendarSelected}
                  onDayClick={handleDayClick}
                  onSelect={() => {}}
                  numberOfMonths={1}
                  className="p-2"
                  classNames={{
                    day: "h-11 w-11 text-sm font-normal aria-selected:opacity-100",
                    day_selected:
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_range_middle:
                      "aria-selected:bg-primary/15 aria-selected:text-foreground aria-selected:rounded-none",
                    day_range_start: "rounded-l-full",
                    day_range_end: "rounded-r-full",
                    head_cell: "w-11 text-xs font-semibold text-muted-foreground",
                    cell: "p-0",
                    nav_button: "h-10 w-10",
                  }}
                />
              </div>
              {/* Desktop calendar — 2 months */}
              <div className="hidden sm:block">
                <Calendar
                  mode="range"
                  selected={calendarSelected}
                  onDayClick={handleDayClick}
                  onSelect={() => {}}
                  numberOfMonths={2}
                  className="p-3"
                />
              </div>
            </div>

            {/* Footer — stacked full-width on mobile, inline on desktop */}
            <div className="border-t border-border/40 bg-muted/20">
              {/* Selection indicator */}
              <div className="px-4 pt-3 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                  {t.dateRange.selecting}
                </p>
                <p
                  className={cn(
                    "text-sm truncate",
                    phase === 2 && pendingFrom && pendingTo
                      ? "font-semibold text-foreground"
                      : phase === 1
                      ? "text-primary font-medium"
                      : "text-muted-foreground italic"
                  )}
                >
                  {selectionLine}
                </p>
              </div>

              {/* Action buttons */}
              {/* Mobile: full-width stacked, 48px height */}
              <div className="flex flex-col gap-2 px-3 pb-3 pt-2 sm:hidden">
                <Button
                  size="lg"
                  className="w-full h-12 rounded-xl text-base shadow-sm"
                  disabled={!canApply}
                  onClick={handleApply}
                >
                  {t.dateRange.apply}
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full h-12 rounded-xl text-base text-muted-foreground"
                  onClick={handleCancel}
                >
                  {t.dateRange.cancel}
                </Button>
              </div>
              {/* Desktop: inline right-aligned */}
              <div className="hidden sm:flex items-center justify-end gap-2 px-4 pb-3 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg px-4 text-muted-foreground hover:text-foreground"
                  onClick={handleCancel}
                >
                  {t.dateRange.cancel}
                </Button>
                <Button
                  size="sm"
                  className="rounded-lg px-5 shadow-sm"
                  disabled={!canApply}
                  onClick={handleApply}
                >
                  {t.dateRange.apply}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
