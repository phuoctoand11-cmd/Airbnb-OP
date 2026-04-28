import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { CalendarDays, Loader2, Plus } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
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
import { supabase, type Booking, type Listing } from "@/lib/supabase";
import { useI18n } from "@/i18n";

const STATUS_VARIANT: Record<Booking["status"], "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  confirmed: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export default function Bookings() {
  const { role } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const canManage = hasPermission(role, "manageBookings");

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
    })
    .refine((d) => d.check_out > d.check_in, {
      message: "Check-out must be after check-in",
      path: ["check_out"],
    });

  type BookingFormValues = z.infer<typeof bookingSchema>;

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    if (!bookingsQuery.data) return [];
    if (statusFilter === "all") return bookingsQuery.data;
    return bookingsQuery.data.filter((b) => b.status === statusFilter);
  }, [bookingsQuery.data, statusFilter]);

  const listingTitle = (id: string) =>
    listingsQuery.data?.find((l) => l.id === id)?.title ?? "—";

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
    },
  });

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

  const createMutation = useMutation({
    mutationFn: async (values: BookingFormValues) => {
      const { error } = await supabase.from("bookings").insert({
        ...values,
        guest_email: values.guest_email || null,
        guest_phone: values.guest_phone || null,
        source: values.source || null,
        notes: values.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.bookings.created });
      setDialogOpen(false);
      form.reset();
      setOverlapWarning(null);
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.bookings.couldNotCreate, description: err.message }),
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
      toast({ variant: "destructive", title: t.bookings.updateFailed, description: err.message }),
  });

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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.status.allStatuses}</SelectItem>
            <SelectItem value="pending">{t.status.pending}</SelectItem>
            <SelectItem value="confirmed">{t.status.confirmed}</SelectItem>
            <SelectItem value="completed">{t.status.completed}</SelectItem>
            <SelectItem value="cancelled">{t.status.cancelled}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {bookingsQuery.error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertTitle>{t.bookings.couldNotLoad}</AlertTitle>
                <AlertDescription>{(bookingsQuery.error as Error).message}</AlertDescription>
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
                  const nights = differenceInCalendarDays(parseISO(b.check_out), parseISO(b.check_in));
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
                        {format(parseISO(b.check_in), "MMM d")} – {format(parseISO(b.check_out), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">{nights}</TableCell>
                      <TableCell className="text-right">${Number(b.total_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground">{b.source ?? "—"}</TableCell>
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
                              updateStatusMutation.mutate({ id: b.id, status: v as Booking["status"] })
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t.bookings.newBooking}</DialogTitle>
            <DialogDescription>Capture a new reservation for one of your listings.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="listing_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.common.listing}</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        const ci = form.getValues("check_in");
                        const co = form.getValues("check_out");
                        checkOverlap(v, ci, co);
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
                            checkOverlap(form.getValues("listing_id"), e.target.value, form.getValues("check_out"));
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
                            checkOverlap(form.getValues("listing_id"), form.getValues("check_in"), e.target.value);
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
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.bookings.notes}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
