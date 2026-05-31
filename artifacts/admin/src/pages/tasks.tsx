import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Eye,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  User,
  X,
  ZoomIn,
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
import { useLogActivity } from "@/lib/activity-log";
import {
  supabase,
  type Booking,
  type ChecklistItem,
  type Employee,
  type Listing,
  type PhotoEntry,
  type Task,
  type TaskType,
} from "@/lib/supabase";
import { useI18n } from "@/i18n";

// ── Constants ───────────────────────────────────────────────────────────────

const TASK_PREFERRED_ROLES: Record<string, string[]> = {
  cleaning: ["cleaner"],
  maintenance: ["maintenance"],
  checkin_prepare: ["sales"],
  checkout_check: ["sales"],
  inspection: ["maintenance", "manager"],
};

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

// ── Checklist templates ───────────────────────────────────────────────────────

type TemplateKey = "cleaning" | "maintenance" | "checkin_prepare" | "checkout_check";

const TEMPLATE_ITEMS: Record<TemplateKey, string[]> = {
  cleaning: [
    "Thay ga giường",
    "Dọn toilet",
    "Lau sàn",
    "Đổ rác",
    "Bổ sung khăn",
    "Bổ sung giấy vệ sinh",
    "Kiểm tra mùi phòng",
    "Chụp ảnh sau khi dọn",
  ],
  maintenance: [
    "Kiểm tra thiết bị hỏng",
    "Kiểm tra điện",
    "Kiểm tra nước",
    "Kiểm tra điều hòa",
    "Ghi chú lỗi",
    "Chụp ảnh tình trạng",
  ],
  checkin_prepare: [
    "Kiểm tra chìa khóa",
    "Bật điều hòa trước giờ khách đến",
    "Kiểm tra nước uống",
    "Kiểm tra khăn",
    "Kiểm tra mã cửa",
    "Xác nhận phòng sạch",
  ],
  checkout_check: [
    "Kiểm tra đồ thất lạc",
    "Kiểm tra hư hỏng",
    "Kiểm tra minibar/vật dụng",
    "Chụp ảnh sau checkout",
  ],
};

const TEMPLATE_KEYS: TemplateKey[] = ["cleaning", "maintenance", "checkin_prepare", "checkout_check"];

/** Task types that require at least one photo before marking as done. */
const PHOTO_REQUIRED_TASK_TYPES: readonly TaskType[] = ["cleaning", "maintenance", "checkout_check"];

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
  assigned_employee_id: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
  due_date: z.string().optional(),
  checklist: z.array(z.object({ id: z.string(), title: z.string(), checked: z.boolean() })).default([]),
});
type FormValues = z.infer<typeof schema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

