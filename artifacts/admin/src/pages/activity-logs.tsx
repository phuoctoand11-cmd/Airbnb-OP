import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";

import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { supabase, type ActivityLog } from "@/lib/supabase";
import { useI18n } from "@/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  email: string | null;
  role: unknown; // may be string or { name: string } depending on Supabase setup
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Module buckets used by the filter dropdown
const MODULE_OPTIONS = ["tasks", "bookings", "calendar", "hr"] as const;
type AppModule = (typeof MODULE_OPTIONS)[number];

/** Normalise whatever module string is stored in metadata into a filter bucket */
function toModuleBucket(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "availability_calendar" || raw === "calendar") return "calendar";
  return raw; // "bookings", "tasks", "hr" pass through as-is
}

const MODULE_CLS: Record<AppModule, string> = {
  tasks:    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bookings: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  calendar: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  hr:       "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const ROLE_CLS: Record<string, string> = {
  admin:   "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  manager: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const STATUS_CLS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
        STATUS_CLS[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {status}
    </span>
  );
}

function actionVariant(action: string): "default" | "secondary" | "outline" | "destructive" {
  if (action.includes("created")) return "default";
  if (
    action.includes("deleted") ||
    action.includes("removed") ||
    action.includes("cancel")
  )
    return "destructive";
  if (
    action.includes("updated") ||
    action.includes("changed") ||
    action.includes("uploaded")
  )
    return "secondary";
  return "outline";
}

/** Extract a plain role string from whatever Supabase returns */
function normaliseRole(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "name" in raw)
    return (raw as { name: string }).name;
  return null;
}

/** Pull structured fields out of JSONB metadata (null-safe) */
function getMeta(log: ActivityLog) {
  const m = (log.metadata ?? {}) as Record<string, unknown>;
  return {
    actorName:    (m.actor_name    as string | null) ?? null,
    actorRole:    (m.actor_role    as string | null) ?? null,
    module:       (m.module        as string | null) ?? log.entity_type ?? null,
    label:        (m.label         as string | null) ?? log.entity_id  ?? null,
    guestName:    (m.guest_name    as string | null) ?? null,
    listingTitle: (m.listing_title as string | null) ?? null,
    oldStatus:    (m.old_status    as string | null) ?? null,
    newStatus:    (m.new_status    as string | null) ?? null,
    totalAmount:  (m.total_amount  as number | null) ?? null,
    changedBy:    (m.changed_by    as string | null) ?? null,
    changedAt:    (m.changed_at    as string | null) ?? null,
    newData:      (m.new_data      as Record<string, unknown> | null) ?? null,
    oldData:      (m.old_data      as Record<string, unknown> | null) ?? null,
  };
}

