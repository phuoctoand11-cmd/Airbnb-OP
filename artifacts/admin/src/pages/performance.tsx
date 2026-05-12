import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  Award, TrendingUp, AlertTriangle, Users, Plus, ChevronLeft, ChevronRight,
  Copy, Check, RotateCcw, Star, Minus,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/lib/supabase";
import type { Employee, PerformanceLog, MonthlyReview } from "@/lib/supabase";

// ── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  "checklist", "lateness", "cleanliness", "customer_feedback",
  "teamwork", "emergency_support", "violation", "bonus", "other",
] as const;
type Category = (typeof CATEGORIES)[number];

interface BonusTier { minScore: number; amount: number; }

const DEFAULT_BONUS_TIERS: BonusTier[] = [
  { minScore: 90, amount: 500000 },
  { minScore: 80, amount: 300000 },
  { minScore: 70, amount: 100000 },
];

interface WarningInfo {
  level: string;
  labelKey: "excellent" | "good" | "normal" | "lightWarning" | "strongWarning" | "deduction" | "reviewRequired";
  color: string;
  bg: string;
  barColor: string;
}

function getWarningInfo(score: number): WarningInfo {
  if (score >= 90) return { level: "excellent", labelKey: "excellent", color: "text-emerald-700", bg: "bg-emerald-100", barColor: "#10b981" };
  if (score >= 80) return { level: "good", labelKey: "good", color: "text-blue-700", bg: "bg-blue-100", barColor: "#3b82f6" };
  if (score >= 70) return { level: "normal", labelKey: "normal", color: "text-gray-700", bg: "bg-gray-100", barColor: "#6b7280" };
  if (score >= 60) return { level: "light_warning", labelKey: "lightWarning", color: "text-yellow-700", bg: "bg-yellow-100", barColor: "#f59e0b" };
  if (score >= 50) return { level: "strong_warning", labelKey: "strongWarning", color: "text-orange-700", bg: "bg-orange-100", barColor: "#f97316" };
  if (score >= 40) return { level: "deduction", labelKey: "deduction", color: "text-red-700", bg: "bg-red-100", barColor: "#ef4444" };
  return { level: "review_required", labelKey: "reviewRequired", color: "text-red-900", bg: "bg-red-200", barColor: "#b91c1c" };
}

const CLEANING_ROLES = ["vệ sinh", "cleaner", "cleaningstaff", "cleaning staff"];

function isCleaningEmployee(emp: Employee): boolean {
  const r = (emp.role ?? "").toLowerCase().trim();
  return CLEANING_ROLES.some(cr => r === cr || r.includes(cr));
}

const SCORE_MAX = 110;
const SCORE_MIN = 0;

function computeScore(logs: PerformanceLog[]): number {
  const raw = 100 + logs.reduce((s, l) => s + l.score_change, 0);
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, raw));
}

function getBonusAmount(score: number, tiers: BonusTier[]): number {
  if (score < 70) return 0;
  const sorted = [...tiers].sort((a, b) => b.minScore - a.minScore);
  for (const tier of sorted) {
    if (score >= tier.minScore) return tier.amount;
  }
  return 0;
}

function getPenaltyAmount(score: number): number {
  if (score >= 60) return 0;
  if (score >= 50) return 100000;
  if (score >= 40) return 200000;
  return 300000;
}

const SETTINGS_KEY = "airbnb-ops-perf-bonus-tiers";

function useBonusTiers() {
  const [tiers, setTiersState] = useState<BonusTier[]>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) return JSON.parse(stored) as BonusTier[];
    } catch { /* noop */ }
    return DEFAULT_BONUS_TIERS;
  });

  const setTiers = useCallback((next: BonusTier[]) => {
    setTiersState(next);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* noop */ }
  }, []);

  const reset = useCallback(() => setTiers(DEFAULT_BONUS_TIERS), [setTiers]);

  return { tiers, setTiers, reset };
}

// ── Score pill ───────────────────────────────────────────────────────────────

