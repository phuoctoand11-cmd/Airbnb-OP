import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Building2,
  Briefcase,
  Loader2,
  Plus,
  Search,
  Users,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  supabase,
  type Department,
  type Employee,
  type EmployeeStatus,
  type EmploymentType,
  type GenderType,
  type Position,
} from "@/lib/supabase";
import { useI18n } from "@/i18n";

// ── Constants ──────────────────────────────────────────────────────

const EMPLOYEE_STATUSES: EmployeeStatus[] = [
  "candidate", "interviewing", "probation", "active",
  "inactive", "resigned", "terminated", "rejected",
];

const TERMINAL_STATUSES: EmployeeStatus[] = [
  "inactive", "resigned", "terminated", "rejected",
];

const EMPLOYMENT_TYPES: EmploymentType[] = [
  "full_time", "part_time", "freelancer", "probation", "intern",
];

const GENDERS: GenderType[] = [
  "male", "female", "other", "prefer_not_to_say",
];

const STATUS_VARIANT: Record<EmployeeStatus, "default" | "secondary" | "destructive" | "outline"> = {
  candidate: "outline",
  interviewing: "secondary",
  probation: "secondary",
  active: "default",
  inactive: "outline",
  resigned: "destructive",
  terminated: "destructive",
  rejected: "destructive",
};

// ── Employee form schema ───────────────────────────────────────────

const employeeSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say", "__none__"]).optional(),
  address: z.string().optional(),
  emergency_contact: z.string().optional(),
  department_id: z.string().min(1),
  position_id: z.string().min(1),
  employment_type: z.enum(["full_time", "part_time", "freelancer", "probation", "intern"]),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  salary_base: z.string().optional(),
  status: z.enum(["candidate", "interviewing", "probation", "active", "inactive", "resigned", "terminated", "rejected"]),
  role: z.string().optional(),
  notes: z.string().optional(),
});
type EmployeeFormValues = z.infer<typeof employeeSchema>;

// ── Department / Position form schema ─────────────────────────────

const deptPosSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
type DeptPosFormValues = z.infer<typeof deptPosSchema>;

// ── Helpers ───────────────────────────────────────────────────────

