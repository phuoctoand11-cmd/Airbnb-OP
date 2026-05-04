"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-background group/calendar [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),

        months: cn(
          "relative flex flex-col gap-8 md:flex-row",
          defaultClassNames.months
        ),

        // Each month column — min-width ensures grid doesn't collapse
        month: cn(
          "flex min-w-[280px] flex-col gap-3",
          defaultClassNames.month
        ),

        // Prev / Next navigation — absolutely positioned at top corners
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-9 w-9 select-none p-0 rounded-lg text-slate-500",
          "hover:bg-slate-100 hover:text-slate-700 aria-disabled:opacity-25",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-9 w-9 select-none p-0 rounded-lg text-slate-500",
          "hover:bg-slate-100 hover:text-slate-700 aria-disabled:opacity-25",
          defaultClassNames.button_next
        ),

        // Month title row
        month_caption: cn(
          "flex h-9 w-full items-center justify-center px-9",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "select-none text-sm font-semibold tracking-normal text-slate-800",
          defaultClassNames.caption_label
        ),

        dropdowns: cn(
          "flex h-9 w-full items-center justify-center gap-1.5 text-sm font-semibold",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "has-focus:border-ring border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] relative rounded-md border",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "bg-popover absolute inset-0 opacity-0",
          defaultClassNames.dropdown
        ),

        // ── Grid ────────────────────────────────────────────────────────────
        // The <table>, <tr> rows, and <td>/<th> cells.
        // We override display so every row is a 7-item flex row
        // and every cell is flex-1 with a fixed height of 36px (h-9).
        table: "w-full",

        // Weekday header row — 7 equal columns
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          // flex-1 so each header matches the day cell width
          "flex h-8 flex-1 select-none items-center justify-center",
          "text-[11px] font-semibold uppercase tracking-wide text-slate-400",
          defaultClassNames.weekday
        ),

        // Each week row — 7 equal columns, 4px gap between rows
        week: cn("mt-1 flex", defaultClassNames.week),

        // Each day cell (<td>) — flex-1 so it matches the header width
        // h-9 = 36px fixed height; range band bg applied here
        day: cn(
          "group/day relative flex h-9 flex-1 select-none items-center justify-center p-0",
          defaultClassNames.day
        ),

        // ── Range band colours on the <td> cell ─────────────────────────────
        // Light blue stretches across the full cell width; endpoints get
        // rounded caps so the band looks like a pill.
        range_start: "bg-blue-100 rounded-l-full",
        range_middle: "bg-blue-100",
        range_end:   "bg-blue-100 rounded-r-full",

        // Today — ring handled on the button via data-today-ring
        today: "",

        // Outside-month days — very muted
        outside: cn(
          "text-slate-300 aria-selected:text-slate-300",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-slate-300 opacity-40 cursor-not-allowed",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),

        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
        ),
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left")
            return <ChevronLeftIcon  className={cn("size-4", className)} {...props} />
          if (orientation === "right")
            return <ChevronRightIcon className={cn("size-4", className)} {...props} />
          return   <ChevronDownIcon  className={cn("size-4", className)} {...props} />
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => (
          <td {...props}>
            <div className="flex h-9 w-9 items-center justify-center text-center text-xs text-slate-400">
              {children}
            </div>
          </td>
        ),
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const isSingleSelected =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle

  // Show today ring only when the day isn't inside a selected range
  const showTodayRing =
    modifiers.today && !modifiers.selected && !modifiers.range_middle

  return (
    <button
      ref={ref}
      type="button"
      data-selected-single={isSingleSelected || undefined}
      data-range-start={modifiers.range_start || undefined}
      data-range-end={modifiers.range_end || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      data-today-ring={showTodayRing || undefined}
      disabled={modifiers.disabled}
      className={cn(
        // ── Base ──────────────────────────────────────────────────────────
        // Fixed 36px square, centered within the flex-1 <td>,
        // always rounded-lg for normal days
        "relative flex h-9 w-9 items-center justify-center rounded-lg",
        "text-sm font-medium tracking-normal text-slate-700",
        "transition-colors duration-100 outline-none",
        "cursor-pointer select-none",
        // Normal hover
        "hover:bg-slate-100 hover:text-slate-900",
        // Focus
        "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",

        // ── Single selection ──────────────────────────────────────────────
        "data-[selected-single]:bg-blue-600 data-[selected-single]:text-white",
        "data-[selected-single]:rounded-full data-[selected-single]:hover:bg-blue-700",

        // ── Range start — solid blue circle ───────────────────────────────
        "data-[range-start]:bg-blue-600 data-[range-start]:text-white",
        "data-[range-start]:rounded-full data-[range-start]:hover:bg-blue-700",

        // ── Range end — solid blue circle ─────────────────────────────────
        "data-[range-end]:bg-blue-600 data-[range-end]:text-white",
        "data-[range-end]:rounded-full data-[range-end]:hover:bg-blue-700",

        // ── Range middle — transparent (band colour comes from <td>) ──────
        "data-[range-middle]:bg-transparent data-[range-middle]:text-blue-900",
        "data-[range-middle]:rounded-none data-[range-middle]:hover:bg-blue-200",

        // ── Today ring ────────────────────────────────────────────────────
        "data-[today-ring]:ring-1 data-[today-ring]:ring-blue-400",
        "data-[today-ring]:rounded-full",

        // ── Disabled ──────────────────────────────────────────────────────
        "disabled:pointer-events-none disabled:opacity-30",

        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
