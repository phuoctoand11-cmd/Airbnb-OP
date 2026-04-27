import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase, type Amenity, type Listing } from "@/lib/supabase";

interface Props {
  listing: Listing;
  canManage: boolean;
}

export function ListingAmenitiesTab({ listing, canManage }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newAmenity, setNewAmenity] = useState("");

  const amenitiesQuery = useQuery({
    queryKey: ["amenities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("amenities").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Amenity[];
    },
  });

  const linkedQuery = useQuery({
    queryKey: ["listing-amenities", listing.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_amenities")
        .select("amenity_id")
        .eq("listing_id", listing.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.amenity_id as string));
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Amenity[]>();
    (amenitiesQuery.data ?? []).forEach((a) => {
      const key = a.category ?? "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [amenitiesQuery.data]);

  const toggleMutation = useMutation({
    mutationFn: async ({ amenityId, on }: { amenityId: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase
          .from("listing_amenities")
          .insert({ listing_id: listing.id, amenity_id: amenityId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("listing_amenities")
          .delete()
          .eq("listing_id", listing.id)
          .eq("amenity_id", amenityId);
        if (error) throw error;
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["listing-amenities", listing.id] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not update amenity", description: err.message }),
  });

  const createAmenityMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("amenities")
        .insert({ name, category: "custom" })
        .select()
        .single();
      if (error) throw error;
      return data as Amenity;
    },
    onSuccess: (a) => {
      toast({ title: `Added "${a.name}"` });
      setNewAmenity("");
      queryClient.invalidateQueries({ queryKey: ["amenities"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not add amenity", description: err.message }),
  });

  const isLoading = amenitiesQuery.isLoading || linkedQuery.isLoading;
  const error = amenitiesQuery.error || linkedQuery.error;

  return (
    <Card>
      <CardContent className="p-6">
        {canManage && (
          <div className="mb-6 flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Add a new amenity (e.g. Espresso machine)"
              value={newAmenity}
              onChange={(e) => setNewAmenity(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => createAmenityMutation.mutate(newAmenity.trim())}
              disabled={!newAmenity.trim() || createAmenityMutation.isPending}
            >
              {createAmenityMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add amenity
            </Button>
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load amenities</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !amenitiesQuery.data || amenitiesQuery.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
            <Sparkles className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No amenities defined</p>
            <p className="text-sm text-muted-foreground">
              {canManage ? "Add the first amenity above." : "Ask a manager to add amenities."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((a) => {
                    const checked = linkedQuery.data?.has(a.id) ?? false;
                    return (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md border bg-card px-3 py-2 hover-elevate"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!canManage || toggleMutation.isPending}
                          onCheckedChange={(v) =>
                            toggleMutation.mutate({ amenityId: a.id, on: !!v })
                          }
                        />
                        <span className="text-sm">{a.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