function formatCurrency(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════

export default function HRRecruitment() {
  const { role } = useAuth();
  const { t } = useI18n();
  const isAdmin = role === "admin";

  return (
    <AppLayout title={t.hr.title}>
      <Tabs defaultValue="employees">
        <TabsList className="mb-6">
          <TabsTrigger value="employees">
            <Users className="mr-2 h-4 w-4" />
            {t.hr.employees}
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Building2 className="mr-2 h-4 w-4" />
            {t.hr.departments}
          </TabsTrigger>
          <TabsTrigger value="positions">
            <Briefcase className="mr-2 h-4 w-4" />
            {t.hr.positions}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <EmployeesTab isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="departments">
          <DepartmentsTab isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="positions">
          <PositionsTab isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EMPLOYEES TAB
// ═══════════════════════════════════════════════════════════════════

function EmployeesTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [posFilter, setPosFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [statusChangeTarget, setStatusChangeTarget] = useState<{ emp: Employee; status: EmployeeStatus } | null>(null);

  // Admin queries employees table; manager/accountant use employee_basic_view
  const tableName = isAdmin ? "employees" : "employee_basic_view";

  const employeesQuery = useQuery({
    queryKey: ["employees", tableName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const deptsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });

  const positionsQuery = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  const filtered = useMemo(() => {
    if (!employeesQuery.data) return [];
    const q = search.toLowerCase();
    return employeesQuery.data.filter((e) => {
      if (q && !e.full_name.toLowerCase().includes(q) &&
          !e.email.toLowerCase().includes(q) &&
          !(e.phone ?? "").toLowerCase().includes(q)) return false;
      if (deptFilter !== "all" && e.department_id !== deptFilter) return false;
      if (posFilter !== "all" && e.position_id !== posFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (typeFilter !== "all" && e.employment_type !== typeFilter) return false;
      return true;
    });
  }, [employeesQuery.data, search, deptFilter, posFilter, statusFilter, typeFilter]);

  const deptName = (id: string) => deptsQuery.data?.find((d) => d.id === id)?.name ?? "—";
  const posName = (id: string) => positionsQuery.data?.find((p) => p.id === id)?.name ?? "—";

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EmployeeStatus }) => {
      const { error } = await supabase.from("employees").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.hr.statusChanged });
      setStatusChangeTarget(null);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: t.hr.couldNotSave, description: err.message }),
  });

  const openCreate = () => { setEditingEmployee(null); setEmployeeFormOpen(true); };
  const openEdit = (e: Employee) => { setEditingEmployee(e); setEmployeeFormOpen(true); };

  const handleStatusChange = (emp: Employee, newStatus: EmployeeStatus) => {
    if (TERMINAL_STATUSES.includes(newStatus)) {
      setStatusChangeTarget({ emp, status: newStatus });
    } else {
      statusMutation.mutate({ id: emp.id, status: newStatus });
    }
  };

  const isLoading = employeesQuery.isLoading || deptsQuery.isLoading || positionsQuery.isLoading;
  const loadError = employeesQuery.error || deptsQuery.error || positionsQuery.error;

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {isAdmin && (
          <Button onClick={openCreate} className="ml-auto">
            <Plus className="mr-2 h-4 w-4" />
            {t.hr.newEmployee}
          </Button>
        )}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.hr.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t.hr.allDepartments} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.hr.allDepartments}</SelectItem>
            {deptsQuery.data?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={posFilter} onValueChange={setPosFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t.hr.allPositions} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.hr.allPositions}</SelectItem>
            {positionsQuery.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t.hr.allStatuses} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.hr.allStatuses}</SelectItem>
            {EMPLOYEE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{(t.hr as Record<string, string>)[s] ?? s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t.hr.allEmploymentTypes} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.hr.allEmploymentTypes}</SelectItem>
            {EMPLOYMENT_TYPES.map((et) => (
              <SelectItem key={et} value={et}>{(t.hr as Record<string, string>)[et] ?? et}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Read-only notice for non-admin */}
      {!isAdmin && (
        <Alert className="mb-4">
          <AlertDescription>{t.hr.viewOnly}</AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>{t.hr.couldNotLoad}</AlertTitle>
          <AlertDescription>{(loadError as Error).message}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Users className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">{t.hr.noEmployees}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{t.hr.fullName}</th>
                <th className="px-4 py-3 text-left font-medium">{t.hr.email}</th>
                <th className="px-4 py-3 text-left font-medium">{t.hr.department}</th>
                <th className="px-4 py-3 text-left font-medium">{t.hr.position}</th>
                <th className="px-4 py-3 text-left font-medium">{t.hr.employmentType}</th>
                {isAdmin && <th className="px-4 py-3 text-left font-medium">{t.hr.salaryBase}</th>}
                <th className="px-4 py-3 text-left font-medium">{t.hr.statusBadge}</th>
                {isAdmin && <th className="px-4 py-3 text-left font-medium">{t.common.actions}</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{emp.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{emp.email}</td>
                  <td className="px-4 py-3">{deptName(emp.department_id)}</td>
                  <td className="px-4 py-3">{posName(emp.position_id)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {(t.hr as Record<string, string>)[emp.employment_type] ?? emp.employment_type}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 font-mono text-sm">{formatCurrency(emp.salary_base)}</td>
                  )}
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[emp.status]} className="capitalize">
                      {(t.hr as Record<string, string>)[emp.status] ?? emp.status}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(emp)}>
                          {t.common.edit}
                        </Button>
                        <Select
                          value={emp.status}
                          onValueChange={(v) => handleStatusChange(emp, v as EmployeeStatus)}
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EMPLOYEE_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {(t.hr as Record<string, string>)[s] ?? s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee form dialog */}
      {isAdmin && (
        <EmployeeFormDialog
          open={employeeFormOpen}
          onOpenChange={(v) => { setEmployeeFormOpen(v); if (!v) setEditingEmployee(null); }}
          employee={editingEmployee}
          departments={deptsQuery.data ?? []}
          positions={positionsQuery.data ?? []}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["employees"] })}
        />
      )}

      {/* Status change confirmation */}
      <Dialog open={!!statusChangeTarget} onOpenChange={(v) => { if (!v) setStatusChangeTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <AlertTriangle className="inline mr-2 h-5 w-5 text-destructive" />
              {t.hr.confirmStatusTitle}
            </DialogTitle>
            <DialogDescription>
              {t.hr.confirmStatusDesc.replace(
                "{status}",
                statusChangeTarget
                  ? ((t.hr as Record<string, string>)[statusChangeTarget.status] ?? statusChangeTarget.status)
                  : ""
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChangeTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={statusMutation.isPending}
              onClick={() => statusChangeTarget && statusMutation.mutate({ id: statusChangeTarget.emp.id, status: statusChangeTarget.status })}
            >
              {statusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.common.yes}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Employee Form Dialog ───────────────────────────────────────────

function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  departments,
  positions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: Employee | null;
  departments: Department[];
  positions: Position[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const isEdit = !!employee;

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      date_of_birth: "",
      gender: "__none__",
      address: "",
      emergency_contact: "",
      department_id: "",
      position_id: "",
      employment_type: "full_time",
      start_date: "",
      end_date: "",
      salary_base: "",
      status: "candidate",
      role: "",
      notes: "",
    },
  });

  // Reset form when dialog opens/closes or employee changes
  const resetForm = (emp: Employee | null) => {
    form.reset({
      full_name: emp?.full_name ?? "",
      email: emp?.email ?? "",
      phone: emp?.phone ?? "",
      date_of_birth: emp?.date_of_birth ?? "",
      gender: (emp?.gender ?? "__none__") as EmployeeFormValues["gender"],
      address: emp?.address ?? "",
      emergency_contact: emp?.emergency_contact ?? "",
      department_id: emp?.department_id ?? "",
      position_id: emp?.position_id ?? "",
      employment_type: emp?.employment_type ?? "full_time",
      start_date: emp?.start_date ?? "",
      end_date: emp?.end_date ?? "",
      salary_base: emp?.salary_base != null ? String(emp.salary_base) : "",
      status: emp?.status ?? "candidate",
      role: emp?.role ?? "",
      notes: emp?.notes ?? "",
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (v: EmployeeFormValues) => {
      const payload = {
        full_name: v.full_name,
        email: v.email,
        phone: v.phone || null,
        date_of_birth: v.date_of_birth || null,
        gender: (v.gender === "__none__" ? null : v.gender) as GenderType | null,
        address: v.address || null,
        emergency_contact: v.emergency_contact || null,
        department_id: v.department_id,
        position_id: v.position_id,
        employment_type: v.employment_type,
        start_date: v.start_date || null,
        end_date: v.end_date || null,
        salary_base: v.salary_base ? parseFloat(v.salary_base) : null,
        status: v.status,
        role: v.role || null,
        notes: v.notes || null,
      };

      if (isEdit && employee) {
        const { error } = await supabase.from("employees").update(payload).eq("id", employee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? t.hr.employeeUpdated : t.hr.employeeCreated });
      onOpenChange(false);
      onSaved();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: t.hr.couldNotSave, description: err.message }),
  });

  const activeDepts = departments.filter((d) => d.is_active);
  const activePositions = positions.filter((p) => p.is_active);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) resetForm(employee); else resetForm(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t.hr.editEmployee : t.hr.newEmployee}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.fullName} *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.email} *</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.phone}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="date_of_birth" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.dateOfBirth}</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.gender}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? "__none__"}>
                    <FormControl><SelectTrigger><SelectValue placeholder={t.hr.selectGender} /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">{t.common.none}</SelectItem>
                      {GENDERS.map((g) => (
                        <SelectItem key={g} value={g}>{(t.hr as Record<string, string>)[g] ?? g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.statusBadge} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {EMPLOYEE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{(t.hr as Record<string, string>)[s] ?? s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hr.address}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="emergency_contact" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hr.emergencyContact}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Org */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="department_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.department} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder={t.hr.selectDepartment} /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeDepts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="position_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.position} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder={t.hr.selectPosition} /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activePositions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="employment_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.employmentType} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((et) => (
                        <SelectItem key={et} value={et}>{(t.hr as Record<string, string>)[et] ?? et}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.common.role}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="start_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.startDate}</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="end_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hr.endDate}</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Salary — admin only */}
            <FormField control={form.control} name="salary_base" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hr.salaryBase}</FormLabel>
                <FormControl><Input type="number" min={0} step="0.01" placeholder="0.00" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hr.notes}</FormLabel>
                <FormControl><Textarea rows={3} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? t.hr.saveEmployee : t.hr.createEmployee}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DEPARTMENTS TAB
