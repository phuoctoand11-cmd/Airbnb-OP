import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { MessageSquare, Plus, Send, Settings2, Trash2, UserPlus, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  supabase,
  type ChatGroup,
  type ChatGroupMember,
  type ChatMessage,
  type UserProfile,
} from "@/lib/supabase";
import { useI18n } from "@/i18n";

const createGroupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});
type CreateGroupValues = z.infer<typeof createGroupSchema>;

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addMemberId, setAddMemberId] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const createGroupForm = useForm<CreateGroupValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: "" },
  });

  // Load all profiles
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return (data ?? []) as UserProfile[];
    },
  });

  // Load groups the current user belongs to
  const groupsQuery = useQuery({
    queryKey: ["chat_groups", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: memberRows, error: memberErr } = await supabase
        .from("chat_group_members")
        .select("group_id")
        .eq("user_id", user.id);
      if (memberErr) throw memberErr;
      const groupIds = (memberRows ?? []).map((r: { group_id: string }) => r.group_id);
      if (groupIds.length === 0) return [];
      const { data, error } = await supabase
        .from("chat_groups")
        .select("*")
        .in("id", groupIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatGroup[];
    },
  });

  // Load members of a group
  const membersQuery = useQuery({
    queryKey: ["chat_group_members", selectedGroupId],
    enabled: !!selectedGroupId,
    queryFn: async () => {
      if (!selectedGroupId) return [];
      const { data, error } = await supabase
        .from("chat_group_members")
        .select("*")
        .eq("group_id", selectedGroupId);
      if (error) throw error;
      return (data ?? []) as ChatGroupMember[];
    },
  });

  // Load messages for selected group
  const messagesQuery = useQuery({
    queryKey: ["chat_messages", selectedGroupId],
    enabled: !!selectedGroupId,
    queryFn: async () => {
      if (!selectedGroupId) return [];
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*, sender:profiles(id, full_name, email)")
        .eq("group_id", selectedGroupId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  // Supabase Realtime subscription for new messages
  useEffect(() => {
    if (!selectedGroupId) return;
    const channel = supabase
      .channel(`chat_messages:${selectedGroupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `group_id=eq.${selectedGroupId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["chat_messages", selectedGroupId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGroupId, queryClient]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  // Mutations
  const createGroupMutation = useMutation({
    mutationFn: async (values: CreateGroupValues) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data: group, error: gErr } = await supabase
        .from("chat_groups")
        .insert({ name: values.name, created_by: user.id })
        .select()
        .single();
      if (gErr) throw gErr;
      const { error: mErr } = await supabase
        .from("chat_group_members")
        .insert({ group_id: (group as ChatGroup).id, user_id: user.id });
      if (mErr) throw mErr;
      return group as ChatGroup;
    },
    onSuccess: (group) => {
      toast({ title: t.chat.groupCreated });
      setCreateOpen(false);
      createGroupForm.reset();
      queryClient.invalidateQueries({ queryKey: ["chat_groups"] });
      setSelectedGroupId(group.id);
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.chat.couldNotLoad, description: err.message }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user?.id || !selectedGroupId) throw new Error("Missing context");
      const { error } = await supabase.from("chat_messages").insert({
        group_id: selectedGroupId,
        sender_id: user.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["chat_messages", selectedGroupId] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.chat.couldNotSend, description: err.message }),
  });

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!selectedGroupId) throw new Error("No group selected");
      const { error } = await supabase
        .from("chat_group_members")
        .insert({ group_id: selectedGroupId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.chat.memberAdded });
      setAddMemberId("");
      queryClient.invalidateQueries({ queryKey: ["chat_group_members", selectedGroupId] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.chat.couldNotLoad, description: err.message }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!selectedGroupId) throw new Error("No group selected");
      const { error } = await supabase
        .from("chat_group_members")
        .delete()
        .eq("group_id", selectedGroupId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.chat.memberRemoved });
      queryClient.invalidateQueries({ queryKey: ["chat_group_members", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["chat_groups"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.chat.couldNotLoad, description: err.message }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from("chat_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t.chat.groupDeleted });
      setSelectedGroupId(null);
      setMembersOpen(false);
      queryClient.invalidateQueries({ queryKey: ["chat_groups"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: t.chat.couldNotLoad, description: err.message }),
  });

  const selectedGroup = groupsQuery.data?.find((g) => g.id === selectedGroupId) ?? null;

  const profileName = (id: string | null | undefined) => {
    if (!id) return "?";
    const p = profilesQuery.data?.find((p) => p.id === id);
    return p?.full_name ?? p?.email ?? "?";
  };

  const profileInitials = (id: string | null | undefined) =>
    profileName(id).slice(0, 2).toUpperCase();

  const memberUserIds = new Set((membersQuery.data ?? []).map((m) => m.user_id));
  const nonMembers = (profilesQuery.data ?? []).filter((p) => !memberUserIds.has(p.id));

  const handleSend = () => {
    const text = messageText.trim();
    if (!text || !selectedGroupId) return;
    sendMessageMutation.mutate(text);
  };

  return (
    <AppLayout title={t.chat.title}>
      <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border bg-card">
        {/* Left panel: group list */}
        <div className="flex w-64 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">{t.chat.title}</span>
            <Button size="icon" variant="ghost" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {groupsQuery.isLoading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !groupsQuery.data || groupsQuery.data.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t.chat.noGroups}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1 h-3 w-3" />
                  {t.chat.createGroupBtn}
                </Button>
              </div>
            ) : (
              <ul className="space-y-0.5 p-2">
                {groupsQuery.data.map((g) => (
                  <li key={g.id}>
                    <button
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                        g.id === selectedGroupId
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{g.name}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        {/* Right panel: messages */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedGroup ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="mb-3 h-10 w-10" />
              <p>{t.chat.selectGroup}</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="font-semibold">{selectedGroup.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {membersQuery.data?.length ?? "…"} {t.chat.members}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setMembersOpen(true)}>
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                  {t.chat.manageMembers}
                </Button>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {messagesQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-3/4" />)}
                  </div>
                ) : messagesQuery.error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{(messagesQuery.error as Error).message}</AlertDescription>
                  </Alert>
                ) : !messagesQuery.data || messagesQuery.data.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t.chat.noMessages}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messagesQuery.data.map((msg) => {
                      const isMe = msg.sender_id === user?.id;
                      const senderName = isMe
                        ? t.chat.you
                        : (msg.sender?.full_name ?? msg.sender?.email ?? profileName(msg.sender_id));
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="text-[10px]">
                              {profileInitials(msg.sender_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                            <div className={`flex items-baseline gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                              <span className="text-xs font-medium">{senderName}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {format(parseISO(msg.created_at), "HH:mm")}
                              </span>
                            </div>
                            <div
                              className={`mt-1 rounded-2xl px-3 py-2 text-sm ${
                                isMe
                                  ? "rounded-tr-sm bg-primary text-primary-foreground"
                                  : "rounded-tl-sm bg-muted"
                              }`}
                            >
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="border-t p-3">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={t.chat.typeMessage}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={sendMessageMutation.isPending}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!messageText.trim() || sendMessageMutation.isPending}
                    size="icon"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create group dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.chat.createGroupTitle}</DialogTitle>
          </DialogHeader>
          <Form {...createGroupForm}>
            <form
              onSubmit={createGroupForm.handleSubmit((v) => createGroupMutation.mutate(v))}
              className="space-y-4"
            >
              <FormField
                control={createGroupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.chat.groupName}</FormLabel>
                    <FormControl>
                      <Input placeholder={t.chat.groupNamePlaceholder} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" disabled={createGroupMutation.isPending}>
                  {t.common.create}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Manage members dialog */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.chat.manageMembers} — {selectedGroup?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">{t.chat.members}</p>
              <ul className="space-y-2">
                {(membersQuery.data ?? []).map((m) => {
                  const pName = profileName(m.user_id);
                  const isMe = m.user_id === user?.id;
                  return (
                    <li key={m.user_id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px]">{pName.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span>{pName}</span>
                        {isMe && <Badge variant="outline" className="text-[10px] px-1 py-0">you</Badge>}
                      </div>
                      {!isMe && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeMemberMutation.mutate(m.user_id)}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {nonMembers.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">{t.chat.addMember}</p>
                <div className="flex gap-2">
                  <Select value={addMemberId} onValueChange={setAddMemberId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t.chat.selectUser} />
                    </SelectTrigger>
                    <SelectContent>
                      {nonMembers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name ?? p.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (addMemberId) addMemberMutation.mutate(addMemberId);
                    }}
                    disabled={!addMemberId || addMemberMutation.isPending}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t pt-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (selectedGroupId) deleteGroupMutation.mutate(selectedGroupId);
                }}
                disabled={deleteGroupMutation.isPending}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t.chat.deleteGroup}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMembersOpen(false)}>
              {t.common.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
