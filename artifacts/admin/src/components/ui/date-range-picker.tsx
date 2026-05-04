import { useState } from "react";
import {
  endOfMonth,
  endOfQuarter,
  format,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
} from "date-fns";
import { CalendarRange } from "lucide-react";
import type { DateRange } from "react-day-picker";

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
  const [pending, setPending] = useState<DateRange>({
    from: startDate,
    to: endDate,
  });

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) setPending({ from: startDate, to: endDate });
    setOpen(isOpen);
  }

  function applyPreset(getRange: () => { from: Date; to: Date }) {
    const r = getRange();
    setPending({ from: r.from, to: r.to });
  }

  function handleApply() {
    const from = pending?.from;
    const to = pending?.to ?? pending?.from;
    if (from && to) {
      onApply(from, to);
      setOpen(false);
    }
  }

  function handleCancel() {
    setPending({ from: startDate, to: endDate });
    setOpen(false);
  }

  // Display the committed range on the trigger button
  const triggerLabel = `${format(startDate, "dd/MM/yyyy")} – ${format(endDate, "dd/MM/yyyy")}`;

  // Display pending selection inside the popover footer
  const footerText =
    pending?.from && pending?.to
      ? `${format(pending.from, "dd/MM/yyyy")} – ${format(pending.to, "dd/MM/yyyy")}`
      : pending?.from
      ? `${format(pending.from, "dd/MM/yyyy")} → chọn ngày kết thúc`
      : "Chọn ngày bắt đầu";

  const footerIsRange = !!(pending?.from && pending?.to);
  const canApply = !!(pending?.from);

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

          {/* ── Calendar area ────────────────────────────────────────────── */}
          <div className="flex flex-col">
            <Calendar
              mode="range"
              selected={pending}
              onSelect={(r) =>
                setPending(r ?? { from: undefined, to: undefined })
              }
              numberOfMonths={2}
              disabled={{ after: new Date() }}
              className="p-3"
            />

            {/* Footer: range display + action buttons */}
            <div className="flex items-center justify-between gap-6 border-t bg-muted/20 px-4 py-2.5">
              <span
                className={cn(
                  "text-sm",
                  footerIsRange ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {footerText}
              </span>
              <div className="flex shrink-0 gap-2">
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
