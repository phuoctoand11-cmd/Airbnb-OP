import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { hasPermission, canViewAllTasks, useAuth } from "@/lib/auth-context";
import {
  supabase,
  type Booking,
  type ChecklistItem,
  type Employee,
  type Listing,
  type Task,
  type TaskType,
} from "@/lib/supabase";
import { useI18n } from "@/i18n";

// ── Constants ───────────────────────────────────────────────────────────────

const STATUSES: Task["status"][] = ["todo", "in_progress", "done"];

const TASK_TYPES: TaskType[] = [
  "cleaning",
  "maintenance",
  "inspection",
  "guest_support",
  "checkin_prepare",
  "checkout_check",
];

const PRIORITY_VARIANT: Record<
  Task["priority"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

const TASK_TYPE_COLORS: Record<TaskType, string> = {
  cleaning: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  maintenance: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  inspection: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  guest_support: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  checkin_prepare: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  checkout_check: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

// ── Zod schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  task_type: z.enum([
    "cleaning",
    "maintenance",
    "inspection",
    "guest_support",
    "checkin_prepare",
    "checkout_check",
  ]).optional(),
  title: z.string().min(2),
  notes: z.string().optional(),
  listing_id: z.string().optional(),
  booking_id: z.string().optional(),
  assignee_id: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
  due_date: z.string().optional(),
  checklist: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })).default([]),
});
type FormValues = z.infer<typeof schema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Tasks() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const canCreate = hasPermission(role, "manageTasks") && (role === "admin" || role === "manager");
  const canManageAll = role === "admin" || role === "manager";
  const viewAll = canViewAllTasks(role);

  const [typeFilter, setTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const STATUS_LABEL: Record<Task["status"], string> = {
    todo: t.tasks.todo,
    in_progress: t.tasks.in_progress,
    done: t.tasks.done,
    cancelled: t.tasks.cancelled,
  };

  const TASK_TYPE_LABEL: Record<TaskType, string> = {
    cleaning: t.tasks.cleaning,
    maintenance: t.tasks.maintenance,
    inspection: t.tasks.inspection,
    guest_support: t.tasks.guest_support,
    checkin_prepare: t.tasks.checkin_prepare,
    checkout_check: t.tasks.checkout_check,
  };

  // ── Queries ─────────────────────────────────────────────────────────────

  const tasksQuery = useQuery({
    queryKey: ["tasks", viewAll ? "all" : user?.id],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (!viewAll && user?.id) {
        q = q.eq("assignee_id", user.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  // Only employees with active or probation status can be assigned tasks
  const employeesQuery = useQuery({
    queryKey: ["employees", "assignable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_basic_view")
        .select("id, full_name, email, status, profile_id, role")
        .in("status", ["active", "probation"])
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Pick<Employee, "id" | "full_name" | "email" | "status" | "profile_id" | "role">[];
    },
    enabled: canManageAll,
  });

  const listingsQuery = useQuery({
    queryKey: ["listings", "for-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("listings").select("id, title").order("title");
      if (error) throw error;
      return (data ?? []) as Pick<Listing, "id" | "title">[];
    },
  });

  const bookingsQuery = useQuery({
    queryKey: ["bookings", "for-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, guest_name, check_in, check_out, listing_id")
        .in("status", ["pending", "confirmed"])
        .order("check_in", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Pick<Booking, "id" | "guest_name" | "check_in" | "check_out" | "listing_id">[];
    },
    enabled: canManageAll,
  });

  // ── Lookup helpers ───────────────────────────────────────────────────────

  const employeeByProfileId = useMemo(() => {
    const map: Record<string, typeof employeesQuery.data extends (infer T)[] | undefined ? T : never> = {};
    employeesQuery.data?.forEach((e) => {
      if (e.profile_id) map[e.profile_id] = e;
    });
    return map;
  }, [employeesQuery.data]);

  const assigneeName = (id: string | null) => {
    if (!id) return t.tasks.unassigned;
    const emp = employeeByProfileId[id];
    if (emp) return emp.full_name ?? emp.email;
    return t.tasks.unassigned;
  };

  const listingTitle = (id: string | null) =>
    listingsQuery.data?.find((l) => l.id === id)?.title ?? "—";

  // ── Filtering ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!tasksQuery.data) return [];
    return tasksQuery.data.filter((tk) => {
      if (typeFilter !== "all" && tk.task_type !== typeFilter) return false;
      if (assigneeFilter === "me" && tk.assignee_id !== user?.id) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "me" && tk.assignee_id !== assigneeFilter)
        return false;
      if (priorityFilter !== "all" && tk.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasksQuery.data, typeFilter, assigneeFilter, priorityFilter, user?.id]);

  const grouped = useMemo(() => {
    const map: Record<Task["status"], Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
      cancelled: [],
    };
    filtered.forEach((tk) => {
      if (map[tk.status]) map[tk.status].push(tk);
    });
    return map;
  }, [filtered]);

  // ── Form ─────────────────────────────────────────────────────────────────

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: "medium",
      status: "todo",
      checklist: [],
    },
  });

  const watchChecklist = form.watch("checklist");

  const addChecklistItem = () => {
    const current = form.getValues("checklist") ?? [];
    form.setValue("checklist", [...current, { id: genId(), text: "", done: false }]);
  };

  const removeChecklistItem = (idx: number) => {
    const current = form.getValues("checklist") ?? [];
    form.setValue("checklist", current.filter((_, i) => i !== idx));
  };

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const { error } = await supabase.from("tasks").insert({
        task_type: v.task_type ?? null,
        title: v.title,
        notes: v.notes || null,
        listing_id: v.listing_id || null,
        booking_id: v.booking_id || null,
        assignee_id: v.assignee_id || null,
        priority: v.priority,
        status: v.status,
        due_date: v.due_date || null,
        checklist: v.checklist.filter((c) => c.text.trim() !== ""),
        photos: [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.tasks.created });
      setOpen(false);
      form.reset({ priority: "medium", status: "todo", checklist: [] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.tasks.couldNotSave, description: err.message }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Task["status"] }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.tasks.couldNotSave, description: err.message }),
  });

  const updateChecklistMutation = useMutation({
    mutationFn: async ({ id, checklist }: { id: string; checklist: ChecklistItem[] }) => {
      const { error } = await supabase.from("tasks").update({ checklist }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const canEditTask = (tk: Task) => canManageAll || tk.assignee_id === user?.id;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout
      title={t.tasks.title}
      action={
        canCreate ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t.tasks.newTask}
          </Button>
        ) : null
      }
    >
      {/* ── Filter bar ── */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t.tasks.allTypes} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.tasks.allTypes}</SelectItem>
            {TASK_TYPES.map((tt) => (
              <SelectItem key={tt} value={tt}>{TASK_TYPE_LABEL[tt]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canManageAll && (
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t.tasks.allAssignees} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.tasks.allAssignees}</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              {employeesQuery.data?.map((e) => (
                <SelectItem key={e.profile_id ?? e.id} value={e.profile_id ?? e.id}>
                  {e.full_name ?? e.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t.tasks.allPriorities} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.tasks.allPriorities}</SelectItem>
            <SelectItem value="high">{t.status.high}</SelectItem>
            <SelectItem value="medium">{t.status.medium}</SelectItem>
            <SelectItem value="low">{t.status.low}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Board ── */}
      {tasksQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t.tasks.couldNotLoad}</AlertTitle>
          <AlertDescription>{(tasksQuery.error as Error).message}</AlertDescription>
        </Alert>
      ) : tasksQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <CheckSquare className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{t.tasks.noTasks}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {STATUSES.map((s) => (
            <Card key={s}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {STATUS_LABEL[s]}
                  </h3>
                  <Badge variant="outline">{grouped[s].length}</Badge>
                </div>
                <div className="space-y-2">
                  {grouped[s].length === 0 ? (
                    <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                      —
                    </p>
                  ) : (
                    grouped[s].map((tk) => (
                      <TaskCard
                        key={tk.id}
                        task={tk}
                        taskTypeLabel={TASK_TYPE_LABEL}
                        assigneeName={assigneeName(tk.assignee_id)}
                        listingTitle={listingTitle(tk.listing_id)}
                        priorityVariant={PRIORITY_VARIANT[tk.priority]}
                        priorityLabel={t.status[tk.priority]}
                        dueLabel={t.tasks.due}
                        canEdit={canEditTask(tk)}
                        statusLabel={STATUS_LABEL}
                        checklistLabel={t.tasks.checklist}
                        onStatusChange={(v) =>
                          updateStatusMutation.mutate({ id: tk.id, status: v })
                        }
                        onChecklistToggle={(idx) => {
                          const updated = (tk.checklist ?? []).map((c, i) =>
                            i === idx ? { ...c, done: !c.done } : c
                          );
                          updateChecklistMutation.mutate({ id: tk.id, checklist: updated });
                        }}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.tasks.newTask}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
              className="space-y-4"
            >
              {/* Task type */}
              <FormField
                control={form.control}
                name="task_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.tasks.taskTypeLabel}</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)}
                      value={field.value ?? "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t.tasks.noType} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">{t.tasks.noType}</SelectItem>
                        {TASK_TYPES.map((tt) => (
                          <SelectItem key={tt} value={tt}>{TASK_TYPE_LABEL[tt]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.tasks.taskTitle}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.tasks.notesLabel}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Listing + Booking */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="listing_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.tasks.listingLabel}</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t.tasks.noListing} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">{t.common.none}</SelectItem>
                          {listingsQuery.data?.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="booking_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.tasks.bookingLabel}</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t.tasks.noBooking} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">{t.common.none}</SelectItem>
                          {bookingsQuery.data?.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.guest_name} · {format(parseISO(b.check_in), "MMM d")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Assignee + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="assignee_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.tasks.assignee}</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t.tasks.unassigned} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">{t.tasks.unassigned}</SelectItem>
                          {employeesQuery.data?.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              {t.tasks.noActiveEmployees}
                            </div>
                          ) : (
                            employeesQuery.data?.map((e) => (
                              <SelectItem
                                key={e.profile_id ?? e.id}
                                value={e.profile_id ?? e.id}
                              >
                                {e.full_name ?? e.email}
                                {e.status === "probation" && (
                                  <span className="ml-1 text-xs text-muted-foreground">(probation)</span>
                                )}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.tasks.priority}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">{t.status.low}</SelectItem>
                          <SelectItem value="medium">{t.status.medium}</SelectItem>
                          <SelectItem value="high">{t.status.high}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Due date + Status */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.tasks.dueDate}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.tasks.statusLabel}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="todo">{t.tasks.todo}</SelectItem>
                          <SelectItem value="in_progress">{t.tasks.in_progress}</SelectItem>
                          <SelectItem value="done">{t.tasks.done}</SelectItem>
                          <SelectItem value="cancelled">{t.tasks.cancelled}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t.tasks.checklist}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={addChecklistItem}>
                    <Plus className="mr-1 h-3 w-3" />
                    {t.tasks.addItem}
                  </Button>
                </div>
                {watchChecklist?.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      className="h-8 flex-1 text-sm"
                      placeholder={t.tasks.itemPlaceholder}
                      value={item.text}
                      onChange={(e) => {
                        const updated = [...(form.getValues("checklist") ?? [])];
                        updated[idx] = { ...updated[idx], text: e.target.value };
                        form.setValue("checklist", updated);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeChecklistItem(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t.tasks.createTask}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ── Task card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  taskTypeLabel: Record<TaskType, string>;
  assigneeName: string;
  listingTitle: string;
  priorityVariant: "default" | "secondary" | "destructive" | "outline";
  priorityLabel: string;
  dueLabel: string;
  checklistLabel: string;
  canEdit: boolean;
  statusLabel: Record<Task["status"], string>;
  onStatusChange: (v: Task["status"]) => void;
  onChecklistToggle: (idx: number) => void;
}

function TaskCard({
  task,
  taskTypeLabel,
  assigneeName,
  listingTitle,
  priorityVariant,
  priorityLabel,
  dueLabel,
  checklistLabel,
  canEdit,
  statusLabel,
  onStatusChange,
  onChecklistToggle,
}: TaskCardProps) {
  const [checklistOpen, setChecklistOpen] = useState(false);

  const checklist: ChecklistItem[] = Array.isArray(task.checklist) ? task.checklist : [];
  const doneCount = checklist.filter((c) => c.done).length;
  const hasChecklist = checklist.length > 0;

  return (
    <div className="rounded-md border bg-card p-3">
      {/* Header row */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {task.task_type && (
            <span
              className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${TASK_TYPE_COLORS[task.task_type]}`}
            >
              {taskTypeLabel[task.task_type]}
            </span>
          )}
          <p className="font-medium leading-snug">{task.title}</p>
        </div>
        <Badge variant={priorityVariant} className="shrink-0 capitalize">
          {priorityLabel}
        </Badge>
      </div>

      {/* Meta */}
      <div className="mb-2 text-xs text-muted-foreground">
        {assigneeName} · {listingTitle}
        {task.due_date && (
          <span>
            {" · "}
            {dueLabel} {format(parseISO(task.due_date), "MMM d")}
          </span>
        )}
      </div>

      {/* Notes */}
      {task.notes && (
        <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{task.notes}</p>
      )}

      {/* Checklist summary */}
      {hasChecklist && (
        <button
          type="button"
          className="mb-2 flex w-full items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setChecklistOpen((o) => !o)}
        >
          <CheckSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">
            {checklistLabel} {doneCount}/{checklist.length}
          </span>
          {checklistOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {/* Checklist items (expanded) */}
      {checklistOpen && (
        <ul className="mb-2 space-y-1 pl-1">
          {checklist.map((item, idx) => (
            <li key={item.id} className="flex items-center gap-2">
              <Checkbox
                id={`cl-${task.id}-${idx}`}
                checked={item.done}
                disabled={!canEdit}
                onCheckedChange={() => onChecklistToggle(idx)}
                className="h-3.5 w-3.5"
              />
              <label
                htmlFor={`cl-${task.id}-${idx}`}
                className={`text-xs ${item.done ? "line-through text-muted-foreground" : ""}`}
              >
                {item.text}
              </label>
            </li>
          ))}
        </ul>
      )}

      {/* Status dropdown */}
      {canEdit && (
        <Select value={task.status} onValueChange={(v) => onStatusChange(v as Task["status"])}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">{statusLabel.todo}</SelectItem>
            <SelectItem value="in_progress">{statusLabel.in_progress}</SelectItem>
            <SelectItem value="done">{statusLabel.done}</SelectItem>
            <SelectItem value="cancelled">{statusLabel.cancelled}</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
