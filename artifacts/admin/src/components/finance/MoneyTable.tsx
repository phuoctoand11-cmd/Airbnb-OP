import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import { DollarSign, Loader2, Plus, Trash2 } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
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
import { supabase, type Listing } from "@/lib/supabase";
import { useI18n } from "@/i18n";
import { useCurrency } from "@/lib/currency";

interface MoneyRecord {
  id: string;
  listing_id: string | null;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  vendor?: string | null;
}

interface MoneyTableConfig {
  table: "revenues" | "expenses";
  title: string;
  dateColumn: "received_at" | "spent_at";
  defaultCategory: string;
  showVendor: boolean;
}

const REVENUE_CATEGORIES = ["booking_revenue", "cancellation_revenue"];
const EXPENSE_CATEGORIES = [
  "cleaning",
  "supplies",
  "maintenance",
  "utilities",
  "marketing",
  "platform_fees",
  "other",
];

export function MoneyTablePage(config: MoneyTableConfig) {
  const { role } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const { fmt } = useCurrency();
  const queryClient = useQueryClient();
  const canManage = hasPermission(role, "manageFinance");
  const [open, setOpen] = useState(false);

  const isRevenue = config.table === "revenues";
  const sectionTitle = isRevenue ? t.finance.revenueTitle : t.finance.expenseTitle;
  const newEntryLabel = isRevenue ? t.finance.newRevenue : t.finance.newExpense;

  const listingsQuery = useQuery({
    queryKey: ["listings", "for-finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("listings").select("id, title").order("title");
      if (error) throw error;
      return (data ?? []) as Pick<Listing, "id" | "title">[];
    },
  });

  const recordsQuery = useQuery({
    queryKey: [config.table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(config.table)
        .select("*")
        .order(config.dateColumn, { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        listing_id: r.listing_id,
        amount: Number(r.amount),
        category: r.category,
        description: r.description,
        date: r[config.dateColumn],
        vendor: r.vendor ?? null,
      })) as MoneyRecord[];
    },
  });

  const monthBuckets = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(now, 5 - i)));
    return months.map((m) => {
      const total = (recordsQuery.data ?? [])
        .filter((r) => isSameMonth(parseISO(r.date), m))
        .reduce((sum, r) => sum + r.amount, 0);
      return { label: format(m, "MMM yyyy"), total };
    });
  }, [recordsQuery.data]);

  const categoryBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    (recordsQuery.data ?? []).forEach((r) => {
      m.set(r.category, (m.get(r.category) ?? 0) + r.amount);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [recordsQuery.data]);

  const schema = z.object({
    listing_id: z.string().optional(),
    amount: z.coerce.number().min(0),
    category: z.string().min(1),
    description: z.string().optional(),
    vendor: z.string().optional(),
    date: z.string().min(1),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: 0,
      category: config.defaultCategory,
      date: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const createMutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload: Record<string, unknown> = {
        listing_id: v.listing_id || null,
        amount: v.amount,
        category: v.category,
        description: v.description || null,
        [config.dateColumn]: v.date,
      };
      if (config.showVendor) payload.vendor = v.vendor || null;
      const { error } = await supabase.from(config.table).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.finance.added });
      setOpen(false);
      form.reset({
        amount: 0,
        category: config.defaultCategory,
        date: format(new Date(), "yyyy-MM-dd"),
      });
      queryClient.invalidateQueries({ queryKey: [config.table] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.finance.couldNotSave, description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(config.table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.finance.removed });
      queryClient.invalidateQueries({ queryKey: [config.table] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.finance.deleteFailed, description: err.message }),
  });

  const total = (recordsQuery.data ?? []).reduce((s, r) => s + r.amount, 0);
  const listingTitle = (id: string | null) =>
    id ? listingsQuery.data?.find((l) => l.id === id)?.title ?? "—" : "—";

  const categories = config.table === "revenues" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <AppLayout
      title={sectionTitle}
      action={
        canManage ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {newEntryLabel}
          </Button>
        ) : null
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.finance.allTimeTotal}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(total)}</div>
          </CardContent>
        </Card>
        {monthBuckets.slice(-3).map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmt(m.total)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t.finance.last6Months}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-3">
              {monthBuckets.map((m) => {
                const max = Math.max(...monthBuckets.map((x) => x.total), 1);
                const heightPct = (m.total / max) * 100;
                return (
                  <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-full w-full items-end">
                      <div
                        className="w-full rounded-t-md bg-primary"
                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                        title={fmt(m.total)}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.finance.byCategory}</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.common.noEntries}</p>
            ) : (
              <ul className="space-y-2">
                {categoryBreakdown.slice(0, 6).map(([cat, amt]) => (
                  <li key={cat} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{cat.replace(/_/g, " ")}</span>
                    <span className="font-medium">{fmt(amt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {recordsQuery.error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertTitle>{t.finance.couldNotLoad}</AlertTitle>
                <AlertDescription>{(recordsQuery.error as Error).message}</AlertDescription>
              </Alert>
            </div>
          ) : recordsQuery.isLoading ? (
            <div className="space-y-2 p-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !recordsQuery.data || recordsQuery.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <DollarSign className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">{t.finance.noEntries}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {canManage ? t.finance.trackFirst : t.finance.viewOnly}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.finance.dateCol}</TableHead>
                  <TableHead>{t.finance.listingCol}</TableHead>
                  <TableHead>{t.finance.categoryCol}</TableHead>
                  {config.showVendor && <TableHead>{t.finance.vendorCol}</TableHead>}
                  <TableHead>{t.finance.descriptionCol}</TableHead>
                  <TableHead className="text-right">{t.finance.amountCol}</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordsQuery.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{format(parseISO(r.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>{listingTitle(r.listing_id)}</TableCell>
                    <TableCell className="capitalize">{r.category.replace(/_/g, " ")}</TableCell>
                    {config.showVendor && <TableCell>{r.vendor ?? "—"}</TableCell>}
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">
                      {r.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.amount)}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(r.id)}
                          aria-label={t.common.remove}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newEntryLabel}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.finance.amount} (VND)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.finance.date}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.finance.category}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c} value={c} className="capitalize">
                              {c.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="listing_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.finance.listingOptional}</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t.finance.pickListing} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">{t.common.none}</SelectItem>
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
              </div>
              {config.showVendor && (
                <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.finance.vendor}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.finance.description}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t.common.save}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
