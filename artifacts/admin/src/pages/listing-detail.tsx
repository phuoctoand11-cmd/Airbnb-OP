import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { hasPermission, canViewPrices, useAuth } from "@/lib/auth-context";
import { supabase, type Listing } from "@/lib/supabase";
import { ListingOverviewTab } from "@/components/listings/ListingOverviewTab";
import { ListingImagesTab } from "@/components/listings/ListingImagesTab";
import { ListingAmenitiesTab } from "@/components/listings/ListingAmenitiesTab";
import { ListingCalendarTab } from "@/components/listings/ListingCalendarTab";
import { ListingPricingTab } from "@/components/listings/ListingPricingTab";

export default function ListingDetail() {
  const [, params] = useRoute("/listings/:id");
  const id = params?.id;
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission(role, "manageListings");
  const showPrices = canViewPrices(role);
  const listingsTable = showPrices ? "listings" : "sales_listings_view";
  // Explicit column list for non-price roles — omits base_price, cleaning_fee (defense-in-depth)
  const listingSelect = showPrices
    ? "*"
    : "id,title,description,address,city,country,bedrooms,bathrooms,max_guests,status,cover_image_url,created_at,updated_at";

  const { data: listing, isLoading, error } = useQuery({
    enabled: !!id,
    queryKey: ["listing", id, listingsTable],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(listingsTable as "listings")
        .select(listingSelect)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Listing;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: Partial<Listing>) => {
      const { data, error } = await supabase
        .from("listings")
        .update(values)
        .eq("id", id!)
        .select()
        .single();
      if (error) throw error;
      return data as Listing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      toast({ title: "Listing updated" });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message,
      }),
  });

  const subtitle = useMemo(() => {
    if (!listing) return "";
    return [listing.city, listing.country].filter(Boolean).join(", ") || "Location not set";
  }, [listing]);

  return (
    <AppLayout
      title={listing?.title ?? "Listing"}
      action={
        <Button variant="ghost" asChild>
          <Link href="/listings">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All listings
          </Link>
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load listing</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      ) : isLoading || !listing ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          <Card className="mb-6 overflow-hidden">
            <div className="grid gap-0 sm:grid-cols-[280px_1fr]">
              <div className="aspect-video bg-muted sm:aspect-auto sm:h-full">
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
              </div>
              <CardContent className="p-6">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold">{listing.title}</h2>
                    <div className="mt-1 flex items-center text-sm text-muted-foreground">
                      <MapPin className="mr-1 h-4 w-4" />
                      {subtitle}
                    </div>
                  </div>
                  <Badge className="capitalize" variant={listing.status === "active" ? "default" : "secondary"}>
                    {listing.status}
                  </Badge>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  {listing.description ?? "No description yet."}
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <Stat label="Bedrooms" value={listing.bedrooms} />
                  <Stat label="Bathrooms" value={listing.bathrooms} />
                  <Stat label="Max guests" value={listing.max_guests} />
                  {!showPrices ? (
                    <Stat label="Price" value={<span className="italic text-muted-foreground text-sm">Contact manager</span>} />
                  ) : (
                    <Stat label="Base / night" value={`$${Number(listing.base_price).toFixed(0)}`} />
                  )}
                </div>
              </CardContent>
            </div>
          </Card>

          <Tabs defaultValue={!showPrices ? "images" : "overview"}>
            <TabsList className="mb-4 flex flex-wrap">
              {showPrices && <TabsTrigger value="overview">Overview</TabsTrigger>}
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="amenities">Amenities</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              {showPrices && <TabsTrigger value="pricing">Pricing</TabsTrigger>}
            </TabsList>

            {showPrices && (
              <TabsContent value="overview">
                <ListingOverviewTab
                  listing={listing}
                  canManage={canManage}
                  onSave={(v) => updateMutation.mutate(v)}
                  saving={updateMutation.isPending}
                />
              </TabsContent>
            )}
            <TabsContent value="images">
              <ListingImagesTab listing={listing} canManage={canManage} />
            </TabsContent>
            <TabsContent value="amenities">
              <ListingAmenitiesTab listing={listing} canManage={canManage} />
            </TabsContent>
            <TabsContent value="calendar">
              <ListingCalendarTab listing={listing} canManage={canManage} isSales={!showPrices} />
            </TabsContent>
            {showPrices && (
              <TabsContent value="pricing">
                <ListingPricingTab listing={listing} canManage={canManage} />
              </TabsContent>
            )}
          </Tabs>

          {updateMutation.isPending && (
            <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm shadow-md">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-medium text-foreground">{value}</div>
    </div>
  );
}
