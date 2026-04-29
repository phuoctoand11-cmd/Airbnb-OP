import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  supabase,
  type Booking,
  type CalendarEntry,
  type Listing,
} from "@/lib/supabase";

interface Props {
  listing: Listing;
  canManage: boolean;
  /** When true, price-related fields are hidden and price columns are not fetched. */
  isSales?: boolean;
}

export function ListingCalendarTab({ listing, canManage, isSales = false }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const start = startOfMonth(cursor);
  const end = endOfMonth(cursor);
  const days = eachDayOfInterval({ start, end });

  // For sale users: omit price_override from calendar_entries; only fetch availability info
  const calendarSelect = isSales
    ? "id,listing_id,date,is_available,note"
    : "*";

  const calendarQuery = useQuery({
    queryKey: ["calendar", listing.id, format(start, "yyyy-MM"), isSales],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_entries")
        .select(calendarSelect)
        .eq("listing_id", listing.id)
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(end, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []) as unknown as CalendarEntry[];
    },
  });

  // For sale users: only fetch date/status columns — no total_amount, paid_amount, etc.
  const bookingsSelect = isSales
    ? "id,listing_id,check_in,check_out,status"
    : "*";

  const bookingsQuery = useQuery({
    queryKey: ["calendar-bookings", listing.id, format(start, "yyyy-MM"), isSales],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(bookingsSelect)
        .eq("listing_id", listing.id)
        .in("status", ["confirmed", "completed", "pending"])
        .lte("check_in", format(end, "yyyy-MM-dd"))
        .gte("check_out", format(start, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []) as unknown as Booking[];
    },
  });

  const entryByDate = useMemo(() => {
    const m = new Map<string, CalendarEntry>();
    (calendarQuery.data ?? []).forEach((e) => m.set(e.date.slice(0, 10), e));
    return m;
  }, [calendarQuery.data]);

  const bookings = bookingsQuery.data ?? [];
  const isBooked = (d: Date) =>
    bookings.some((b) =>
      isWithinInterval(d, {
        start: parseISO(b.check_in),
        end: parseISO(b.check_out),
      })
    );

  const upsertMutation = useMutation({
    mutationFn: async (payload: {
      date: string;
      is_available: boolean;
      price_override: number | null;
      note: string | null;
    }) => {
      const existing = entryByDate.get(payload.date);
      if (existing) {
        const { error } = await supabase
          .from("calendar_entries")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("calendar_entries").insert({
          listing_id: listing.id,
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Calendar updated" });
      queryClient.invalidateQueries({ queryKey: ["calendar", listing.id] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not update calendar", description: err.message }),
  });

  const selectedEntry = selectedDate ? entryByDate.get(format(selectedDate, "yyyy-MM-dd")) : null;
  const isLoading = calendarQuery.isLoading || bookingsQuery.isLoading;
  const error = calendarQuery.error || bookingsQuery.error;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <Button size="icon" variant="outline" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="text-lg font-semibold">{format(cursor, "MMMM yyyy")}</h3>
            <Button size="icon" variant="outline" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load calendar</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 text-sm">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {d}
                </div>
              ))}
              {Array.from({ length: start.getDay() }).map((_, i) => (
                <div key={`b-${i}`} />
              ))}
              {days.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const entry = entryByDate.get(key);
                const booked = isBooked(d);
                const blocked = entry && entry.is_available === false;
                const isSelected = selectedDate && isSameDay(selectedDate, d);
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(d)}
                    className={`flex h-16 flex-col items-stretch justify-between rounded-md border bg-card p-1 text-left transition-colors hover-elevate ${
                      isSelected ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <span className="text-xs font-medium">{format(d, "d")}</span>
                    <div className="flex flex-wrap gap-1">
                      {booked && (
                        <span className="rounded-sm bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                          Booked
                        </span>
                      )}
                      {blocked && !booked && (
                        <span className="rounded-sm bg-destructive/10 px-1 text-[10px] font-semibold text-destructive">
                          Blocked
                        </span>
                      )}
                      {!isSales && entry?.price_override != null && (
                        <span className="rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                          ${Number(entry.price_override).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          {!selectedDate ? (
            <div className="text-sm text-muted-foreground">
              Select a date to view or edit availability.
            </div>
          ) : (
            <DayEditor
              date={selectedDate}
              entry={selectedEntry ?? null}
              booked={isBooked(selectedDate)}
              canManage={canManage}
              isSales={isSales}
              onSave={(payload) => upsertMutation.mutate(payload)}
              saving={upsertMutation.isPending}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DayEditor({
  date,
  entry,
  booked,
  canManage,
  isSales = false,
  onSave,
  saving,
}: {
  date: Date;
  entry: CalendarEntry | null;
  booked: boolean;
  canManage: boolean;
  isSales?: boolean;
  onSave: (p: { date: string; is_available: boolean; price_override: number | null; note: string | null }) => void;
  saving: boolean;
}) {
  const [available, setAvailable] = useState(entry?.is_available ?? true);
  const [price, setPrice] = useState<string>(
    entry?.price_override != null ? String(entry.price_override) : ""
  );
  const [note, setNote] = useState(entry?.note ?? "");

  // Re-sync when entry/date changes
  useMemo(() => {
    setAvailable(entry?.is_available ?? true);
    setPrice(entry?.price_override != null ? String(entry.price_override) : "");
    setNote(entry?.note ?? "");
  }, [entry, date]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{format(date, "PPPP")}</h3>
        {booked && (
          <p className="mt-1 text-xs text-muted-foreground">
            This date is part of an existing booking.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label htmlFor="avail">Available</Label>
          <p className="text-xs text-muted-foreground">Block this date from new bookings.</p>
        </div>
        <Switch
          id="avail"
          checked={available}
          disabled={!canManage}
          onCheckedChange={setAvailable}
        />
      </div>

      {!isSales && (
        <div className="space-y-2">
          <Label htmlFor="price">Price override (per night)</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            min="0"
            placeholder="Leave empty to use base price"
            value={price}
            disabled={!canManage}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Input
          id="note"
          placeholder="e.g. Owner staying"
          value={note}
          disabled={!canManage}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {canManage && (
        <Button
          className="w-full"
          disabled={saving}
          onClick={() =>
            onSave({
              date: format(date, "yyyy-MM-dd"),
              is_available: available,
              // sale users never send a price_override value
              price_override: isSales ? null : price === "" ? null : Number(price),
              note: note.trim() === "" ? null : note.trim(),
            })
          }
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save day
        </Button>
      )}
    </div>
  );
}
