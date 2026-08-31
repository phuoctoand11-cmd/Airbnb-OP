/**
 * Guest-facing page shown to anyone who opens the site without signing in.
 *
 * Reads ONLY the public_* views, never the base tables: those views are the
 * single place that decides what a signed-out visitor may see, and they leave
 * out prices, guest names, confirmation codes and amounts. Do not swap a query
 * here for a base table — the anon key is public, so whatever this page can
 * read, anyone can read straight from the REST API.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths, eachDayOfInterval, endOfMonth, format, isSameMonth,
  parseISO, startOfMonth,
} from "date-fns";
import { enUS as enLocale } from "date-fns/locale";
import { ArrowLeft, Bath, BedDouble, Building2, ChevronLeft, ChevronRight, LogIn, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { useI18n, type Lang } from "@/i18n";
import { cn } from "@/lib/utils";

type PublicListing = {
  id: string; title: string; description: string | null;
  address: string | null; city: string | null; country: string | null;
  bedrooms: number | null; bathrooms: number | null; max_guests: number | null;
  cover_image_url: string | null;
};
type PublicImage = { id: string; listing_id: string; url: string; position: number | null };
type PublicAmenity = { listing_id: string; amenity_id: string; name: string; icon: string | null };
/** end_date is exclusive for bookings and inclusive for blocks; see markBusy(). */
type Availability = { listing_id: string; start_date: string; end_date: string; kind: string };

const LANG_OPTIONS: { value: Lang; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
];

/** Expands one availability row into the individual dates it covers. */
function markBusy(rows: Availability[], into: Set<string>) {
  for (const row of rows) {
    const from = parseISO(row.start_date);
    const to = parseISO(row.end_date);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) continue;
    for (const day of eachDayOfInterval({ start: from, end: to })) {
      // A booking frees the checkout day for the next guest, so its end is
      // exclusive; a manual block covers its end date.
      if (row.kind === "booked" && format(day, "yyyy-MM-dd") === row.end_date) continue;
      into.add(format(day, "yyyy-MM-dd"));
    }
  }
}

function monthLabelFor(cursor: Date, lang: Lang) {
  // date-fns' vi locale renders MMMM as "tháng 08"; write it the Vietnamese way.
  return lang === "vi"
    ? `Tháng ${cursor.getMonth() + 1}, ${cursor.getFullYear()}`
    : format(cursor, "MMMM yyyy", { locale: enLocale });
}