// ═══════════════════════════════════════════════════════════════════

function DepartmentsTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Department | null>(null);

  const query = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("departments").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast({ title: vars.is_active ? t.hr.activated : t.hr.deactivated });
      setConfirmDeactivate(null);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: t.hr.couldNotSave, description: err.message }),
  });

  return (
    <>
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t.hr.newDepartment}
          </Button>
        </div>
      )}

      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t.hr.couldNotLoad}</AlertTitle>
          <AlertDescription>{(query.error as Error).message}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (query.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Building2 className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">{t.hr.noDepartments}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(query.data ?? []).map((dept) => (
            <Card key={dept.id} className={!dept.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{dept.name}</CardTitle>
                  <Badge variant={dept.is_active ? "default" : "outline"}>
                    {dept.is_active ? t.hr.active : t.hr.inactive}
                  </Badge>
                </div>
              </CardHeader>
              {dept.description && (
                <CardContent className="pb-3 pt-0">
                  <p className="text-sm text-muted-foreground">{dept.description}</p>
                </CardContent>
              )}
              {isAdmin && (
                <CardContent className="flex gap-2 pb-3 pt-0">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(dept); setFormOpen(true); }}>
                    {t.common.edit}
                  </Button>
                  {dept.is_active ? (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDeactivate(dept)}>
                      {t.hr.deactivate}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate({ id: dept.id, is_active: true })}>
                      {t.hr.activate}
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Form dialog */}
      {isAdmin && (
        <DeptPosFormDialog
          open={formOpen}
          onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
          editing={editing}
          entityType="department"
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["departments"] })}
        />
      )}

      {/* Deactivate confirm */}
      <Dialog open={!!confirmDeactivate} onOpenChange={(v) => { if (!v) setConfirmDeactivate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.hr.confirmDeactivateTitle}</DialogTitle>
            <DialogDescription>{t.hr.confirmDeactivateDept}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(null)}>{t.common.cancel}</Button>
            <Button
              variant="destructive"
              disabled={toggleMutation.isPending}
              onClick={() => confirmDeactivate && toggleMutation.mutate({ id: confirmDeactivate.id, is_active: false })}
            >
              {toggleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.hr.deactivate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// POSITIONS TAB
// ═══════════════════════════════════════════════════════════════════

function PositionsTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Position | null>(null);

  const query = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("positions").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast({ title: vars.is_active ? t.hr.activated : t.hr.deactivated });
      setConfirmDeactivate(null);
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: t.hr.couldNotSave, description: err.message }),
  });

  return (
    <>
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t.hr.newPosition}
          </Button>
        </div>
      )}

      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t.hr.couldNotLoad}</AlertTitle>
          <AlertDescription>{(query.error as Error).message}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (query.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Briefcase className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">{t.hr.noPositions}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(query.data ?? []).map((pos) => (
            <Card key={pos.id} className={!pos.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{pos.name}</CardTitle>
                  <Badge variant={pos.is_active ? "default" : "outline"}>
                    {pos.is_active ? t.hr.active : t.hr.inactive}
                  </Badge>
                </div>
              </CardHeader>
              {pos.description && (
                <CardContent className="pb-3 pt-0">
                  <p className="text-sm text-muted-foreground">{pos.description}</p>
                </CardContent>
              )}
              {isAdmin && (
                <CardContent className="flex gap-2 pb-3 pt-0">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(pos); setFormOpen(true); }}>
                    {t.common.edit}
                  </Button>
                  {pos.is_active ? (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDeactivate(pos)}>
                      {t.hr.deactivate}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate({ id: pos.id, is_active: true })}>
                      {t.hr.activate}
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Form dialog */}
      {isAdmin && (
        <DeptPosFormDialog
          open={formOpen}
          onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
          editing={editing}
          entityType="position"
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["positions"] })}
        />
      )}

      {/* Deactivate confirm */}
      <Dialog open={!!confirmDeactivate} onOpenChange={(v) => { if (!v) setConfirmDeactivate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.hr.confirmDeactivateTitle}</DialogTitle>
            <DialogDescription>{t.hr.confirmDeactivatePos}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(null)}>{t.common.cancel}</Button>
            <Button
              variant="destructive"
              disabled={toggleMutation.isPending}
              onClick={() => confirmDeactivate && toggleMutation.mutate({ id: confirmDeactivate.id, is_active: false })}
            >
              {toggleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.hr.deactivate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHARED DEPT / POSITION FORM DIALOG
// ═══════════════════════════════════════════════════════════════════

function DeptPosFormDialog({
  open,
  onOpenChange,
  editing,
  entityType,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Department | Position | null;
  entityType: "department" | "position";
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const isEdit = !!editing;

  const table = entityType === "department" ? "departments" : "positions";
  const createLabel = entityType === "department" ? t.hr.createDepartment : t.hr.createPosition;
  const saveLabel = entityType === "department" ? t.hr.saveDepartment : t.hr.savePosition;
  const titleLabel = entityType === "department"
    ? (isEdit ? t.hr.editDepartment : t.hr.newDepartment)
    : (isEdit ? t.hr.editPosition : t.hr.newPosition);
  const createdMsg = entityType === "department" ? t.hr.departmentCreated : t.hr.positionCreated;
  const updatedMsg = entityType === "department" ? t.hr.departmentUpdated : t.hr.positionUpdated;

  const form = useForm<DeptPosFormValues>({
    resolver: zodResolver(deptPosSchema),
    defaultValues: { name: "", description: "" },
  });

  const resetForm = (e: Department | Position | null) => {
    form.reset({ name: e?.name ?? "", description: e?.description ?? "" });
  };

  const saveMutation = useMutation({
    mutationFn: async (v: DeptPosFormValues) => {
      const payload = { name: v.name, description: v.description || null };
      if (isEdit && editing) {
        const { error } = await supabase.from(table).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? updatedMsg : createdMsg });
      onOpenChange(false);
      onSaved();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: t.hr.couldNotSave, description: err.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) resetForm(editing); else resetForm(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titleLabel}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.common.name} *</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hr.description}</FormLabel>
                <FormControl><Textarea rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.common.cancel}</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? saveLabel : createLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
