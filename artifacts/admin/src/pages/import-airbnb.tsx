import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth, canViewPrices } from "@/lib/auth-context";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

type Row = {
  confirmation_code: string;
  guest: string;
  check_in: string;
  check_out: string;
  listing_name: string;
  mapped: boolean;
  usd_after_tax: number;
  amount_vnd: number;
  action: "create" | "update_imported" | "merge_manual";
  /** Belongs to a different villa than the one selected — shown, never written. */
  excluded?: boolean;
};
type Summary = {
  rate: number;
  total_payout_vnd: number;
  total_usd_after_tax: number;
  count: number;
  create: number;
  update_imported: number;
  merge_manual: number;
  unmapped: string[];
  excluded?: number;
  /** Echoed back by the function so the UI can prove the filter actually ran. */
  applied_listing_filter?: string | null;
  applied_listing_title?: string | null;
};

const ALL_LISTINGS = "__all__";

const vnd = (n: number) => n.toLocaleString("vi-VN") + " ₫";

const ACTION_VARIANT: Record<Row["action"], "default" | "secondary" | "outline"> = {
  create: "default",
  update_imported: "secondary",
  merge_manual: "outline",
};

export default function ImportAirbnb() {
  const { t } = useI18n();
  const { role } = useAuth();
  const { toast } = useToast();

  const actionLabel = (a: Row["action"]) =>
    a === "create"
      ? t.importAirbnb.actionCreate
      : a === "update_imported"
      ? t.importAirbnb.actionUpdate
      : t.importAirbnb.actionMerge;
  const queryClient = useQueryClient();

  const [listingId, setListingId] = useState<string>(ALL_LISTINGS);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Must stay above the permission guard below: `role` is null on the first
  // render and only fills in once the profile loads, so a hook placed after an
  // early return would change the hook count between renders and crash React.
  const listingsQuery = useQuery({
    queryKey: ["listings", "for-import"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, title")
        .order("title");
      if (error) throw error;
      return (data ?? []) as { id: string; title: string }[];
    },
    enabled: canViewPrices(role),
  });

  if (!canViewPrices(role)) {
    return (
      <AppLayout title={t.importAirbnb.title}>
        <Alert variant="destructive">
          <AlertTitle>{t.importAirbnb.noPermission}</AlertTitle>
          <AlertDescription>{t.importAirbnb.noPermissionBody}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  const reset = () => {
    setSummary(null); setRows([]); setDone(null); setError(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    reset();
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(f, "utf-8");
  };

  const selectedListingId = listingId === ALL_LISTINGS ? null : listingId;

  const callFn = async (dry_run: boolean) => {
    const { data, error } = await supabase.functions.invoke("airbnb-import", {
      body: { csv: csvText, dry_run, listing_id: selectedListingId },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const runPreview = async () => {
    if (!csvText) return;
    setLoading(true); setError(null); setDone(null);
    try {
      const data = await callFn(true);
      setSummary(data.summary);
      setRows(data.bookings ?? []);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const runCommit = async () => {
    if (!csvText) return;
    setCommitting(true); setError(null);
    try {
      const data = await callFn(false);
      const n = (data.written ?? []).filter((w: any) => w.booking_id).length;
      setDone(t.importAirbnb.importedBody.replace("{n}", String(n)));
      toast({ title: t.importAirbnb.importSuccess, description: t.importAirbnb.importSuccessBody.replace("{n}", String(n)) });
      queryClient.invalidateQueries({ queryKey: ["revenues"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setCommitting(false);
    }
  };

  // Fail closed. An older deployment of the edge function ignores listing_id and
  // echoes nothing back, so a filter the user asked for would silently not apply
  // and the whole file would be written. Block the commit until the response
  // proves the filter ran.
  const filterHonoured =
    !selectedListingId || summary?.applied_listing_filter === selectedListingId;
  const writableRows = rows.filter((r) => r.mapped && !r.excluded);

  return (
    <AppLayout title={t.importAirbnb.title}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.importAirbnb.step0}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select
              value={listingId}
              onValueChange={(v) => { setListingId(v); reset(); }}
            >
              <SelectTrigger className="sm:w-[420px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LISTINGS}>{t.importAirbnb.allListings}</SelectItem>
                {(listingsQuery.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t.importAirbnb.pickListingHint}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.importAirbnb.step1}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file" accept=".csv"
              onChange={handleFile}
              className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
            />
            {fileName && <p className="text-sm text-muted-foreground">{t.importAirbnb.picked} {fileName}</p>}
            <Button onClick={runPreview} disabled={!csvText || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t.importAirbnb.preview}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t.common.error}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {summary && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.importAirbnb.step2}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t.importAirbnb.writingInto}: </span>
                <span className="font-semibold">
                  {summary.applied_listing_title ?? t.importAirbnb.writingIntoAll}
                </span>
              </div>

              {!filterHonoured && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t.importAirbnb.filterNotApplied}</AlertTitle>
                  <AlertDescription>{t.importAirbnb.filterNotApppliedBody}</AlertDescription>
                </Alert>
              )}

              {!!summary.excluded && summary.excluded > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {t.importAirbnb.excludedNote.replace("{n}", String(summary.excluded))}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label={t.importAirbnb.rateApplied} value={`${summary.rate.toLocaleString("vi-VN")} ₫/USD`} />
                <Stat label={t.importAirbnb.totalPayout} value={vnd(summary.total_payout_vnd)} />
                <Stat label={t.importAirbnb.bookingCount} value={String(summary.count)} />
                <Stat label={t.importAirbnb.createUpdateMerge} value={`${summary.create} / ${summary.update_imported} / ${summary.merge_manual}`} />
              </div>

              {summary.unmapped.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t.importAirbnb.unmappedTitle}</AlertTitle>
                  <AlertDescription>
                    {summary.unmapped.join("; ")}. {t.importAirbnb.unmappedBody}
                  </AlertDescription>
                </Alert>
              )}

              <Table className="min-w-[680px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.importAirbnb.guest}</TableHead>
                    <TableHead>{t.importAirbnb.checkInOut}</TableHead>
                    <TableHead className="text-right">{t.importAirbnb.usdAfterTax}</TableHead>
                    <TableHead className="text-right">{t.importAirbnb.revenueVnd}</TableHead>
                    <TableHead>{t.common.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* A confirmation code can appear in more than one payout block,
                      so it is not unique across rows — pair it with the index. */}
                  {rows.map((r, i) => (
                    <TableRow
                      key={`${r.confirmation_code}-${i}`}
                      className={cn(r.excluded && "opacity-45")}
                    >
                      <TableCell>
                        <div className="font-medium">{r.guest}</div>
                        <div className="text-xs text-muted-foreground">{r.confirmation_code}</div>
                        <div className="text-xs text-muted-foreground">{r.listing_name}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.check_in} → {r.check_out}</TableCell>
                      <TableCell className="text-right">{r.usd_after_tax.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">{vnd(r.amount_vnd)}</TableCell>
                      <TableCell>
                        {/* "not mapped" outranks "other villa": an unmapped row is
                            excluded too, but calling it another villa hides the
                            real cause, which is a name that does not match. */}
                        {!r.mapped
                          ? <Badge variant="destructive">{t.importAirbnb.notMapped}</Badge>
                          : r.excluded
                          ? <Badge variant="outline">{t.importAirbnb.excludedBadge}</Badge>
                          : <Badge variant={ACTION_VARIANT[r.action]}>{actionLabel(r.action)}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={runCommit}
                  disabled={committing || !filterHonoured || writableRows.length === 0}
                >
                  {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {t.importAirbnb.confirmWrite}
                </Button>
                {filterHonoured && writableRows.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    {t.importAirbnb.nothingToWrite}
                  </span>
                )}
                {done && <span className="text-sm text-green-600">{done}</span>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
