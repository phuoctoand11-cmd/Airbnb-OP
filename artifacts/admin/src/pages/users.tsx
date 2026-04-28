import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Users } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS, ROLES, supabase, type AppRole, type UserProfile } from "@/lib/supabase";
import { useI18n } from "@/i18n";

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserProfile[];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AppRole }) => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.team.roleUpdated });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.team.updateFailed, description: err.message }),
  });

  return (
    <AppLayout title={t.team.title}>
      {profilesQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t.team.couldNotLoad}</AlertTitle>
          <AlertDescription>{(profilesQuery.error as Error).message}</AlertDescription>
        </Alert>
      ) : profilesQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !profilesQuery.data || profilesQuery.data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Users className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{t.team.noMembers}</p>
          <p className="text-sm text-muted-foreground">{t.team.signUpNote}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.team.name}</TableHead>
                  <TableHead>{t.team.email}</TableHead>
                  <TableHead>{t.team.joined}</TableHead>
                  <TableHead className="text-right">{t.team.role}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profilesQuery.data.map((p) => {
                  const initials = (p.full_name ?? p.email)
                    .split(" ")
                    .map((s: string) => s[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  const isMe = p.id === user?.id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border">
                            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-medium">{p.full_name ?? "—"}</span>
                            {isMe && (
                              <span className="ml-1 text-xs text-muted-foreground">{t.team.you}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(parseISO(p.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Select
                          value={p.role}
                          onValueChange={(role) => updateRole.mutate({ id: p.id, role: role as AppRole })}
                          disabled={isMe}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
