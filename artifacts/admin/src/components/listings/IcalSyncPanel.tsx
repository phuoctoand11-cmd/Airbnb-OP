import { useEffect, useState } from "react";
import { Copy, RefreshCw, Trash2, Plus, Check, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";

// Đổi tại đây nếu project ref thay đổi
const FUNCTIONS_BASE = "https://ravcgwnshziipdngquop.supabase.co/functions/v1";

const PLATFORMS = [
  { value: "airbnb", label: "Airbnb" },
  { value: "booking", label: "Booking.com" },
  { value: "agoda", label: "Agoda" },
  { value: "other", label: null },
];

type Feed = {
  id: string;
  platform: string;
  import_url: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_status: string | null;
};

export function IcalSyncPanel({ listingId, canManage }: { listingId: string; canManage: boolean }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [platform, setPlatform] = useState("airbnb");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const exportLink = token ? `${FUNCTIONS_BASE}/ical-export?token=${token}` : "";

  const load = async () => {
    const { data: l } = await supabase
      .from("listings").select("ical_export_token").eq("id", listingId).single();
    setToken((l as any)?.ical_export_token ?? null);
    const { data: f } = await supabase
      .from("listing_ical_feeds").select("*").eq("listing_id", listingId).order("platform");
    setFeeds((f as Feed[]) ?? []);
  };

  useEffect(() => { load(); }, [listingId]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(exportLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const addFeed = async () => {
    if (!url.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("listing_ical_feeds").upsert(
      { listing_id: listingId, platform, import_url: url.trim(), is_active: true },
      { onConflict: "listing_id,platform" },
    );
    setAdding(false);
    if (error) { toast({ variant: "destructive", title: t.listingDetail.icalAddFailed, description: error.message }); return; }
    setUrl("");
    toast({ title: t.listingDetail.icalSaved });
    load();
  };

  const removeFeed = async (id: string) => {
    const { error } = await supabase.from("listing_ical_feeds").delete().eq("id", id);
    if (error) { toast({ variant: "destructive", title: t.listingDetail.icalDeleteFailed, description: error.message }); return; }
    load();
  };

  const syncNow = async () => {
    setSyncing(true);
    const { error } = await supabase.functions.invoke("ical-import");
    setSyncing(false);
    if (error) { toast({ variant: "destructive", title: t.listingDetail.icalSyncFailed, description: error.message }); return; }
    toast({ title: t.listingDetail.icalSynced });
    load();
  };

  /** Brand names stay as-is; only the generic "other" entry is translated. */
  const platformLabel = (v: string) => {
    const p = PLATFORMS.find((x) => x.value === v);
    if (!p) return v;
    return p.label ?? t.listingDetail.otherChannel;
  };

  return (
    <div className="space-y-6">
      {/* Link xuất */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.listingDetail.icalExportTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t.listingDetail.icalExportHint}
          </p>
          <div className="flex gap-2">
            <Input readOnly value={exportLink} className="font-mono text-xs" />
            <Button variant="outline" onClick={copyLink} disabled={!exportLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Link nhập */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t.listingDetail.icalImportTitle}</CardTitle>
          <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing || feeds.length === 0}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t.listingDetail.icalSyncNow}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {feeds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.listingDetail.icalNoFeeds}</p>
          ) : (
            <div className="space-y-2">
              {feeds.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-md border p-3">
                  <Badge variant="secondary">{platformLabel(f.platform)}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs">{f.import_url}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.last_synced_at
                        ? `${t.listingDetail.icalSyncedAt}: ${new Date(f.last_synced_at).toLocaleString(
                            lang === "vi" ? "vi-VN" : "en-US"
                          )}`
                        : t.listingDetail.icalNeverSynced}
                      {f.last_status && f.last_status !== "ok"
                        ? ` · ${t.common.error}: ${f.last_status}`
                        : ""}
                    </div>
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="icon" onClick={() => removeFeed(f.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm sm:w-40"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{platformLabel(p.value)}</option>
                ))}
              </select>
              <Input
                placeholder={t.listingDetail.icalPastePlaceholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 font-mono text-xs"
              />
              <Button onClick={addFeed} disabled={adding || !url.trim()}>
                {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Thêm
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