export default function PublicHome() {
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<"listings" | "availability">("listings");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listingsQuery = useQuery({
    queryKey: ["public-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_listings_view")
        .select("*")
        .order("title");
      if (error) throw error;
      return (data ?? []) as unknown as PublicListing[];
    },
  });

  const selected = listingsQuery.data?.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
              <Building2 className="h-4.5 w-4.5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Airbnb Ops</p>
              <p className="text-[11px] text-muted-foreground">{t.publicSite.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {LANG_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant="ghost"
                size="sm"
                onClick={() => setLang(o.value)}
                aria-pressed={lang === o.value}
                className={cn(
                  "h-8 rounded-lg px-2 text-xs",
                  lang === o.value ? "bg-muted font-semibold" : "text-muted-foreground",
                )}
              >
                <span className="mr-1 text-sm">{o.flag}</span>
                <span className="hidden sm:inline">{o.label}</span>
              </Button>
            ))}
            <Button variant="outline" size="sm" asChild className="ml-1 h-8 rounded-lg">
              <Link href="/login">
                <LogIn className="mr-1.5 h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.publicSite.staffLogin}</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <nav className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
          {([
            ["listings", t.publicSite.tabListings],
            ["availability", t.publicSite.tabAvailability],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSelectedId(null); }}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors",
                tab === key
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {tab === "availability" ? (
          <AvailabilityBoard listings={listingsQuery.data ?? []} loading={listingsQuery.isLoading} />
        ) : listingsQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>{t.publicSite.couldNotLoad}</AlertTitle>
            <AlertDescription>{(listingsQuery.error as Error).message}</AlertDescription>
          </Alert>
        ) : listingsQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : selected ? (
          <ListingDetailPanel listing={selected} onBack={() => setSelectedId(null)} />
        ) : (listingsQuery.data ?? []).length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t.publicSite.noListings}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(listingsQuery.data ?? []).map((l) => (
              <ListingCard key={l.id} listing={l} onOpen={() => setSelectedId(l.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/** All villas at once: one row per villa, one column per day of the month. */
function AvailabilityBoard({ listings, loading }: { listings: PublicListing[]; loading: boolean }) {
  const { t, lang } = useI18n();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const availabilityQuery = useQuery({
    queryKey: ["public-availability-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("public_availability_view").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Availability[];
    },
  });

  const busyByListing = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of availabilityQuery.data ?? []) {
      if (!map.has(row.listing_id)) map.set(row.listing_id, new Set());
      markBusy([row], map.get(row.listing_id)!);
    }
    return map;
  }, [availabilityQuery.data]);

  const days = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) });

  if (loading || availabilityQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }
  if (availabilityQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.publicSite.couldNotLoad}</AlertTitle>
        <AlertDescription>{(availabilityQuery.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold sm:text-lg">{t.publicSite.allVillas}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8"
                  aria-label={t.publicSite.prevMonth}
                  onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[120px] text-center text-sm font-semibold">
            {monthLabelFor(cursor, lang)}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8"
                  aria-label={t.publicSite.nextMonth}
                  onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrolls inside its own box so a 31-column grid never widens the page. */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="min-w-[760px]">
          <div className="flex border-b border-border bg-muted/40">
            <div className="w-52 shrink-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.publicSite.villaColumn}
            </div>
            {days.map((d) => (
              <div key={d.toISOString()} className="flex-1 py-2 text-center text-[11px] text-muted-foreground">
                {format(d, "d")}
              </div>
            ))}
          </div>

          {listings.map((l) => {
            const busy = busyByListing.get(l.id) ?? new Set<string>();
            return (
              <div key={l.id} className="flex border-b border-border last:border-b-0">
                <div className="w-52 shrink-0 truncate px-3 py-2.5 text-sm" title={l.title}>
                  {l.title}
                </div>
                {days.map((d) => {
                  const key = format(d, "yyyy-MM-dd");
                  const isBusy = busy.has(key);
                  return (
                    <div key={key} className="flex flex-1 items-center justify-center px-0.5 py-2.5">
                      <span
                        title={`${l.title} · ${key} · ${isBusy ? t.publicSite.busy : t.publicSite.free}`}
                        className={cn(
                          "block h-6 w-full rounded-sm border",
                          isBusy ? "border-rose-200 bg-rose-100" : "border-border bg-card",
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-border bg-card" />{t.publicSite.free}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-rose-200 bg-rose-100" />{t.publicSite.busy}
        </span>
      </div>
    </section>
  );
}

function ListingCard({ listing, onOpen }: { listing: PublicListing; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="aspect-video w-full bg-muted">
        {listing.cover_image_url ? (
          <img src={listing.cover_image_url} alt={listing.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Building2 className="h-8 w-8 opacity-30" />
          </div>
        )}
      </div>
      <CardContent className="space-y-2 p-4">
        <h2 className="line-clamp-2 text-sm font-semibold leading-snug" title={listing.title}>
          {listing.title}
        </h2>
        {(listing.city || listing.country) && (
          <p className="truncate text-xs text-muted-foreground">
            {[listing.city, listing.country].filter(Boolean).join(", ")}
          </p>
        )}
        <SpecRow listing={listing} />
        <Button size="sm" className="mt-1 w-full rounded-lg" onClick={onOpen}>
          {t.publicSite.viewDetail}
        </Button>
      </CardContent>
    </Card>
  );
}

function SpecRow({ listing }: { listing: PublicListing }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{listing.bedrooms ?? "—"}</span>
      <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{listing.bathrooms ?? "—"}</span>
      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{listing.max_guests ?? "—"} {t.publicSite.guests}</span>
    </div>
  );
}

function ListingDetailPanel({ listing, onBack }: { listing: PublicListing; onBack: () => void }) {
  const { t } = useI18n();

  const imagesQuery = useQuery({
    queryKey: ["public-images", listing.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_listing_images_view")
        .select("*")
        .eq("listing_id", listing.id)
        .order("position");
      if (error) throw error;
      return (data ?? []) as unknown as PublicImage[];
    },
  });

  const amenitiesQuery = useQuery({
    queryKey: ["public-amenities", listing.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_listing_amenities_view")
        .select("*")
        .eq("listing_id", listing.id);
      if (error) throw error;
      return (data ?? []) as unknown as PublicAmenity[];
    },
  });

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {t.publicSite.back}
      </Button>

      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{listing.title}</h1>
        {(listing.city || listing.country) && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[listing.address, listing.city, listing.country].filter(Boolean).join(", ")}
          </p>
        )}
        <div className="mt-2"><SpecRow listing={listing} /></div>
        <p className="mt-2 text-xs text-muted-foreground">{t.publicSite.contactForPrice}</p>
      </div>

      {listing.description && (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{listing.description}</p>
      )}

      {(imagesQuery.data ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t.publicSite.photos}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {(imagesQuery.data ?? []).map((img) => (
              <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer"
                 className="aspect-square overflow-hidden rounded-lg border bg-muted">
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}

      {(amenitiesQuery.data ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t.publicSite.amenities}</h2>
          <div className="flex flex-wrap gap-1.5">
            {(amenitiesQuery.data ?? []).map((a) => (
              <Badge key={a.amenity_id} variant="secondary" className="font-normal">{a.name}</Badge>
            ))}
          </div>
        </section>
      )}

      <AvailabilitySection listingId={listing.id} />
    </div>
  );
}

function AvailabilitySection({ listingId }: { listingId: string }) {
  const { t, lang } = useI18n();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const availabilityQuery = useQuery({
    queryKey: ["public-availability", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_availability_view")
        .select("*")
        .eq("listing_id", listingId);
      if (error) throw error;
      return (data ?? []) as unknown as Availability[];
    },
  });

  const busy = useMemo(() => {
    const set = new Set<string>();
    markBusy(availabilityQuery.data ?? [], set);
    return set;
  }, [availabilityQuery.data]);

  const days = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) });
  const leadingBlanks = (startOfMonth(cursor).getDay() + 6) % 7; // week starts Monday
  const monthLabel = monthLabelFor(cursor, lang);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{t.publicSite.availability}</h2>

      <div className="rounded-xl border border-border p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="outline" size="icon" className="h-8 w-8"
                  aria-label={t.publicSite.prevMonth}
                  onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">{monthLabel}</span>
          <Button variant="outline" size="icon" className="h-8 w-8"
                  aria-label={t.publicSite.nextMonth}
                  onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1">
          {t.listingDetail.weekdaysShort.map((d) => (
            <div key={d} className="py-1 text-center text-[11px] font-semibold text-muted-foreground">{d}</div>
          ))}
        </div>

        {availabilityQuery.isLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const isBusy = busy.has(key);
              return (
                <div
                  key={key}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-md border text-xs",
                    isBusy
                      ? "border-rose-200 bg-rose-50 font-medium text-rose-700"
                      : "border-border bg-card text-foreground",
                    !isSameMonth(day, cursor) && "opacity-40",
                  )}
                  title={isBusy ? t.publicSite.busy : t.publicSite.free}
                >
                  {format(day, "d")}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-border bg-card" />{t.publicSite.free}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-rose-200 bg-rose-50" />{t.publicSite.busy}
          </span>
        </div>
      </div>
    </section>
  );
}