const PHOTO_KEYWORDS = ["chụp ảnh", "upload ảnh", "photo"];
function isPhotoItem(title: string): boolean {
  const lower = title.toLowerCase();
  return PHOTO_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Tasks() {
  const { role, user, employee } = useAuth();
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
  const [selectedTemplate, setSelectedTemplate] = useState<string>("__none__");
  const [detailTask, setDetailTask] = useState<Task | null>(null);

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
    queryKey: ["tasks", viewAll ? "all" : employee?.id],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (!viewAll && employee?.id) {
        q = q.eq("assigned_employee_id", employee.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  // Query employees table directly (admin/manager have RLS access).
  // IMPORTANT: Use employees table, NOT employee_basic_view, so e.id is the
  // actual employees.id primary key — not a profile_id alias.
  const employeesQuery = useQuery({
    queryKey: ["employees", "assignable-direct"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, email, status, role")
        .in("status", ["active", "probation"])
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Pick<Employee, "id" | "full_name" | "email" | "status" | "role">[];
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

  const employeeById = useMemo(() => {
    const map: Record<string, typeof employeesQuery.data extends (infer T)[] | undefined ? T : never> = {};
    employeesQuery.data?.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [employeesQuery.data]);

  const assigneeName = (id: string | null) => {
    if (!id) return t.tasks.unassigned;
    const emp = employeeById[id];
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
      if (assigneeFilter === "me" && tk.assigned_employee_id !== employee?.id) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "me" && tk.assigned_employee_id !== assigneeFilter)
        return false;
      if (priorityFilter !== "all" && tk.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasksQuery.data, typeFilter, assigneeFilter, priorityFilter, employee?.id]);

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
    form.setValue("checklist", [...current, { id: genId(), title: "", checked: false }]);
  };

  const removeChecklistItem = (idx: number) => {
    const current = form.getValues("checklist") ?? [];
    form.setValue("checklist", current.filter((_, i) => i !== idx));
  };

  const applyTemplate = (key: string) => {
    setSelectedTemplate(key);
    if (key === "__none__") return;
    const items = TEMPLATE_ITEMS[key as TemplateKey];
    if (!items) return;
    form.setValue(
      "checklist",
      items.map((title) => ({ id: genId(), title, checked: false }))
    );
  };

  const log = useLogActivity();

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const selectedEmployee = employeesQuery.data?.find((e) => e.id === v.assigned_employee_id) ?? null;
      // eslint-disable-next-line no-console
      console.log("[task create] selectedEmployee:", selectedEmployee);
      // eslint-disable-next-line no-console
      console.log("[task create] taskPayload.assigned_employee_id:", v.assigned_employee_id);

      const payload = {
        task_type: v.task_type ?? null,
        title: v.title,
        notes: v.notes || null,
        listing_id: v.listing_id || null,
        booking_id: v.booking_id || null,
        assigned_employee_id: v.assigned_employee_id || null,
        priority: v.priority,
        status: v.status,
        due_date: v.due_date || null,
        checklist: v.checklist.filter((c) => c.title.trim() !== ""),
        photos: [],
      };
      // eslint-disable-next-line no-console
      console.log("[task create] full payload:", payload);

      const { data, error } = await supabase.from("tasks").insert(payload).select("id").single();
      if (error) throw error;
      return { id: data?.id as string | undefined, v };
    },
    onSuccess: ({ id, v }) => {
      log({
        action: "task_created",
        entityType: "tasks",
        entityId: id ?? null,
        metadata: {
          module: "tasks",
          label: v.title,
          new_data: {
            title: v.title,
            task_type: v.task_type ?? null,
            status: v.status,
            priority: v.priority,
            due_date: v.due_date || null,
          },
        },
      });
      toast({ title: t.tasks.created });
      setOpen(false);
      setSelectedTemplate("__none__");
      form.reset({ priority: "medium", status: "todo", checklist: [] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.tasks.couldNotSave, description: err.message }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, title }: { id: string; status: Task["status"]; title?: string }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, status, title }) => {
      log({
        action: "task_status_updated",
        entityType: "tasks",
        entityId: id,
        metadata: {
          module: "tasks",
          label: title ?? id,
          new_data: { status },
        },
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.tasks.couldNotSave, description: err.message }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ taskId, employeeId }: { taskId: string; employeeId: string | null }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ assigned_employee_id: employeeId })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const updateChecklistMutation = useMutation({
    mutationFn: async ({ id, checklist, title }: { id: string; checklist: ChecklistItem[]; title?: string }) => {
      const { error } = await supabase.from("tasks").update({ checklist }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, checklist, title }) => {
      log({
        action: "task_checklist_updated",
        entityType: "tasks",
        entityId: id,
        metadata: {
          module: "tasks",
          label: title ?? id,
          new_data: {
            total: checklist.length,
            checked: checklist.filter((c) => c.checked).length,
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const updatePhotosMutation = useMutation({
    mutationFn: async ({ id, photos, title }: { id: string; photos: PhotoEntry[]; title?: string }) => {
      const { error } = await supabase.from("tasks").update({ photos }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, photos, title }) => {
      log({
        action: "task_photo_uploaded",
        entityType: "tasks",
        entityId: id,
        metadata: {
          module: "tasks",
          label: title ?? id,
          new_data: { photo_count: photos.length },
        },
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Không thể lưu ảnh", description: err.message }),
  });

  const requiresPhotoEvidence = (tk: Task) =>
    !!tk.task_type && (PHOTO_REQUIRED_TASK_TYPES as readonly string[]).includes(tk.task_type);

  const checkPhotoBeforeDone = (tk: Task): boolean => {
    if (!requiresPhotoEvidence(tk)) return true;
    if ((tk.photos ?? []).length > 0) return true;
    toast({
      variant: "destructive",
      description: "Vui lòng tải lên ít nhất 1 ảnh báo cáo trước khi hoàn thành công việc.",
    });
    return false;
  };

  const canEditTask = (tk: Task) => canManageAll || tk.assigned_employee_id === employee?.id;

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
                <SelectItem key={e.id} value={e.id}>
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
                        assigneeName={assigneeName(tk.assigned_employee_id)}
                        listingTitle={listingTitle(tk.listing_id)}
                        priorityVariant={PRIORITY_VARIANT[tk.priority]}
                        priorityLabel={t.status[tk.priority]}
                        dueLabel={t.tasks.due}
                        canEdit={canEditTask(tk)}
                        canUploadPhoto={canEditTask(tk)}
                        currentUserId={user?.id}
                        statusLabel={STATUS_LABEL}
                        checklistLabel={t.tasks.checklist}
                        onStatusChange={(v) => {
                          if (v === "done" && !checkPhotoBeforeDone(tk)) return;
                          updateStatusMutation.mutate({ id: tk.id, status: v, title: tk.title });
                        }}
                        onChecklistToggle={(idx) => {
                          const updated = (tk.checklist ?? []).map((c, i) =>
                            i === idx ? { ...c, checked: !c.checked } : c
                          );
                          updateChecklistMutation.mutate({ id: tk.id, checklist: updated, title: tk.title });
                          const allDone = updated.length > 0 && updated.every((c) => c.checked);
                          if (allDone && tk.status !== "done" && checkPhotoBeforeDone(tk)) {
                            updateStatusMutation.mutate({ id: tk.id, status: "done", title: tk.title });
                          }
                        }}
                        onPhotosUpdate={(photos) =>
                          updatePhotosMutation.mutate({ id: tk.id, photos, title: tk.title })
                        }
                        onViewDetail={canManageAll ? () => setDetailTask(tk) : undefined}
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
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSelectedTemplate("__none__"); form.reset({ priority: "medium", status: "todo", checklist: [] }); } }}>
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
                  name="assigned_employee_id"
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
                              <SelectItem key={e.id} value={e.id}>
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
                {/* Template picker */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm font-medium">{t.tasks.checklistTemplate}</span>
                  <Select value={selectedTemplate} onValueChange={applyTemplate}>
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder={t.tasks.noTemplate} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t.tasks.noTemplate}</SelectItem>
                      {TEMPLATE_KEYS.map((tk) => (
                        <SelectItem key={tk} value={tk}>
                          {TASK_TYPE_LABEL[tk]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Items header */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t.tasks.checklist}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={addChecklistItem}>
                    <Plus className="mr-1 h-3 w-3" />
                    {t.tasks.addItem}
                  </Button>
                </div>

                {watchChecklist?.length === 0 && (
                  <p className="rounded border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
                    {t.tasks.noTemplate} — select a template or add items manually.
                  </p>
                )}

                {watchChecklist?.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      className="h-8 flex-1 text-sm"
                      placeholder={t.tasks.itemPlaceholder}
                      value={item.title}
                      onChange={(e) => {
                        const updated = [...(form.getValues("checklist") ?? [])];
                        updated[idx] = { ...updated[idx], title: e.target.value };
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

      {/* ── Task detail dialog (admin / manager) ── */}
      {detailTask && (
        <TaskDetailDialog
          task={detailTask}
          assigneeName={assigneeName(detailTask.assigned_employee_id)}
          taskTypeLabel={TASK_TYPE_LABEL}
          statusLabel={STATUS_LABEL}
          priorityLabel={t.status[detailTask.priority]}
          priorityVariant={PRIORITY_VARIANT[detailTask.priority]}
          onClose={() => setDetailTask(null)}
          canAssign={canManageAll}
          assignableEmployees={employeesQuery.data ?? []}
          onAssign={(employeeId) => assignMutation.mutate({ taskId: detailTask.id, employeeId })}
          isAssigning={assignMutation.isPending}
        />
      )}
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
  canUploadPhoto: boolean;
  currentUserId: string | undefined;
  statusLabel: Record<Task["status"], string>;
  onStatusChange: (v: Task["status"]) => void;
  onChecklistToggle: (idx: number) => void;
  onPhotosUpdate: (photos: PhotoEntry[]) => void;
  onViewDetail?: () => void;
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
  canUploadPhoto,
  currentUserId,
  statusLabel,
  onStatusChange,
  onChecklistToggle,
  onPhotosUpdate,
  onViewDetail,
}: TaskCardProps) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const checklist: ChecklistItem[] = Array.isArray(task.checklist) ? task.checklist : [];
  const photos: PhotoEntry[] = Array.isArray(task.photos) ? task.photos : [];
  const doneCount = checklist.filter((c) => c.checked).length;
  const hasChecklist = checklist.length > 0;

  const handleDeletePhoto = (delIdx: number) => {
    onPhotosUpdate(photos.filter((_, i) => i !== delIdx));
  };

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
        <div className="flex shrink-0 items-center gap-1">
          {onViewDetail && (
            <button
              type="button"
              title="Xem chi tiết"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={onViewDetail}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          <Badge variant={priorityVariant} className="capitalize">
            {priorityLabel}
          </Badge>
        </div>
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
        <ul className="mb-2 space-y-1.5">
          {checklist.map((item, idx) => {
            const showUploadButton = canUploadPhoto && isPhotoItem(item.title);
            return (
              <li key={item.id ?? idx}>
                {/* Checklist row */}
                <div
                  className={`flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${
                    item.checked
                      ? "bg-green-50 dark:bg-green-950/30"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => onChecklistToggle(idx)}
                    className="shrink-0 disabled:cursor-not-allowed"
                  >
                    {item.checked ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <span
                    className={`flex-1 text-xs leading-snug ${
                      item.checked
                        ? "font-medium text-green-700 dark:text-green-300"
                        : "text-foreground"
                    }`}
                  >
                    {item.title}
                  </span>
                  {/* Inline upload button next to photo checklist items */}
                  {showUploadButton && (
                    <PhotoUploadButton
                      taskId={task.id}
                      checklistItemTitle={item.title}
                      existingPhotos={photos}
                      currentUserId={currentUserId}
                      onPhotosUpdate={onPhotosUpdate}
                      compact
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Photos section ── */}
      {(photos.length > 0 || canUploadPhoto) && (
        <div className="mb-2">
          {/* Header row for photos */}
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              Ảnh ({photos.length})
            </span>
            {canUploadPhoto && (
              <PhotoUploadButton
                taskId={task.id}
                existingPhotos={photos}
                currentUserId={currentUserId}
                onPhotosUpdate={onPhotosUpdate}
              />
            )}
          </div>

          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {photos.map((p, i) => (
                <div key={i} className="group relative h-16 w-16 shrink-0">
                  <img
                    src={p.url}
                    alt={`photo ${i + 1}`}
                    className="h-16 w-16 rounded border object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-1 rounded bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      title="Xem ảnh"
                      className="rounded p-0.5 text-white hover:text-blue-300"
                      onClick={() => setLightboxIdx(i)}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    {canUploadPhoto && (
                      <button
                        type="button"
                        title="Xóa ảnh"
                        className="rounded p-0.5 text-white hover:text-red-400"
                        onClick={() => handleDeletePhoto(i)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

      {lightboxIdx !== null && (
        <PhotoLightbox
          photos={photos}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}

// ── Photo upload button ───────────────────────────────────────────────────────

interface PhotoUploadButtonProps {
  taskId: string;
  checklistItemTitle?: string;
  existingPhotos: PhotoEntry[];
  currentUserId: string | undefined;
  onPhotosUpdate: (photos: PhotoEntry[]) => void;
  /** When true renders a compact icon-only button for inline use */
  compact?: boolean;
}

function PhotoUploadButton({
  taskId,
  checklistItemTitle = "",
  existingPhotos,
  currentUserId,
  onPhotosUpdate,
  compact = false,
}: PhotoUploadButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isUploading = progress !== null;

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setProgress({ done: 0, total: files.length });
    setUploadError(null);

    const newEntries: PhotoEntry[] = [];
    try {
      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${taskId}/${genId()}.${ext}`;

        // eslint-disable-next-line no-console
        console.log(`[photo upload] (${fi + 1}/${files.length}) path:`, path);

        const { error: uploadErr } = await supabase.storage
          .from("task-images")
          .upload(path, file, { upsert: false });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from("task-images")
          .getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        // eslint-disable-next-line no-console
        console.log(`[photo upload] (${fi + 1}/${files.length}) public URL:`, publicUrl);

        newEntries.push({
          url: publicUrl,
          checklist_item: checklistItemTitle,
          uploaded_at: new Date().toISOString(),
          uploaded_by: currentUserId ?? "",
        });

        setProgress({ done: fi + 1, total: files.length });
      }

      const updatedPhotos = [...existingPhotos, ...newEntries];
      // eslint-disable-next-line no-console
      console.log("[photo upload] updated photos array:", updatedPhotos);
      onPhotosUpdate(updatedPhotos);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={compact ? "inline-flex" : undefined}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={compact ? "h-6 w-6 shrink-0 p-0" : "h-7 gap-1.5 text-xs"}
        disabled={isUploading}
        title="Tải ảnh lên"
        onClick={() => fileRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Upload className="h-3 w-3" />
        )}
        {!compact && (
          isUploading
            ? `Đang tải ${progress!.done}/${progress!.total}...`
            : "Tải ảnh"
        )}
      </Button>
      {uploadError && !compact && (
        <p className="mt-1 text-xs text-destructive">{uploadError}</p>
      )}
    </div>
  );
}

// ── Photo lightbox ────────────────────────────────────────────────────────────

interface PhotoLightboxProps {
  photos: PhotoEntry[];
  startIndex: number;
  onClose: () => void;
}

function PhotoLightbox({ photos, startIndex, onClose }: PhotoLightboxProps) {
  const [idx, setIdx] = useState(startIndex);

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(photos.length - 1, i + 1));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const photo = photos[idx];
  if (!photo) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl border-none bg-black/95 p-0 [&>button]:text-white/70 [&>button]:hover:text-white">
        <div className="flex select-none flex-col items-center justify-center px-12 py-6">
          {/* Image with side navigation */}
          <div className="relative flex w-full items-center justify-center">
            <button
              type="button"
              className="absolute left-0 z-10 rounded-full p-1 text-white/70 transition hover:text-white disabled:opacity-20"
              disabled={idx === 0}
              onClick={prev}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>

            <img
              key={photo.url}
              src={photo.url}
              alt={`photo ${idx + 1}`}
              className="max-h-[68vh] max-w-full rounded object-contain"
            />

            <button
              type="button"
              className="absolute right-0 z-10 rounded-full p-1 text-white/70 transition hover:text-white disabled:opacity-20"
              disabled={idx === photos.length - 1}
              onClick={next}
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </div>

          {/* Counter + caption */}
          <div className="mt-3 flex flex-col items-center gap-0.5">
            <span className="text-sm font-semibold text-white">
              {idx + 1} / {photos.length}
            </span>
            {(photo.checklist_item || photo.uploaded_at) && (
              <span className="text-xs text-white/55">
                {photo.checklist_item ? `${photo.checklist_item} · ` : ""}
                {photo.uploaded_at
                  ? format(parseISO(photo.uploaded_at), "MMM d, yyyy HH:mm")
                  : ""}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Task detail dialog (admin / manager only) ────────────────────────────────

interface TaskDetailDialogProps {
  task: Task;
  assigneeName: string;
  taskTypeLabel: Record<TaskType, string>;
  statusLabel: Record<Task["status"], string>;
  priorityLabel: string;
  priorityVariant: "default" | "secondary" | "destructive" | "outline";
  onClose: () => void;
  canAssign: boolean;
  assignableEmployees: Pick<Employee, "id" | "full_name" | "email" | "status" | "role">[];
  onAssign: (employeeId: string | null) => void;
  isAssigning: boolean;
}

function TaskDetailDialog({
  task,
  assigneeName,
  taskTypeLabel,
  statusLabel,
  priorityLabel,
  priorityVariant,
  onClose,
  canAssign,
  assignableEmployees,
  onAssign,
  isAssigning,
}: TaskDetailDialogProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const checklist: ChecklistItem[] = Array.isArray(task.checklist) ? task.checklist : [];
  const photos: PhotoEntry[] = Array.isArray(task.photos) ? task.photos : [];
  const doneCount = checklist.filter((c) => c.checked).length;
  const pct = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : null;

  const completedAt =
    task.status === "done" && task.updated_at
      ? format(parseISO(task.updated_at), "MMM d, yyyy HH:mm")
      : null;

  const preferredRoles = task.task_type ? (TASK_PREFERRED_ROLES[task.task_type] ?? []) : [];
  const sortedEmployees = [...assignableEmployees].sort((a, b) => {
    const aMatch = a.role && preferredRoles.includes(a.role) ? 0 : 1;
    const bMatch = b.role && preferredRoles.includes(b.role) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email);
  });
  const hasPreferred = preferredRoles.length > 0 && sortedEmployees.some((e) => e.role && preferredRoles.includes(e.role));

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
              {task.task_type && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TASK_TYPE_COLORS[task.task_type]}`}
                >
                  {taskTypeLabel[task.task_type]}
                </span>
              )}
              <span className="flex-1">{task.title}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Status + Priority row */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="capitalize">
                {statusLabel[task.status]}
              </Badge>
              <Badge variant={priorityVariant} className="capitalize">
                {priorityLabel}
              </Badge>
            </div>

            {/* Assigned employee */}
            {canAssign ? (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Nhân viên:</span>
                <Select
                  value={task.assigned_employee_id ?? "__none__"}
                  onValueChange={(v) => onAssign(v === "__none__" ? null : v)}
                  disabled={isAssigning}
                >
                  <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Chưa phân công" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Chưa phân công</SelectItem>
                    {sortedEmployees.map((e, idx) => {
                      const isMatch = e.role && preferredRoles.includes(e.role);
                      const prevMatch = idx > 0 && sortedEmployees[idx - 1].role && preferredRoles.includes(sortedEmployees[idx - 1].role!);
                      const showSuitableLabel = hasPreferred && idx === 0 && isMatch;
                      const showOtherLabel = hasPreferred && !isMatch && (idx === 0 || prevMatch);
                      return (
                        <div key={e.id}>
                          {showSuitableLabel && <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">Phù hợp</div>}
                          {showOtherLabel && <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">Khác</div>}
                          <SelectItem value={e.id}>{e.full_name ?? e.email}</SelectItem>
                        </div>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Nhân viên:</span>
                <span className="font-medium">{assigneeName}</span>
              </div>
            )}

            {/* Due date */}
            {task.due_date && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Hạn:</span>
                <span className="font-medium">
                  {format(parseISO(task.due_date), "MMM d, yyyy")}
                </span>
              </div>
            )}

            {/* Completion time */}
            {completedAt && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                <span className="text-muted-foreground">Hoàn thành lúc:</span>
                <span className="font-medium text-green-700">{completedAt}</span>
              </div>
            )}

            {/* Notes */}
            {task.notes && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {task.notes}
              </div>
            )}

            {/* Checklist */}
            {checklist.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Checklist — {doneCount}/{checklist.length}
                  </span>
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </div>
                {/* Progress bar */}
                <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <ul className="space-y-1.5">
                  {checklist.map((item, idx) => (
                    <li
                      key={item.id ?? idx}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                        item.checked
                          ? "bg-green-50 dark:bg-green-950/30"
                          : "bg-muted/30"
                      }`}
                    >
                      {item.checked ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span
                        className={
                          item.checked
                            ? "font-medium text-green-700 dark:text-green-300"
                            : "text-foreground"
                        }
                      >
                        {item.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Photos */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                Ảnh ({photos.length})
              </div>
              {photos.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  Chưa có ảnh
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      className="group relative aspect-square overflow-hidden rounded-md border"
                      onClick={() => setLightboxIdx(i)}
                    >
                      <img
                        src={p.url}
                        alt={`photo ${i + 1}`}
                        className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                        <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {lightboxIdx !== null && (
        <PhotoLightbox
          photos={photos}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