function JsonBlock({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/30 p-3 text-[11px] font-mono text-foreground whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityLogs() {
  const { t } = useI18n();
  const al = t.activityLogs;

  const [moduleFilter, setModuleFilter] = useState("all");
  const [search, setSearch]             = useState("");
  const [from, setFrom]                 = useState("");
  const [to, setTo]                     = useState("");
  const [selected, setSelected]         = useState<ActivityLog | null>(null);

  // ── Query 1: activity_logs ──────────────────────────────────────────────────
  const logsQuery = useQuery({
    queryKey: ["activity_logs", { from, to }],
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      // Local-timezone boundaries (Vietnam = UTC+7, or wherever the browser is)
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to)   q = q.lte("created_at", new Date(`${to}T23:59:59.999`).toISOString());

      const { data, error } = await q;
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[ACTIVITY_LOGS_FETCH] error", { message: error.message, code: error.code });
        throw error;
      }
      const rows = (data ?? []) as ActivityLog[];
      // eslint-disable-next-line no-console
      console.log("[ACTIVITY_LOGS_FETCH]", {
        rowCount: rows.length,
        from,
        to,
        note: rows.length === 0 ? "DB returned 0 rows — check Supabase RLS SELECT policy on activity_logs" : "ok",
      });
      return rows;
    },
  });

  // ── Query 2: profiles (cached 5 min, used for email + role lookup) ──────────
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role");
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("[PROFILES_FETCH] error", error.message);
        return [] as ProfileRow[];
      }
      return (data ?? []) as ProfileRow[];
    },
    staleTime: 5 * 60_000,
  });

  // ── Merge: build a fast id → profile map ───────────────────────────────────
  const profileMap = useMemo(() => {
    const map = new Map<string, { email: string | null; role: string | null }>();
    for (const p of profilesQuery.data ?? []) {
      map.set(p.id, { email: p.email, role: normaliseRole(p.role) });
    }
    return map;
  }, [profilesQuery.data]);

  // ── Client-side filter ─────────────────────────────────────────────────────
  const afterModuleFilter = useMemo(() => {
    const logs = logsQuery.data ?? [];
    return logs.filter((log) => {
      const meta = getMeta(log);
      const bucket = toModuleBucket(meta.module);
      if (moduleFilter !== "all" && bucket !== moduleFilter) return false;
      return true;
    });
  }, [logsQuery.data, moduleFilter]);

  const filtered = useMemo(() => {
    return afterModuleFilter.filter((log) => {
      if (!search.trim()) return true;
      const s = search.trim().toLowerCase();
      const meta = getMeta(log);
      const profile = log.user_id ? profileMap.get(log.user_id) : null;
      const haystack = [
        profile?.email,
        meta.actorName,
        log.action,
        log.entity_type,
        meta.label,
        meta.guestName,
        meta.listingTitle,
        meta.oldStatus,
        meta.newStatus,
        meta.changedBy,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(s);
    });
  }, [afterModuleFilter, search, profileMap]);

  // ── Debug values ───────────────────────────────────────────────────────────
  const rawLogsCount          = logsQuery.data?.length ?? 0;
  const afterDateFilterCount  = rawLogsCount; // date filter is server-side
  const afterSearchFilterCount = filtered.length;
  const selectedStart = from ? new Date(`${from}T00:00:00`).toISOString() : "(none)";
  const selectedEnd   = to   ? new Date(`${to}T23:59:59.999`).toISOString() : "(none)";

  const moduleLabel = (mod: string) =>
    (al.modules as Record<string, string>)[mod] ?? mod;

  const isLoading = logsQuery.isLoading;
  const queryError = logsQuery.error as Error | null;

  return (
    <AppLayout title={al.title}>
      <p className="mb-4 text-sm text-muted-foreground">{al.subtitle}</p>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-48">
          <Input
            placeholder={al.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3"
          />
        </div>

        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={al.allModules} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{al.allModules}</SelectItem>
            {MODULE_OPTIONS.map((m) => (
              <SelectItem key={m} value={m}>{moduleLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{al.from}</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-36 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{al.to}</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-36 text-sm"
            />
          </div>
        </div>

        {(search || moduleFilter !== "all" || from || to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setModuleFilter("all");
              setFrom("");
              setTo("");
            }}
          >
            {t.common.all}
          </Button>
        )}
      </div>

      {/* ── Debug panel ─────────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-mono dark:border-amber-700 dark:bg-amber-950">
          <p className="mb-1 font-semibold text-amber-800 dark:text-amber-300">[DEBUG] Activity Logs</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-amber-900 dark:text-amber-200">
            <span>rawLogsCount: <strong>{rawLogsCount}</strong></span>
            <span>afterDateFilterCount: <strong>{afterDateFilterCount}</strong></span>
            <span>afterSearchFilterCount: <strong>{afterSearchFilterCount}</strong></span>
            <span>moduleFilter: <strong>{moduleFilter}</strong></span>
            <span className="col-span-2">selectedStart: <strong>{selectedStart}</strong></span>
            <span className="col-span-2">selectedEnd: <strong>{selectedEnd}</strong></span>
            {logsQuery.error && (
              <span className="col-span-2 text-red-600">
                queryError: {(logsQuery.error as Error).message}
              </span>
            )}
            {rawLogsCount === 0 && !logsQuery.error && (
              <span className="col-span-2 text-red-700 dark:text-red-400">
                ⚠ DB returned 0 rows — RLS SELECT policy may be blocking the anon key
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : queryError ? (
        <Alert variant="destructive">
          <AlertTitle>{t.common.error}</AlertTitle>
          <AlertDescription>{queryError.message}</AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
          <p className="font-medium text-muted-foreground">{al.noLogs}</p>
          {logsQuery.data?.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              The database returned 0 rows. Check the Supabase RLS SELECT policy on{" "}
              <code className="font-mono">activity_logs</code>.
            </p>
          )}
          {(logsQuery.data?.length ?? 0) > 0 && search && (
            <p className="mt-1 text-sm text-muted-foreground">
              No results for "{search}"
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-36">{al.time}</TableHead>
                <TableHead className="w-52">{al.actor}</TableHead>
                <TableHead>{al.action}</TableHead>
                <TableHead className="w-28">Entity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => {
                const meta = getMeta(log);
                const profile = log.user_id ? profileMap.get(log.user_id) : null;

                // Email: prefer profile join, fall back to metadata actor_name or changed_by
                const actorEmail =
                  profile?.email ??
                  meta.changedBy ??
                  meta.actorName ??
                  null;

                // Role: prefer profile join, fall back to metadata actor_role
                const actorRole =
                  profile?.role ??
                  meta.actorRole ??
                  null;

                return (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setSelected(log)}
                  >
                    {/* Time */}
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(parseISO(log.created_at), "dd/MM HH:mm")}
                    </TableCell>

                    {/* Email + Role */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate text-xs font-medium leading-none">
                          {actorEmail ?? "—"}
                        </span>
                        {actorRole && (
                          <span
                            className={`inline-block w-fit rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                              ROLE_CLS[actorRole] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {actorRole}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell>
                      <Badge
                        variant={actionVariant(log.action)}
                        className="font-mono text-xs"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>

                    {/* Entity type */}
                    <TableCell className="text-xs text-muted-foreground">
                      {log.entity_type ?? "—"}
                    </TableCell>

                    {/* Status change */}
                    <TableCell>
                      {meta.oldStatus && meta.newStatus ? (
                        <div className="flex items-center gap-1">
                          <StatusPill status={meta.oldStatus} />
                          <span className="text-[11px] text-muted-foreground">→</span>
                          <StatusPill status={meta.newStatus} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {meta.label ?? meta.guestName ?? "—"}
                        </span>
                      )}
                    </TableCell>

                    {/* Details button */}
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(log);
                        }}
                      >
                        {al.details}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Detail dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {al.logDetail}
              {selected && (() => {
                const bucket = toModuleBucket(getMeta(selected).module);
                return bucket ? (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      MODULE_CLS[bucket as AppModule] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {moduleLabel(bucket)}
                  </span>
                ) : null;
              })()}
            </DialogTitle>
          </DialogHeader>

          {selected && (() => {
            const meta = getMeta(selected);
            const profile = selected.user_id ? profileMap.get(selected.user_id) : null;
            const actorEmail = profile?.email ?? meta.changedBy ?? meta.actorName ?? null;
            const actorRole  = profile?.role  ?? meta.actorRole ?? null;
            const isStatusChange = Boolean(meta.oldStatus && meta.newStatus);

            return (
              <div className="space-y-4 text-sm">
                {/* Status change banner */}
                {isStatusChange && (
                  <div className="flex items-center justify-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                    <StatusPill status={meta.oldStatus!} />
                    <span className="text-base text-muted-foreground">→</span>
                    <StatusPill status={meta.newStatus!} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/20 p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{al.time}</p>
                    <p className="font-medium">
                      {format(parseISO(selected.created_at), "dd/MM/yyyy HH:mm:ss")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{al.actor}</p>
                    <p className="font-medium">{actorEmail ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{al.role}</p>
                    <p className="font-medium capitalize">{actorRole ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{al.action}</p>
                    <Badge variant={actionVariant(selected.action)} className="font-mono text-xs">
                      {selected.action}
                    </Badge>
                  </div>
                  {selected.entity_type && (
                    <div>
                      <p className="text-xs text-muted-foreground">Entity type</p>
                      <p className="font-mono text-xs">{selected.entity_type}</p>
                    </div>
                  )}
                  {selected.entity_id && (
                    <div>
                      <p className="text-xs text-muted-foreground">Entity ID</p>
                      <p className="truncate font-mono text-xs">{selected.entity_id}</p>
                    </div>
                  )}
                  {(meta.guestName ?? meta.label) && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">{al.target}</p>
                      <p className="font-medium">{meta.guestName ?? meta.label}</p>
                    </div>
                  )}
                  {meta.listingTitle && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">{t.activityLogs.listingCol}</p>
                      <p className="font-medium">{meta.listingTitle}</p>
                    </div>
                  )}
                  {meta.totalAmount != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t.activityLogs.totalAmount}</p>
                      <p className="font-medium tabular-nums">
                        {meta.totalAmount.toLocaleString("vi-VN")} ₫
                      </p>
                    </div>
                  )}
                  {meta.changedAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t.activityLogs.changedAt}</p>
                      <p className="font-medium">
                        {format(new Date(meta.changedAt), "dd/MM/yyyy HH:mm:ss")}
                      </p>
                    </div>
                  )}
                </div>

                {(meta.oldData || meta.newData) ? (
                  <div className="space-y-3">
                    <JsonBlock label={al.oldData} data={meta.oldData} />
                    <JsonBlock label={al.newData} data={meta.newData} />
                  </div>
                ) : !isStatusChange ? (
                  <p className="text-xs italic text-muted-foreground">{al.noChange}</p>
                ) : null}

                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <JsonBlock label={al.metadata} data={selected.metadata} />
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
