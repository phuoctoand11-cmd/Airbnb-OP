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
import { hasPermission, useAuth } from "@/lib/auth-context";
import {
  supabase,
  type Listing,
  type Task,
  type UserProfile,
} from "@/lib/supabase";

const STATUSES: Task["status"][] = ["todo", "in_progress", "done"];
const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};
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
  const queryClient = useQueryClient();
  const canCreate = hasPermission(role, "manageTasks");
  const canManageAll = hasPermission(role, "manageBookings");

  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });
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
    profilesQuery.data?.find((p) => p.id === id)?.full_name ?? "Unassigned";
  const listingTitle = (id: string | null) =>
    listingsQuery.data?.find((l) => l.id === id)?.title ?? "—";

  const filtered = useMemo(() => {
    if (!tasksQuery.data) return [];
    return tasksQuery.data.filter((t) => {
      if (assigneeFilter === "me" && t.assignee_id !== user?.id) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "me" && t.assignee_id !== assigneeFilter)
        return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasksQuery.data, assigneeFilter, priorityFilter, user?.id]);

  const grouped = useMemo(() => {
    const map: Record<Task["status"], Task[]> = { todo: [], in_progress: [], done: [], cancelled: [] };
    filtered.forEach((t) => {
      if (map[t.status]) map[t.status].push(t);
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
      toast({ title: "Task created" });
      setOpen(false);
      form.reset({ title: "", priority: "medium", status: "todo" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not create task", description: err.message }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Task["status"] }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not update task", description: err.message }),
  });

  const canEditTask = (t: Task) => canManageAll || t.assignee_id === user?.id;

  return (
    <AppLayout
      title="Tasks"
      action={
        canCreate ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New task
          </Button>
        ) : null
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
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
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tasksQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load tasks</AlertTitle>
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
          <p className="font-medium">No tasks</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {canCreate
              ? "Create the first task to get your team coordinated."
              : "When tasks are assigned to you they will show up here."}
          </p>
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
                      Empty
                    </p>
                  ) : (
                    grouped[s].map((t) => (
                      <div key={t.id} className="rounded-md border bg-card p-3 hover-elevate">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <span className="font-medium">{t.title}</span>
                          <Badge variant={PRIORITY_VARIANT[t.priority]} className="capitalize">
                            {t.priority}
                          </Badge>
                        </div>
                        {t.description && (
                          <p className="mb-2 text-xs text-muted-foreground">{t.description}</p>
                        )}
                        <div className="mb-2 text-xs text-muted-foreground">
                          {assigneeName(t.assignee_id)} · {listingTitle(t.listing_id)}
                          {t.due_date && (
                            <span> · due {format(parseISO(t.due_date), "MMM d")}</span>
                          )}
                        </div>
                        {canEditTask(t) && (
                          <Select
                            value={t.status}
                            onValueChange={(v) =>
                              updateStatusMutation.mutate({ id: t.id, status: v as Task["status"] })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todo">To do</SelectItem>
                              <SelectItem value="in_progress">In progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
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
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="listing_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Listing</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
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
                      <FormLabel>Assignee</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Unassigned</SelectItem>
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
              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
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
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="todo">To do</SelectItem>
                          <SelectItem value="in_progress">In progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create task
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
