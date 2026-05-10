import { useState } from "react";
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

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE_OPTIONS = ["tasks", "bookings", "calendar", "hr"] as const;
type AppModule = (typeof MODULE_OPTIONS)[number];

const MODULE_CLS: Record<AppModule, string> = {
  tasks: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bookings: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  calendar: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  hr: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const ROLE_CLS: Record<string, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  manager: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const STATUS_CLS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

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
  if (action.includes("deleted") || action.includes("removed") || action.includes("cancel")) return "destructive";
  if (action.includes("updated") || action.includes("changed") || action.includes("uploaded")) return "secondary";
  return "outline";
}

// ── Metadata helpers ──────────────────────────────────────────────────────────

function getMeta(log: ActivityLog) {
  const m = (log.metadata ?? {}) as Record<string, unknown>;
  return {
    actorName:    (m.actor_name   as string | null) ?? null,
    actorRole:    (m.actor_role   as string | null) ?? null,
    module:       (m.module       as string | null) ?? log.entity_type ?? null,
    label:        (m.label        as string | null) ?? log.entity_id ?? null,
    guestName:    (m.guest_name   as string | null) ?? null,
    listingTitle: (m.listing_title as string | null) ?? null,
    oldStatus:    (m.old_status   as string | null) ?? null,
    newStatus:    (m.new_status   as string | null) ?? null,
    totalAmount:  (m.total_amount as number | null) ?? null,
    changedAt:    (m.changed_at   as string | null) ?? null,
    newData:  (m.new_data  as Record<string, unknown> | null) ?? null,
    oldData:  (m.old_data  as Record<string, unknown> | null) ?? null,
  };
}

// ── JSON display helper ───────────────────────────────────────────────────────

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
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<ActivityLog | null>(null);

  const query = useQuery({
    queryKey: ["activity_logs", { from, to }],
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      // Use local-timezone boundaries so "today" in Vietnam (UTC+7) is correct
      if (from) {
        q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      }
      if (to) {
        q = q.lte("created_at", new Date(`${to}T23:59:59.999`).toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ActivityLog[];
      console.log("[ACTIVITY_LOGS_FETCH]", { rowCount: rows.length, from, to });
      return rows;
    },
  });

  // ── Client-side filtering (module is inside JSONB metadata) ──────────────
  const filtered = (query.data ?? []).filter((log) => {
    const { module, actorName, label } = getMeta(log);
    if (moduleFilter !== "all" && module !== moduleFilter) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      const haystack = [actorName, log.action, label, module]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(s)) return false;
    }
    return true;
  });

  const moduleLabel = (mod: string) =>
    (al.modules as Record<string, string>)[mod] ?? mod;

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

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {query.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : query.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t.common.error}</AlertTitle>
          <AlertDescription>{(query.error as Error).message}</AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
          <p className="font-medium text-muted-foreground">{al.noLogs}</p>
          {query.data && query.data.length > 0 && search && (
            <p className="mt-1 text-sm text-muted-foreground">No results for "{search}"</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-40">{al.time}</TableHead>
                <TableHead>{al.actor}</TableHead>
                <TableHead className="w-28">{al.module}</TableHead>
                <TableHead>{al.action}</TableHead>
                <TableHead>{al.target}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => {
                const { actorName, actorRole, module, label, oldStatus, newStatus } = getMeta(log);
                return (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setSelected(log)}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(parseISO(log.created_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium leading-none">
                          {actorName ?? "—"}
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
                    <TableCell>
                      {module && (
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            MODULE_CLS[module as AppModule] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {moduleLabel(module)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={actionVariant(log.action)}
                        className="text-xs font-mono"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        <span className="truncate">{label ?? "—"}</span>
                        {oldStatus && newStatus && (
                          <div className="flex items-center gap-1">
                            <StatusPill status={oldStatus} />
                            <span className="text-[11px] text-muted-foreground">→</span>
                            <StatusPill status={newStatus} />
                          </div>
                        )}
                      </div>
                    </TableCell>
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
                const { module } = getMeta(selected);
                return module ? (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      MODULE_CLS[module as AppModule] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {moduleLabel(module)}
                  </span>
                ) : null;
              })()}
            </DialogTitle>
          </DialogHeader>

          {selected && (() => {
            const {
              actorName, actorRole, label, newData, oldData,
              guestName, listingTitle, oldStatus, newStatus, totalAmount, changedAt,
            } = getMeta(selected);
            const isStatusChange = Boolean(oldStatus && newStatus);
            return (
              <div className="space-y-4 text-sm">
                {/* ── Status change banner ────────────────────────────── */}
                {isStatusChange && (
                  <div className="flex items-center justify-center gap-3 rounded-lg border bg-muted/30 py-3 px-4">
                    <StatusPill status={oldStatus!} />
                    <span className="text-base text-muted-foreground">→</span>
                    <StatusPill status={newStatus!} />
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
                    <p className="font-medium">{actorName ?? "—"}</p>
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
                  {(guestName ?? label) && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">{al.target}</p>
                      <p className="font-medium">{guestName ?? label}</p>
                    </div>
                  )}
                  {listingTitle && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Căn hộ</p>
                      <p className="font-medium">{listingTitle}</p>
                    </div>
                  )}
                  {totalAmount != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Tổng tiền</p>
                      <p className="font-medium tabular-nums">
                        {totalAmount.toLocaleString("vi-VN")} ₫
                      </p>
                    </div>
                  )}
                  {changedAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">Thời điểm đổi</p>
                      <p className="font-medium">
                        {format(new Date(changedAt), "dd/MM/yyyy HH:mm:ss")}
                      </p>
                    </div>
                  )}
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
                </div>

                {(oldData || newData) ? (
                  <div className="space-y-3">
                    <JsonBlock label={al.oldData} data={oldData} />
                    <JsonBlock label={al.newData} data={newData} />
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