function ScorePill({ score, large = false }: { score: number; large?: boolean }) {
  const info = getWarningInfo(score);
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${info.bg} ${info.color} ${large ? "px-4 py-1.5 text-2xl" : "px-2.5 py-0.5 text-sm"}`}>
      {score}
    </span>
  );
}

function WarningBadge({ score }: { score: number }) {
  const { t } = useI18n();
  const info = getWarningInfo(score);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${info.bg} ${info.color}`}>
      {t.performance[info.labelKey]}
    </span>
  );
}

// ── Add Score Modal ──────────────────────────────────────────────────────────

interface AddScoreModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: Employee[];
  month: number;
  year: number;
  preEmployeeId?: string;
}

function AddScoreModal({ open, onOpenChange, employees, month, year, preEmployeeId }: AddScoreModalProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { session } = useAuth();
  const qc = useQueryClient();

  const [employeeId, setEmployeeId] = useState(preEmployeeId ?? "");
  const [category, setCategory] = useState<Category | "">("");
  const [scoreChange, setScoreChange] = useState<string>("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpen = (v: boolean) => {
    if (!v) {
      setEmployeeId(preEmployeeId ?? "");
      setCategory("");
      setScoreChange("");
      setReason("");
    }
    onOpenChange(v);
  };

  const valid = employeeId && category && scoreChange !== "" && !isNaN(Number(scoreChange)) && Number(scoreChange) !== 0 && reason.trim();

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);

    const change = Number(scoreChange);
    const logStart = new Date(year, month - 1, 1).toISOString();
    const logEnd = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    // eslint-disable-next-line no-console
    console.info("[PERFORMANCE_SAVE_ATTEMPT]", {
      employeeId,
      category,
      change,
      reason: reason.trim(),
      month,
      year,
      userId: session?.user?.id ?? null,
    });

    try {
      // 1. Insert log row
      const { error: logErr } = await supabase
        .from("employee_performance_logs")
        .insert({
          employee_id: employeeId,
          score_change: change,
          reason: reason.trim(),
          category,
          created_by: session?.user?.id ?? null,
        });

      if (logErr) {
        // eslint-disable-next-line no-console
        console.error("[PERFORMANCE_SAVE_ERROR] log insert failed", {
          code: logErr.code,
          message: logErr.message,
          details: logErr.details,
          hint: logErr.hint,
        });
        throw logErr;
      }

      // 2. Re-fetch all logs for this employee in this month to recompute total
      const { data: allLogs, error: fetchErr } = await supabase
        .from("employee_performance_logs")
        .select("score_change")
        .eq("employee_id", employeeId)
        .gte("created_at", logStart)
        .lte("created_at", logEnd);

      if (fetchErr) {
        // eslint-disable-next-line no-console
        console.error("[PERFORMANCE_SAVE_ERROR] log refetch failed", {
          code: fetchErr.code,
          message: fetchErr.message,
        });
        throw fetchErr;
      }

      // 3. Compute capped total, bonus, penalty, warning level
      const rawTotal = 100 + (allLogs ?? []).reduce((s: number, l: { score_change: number }) => s + l.score_change, 0);
      const total = Math.min(SCORE_MAX, Math.max(SCORE_MIN, rawTotal));
      const info = getWarningInfo(total);
      const bonusAmt = getBonusAmount(total, DEFAULT_BONUS_TIERS);
      const penaltyAmt = getPenaltyAmount(total);

      // 4. Upsert score row
      const { error: upsertErr } = await supabase
        .from("employee_performance_scores")
        .upsert(
          {
            employee_id: employeeId,
            month,
            year,
            total_score: total,
            warning_level: info.level,
            bonus_amount: bonusAmt,
            penalty_amount: penaltyAmt,
          },
          { onConflict: "employee_id,month,year" }
        );

      if (upsertErr) {
        // eslint-disable-next-line no-console
        console.error("[PERFORMANCE_SAVE_ERROR] score upsert failed", {
          code: upsertErr.code,
          message: upsertErr.message,
          details: upsertErr.details,
          hint: upsertErr.hint,
        });
        // Non-fatal: log row already saved, just warn
        console.warn("[PERFORMANCE_SAVE_ERROR] score row not updated but log was saved");
      }

      // eslint-disable-next-line no-console
      console.info("[PERFORMANCE_SAVE_SUCCESS]", {
        employeeId,
        month,
        year,
        total,
        warningLevel: info.level,
        bonusAmt,
        penaltyAmt,
      });

      toast({ title: t.performance.scoreAdded });
      qc.invalidateQueries({ queryKey: ["perf_logs"] });
      qc.invalidateQueries({ queryKey: ["perf_scores"] });
      handleOpen(false);
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      // eslint-disable-next-line no-console
      console.error("[PERFORMANCE_SAVE_ERROR]", {
        message: e?.message,
        code: e?.code,
        raw: err,
      });
      const detail = e?.code === "42P01"
        ? " (Bảng chưa tồn tại — hãy chạy migration SQL)"
        : e?.message ? `: ${e.message}` : "";
      toast({ title: `${t.performance.couldNotSave}${detail}`, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const catLabel = (c: string) => t.performance[`cat_${c}` as keyof typeof t.performance] as string || c;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.performance.addScore}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.performance.employee}</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={!!preEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder={t.performance.selectEmployee} />
              </SelectTrigger>
              <SelectContent>
                {employees.filter(e => e.status === "active" && isCleaningEmployee(e)).map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t.performance.category}</Label>
            <Select value={category} onValueChange={v => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue placeholder={t.performance.selectCategory} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t.performance.scoreChange}</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline"
                className={Number(scoreChange) > 0 ? "border-emerald-500 text-emerald-700" : ""}
                onClick={() => setScoreChange(v => v.startsWith("-") ? v.slice(1) : (v ? v : ""))}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Input
                type="number"
                placeholder="e.g. 5 or -10"
                value={scoreChange}
                onChange={e => setScoreChange(e.target.value)}
                className="text-center font-mono"
              />
              <Button type="button" size="sm" variant="outline"
                className={Number(scoreChange) < 0 ? "border-red-500 text-red-700" : ""}
                onClick={() => setScoreChange(v => !v.startsWith("-") ? `-${v || ""}` : v)}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {scoreChange && !isNaN(Number(scoreChange)) && Number(scoreChange) !== 0 && (
              <p className={`text-xs font-medium ${Number(scoreChange) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {Number(scoreChange) > 0 ? `+${scoreChange} ${t.performance.pointsLabel}` : `${scoreChange} ${t.performance.pointsLabel}`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t.performance.reason}</Label>
            <Textarea
              rows={3}
              placeholder={t.performance.reasonPlaceholder}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>{t.common.cancel}</Button>
          <Button onClick={handleSubmit} disabled={!valid || saving}>
            {saving ? t.common.loading : t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Employee Detail Dialog ────────────────────────────────────────────────────

interface DetailDialogProps {
  employee: Employee | null;
  logs: PerformanceLog[];
  month: number;
  year: number;
  canManage: boolean;
  tiers: BonusTier[];
  onClose: () => void;
  onAddScore: (empId: string) => void;
}

function EmployeeDetailDialog({ employee, logs, month, year, canManage, tiers, onClose, onAddScore }: DetailDialogProps) {
  const { t } = useI18n();
  const { fmt } = useCurrency();
  const { toast } = useToast();
  const { session } = useAuth();
  const [review, setReview] = useState<Partial<MonthlyReview>>({});
  const [savingReview, setSavingReview] = useState(false);

  const empLogs = useMemo(() => logs.filter(l => l.employee_id === employee?.id), [logs, employee?.id]);
  const score = computeScore(empLogs);
  const bonus = getBonusAmount(score, tiers);
  const info = getWarningInfo(score);

  const catLabel = (c: string) => t.performance[`cat_${c}` as keyof typeof t.performance] as string || c;

  const reviewQuery = useQuery({
    queryKey: ["perf_review", employee?.id, month, year],
    enabled: !!employee,
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_monthly_reviews")
        .select("*")
        .eq("employee_id", employee!.id)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();
      return data as MonthlyReview | null;
    },
  });

  const qc = useQueryClient();

  const handleSaveReview = async () => {
    if (!employee) return;
    setSavingReview(true);
    try {
      await supabase.from("employee_monthly_reviews").upsert(
        { employee_id: employee.id, month, year, ...review, created_by: session?.user?.id ?? null },
        { onConflict: "employee_id,month,year" }
      );
      toast({ title: t.performance.reviewSaved });
      qc.invalidateQueries({ queryKey: ["perf_review", employee.id, month, year] });
    } catch {
      toast({ title: t.common.error, variant: "destructive" });
    } finally {
      setSavingReview(false);
    }
  };

  const reviewData = reviewQuery.data ?? {};

  return (
    <Dialog open={!!employee} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee?.full_name}</DialogTitle>
        </DialogHeader>

        {/* Score summary */}
        <div className="flex items-center gap-4 rounded-xl border border-border p-4">
          <div className="flex flex-col items-center gap-1">
            <ScorePill score={score} large />
            <span className="text-xs text-muted-foreground">{t.performance.scoreThisMonth}</span>
          </div>
          <div className="flex-1 space-y-1">
            <WarningBadge score={score} />
            <p className="text-sm text-muted-foreground">
              {t.performance.bonus}: <span className="font-semibold text-foreground">{fmt(bonus)}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t.performance.startingScore}</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => { onClose(); onAddScore(employee!.id); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t.common.add}
            </Button>
          )}
        </div>

        {/* Recent logs */}
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">{t.performance.recentLogs}</p>
          {empLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.performance.noLogs}</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {empLogs.slice(0, 20).map(log => (
                <div key={log.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className={`w-12 shrink-0 text-right font-mono font-semibold ${log.score_change > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {log.score_change > 0 ? `+${log.score_change}` : log.score_change}
                  </span>
                  <span className="flex-1 truncate text-foreground">{log.reason}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{catLabel(log.category)}</Badge>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "dd/MM")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly review (manager can edit) */}
        {canManage && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">{t.performance.monthlyReview}</p>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.performance.strengths}</Label>
              <Textarea rows={2} value={review.strengths ?? reviewData.strengths ?? ""} onChange={e => setReview(r => ({ ...r, strengths: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.performance.weaknesses}</Label>
              <Textarea rows={2} value={review.weaknesses ?? reviewData.weaknesses ?? ""} onChange={e => setReview(r => ({ ...r, weaknesses: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.performance.managerComment}</Label>
              <Textarea rows={2} value={review.manager_comment ?? reviewData.manager_comment ?? ""} onChange={e => setReview(r => ({ ...r, manager_comment: e.target.value }))} />
            </div>
            <Button size="sm" onClick={handleSaveReview} disabled={savingReview}>
              {savingReview ? t.common.loading : t.performance.saveReview}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Migration SQL card ────────────────────────────────────────────────────────

const MIGRATION_SQL = `-- Run this in your Supabase SQL Editor
-- (full SQL at .local/performance_migration.sql)

CREATE TABLE IF NOT EXISTS employee_performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year >= 2020),
  total_score integer NOT NULL DEFAULT 100,
  bonus_amount numeric(12,2) NOT NULL DEFAULT 0,
  penalty_amount numeric(12,2) NOT NULL DEFAULT 0,
  rank integer, warning_level text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month, year)
);
CREATE TABLE IF NOT EXISTS employee_performance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  score_change integer NOT NULL,
  reason text NOT NULL,
  category text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS employee_monthly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month integer NOT NULL, year integer NOT NULL,
  strengths text, weaknesses text, improvement_plan text, manager_comment text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month, year)
);
ALTER TABLE employee_performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_performance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_monthly_reviews ENABLE ROW LEVEL SECURITY;
-- (see .local/performance_migration.sql for full RLS policies)`;

function MigrationCard({ t }: { t: { performance: Record<string, string> } }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-amber-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {t.performance.migrationNote}
        </CardTitle>
        <CardDescription className="text-amber-800">{t.performance.migrationDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShow(s => !s)} className="border-amber-300">
            {show ? t.performance.hideSql : t.performance.showSql}
          </Button>
          {show && (
            <Button size="sm" variant="outline" onClick={copy} className="border-amber-300 gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t.performance.copied : t.performance.copy}
            </Button>
          )}
        </div>
        {show && (
          <pre className="overflow-x-auto rounded-lg bg-amber-100 p-3 text-[11px] text-amber-900 font-mono leading-relaxed">
            {MIGRATION_SQL}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Performance() {
  const { t } = useI18n();
  const { fmt } = useCurrency();
  const { role, employee, session } = useAuth();
  const { toast } = useToast();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [addScoreOpen, setAddScoreOpen] = useState(false);
  const [preEmployeeId, setPreEmployeeId] = useState<string | undefined>();
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all");

  const isManager = role === "admin" || role === "manager";
  const isCleaner = role === "cleaner" || role === "cleaningstaff";

  const monthStart = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
  const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString();

  // ── Navigate months ────────────────────────────────────────────────────────
  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  // ── Settings ───────────────────────────────────────────────────────────────
  const { tiers, setTiers, reset: resetTiers } = useBonusTiers();
  const [editTiers, setEditTiers] = useState<BonusTier[]>(() => [...tiers]);
  const [tiersSaved, setTiersSaved] = useState(false);

  const saveTiers = () => {
    setTiers(editTiers);
    setTiersSaved(true);
    toast({ title: t.performance.settingsSaved });
    setTimeout(() => setTiersSaved(false), 1500);
  };

  // ── Fetch employees ────────────────────────────────────────────────────────
  const employeesQuery = useQuery({
    queryKey: ["hr_employees_perf", role],
    enabled: role !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_hr_employees");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  // ── Fetch logs ────────────────────────────────────────────────────────────
  const [needsMigration, setNeedsMigration] = useState(false);
  const logsQuery = useQuery({
    queryKey: ["perf_logs", selectedYear, selectedMonth],
    enabled: role !== null,
    queryFn: async () => {
      let q = supabase
        .from("employee_performance_logs")
        .select("*")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd)
        .order("created_at", { ascending: false });
      if (isCleaner && employee?.id) q = q.eq("employee_id", employee.id);
      const { data, error } = await q;
      if (error) {
        if (error.code === "42P01") { setNeedsMigration(true); return []; }
        throw error;
      }
      setNeedsMigration(false);
      return (data ?? []) as PerformanceLog[];
    },
  });

  const employees = employeesQuery.data ?? [];
  const logs = logsQuery.data ?? [];

  // ── Computed scores ────────────────────────────────────────────────────────
  const employeeScores = useMemo(() => {
    const activeEmployees = isCleaner && employee
      ? employees.filter(e => e.id === employee.id)
      : employees.filter(e => e.status === "active" && isCleaningEmployee(e));

    return activeEmployees
      .map(emp => {
        const empLogs = logs.filter(l => l.employee_id === emp.id);
        const score = computeScore(empLogs);
        return { emp, score, empLogs, bonus: getBonusAmount(score, tiers), info: getWarningInfo(score) };
      })
      .sort((a, b) => b.score - a.score)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [employees, logs, tiers, isCleaner, employee]);

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const avgScore = employeeScores.length
    ? Math.round(employeeScores.reduce((s, e) => s + e.score, 0) / employeeScores.length)
    : 0;
  const best = employeeScores[0] ?? null;
  const underWarning = employeeScores.filter(e => e.score < 70).length;
  const totalBonus = employeeScores.reduce((s, e) => s + e.bonus, 0);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = employeeScores.map(e => ({
    name: e.emp.full_name.split(" ").slice(-1)[0],
    score: e.score,
    fill: e.info.barColor,
  }));

  // ── Filtered logs for Logs tab ─────────────────────────────────────────────
  const filteredLogs = filterEmployeeId === "all"
    ? logs
    : logs.filter(l => l.employee_id === filterEmployeeId);

  const catLabel = (c: string) => (t.performance[`cat_${c}` as keyof typeof t.performance] as string) || c;

  // ── Loading & migration states ─────────────────────────────────────────────
  const loading = logsQuery.isLoading || employeesQuery.isLoading;

  // ── Self score (cleaner view) ──────────────────────────────────────────────
  const myEntry = isCleaner && employee ? employeeScores.find(e => e.emp.id === employee.id) : null;

  // ── Month label ────────────────────────────────────────────────────────────
  const monthLabel = format(new Date(selectedYear, selectedMonth - 1, 1), "MMMM yyyy");

  const openAddScore = (empId?: string) => {
    setPreEmployeeId(empId);
    setAddScoreOpen(true);
  };

  return (
    <AppLayout
      title={t.performance.title}
      action={
        isManager ? (
          <Button size="sm" onClick={() => openAddScore()} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t.performance.addScore}
          </Button>
        ) : undefined
      }
    >
      {/* Migration banner */}
      {needsMigration && <div className="mb-6"><MigrationCard t={t as { performance: Record<string, string> }} /></div>}

      {/* Month / Year selector */}
      <div className="mb-6 flex items-center gap-3">
        <Button size="icon" variant="outline" onClick={prevMonth} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[160px] text-center text-base font-semibold text-foreground capitalize">
          {monthLabel}
        </span>
        <Button size="icon" variant="outline" onClick={nextMonth} className="h-8 w-8">
          <ChevronRight className="h-4 w-4" />
        </Button>
        {loading && (
          <span className="text-sm text-muted-foreground animate-pulse">{t.common.loading}</span>
        )}
      </div>

      {/* ── Cleaner self-view ─────────────────────────────────────────────── */}
      {isCleaner && (
        <div className="space-y-6">
          {myEntry ? (
            <>
              {/* My score card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t.performance.myScore}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <ScorePill score={myEntry.score} large />
                      <p className="mt-1 text-xs text-muted-foreground">{t.performance.scoreThisMonth}</p>
                    </div>
                    <div className="space-y-2">
                      <WarningBadge score={myEntry.score} />
                      <p className="text-sm">
                        <span className="text-muted-foreground">{t.performance.bonus}: </span>
                        <span className="font-semibold text-foreground">{fmt(myEntry.bonus)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{t.performance.startingScore}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* My recent logs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t.performance.recentLogs}</CardTitle>
                </CardHeader>
                <CardContent>
                  {myEntry.empLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.performance.noLogs}</p>
                  ) : (
                    <div className="space-y-2">
                      {myEntry.empLogs.slice(0, 15).map(log => (
                        <div key={log.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                          <span className={`w-10 shrink-0 text-right font-mono font-semibold ${log.score_change > 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {log.score_change > 0 ? `+${log.score_change}` : log.score_change}
                          </span>
                          <span className="flex-1 truncate">{log.reason}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">{catLabel(log.category)}</Badge>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {format(new Date(log.created_at), "dd/MM/yyyy")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {t.performance.noScore}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Admin / Manager full dashboard ────────────────────────────────── */}
      {isManager && (
        <>
          {/* KPI cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
                    <TrendingUp className="h-4.5 w-4.5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t.performance.avgScore}</p>
                    <p className="text-2xl font-bold text-foreground">{avgScore}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
                    <Star className="h-4.5 w-4.5 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t.performance.bestPerformer}</p>
                    <p className="truncate text-sm font-bold text-foreground">
                      {best ? `${best.emp.full_name.split(" ").slice(-1)[0]} (${best.score})` : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100">
                    <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t.performance.underWarning}</p>
                    <p className="text-2xl font-bold text-foreground">{underWarning}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                    <Award className="h-4.5 w-4.5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t.performance.totalBonus}</p>
                    <p className="text-base font-bold text-foreground">{fmt(totalBonus)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">{t.performance.overview}</TabsTrigger>
              <TabsTrigger value="employees">{t.performance.employees}</TabsTrigger>
              <TabsTrigger value="logs">{t.performance.logs}</TabsTrigger>
              <TabsTrigger value="settings">{t.performance.settings}</TabsTrigger>
            </TabsList>

            {/* ── Overview ──────────────────────────────────────────────── */}
            <TabsContent value="overview" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t.performance.scoreDistribution}</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t.performance.noEmployees}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 120]} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v) => [`${v} pts`, t.performance.score]}
                          contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                        />
                        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Warning level summary */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { labelKey: "excellent" as const, min: 90, color: "emerald" },
                  { labelKey: "good" as const, min: 80, color: "blue" },
                  { labelKey: "lightWarning" as const, min: 60, color: "yellow" },
                  { labelKey: "reviewRequired" as const, min: 0, color: "red" },
                ].map(item => {
                  const count = employeeScores.filter(e => {
                    if (item.labelKey === "excellent") return e.score >= 90;
                    if (item.labelKey === "good") return e.score >= 80 && e.score < 90;
                    if (item.labelKey === "lightWarning") return e.score >= 60 && e.score < 70;
                    return e.score < 40;
                  }).length;
                  return (
                    <Card key={item.labelKey} className="text-center">
                      <CardContent className="py-4">
                        <p className="text-2xl font-bold text-foreground">{count}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t.performance[item.labelKey]}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* ── Employees ─────────────────────────────────────────────── */}
            <TabsContent value="employees">
              <Card>
                <CardContent className="p-0">
                  {employeesQuery.isLoading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground animate-pulse">{t.common.loading}</p>
                  ) : employeesQuery.isError ? (
                    <p className="py-8 text-center text-sm text-red-500">{t.common.error}</p>
                  ) : employeeScores.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t.performance.noEmployees}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">{t.performance.rank}</TableHead>
                          <TableHead>{t.common.name}</TableHead>
                          <TableHead className="text-center">{t.performance.score}</TableHead>
                          <TableHead>{t.performance.warningLevel}</TableHead>
                          <TableHead className="text-right">{t.performance.bonus}</TableHead>
                          <TableHead className="w-24 text-center">{t.common.actions}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employeeScores.map(({ emp, score, bonus: empBonus, rank }) => (
                          <TableRow key={emp.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setDetailEmployee(emp)}>
                            <TableCell className="text-center font-mono font-semibold text-muted-foreground">
                              {rank === 1 ? <span className="text-amber-500">①</span> : rank}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-foreground">{emp.full_name}</div>
                              <div className="text-xs text-muted-foreground">{emp.role ?? ""}</div>
                            </TableCell>
                            <TableCell className="text-center">
                              <ScorePill score={score} />
                            </TableCell>
                            <TableCell><WarningBadge score={score} /></TableCell>
                            <TableCell className="text-right font-medium">{empBonus > 0 ? fmt(empBonus) : "—"}</TableCell>
                            <TableCell className="text-center">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                onClick={e => { e.stopPropagation(); openAddScore(emp.id); }}>
                                <Plus className="h-3 w-3 mr-1" />{t.common.add}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Logs ──────────────────────────────────────────────────── */}
            <TabsContent value="logs" className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.performance.all ?? "All employees"}</SelectItem>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterEmployeeId !== "all" && (
                  <Button size="sm" variant="ghost" onClick={() => setFilterEmployeeId("all")}>
                    {t.performance.clearFilter}
                  </Button>
                )}
                <span className="ml-auto text-sm text-muted-foreground">{filteredLogs.length} logs</span>
              </div>
              <Card>
                <CardContent className="p-0">
                  {filteredLogs.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t.performance.noLogs}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.performance.createdAt}</TableHead>
                          <TableHead>{t.performance.employee}</TableHead>
                          <TableHead>{t.performance.category}</TableHead>
                          <TableHead className="text-center">{t.performance.scoreChange}</TableHead>
                          <TableHead>{t.performance.reason}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.map(log => {
                          const emp = employees.find(e => e.id === log.employee_id);
                          return (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {format(new Date(log.created_at), "dd/MM HH:mm")}
                              </TableCell>
                              <TableCell className="font-medium">{emp?.full_name ?? "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{catLabel(log.category)}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={`font-mono font-semibold ${log.score_change > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {log.score_change > 0 ? `+${log.score_change}` : log.score_change}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{log.reason}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Settings ──────────────────────────────────────────────── */}
            <TabsContent value="settings" className="space-y-6">
              {/* Bonus tiers */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t.performance.bonusRules}</CardTitle>
                  <CardDescription>{t.performance.bonusTier1} / {t.performance.bonusTier2} / {t.performance.bonusTier3}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {editTiers.map((tier, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <Label className="w-28 shrink-0 text-xs">
                          {i === 0 ? t.performance.bonusTier1 : i === 1 ? t.performance.bonusTier2 : t.performance.bonusTier3}
                        </Label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{t.performance.minScore} ≥</span>
                          <Input
                            type="number"
                            value={tier.minScore}
                            onChange={e => {
                              const next = [...editTiers];
                              next[i] = { ...next[i], minScore: Number(e.target.value) };
                              setEditTiers(next);
                            }}
                            className="w-16 h-8 text-sm text-center"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{t.performance.amount}:</span>
                          <Input
                            type="number"
                            value={tier.amount}
                            onChange={e => {
                              const next = [...editTiers];
                              next[i] = { ...next[i], amount: Number(e.target.value) };
                              setEditTiers(next);
                            }}
                            className="w-28 h-8 text-sm"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{fmt(tier.amount)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={saveTiers} disabled={tiersSaved}>
                      {tiersSaved ? <><Check className="h-3.5 w-3.5 mr-1" />{t.performance.settingsSaved}</> : t.common.save}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { resetTiers(); setEditTiers([...DEFAULT_BONUS_TIERS]); }}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />{t.performance.resetDefaults}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Warning thresholds (read-only reference) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t.performance.warningThresholds}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { range: "90 – 100", labelKey: "excellent" as const },
                      { range: "80 – 89", labelKey: "good" as const },
                      { range: "70 – 79", labelKey: "normal" as const },
                      { range: "60 – 69", labelKey: "lightWarning" as const },
                      { range: "50 – 59", labelKey: "strongWarning" as const },
                      { range: "40 – 49", labelKey: "deduction" as const },
                      { range: "< 40", labelKey: "reviewRequired" as const },
                    ].map(row => {
                      const info = getWarningInfo(
                        row.labelKey === "excellent" ? 95 :
                        row.labelKey === "good" ? 85 :
                        row.labelKey === "normal" ? 75 :
                        row.labelKey === "lightWarning" ? 65 :
                        row.labelKey === "strongWarning" ? 55 :
                        row.labelKey === "deduction" ? 45 : 30
                      );
                      return (
                        <div key={row.labelKey} className="flex items-center gap-3">
                          <span className="w-16 shrink-0 text-center font-mono text-xs text-muted-foreground">{row.range}</span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${info.bg} ${info.color}`}>
                            {t.performance[row.labelKey]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Score rules reference */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t.performance.scoreRules}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                    {[
                      { label: "Hoàn thành checklist xuất sắc", change: +2 },
                      { label: "Tải ảnh trước/sau đúng cách", change: +3 },
                      { label: "Hỗ trợ công việc khẩn cấp", change: +5 },
                      { label: "Không có khiếu nại 7 ngày", change: +5 },
                      { label: "Khách khen ngợi", change: +5 },
                      { label: "Chất lượng phòng VIP xuất sắc", change: +10 },
                      { label: "Quên tải ảnh", change: -2 },
                      { label: "Đi muộn nhẹ", change: -2 },
                      { label: "Checklist chưa hoàn thành", change: -5 },
                      { label: "Quên xác nhận hoàn thành", change: -5 },
                      { label: "Vấn đề chất lượng phòng", change: -10 },
                      { label: "Khách khiếu nại", change: -15 },
                      { label: "Vắng mặt không thông báo", change: -20 },
                      { label: "Vi phạm nghiêm trọng", change: -30 },
                    ].map((rule, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                        <span className={`w-8 shrink-0 text-right font-mono font-semibold ${rule.change > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {rule.change > 0 ? `+${rule.change}` : rule.change}
                        </span>
                        <span className="text-foreground">{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {isManager && (
        <AddScoreModal
          open={addScoreOpen}
          onOpenChange={setAddScoreOpen}
          employees={employees}
          month={selectedMonth}
          year={selectedYear}
          preEmployeeId={preEmployeeId}
        />
      )}

      <EmployeeDetailDialog
        employee={detailEmployee}
        logs={logs}
        month={selectedMonth}
        year={selectedYear}
        canManage={isManager}
        tiers={tiers}
        onClose={() => setDetailEmployee(null)}
        onAddScore={(empId) => { setDetailEmployee(null); openAddScore(empId); }}
      />
    </AppLayout>
  );
}
