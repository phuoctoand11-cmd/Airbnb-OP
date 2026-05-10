import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ClipboardCopy, Info } from "lucide-react";

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

// ── SQL Migration ─────────────────────────────────────────────────────────────

const MIGRATION_SQL = `-- Activity Logs / Audit Trail
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_name        text,
  actor_role        text,
  action            text NOT NULL,
  module            text NOT NULL,
  target_table      text,
  target_id         uuid,
  target_label      text,
  old_data          jsonb,
  new_data          jsonb,
  metadata          jsonb,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_actor_idx
  ON public.activity_logs (actor_profile_id);
CREATE INDEX IF NOT EXISTS activity_logs_module_idx
  ON public.activity_logs (module);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert logs (best-effort, no PII)
CREATE POLICY "activity_logs_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- All authenticated users can read (app enforces admin/manager gate)
CREATE POLICY "activity_logs_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (true);`;

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

function actionVariant(action: string): "default" | "secondary" | "outline" | "destructive" {
  if (action.includes("created")) return "default";
  if (action.includes("deleted") || action.includes("removed")) return "destructive";
  if (action.includes("updated") || action.includes("changed")) return "secondary";
  return "outline";
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
  const [tableNotFound, setTableNotFound] = useState(false);
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  const query = useQuery({
    queryKey: ["activity_logs", { moduleFilter, search, from, to }],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (moduleFilter !== "all") q = q.eq("module", moduleFilter);
      if (from) q = q.gte("created_at", `${from}T00:00:00.000Z`);
      if (to) q = q.lte("created_at", `${to}T23:59:59.999Z`);
      if (search.trim()) {
        q = q.or(
          `actor_name.ilike.%${search.trim()}%,action.ilike.%${search.trim()}%,target_label.ilike.%${search.trim()}%`,
        );
      }

      const { data, error } = await q;
      if (error) {
        if ((error as { code?: string }).code === "42P01") {
          setTableNotFound(true);
          return [] as ActivityLog[];
        }
        throw error;
      }
      setTableNotFound(false);
      return (data ?? []) as ActivityLog[];
    },
  });

  const copySql = async () => {
    await navigator.clipboard.writeText(MIGRATION_SQL);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2000);
  };

  const moduleLabel = (mod: string) =>
    (al.modules as Record<string, string>)[mod] ?? mod;

  return (
    <AppLayout title={al.title}>
      <p className="mb-4 text-sm text-muted-foreground">{al.subtitle}</p>

      {/* ── Migration notice ───────────────────────────────────────────── */}
      {tableNotFound && (
        <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">{al.migrationTitle}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">{al.migrationDesc}</p>
            <button
              className="text-xs font-medium underline underline-offset-2"
              onClick={() => setSqlExpanded((v) => !v)}
            >
              {sqlExpanded ? al.hideSql : al.showSql}
            </button>
            {sqlExpanded && (
              <div className="relative mt-2 rounded-lg border border-amber-300 bg-white/70 dark:bg-black/20">
                <pre className="max-h-64 overflow-auto p-3 text-[11px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {MIGRATION_SQL}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute right-2 top-2 h-7 gap-1.5 text-xs"
                  onClick={copySql}
                >
                  <ClipboardCopy className="h-3 w-3" />
                  {sqlCopied ? al.copied : al.copy}
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

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
      ) : !query.data || query.data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
          <p className="font-medium text-muted-foreground">{al.noLogs}</p>
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
              {query.data.map((log) => (
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
                        {log.actor_name ?? "—"}
                      </span>
                      {log.actor_role && (
                        <span
                          className={`inline-block w-fit rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                            ROLE_CLS[log.actor_role] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {log.actor_role}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.module && (
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          MODULE_CLS[log.module as AppModule] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {moduleLabel(log.module)}
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
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {log.target_label ?? "—"}
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
              ))}
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
              {selected?.module && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    MODULE_CLS[selected.module as AppModule] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {moduleLabel(selected.module)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 text-sm">
              {/* Meta row */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/20 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">{al.time}</p>
                  <p className="font-medium">
                    {format(parseISO(selected.created_at), "dd/MM/yyyy HH:mm:ss")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{al.actor}</p>
                  <p className="font-medium">{selected.actor_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{al.role}</p>
                  <p className="font-medium capitalize">{selected.actor_role ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{al.action}</p>
                  <Badge variant={actionVariant(selected.action)} className="font-mono text-xs">
                    {selected.action}
                  </Badge>
                </div>
                {selected.target_label && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{al.target}</p>
                    <p className="font-medium">{selected.target_label}</p>
                  </div>
                )}
                {selected.target_table && (
                  <div>
                    <p className="text-xs text-muted-foreground">Table</p>
                    <p className="font-mono text-xs">{selected.target_table}</p>
                  </div>
                )}
                {selected.target_id && (
                  <div>
                    <p className="text-xs text-muted-foreground">ID</p>
                    <p className="truncate font-mono text-xs">{selected.target_id}</p>
                  </div>
                )}
              </div>

              {/* Data sections */}
              {selected.old_data || selected.new_data ? (
                <div className="space-y-3">
                  <JsonBlock label={al.oldData} data={selected.old_data} />
                  <JsonBlock label={al.newData} data={selected.new_data} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">{al.noChange}</p>
              )}

              {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                <JsonBlock label={al.metadata} data={selected.metadata} />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
