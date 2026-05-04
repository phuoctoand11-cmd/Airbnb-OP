import { useState } from "react";
import {
  endOfMonth,
  endOfQuarter,
  format,
  isBefore,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
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

// ── Quick presets ──────────────────────────────────────────────────────────────

const PRESETS: { label: string; getRange: () => { from: Date; to: Date } }[] = [
  {
    label: "Hôm nay",
    getRange: () => { const d = new Date(); return { from: d, to: d }; },
  },
  {
    label: "7 ngày gần đây",
    getRange: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    label: "30 ngày gần đây",
    getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    label: "Tháng này",
    getRange: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    label: "Tháng trước",
    getRange: () => {
      const lm = subMonths(new Date(), 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    },
  },
  {
    label: "Quý này",
    getRange: () => ({ from: startOfQuarter(new Date()), to: new Date() }),
  },
  {
    label: "Quý trước",
    getRange: () => {
      const lq = subQuarters(new Date(), 1);
      return { from: startOfQuarter(lq), to: endOfQuarter(lq) };
    },
  },
  {
    label: "Năm nay",
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

  // Trigger — shows committed (applied) range
  const triggerLabel = `${format(startDate, "dd/MM/yyyy")} – ${format(endDate, "dd/MM/yyyy")}`;

  // Footer selection indicator
  let selectionLine: string;
  if (phase === 1 && pendingFrom) {
    selectionLine = `${format(pendingFrom, "dd/MM/yyyy")} → chọn ngày kết thúc`;
  } else if (phase === 2 && pendingFrom && pendingTo) {
    selectionLine = `${format(pendingFrom, "dd/MM/yyyy")} – ${format(pendingTo, "dd/MM/yyyy")}`;
  } else {
    selectionLine = "Nhấn vào ngày bắt đầu trên lịch";
  }

  const canApply = phase !== 0 && !!pendingFrom;

  // Calendar `selected` prop — drives visual range highlight
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
          <span className="text-sm text-muted-foreground">Khoảng thời gian</span>
          <span className="h-4 w-px bg-border/70 mx-0.5" />
          <span className="text-sm font-semibold tabular-nums">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>

      {/* ── Popover ─────────────────────────────────────────────────────────── */}
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn(
          "w-auto p-0",
          "rounded-xl border border-border/40 shadow-2xl",
          "bg-background overflow-hidden",
          // Prevent overflow on small screens
          "max-h-[calc(100vh-4rem)] overflow-y-auto"
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col sm:flex-row">
          {/* ── Preset sidebar ──────────────────────────────────────────────── */}
          <div
            className="flex flex-col border-b sm:border-b-0 sm:border-r border-border/40 bg-muted/25"
            style={{ minWidth: 180 }}
          >
            {/* Sidebar header */}
            <div className="px-4 py-3 border-b border-border/30">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Khoảng thời gian
              </p>
            </div>

            {/* Preset buttons */}
            <div className="flex flex-col gap-px p-2">
              {PRESETS.map((p) => {
                const isActive = activePreset === p.label;
                return (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.label, p.getRange)}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "text-foreground/80 hover:bg-primary/8 hover:text-primary"
                    )}
                  >
                    <span>{p.label}</span>
                    {isActive && (
                      <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Calendar + footer ───────────────────────────────────────────── */}
          <div className="flex flex-col min-w-0">
            {/* Calendar */}
            <div className="p-1">
              <Calendar
                mode="range"
                selected={calendarSelected}
                onDayClick={handleDayClick}
                onSelect={() => {}}
                numberOfMonths={2}
                className="p-3"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-4 border-t border-border/40 bg-muted/20 px-4 py-3">
              {/* Selection indicator */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Đang chọn
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
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg px-4 text-muted-foreground hover:text-foreground"
                  onClick={handleCancel}
                >
                  Hủy
                </Button>
                <Button
                  size="sm"
                  className="rounded-lg px-5 shadow-sm"
                  disabled={!canApply}
                  onClick={handleApply}
                >
                  Áp dụng
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
