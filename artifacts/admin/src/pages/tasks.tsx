import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckSquare, Loader2, Plus } from "lucide-react";
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
import {
  supabase,
  type Listing,
  type Task,
  type UserProfile,
} from "@/lib/supabase";
import { useI18n } from "@/i18n";

const STATUSES: Task["status"][] = ["todo", "in_progress", "done"];
const PRIORITY_VARIANT: Record<Task["priority"], "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

const schema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  listing_id: z.string().optional(),
  assignee_id: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
  due_date: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function Tasks() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const canCreate = hasPermission(role, "manageTasks") &&
    (role === "admin" || role === "manager");
  const canManageAll = role === "admin" || role === "manager";
  const viewAll = canViewAllTasks(role);

  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const STATUS_LABEL: Record<Task["status"], string> = {
    todo: t.tasks.todo,
    in_progress: t.tasks.in_progress,
    done: t.tasks.done,
    cancelled: t.tasks.cancelled,
  };

  const tasksQuery = useQuery({
    queryKey: ["tasks", viewAll ? "all" : user?.id],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });
      // maintenance, cleaner, staff only see tasks assigned to them
      if (!viewAll && user?.id) {
        q = q.eq("assignee_id", user.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return (data ?? []) as UserProfile[];
    },
  });

  const listingsQuery = useQuery({
    queryKey: ["listings", "for-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("listings").select("id, title").order("title");
      if (error) throw error;
      return (data ?? []) as Pick<Listing, "id" | "title">[];
    },
  });

  const assigneeName = (id: string | null) =>
    profilesQuery.data?.find((p) => p.id === id)?.full_name ?? t.tasks.unassigned;
  const listingTitle = (id: string | null) =>
    listingsQuery.data?.find((l) => l.id === id)?.title ?? "—";

  const filtered = useMemo(() => {
    if (!tasksQuery.data) return [];
    return tasksQuery.data.filter((tk) => {
      if (assigneeFilter === "me" && tk.assignee_id !== user?.id) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "me" && tk.assignee_id !== assigneeFilter)
        return false;
      if (priorityFilter !== "all" && tk.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasksQuery.data, assigneeFilter, priorityFilter, user?.id]);

  const grouped = useMemo(() => {
    const map: Record<Task["status"], Task[]> = { todo: [], in_progress: [], done: [], cancelled: [] };
    filtered.forEach((tk) => {
      if (map[tk.status]) map[tk.status].push(tk);
    });
    return map;
  }, [filtered]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", priority: "medium", status: "todo" },
  });

  const createMutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const { error } = await supabase.from("tasks").insert({
        title: v.title,
        description: v.description || null,
        listing_id: v.listing_id || null,
        assignee_id: v.assignee_id || null,
        priority: v.priority,
        status: v.status,
        due_date: v.due_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.tasks.created });
      setOpen(false);
      form.reset({ title: "", priority: "medium", status: "todo" });
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

  const canEditTask = (tk: Task) => canManageAll || tk.assignee_id === user?.id;

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
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t.tasks.allAssignees} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.tasks.allAssignees}</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            {profilesQuery.data?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[180px]">
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
                      <div key={tk.id} className="rounded-md border bg-card p-3">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <span className="font-medium">{tk.title}</span>
                          <Badge variant={PRIORITY_VARIANT[tk.priority]} className="capitalize">
                            {t.status[tk.priority]}
                          </Badge>
                        </div>
                        {tk.description && (
                          <p className="mb-2 text-xs text-muted-foreground">{tk.description}</p>
                        )}
                        <div className="mb-2 text-xs text-muted-foreground">
                          {assigneeName(tk.assignee_id)} · {listingTitle(tk.listing_id)}
                          {tk.due_date && (
                            <span> · {t.tasks.due} {format(parseISO(tk.due_date), "MMM d")}</span>
                          )}
                        </div>
                        {canEditTask(tk) && (
                          <Select
                            value={tk.status}
                            onValueChange={(v) =>
                              updateStatusMutation.mutate({ id: tk.id, status: v as Task["status"] })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todo">{t.tasks.todo}</SelectItem>
                              <SelectItem value="in_progress">{t.tasks.in_progress}</SelectItem>
                              <SelectItem value="done">{t.tasks.done}</SelectItem>
                              <SelectItem value="cancelled">{t.tasks.cancelled}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tasks.newTask}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
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
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.tasks.descriptionLabel}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
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
                            <SelectItem key={l.id} value={l.id}>
                              {l.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                          {profilesQuery.data?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.full_name ?? p.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
