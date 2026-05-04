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
import { CalendarRange } from "lucide-react";

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

  // Reset pending state to the last committed range when opening
  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setPendingFrom(startDate);
      setPendingTo(endDate);
      setPhase(2);
    }
    setOpen(isOpen);
  }

  // ── Click handler for calendar days ───────────────────────────────────────
  function handleDayClick(day: Date) {
    if (phase === 0 || phase === 2) {
      // Click 1 (or reset after phase 2): start a new range
      setPendingFrom(day);
      setPendingTo(undefined);
      setPhase(1);
    } else {
      // Click 2: finalize the range (swap if needed)
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
  function applyPreset(getRange: () => { from: Date; to: Date }) {
    const r = getRange();
    setPendingFrom(r.from);
    setPendingTo(r.to);
    setPhase(2);
  }

  // ── Apply / Cancel ────────────────────────────────────────────────────────
  function handleApply() {
    if (!pendingFrom) return;
    const to = pendingTo ?? pendingFrom;
    onApply(pendingFrom, to);
    setOpen(false);
  }

  function handleCancel() {
    // Restore to last committed range without applying
    setPendingFrom(startDate);
    setPendingTo(endDate);
    setPhase(2);
    setOpen(false);
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  // Trigger button — always shows the *committed* (applied) range
  const triggerLabel = `${format(startDate, "dd/MM/yyyy")} – ${format(endDate, "dd/MM/yyyy")}`;

  // "Đang chọn" line inside the popover — shows the pending selection
  let selectionText: string;
  if (phase === 1 && pendingFrom) {
    selectionText = `Đang chọn: ${format(pendingFrom, "dd/MM/yyyy")} → chọn ngày kết thúc`;
  } else if (phase === 2 && pendingFrom && pendingTo) {
    selectionText = `Đang chọn: ${format(pendingFrom, "dd/MM/yyyy")} - ${format(pendingTo, "dd/MM/yyyy")}`;
  } else {
    selectionText = "Nhấn vào ngày bắt đầu trên lịch";
  }

  const canApply = phase !== 0 && !!pendingFrom;

  // The `selected` prop drives the visual range highlight on the calendar
  const calendarSelected =
    pendingFrom && pendingTo
      ? { from: pendingFrom, to: pendingTo }
      : pendingFrom
      ? { from: pendingFrom, to: undefined }
      : undefined;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 gap-2 px-3 font-normal", className)}
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm">Chọn khoảng thời gian</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm font-semibold">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto p-0 shadow-xl"
        // Stop clicks inside the popover from bubbling up and toggling it closed
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex overflow-hidden rounded-md divide-x">
          {/* ── Preset sidebar ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-0.5 bg-muted/30 p-2" style={{ minWidth: 152 }}>
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Nhanh
            </p>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.getRange)}
                className="w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* ── Calendar + footer ────────────────────────────────────────── */}
          <div className="flex flex-col">
            <Calendar
              mode="range"
              selected={calendarSelected}
              // Use onDayClick for our custom state machine; suppress onSelect
              onDayClick={handleDayClick}
              onSelect={() => {}}
              numberOfMonths={2}
              className="p-3"
            />

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-2 border-t bg-muted/20 px-4 py-3">
              {/* Visible selection indicator */}
              <p
                className={cn(
                  "text-sm",
                  phase === 2
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {selectionText}
              </p>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Hủy
                </Button>
                <Button size="sm" disabled={!canApply} onClick={handleApply}>
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
