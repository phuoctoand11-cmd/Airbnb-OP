import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
};

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

  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const callFn = async (dry_run: boolean) => {
    const { data, error } = await supabase.functions.invoke("airbnb-import", {
      body: { csv: csvText, dry_run },
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

  return (
    <AppLayout title={t.importAirbnb.title}>
      <div className="space-y-6">
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

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.importAirbnb.guest}</TableHead>
                    <TableHead>{t.importAirbnb.checkInOut}</TableHead>
                    <TableHead className="text-right">{t.importAirbnb.usdAfterTax}</TableHead>
                    <TableHead className="text-right">Doanh thu VND</TableHead>
                    <TableHead>{t.common.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.confirmation_code}>
                      <TableCell>
                        <div className="font-medium">{r.guest}</div>
                        <div className="text-xs text-muted-foreground">{r.confirmation_code}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.check_in} → {r.check_out}</TableCell>
                      <TableCell className="text-right">{r.usd_after_tax.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">{vnd(r.amount_vnd)}</TableCell>
                      <TableCell>
                        {r.mapped
                          ? <Badge variant={ACTION_VARIANT[r.action]}>{actionLabel(r.action)}</Badge>
                          : <Badge variant="destructive">{t.importAirbnb.notMapped}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center gap-3">
                <Button onClick={runCommit} disabled={committing || rows.every((r) => !r.mapped)}>
                  {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {t.importAirbnb.confirmWrite}
                </Button>
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
