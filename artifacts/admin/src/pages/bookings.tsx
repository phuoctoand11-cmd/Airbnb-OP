import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { CalendarDays, ChevronDown, ClipboardCheck, Loader2, Plus, Sparkles, Brush } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { hasPermission, useAuth } from "@/lib/auth-context";
import { supabase, type Booking, type Employee, type Listing } from "@/lib/supabase";
import { useI18n } from "@/i18n";
import { useCurrency } from "@/lib/currency";

// ── Types ────────────────────────────────────────────────────────────────────

type AssignableEmployee = Pick<Employee, "id" | "full_name" | "email" | "status">;

// ── Status options (for multi-select filter) ─────────────────────────────────

const STATUS_OPTIONS: { value: Booking["status"]; label: string }[] = [
  { value: "pending",   label: "Chờ xác nhận" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
];

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  Booking["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "outline",
  confirmed: "default",
  completed: "secondary",
  cancelled: "destructive",
};

// ── Auto-task config ──────────────────────────────────────────────────────────

const AUTO_TASKS = [
  {
    key: "checkin_assignee_id" as const,
    type: "checkin_prepare" as const,
    labelKey: "checkinPrep" as const,
    dueKey: "dueCheckin" as const,
    dueDateField: "check_in" as const,
    priority: "high" as const,
    icon: Sparkles,
    color: "text-teal-600",
    bg: "bg-teal-50 dark:bg-teal-950",
  },
  {
    key: "checkout_assignee_id" as const,
    type: "checkout_check" as const,
    labelKey: "checkoutInspection" as const,
    dueKey: "dueCheckout" as const,
    dueDateField: "check_out" as const,
    priority: "medium" as const,
    icon: ClipboardCheck,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950",
  },
  {
    key: "cleaning_assignee_id" as const,
    type: "cleaning" as const,
    labelKey: "cleaningTask" as const,
    dueKey: "dueCheckout" as const,
    dueDateField: "check_out" as const,
    priority: "high" as const,
    icon: Brush,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950",
  },
] as const;

// ── Schema ───────────────────────────────────────────────────────────────────

const bookingSchema = z
  .object({
    listing_id: z.string().min(1, "Listing required"),
    guest_name: z.string().min(1, "Guest name required"),
    guest_email: z.string().email().or(z.literal("")).optional(),
    guest_phone: z.string().optional(),
    check_in: z.string().min(1, "Check-in required"),
    check_out: z.string().min(1, "Check-out required"),
    guests: z.coerce.number().int().min(1),
    total_amount: z.coerce.number().min(0),
    status: z.enum(["pending", "confirmed", "completed", "cancelled"]),
    source: z.string().optional(),
    notes: z.string().optional(),
    // Optional task assignees — one per auto-created task
    checkin_assignee_id: z.string().optional(),
    checkout_assignee_id: z.string().optional(),
    cleaning_assignee_id: z.string().optional(),
  })
  .refine((d) => d.check_out > d.check_in, {
    message: "Check-out must be after check-in",
    path: ["check_out"],
  });

type BookingFormValues = z.infer<typeof bookingSchema>;

// ── Component ────────────────────────────────────────────────────────────────

export default function Bookings() {
  const { role } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const { fmt } = useCurrency();
  const queryClient = useQueryClient();
  const canManage = hasPermission(role, "manageBookings");

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────

  const listingsQuery = useQuery({
    queryKey: ["listings", "for-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("listings").select("id, title").order("title");
      if (error) throw error;
      return (data ?? []) as Pick<Listing, "id" | "title">[];
    },
  });

  const bookingsQuery = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("check_in", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });

  // Active/probation employees only — for task assignment dropdowns
  const employeesQuery = useQuery({
    queryKey: ["employees", "assignable"],
    queryFn: async () => {
      // Use employees table directly so e.id is the real employees.id PK,
      // not a profile_id alias that employee_basic_view might expose.
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, email, status")
        .in("status", ["active", "probation"])
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as AssignableEmployee[];
    },
    enabled: canManage,
  });

  const filtered = useMemo(() => {
    if (!bookingsQuery.data) return [];
    if (statusFilter.length === 0) return bookingsQuery.data;
    return bookingsQuery.data.filter((b) => statusFilter.includes(b.status));
  }, [bookingsQuery.data, statusFilter]);

  // ── Multi-select helpers ───────────────────────────────────────────────────

  function toggleStatus(val: string) {
    setStatusFilter((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
    );
  }

  const filterLabel =
    statusFilter.length === 0
      ? t.status.allStatuses
      : statusFilter.length === 1
      ? (STATUS_OPTIONS.find((o) => o.value === statusFilter[0])?.label ?? statusFilter[0])
      : `${statusFilter.length} trạng thái`;

  const listingTitle = (id: string) =>
    listingsQuery.data?.find((l) => l.id === id)?.title ?? "—";

  // ── Form ─────────────────────────────────────────────────────────────────

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      listing_id: "",
      guest_name: "",
      guest_email: "",
      guest_phone: "",
      check_in: "",
      check_out: "",
      guests: 2,
      total_amount: 0,
      status: "pending",
      source: "",
      notes: "",
      checkin_assignee_id: "",
      checkout_assignee_id: "",
      cleaning_assignee_id: "",
    },
  });

  const watchCheckIn = form.watch("check_in");
  const watchCheckOut = form.watch("check_out");
  const watchGuestName = form.watch("guest_name");

  const checkOverlap = async (listingId: string, checkIn: string, checkOut: string) => {
    if (!listingId || !checkIn || !checkOut) {
      setOverlapWarning(null);
      return;
    }
    const { data, error } = await supabase
      .from("bookings")
      .select("id, check_in, check_out, guest_name, status")
      .eq("listing_id", listingId)
      .in("status", ["pending", "confirmed", "completed"])
      .lt("check_in", checkOut)
      .gt("check_out", checkIn);
    if (error) return;
    if (data && data.length > 0) {
      setOverlapWarning(
        `Overlaps with ${data.length} existing booking${data.length > 1 ? "s" : ""}.`
      );
    } else {
      setOverlapWarning(null);
    }
  };

  // ── Mutation ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (values: BookingFormValues) => {
      // 1. Insert booking and retrieve the new row's ID
      const { data: newBooking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          listing_id: values.listing_id,
          guest_name: values.guest_name,
          guest_email: values.guest_email || null,
          guest_phone: values.guest_phone || null,
          check_in: values.check_in,
          check_out: values.check_out,
          guests: values.guests,
          total_amount: values.total_amount,
          status: values.status,
          source: values.source || null,
          notes: values.notes || null,
        })
        .select("id")
        .single();

      if (bookingError) throw bookingError;

      // 2. Build 3 auto-tasks linked to the new booking
      const guestLabel = values.guest_name || "Guest";
      const autoTaskRows = [
        {
          task_type: "checkin_prepare",
          title: `Check-in Prep — ${guestLabel}`,
          listing_id: values.listing_id,
          booking_id: newBooking.id,
          assigned_employee_id: values.checkin_assignee_id || null,
          due_date: values.check_in,
          priority: "high",
          status: "todo",
          checklist: [],
          photos: [],
        },
        {
          task_type: "checkout_check",
          title: `Checkout Check — ${guestLabel}`,
          listing_id: values.listing_id,
          booking_id: newBooking.id,
          assigned_employee_id: values.checkout_assignee_id || null,
          due_date: values.check_out,
          priority: "medium",
          status: "todo",
          checklist: [],
          photos: [],
        },
        {
          task_type: "cleaning",
          title: `Post-checkout Cleaning — ${guestLabel}`,
          listing_id: values.listing_id,
          booking_id: newBooking.id,
          assigned_employee_id: values.cleaning_assignee_id || null,
          due_date: values.check_out,
          priority: "high",
          status: "todo",
          checklist: [],
          photos: [],
        },
      ];

      // 3. Insert tasks — non-blocking: a task failure doesn't roll back the booking
      const { error: tasksError } = await supabase.from("tasks").insert(autoTaskRows);

      return { tasksError };
    },
    onSuccess: ({ tasksError }) => {
      if (tasksError) {
        // Booking created but tasks failed
        toast({
          variant: "destructive",
          title: t.bookings.taskCreationFailed,
          description: tasksError.message,
        });
      } else {
        toast({ title: t.bookings.created });
      }
      setDialogOpen(false);
      form.reset();
      setOverlapWarning(null);
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: t.bookings.couldNotCreate,
        description: err.message,
      }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Booking["status"] }) => {
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.bookings.updated });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: t.bookings.updateFailed,
        description: err.message,
      }),
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout
      title={t.bookings.title}
      action={
        canManage ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t.bookings.newBooking}
          </Button>
        ) : null
      }
    >
      <div className="mb-4 flex justify-end">
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-9 w-[220px] justify-between px-3 font-normal"
            >
              <span className={statusFilter.length === 0 ? "text-muted-foreground" : "font-medium"}>
                {filterLabel}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[220px] p-0"
            align="end"
            sideOffset={6}
          >
            {/* Action row */}
            <div className="flex items-center justify-between border-b px-3 py-2">
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setStatusFilter(STATUS_OPTIONS.map((o) => o.value))}
              >
                Chọn tất cả
              </button>
              <button
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => setStatusFilter([])}
              >
                Xóa lọc
              </button>
            </div>

            {/* Checkbox list */}
            <div className="p-1">
              {STATUS_OPTIONS.map((opt) => {
                const checked = statusFilter.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-muted/60 select-none"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleStatus(opt.value)}
                      id={`filter-${opt.value}`}
                    />
                    <span className={checked ? "font-medium" : ""}>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Card>
        <CardContent className="p-0">
          {bookingsQuery.error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertTitle>{t.bookings.couldNotLoad}</AlertTitle>
                <AlertDescription>
                  {(bookingsQuery.error as Error).message}
                </AlertDescription>
              </Alert>
            </div>
          ) : bookingsQuery.isLoading ? (
            <div className="space-y-2 p-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">{t.bookings.noBookings}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {canManage ? t.bookings.createFirst : t.bookings.viewOnly}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.bookings.guest}</TableHead>
                  <TableHead>{t.common.listing}</TableHead>
                  <TableHead>{t.bookings.dates}</TableHead>
                  <TableHead className="text-right">{t.bookings.nights}</TableHead>
                  <TableHead className="text-right">{t.common.total}</TableHead>
                  <TableHead>{t.bookings.source}</TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead className="text-right">{t.bookings.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => {
                  const nights = differenceInCalendarDays(
                    parseISO(b.check_out),
                    parseISO(b.check_in)
                  );
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        <div>{b.guest_name}</div>
                        {b.guest_email && (
                          <div className="text-xs text-muted-foreground">{b.guest_email}</div>
                        )}
                      </TableCell>
                      <TableCell>{listingTitle(b.listing_id)}</TableCell>
                      <TableCell>
                        {format(parseISO(b.check_in), "MMM d")} –{" "}
                        {format(parseISO(b.check_out), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">{nights}</TableCell>
                      <TableCell className="text-right">
                        {fmt(Number(b.total_amount))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {b.source ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[b.status]} className="capitalize">
                          {t.status[b.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <Select
                            value={b.status}
                            onValueChange={(v) =>
                              updateStatusMutation.mutate({
                                id: b.id,
                                status: v as Booking["status"],
                              })
                            }
                          >
                            <SelectTrigger className="ml-auto h-8 w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">{t.status.pending}</SelectItem>
                              <SelectItem value="confirmed">{t.status.confirmed}</SelectItem>
                              <SelectItem value="completed">{t.status.completed}</SelectItem>
                              <SelectItem value="cancelled">{t.status.cancelled}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Create booking dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t.bookings.newBooking}</DialogTitle>
            <DialogDescription>
              Capture a new reservation for one of your listings.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
              className="space-y-4"
            >
              {/* Listing */}
              <FormField
                control={form.control}
                name="listing_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.common.listing}</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        checkOverlap(v, form.getValues("check_in"), form.getValues("check_out"));
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t.bookings.selectListing} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {listingsQuery.data?.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Guest name + email */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="guest_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.bookings.guestName}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guest_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.bookings.guestEmail}</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Check-in + Check-out */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="check_in"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.bookings.checkIn}</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            checkOverlap(
                              form.getValues("listing_id"),
                              e.target.value,
                              form.getValues("check_out")
                            );
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="check_out"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.bookings.checkOut}</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            checkOverlap(
                              form.getValues("listing_id"),
                              form.getValues("check_in"),
                              e.target.value
                            );
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {overlapWarning && (
                <Alert variant="destructive">
                  <AlertTitle>{t.bookings.overlapWarning}</AlertTitle>
                  <AlertDescription>{overlapWarning}</AlertDescription>
                </Alert>
              )}

              {/* Guests + Amount + Status */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="guests"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.bookings.guests}</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="total_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.bookings.totalAmount}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.common.status}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">{t.status.pending}</SelectItem>
                          <SelectItem value="confirmed">{t.status.confirmed}</SelectItem>
                          <SelectItem value="completed">{t.status.completed}</SelectItem>
                          <SelectItem value="cancelled">{t.status.cancelled}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Source */}
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.bookings.source}</FormLabel>
                    <FormControl>
                      <Input placeholder="Airbnb, Vrbo, Direct, …" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.bookings.notes}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Auto-created tasks section ── */}
              <div className="rounded-lg border border-dashed">
                <div className="border-b bg-muted/40 px-4 py-2.5">
                  <p className="text-sm font-semibold">{t.bookings.autoTasks}</p>
                  <p className="text-xs text-muted-foreground">{t.bookings.autoTasksNote}</p>
                </div>
                <div className="divide-y">
                  {AUTO_TASKS.map(
                    ({ key, type: _type, labelKey, dueKey, dueDateField, icon: Icon, color, bg }) => {
                      const dueDate =
                        dueDateField === "check_in" ? watchCheckIn : watchCheckOut;
                      const formattedDate = dueDate
                        ? format(parseISO(dueDate), "MMM d, yyyy")
                        : "—";

                      return (
                        <div key={key} className="px-4 py-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${bg}`}>
                              <Icon className={`h-3.5 w-3.5 ${color}`} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-none">
                                {t.bookings[labelKey]}
                                {watchGuestName && (
                                  <span className="ml-1 text-muted-foreground">
                                    — {watchGuestName}
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {t.bookings[dueKey]}{dueDate ? `: ${formattedDate}` : ""}
                              </p>
                            </div>
                          </div>
                          <FormField
                            control={form.control}
                            name={key}
                            render={({ field }) => (
                              <FormItem>
                                <Select
                                  onValueChange={(v) =>
                                    field.onChange(v === "__none__" ? "" : v)
                                  }
                                  value={field.value || "__none__"}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue
                                        placeholder={t.bookings.assignTo}
                                      />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      {t.tasks.unassigned}
                                    </SelectItem>
                                    {employeesQuery.data?.map((e) => (
                                      <SelectItem key={e.id} value={e.id}>
                                        {e.full_name ?? e.email}
                                        {e.status === "probation" && (
                                          <span className="ml-1 text-xs text-muted-foreground">
                                            (probation)
                                          </span>
                                        )}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDialogOpen(false);
                    setOverlapWarning(null);
                  }}
                >
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t.bookings.createBooking}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
