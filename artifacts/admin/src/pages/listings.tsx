import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Home, Search } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListingFormDialog } from "@/components/listings/ListingFormDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth, hasPermission } from "@/lib/auth-context";
import { supabase, type Listing } from "@/lib/supabase";

const STATUS_BADGE: Record<Listing["status"], "default" | "secondary" | "outline"> = {
  active: "default",
  inactive: "outline",
  maintenance: "secondary",
};

export default function Listings() {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission(role, "manageListings");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: listings, isLoading, error } = useQuery({
    queryKey: ["listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Listing[];
    },
  });

  const filtered = useMemo(() => {
    if (!listings) return [];
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        (l.city ?? "").toLowerCase().includes(q) ||
        (l.country ?? "").toLowerCase().includes(q)
      );
    });
  }, [listings, search, statusFilter]);

  const createMutation = useMutation({
    mutationFn: async (values: Partial<Listing>) => {
      const { data, error } = await supabase
        .from("listings")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data as Listing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      toast({ title: "Listing created" });
      setCreateOpen(false);
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: "Failed to create listing",
        description: err.message,
      }),
  });

  return (
    <AppLayout
      title="Listings"
      action={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Listing
          </Button>
        ) : null
      }
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, city, or country"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load listings</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-48 w-full rounded-none" />
              <CardContent className="p-4">
                <Skeleton className="mb-2 h-6 w-3/4" />
                <Skeleton className="mb-4 h-4 w-1/2" />
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-12">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Home className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">No listings found</h2>
          <p className="mb-6 max-w-md text-center text-muted-foreground">
            {listings?.length
              ? "No listings match your current filters. Try clearing them."
              : "You don't have any properties yet. Add your first listing to start managing operations."}
          </p>
          {canManage && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Listing
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((listing) => (
            <Link key={listing.id} href={`/listings/${listing.id}`}>
              <Card className="cursor-pointer overflow-hidden transition-all hover:border-primary/50 hover:shadow-md">
                <div className="relative aspect-video w-full bg-muted">
                  {listing.cover_image_url ? (
                    <img
                      src={listing.cover_image_url}
                      alt={listing.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      No image
                    </div>
                  )}
                  <div className="absolute right-2 top-2">
                    <Badge variant={STATUS_BADGE[listing.status]} className="capitalize shadow-sm">
                      {listing.status}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="mb-2 line-clamp-1 text-lg font-semibold">{listing.title}</h3>
                  <div className="mb-4 flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-3.5 w-3.5" />
                    <span className="line-clamp-1">
                      {[listing.city, listing.country].filter(Boolean).join(", ") || "Location not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">${Number(listing.base_price).toFixed(0)}</span>{" "}
                      <span className="text-muted-foreground">/ night</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {listing.bedrooms} bed · {listing.bathrooms} bath · {listing.max_guests} guests
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {canManage && (
        <ListingFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={(v) => createMutation.mutate(v)}
          submitting={createMutation.isPending}
        />
      )}
    </AppLayout>
  );
}
