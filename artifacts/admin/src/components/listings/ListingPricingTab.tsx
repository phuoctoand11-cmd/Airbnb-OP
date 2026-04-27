import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase, type Listing, type PricingRule } from "@/lib/supabase";

interface Props {
  listing: Listing;
  canManage: boolean;
}

const ruleSchema = z.object({
  name: z.string().min(2),
  rule_type: z.enum(["weekend", "seasonal", "length_of_stay", "minimum_stay"]),
  adjustment_type: z.enum(["percentage", "fixed", "absolute"]),
  adjustment_value: z.coerce.number(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  min_nights: z.coerce.number().int().min(0).optional(),
  active: z.boolean().default(true),
});

type FormValues = z.infer<typeof ruleSchema>;

export function ListingPricingTab({ listing, canManage }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rules, isLoading, error } = useQuery({
    queryKey: ["pricing-rules", listing.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .select("*")
        .eq("listing_id", listing.id)
        .order("active", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PricingRule[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: "",
      rule_type: "weekend",
      adjustment_type: "percentage",
      adjustment_value: 10,
      active: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = {
        listing_id: listing.id,
        name: v.name,
        rule_type: v.rule_type,
        adjustment_type: v.adjustment_type,
        adjustment_value: v.adjustment_value,
        start_date: v.start_date || null,
        end_date: v.end_date || null,
        min_nights: v.min_nights ?? null,
        active: v.active,
      };
      const { error } = await supabase.from("pricing_rules").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Pricing rule added" });
      setOpen(false);
      form.reset({
        name: "",
        rule_type: "weekend",
        adjustment_type: "percentage",
        adjustment_value: 10,
        active: true,
      });
      queryClient.invalidateQueries({ queryKey: ["pricing-rules", listing.id] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not add rule", description: err.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("pricing_rules").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pricing-rules", listing.id] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Update failed", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Rule removed" });
      queryClient.invalidateQueries({ queryKey: ["pricing-rules", listing.id] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not delete rule", description: err.message }),
  });

  return (
    <Card>
      <CardContent className="p-6">
        {canManage && (
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New rule
            </Button>
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load pricing rules</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !rules || rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
            <TrendingUp className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No pricing rules yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add weekend uplifts, seasonal premiums, length-of-stay discounts, and minimum stay rules.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <Badge variant="outline" className="capitalize">
                      {r.rule_type.replace(/_/g, " ")}
                    </Badge>
                    {!r.active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {describeRule(r)}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={r.active}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, active: v })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(r.id)}
                      aria-label="Delete rule"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New pricing rule</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Weekend premium" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="rule_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="weekend">Weekend</SelectItem>
                            <SelectItem value="seasonal">Seasonal</SelectItem>
                            <SelectItem value="length_of_stay">Length of stay</SelectItem>
                            <SelectItem value="minimum_stay">Minimum stay</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="adjustment_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Adjustment</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="percentage">Percentage</SelectItem>
                            <SelectItem value="fixed">Fixed amount</SelectItem>
                            <SelectItem value="absolute">Absolute price</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="adjustment_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Value</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="min_nights"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum nights (optional)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add rule
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function describeRule(r: PricingRule) {
  const value =
    r.adjustment_type === "percentage"
      ? `${r.adjustment_value}%`
      : r.adjustment_type === "absolute"
      ? `set to $${Number(r.adjustment_value).toFixed(0)}`
      : `${r.adjustment_value > 0 ? "+" : ""}$${Number(r.adjustment_value).toFixed(0)}`;
  const dates =
    r.start_date && r.end_date
      ? `${r.start_date} → ${r.end_date}`
      : r.start_date
      ? `from ${r.start_date}`
      : r.end_date
      ? `until ${r.end_date}`
      : "always";
  const min = r.min_nights ? ` · min ${r.min_nights} nights` : "";
  return `${value} · ${dates}${min}`;
}
