import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Hash,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLogActivity } from "@/lib/activity-log";
import { useAuth } from "@/lib/auth-context";
import { supabase, ROLE_LABELS, type AppRole } from "@/lib/supabase";

// ── Local types ────────────────────────────────────────────────────────────────

interface CompanyMember {
  id: string;
  profile_id: string;
  full_name: string;
  email: string;
  role: string | null;
  status: string;
  avatar_url: string | null;
}

interface ChatGroup {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

interface ChatGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
}

interface ChatTopic {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

interface ChatMessage {
  id: string;
  topic_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((s) => s[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fmtTime(iso: string) {
  try {
    const d = parseISO(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return format(d, "HH:mm");
    return format(d, "dd/MM HH:mm");
  } catch {
    return "";
  }
}

// ── CreateGroupModal ────────────────────────────────────────────────────────────

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  companyMembers: CompanyMember[];
  currentUserId: string;
  onSubmit: (name: string, description: string, memberIds: string[]) => void;
  loading: boolean;
}

function CreateGroupModal({
  open,
  onClose,
  companyMembers,
  currentUserId,
  onSubmit,
  loading,
}: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () =>
      companyMembers.filter(
        (m) =>
          m.profile_id !== currentUserId &&
          (m.full_name.toLowerCase().includes(search.toLowerCase()) ||
            m.email.toLowerCase().includes(search.toLowerCase()))
      ),
    [companyMembers, search, currentUserId]
  );

  function toggle(profileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit(name.trim(), description.trim(), Array.from(selected));
  }

  function handleClose() {
    setName("");
    setDescription("");
    setSearch("");
    setSelected(new Set());
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Group name *</Label>
            <Input
              placeholder="e.g. Housekeeping Team"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Description{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              placeholder="What is this group for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Add members</Label>
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <ScrollArea className="h-40 rounded-lg border border-border p-1">
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No members found
                </p>
              ) : (
                filtered.map((m) => (
                  <div
                    key={m.profile_id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent"
                    onClick={() => toggle(m.profile_id)}
                  >
                    <Checkbox
                      checked={selected.has(m.profile_id)}
                      onCheckedChange={() => toggle(m.profile_id)}
                    />
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={m.avatar_url ?? ""} />
                      <AvatarFallback className="text-[10px]">
                        {initials(m.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.full_name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {m.role
                          ? (ROLE_LABELS[m.role as AppRole] ?? m.role)
                          : m.email}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
            {selected.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {selected.size} member{selected.size !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CreateTopicModal ───────────────────────────────────────────────────────────

interface CreateTopicModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
  loading: boolean;
}

function CreateTopicModal({
  open,
  onClose,
  onSubmit,
  loading,
}: CreateTopicModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit() {
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim());
  }

  function handleClose() {
    setTitle("");
    setDescription("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Topic</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Topic title *</Label>
            <Input
              placeholder="e.g. General, Urgent Cleaning…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Description{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              placeholder="What is this topic about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AddMembersModal ────────────────────────────────────────────────────────────

interface AddMembersModalProps {
  open: boolean;
  onClose: () => void;
  companyMembers: CompanyMember[];
  existingMemberIds: Set<string>;
  onAdd: (profileIds: string[]) => void;
  loading: boolean;
}

function AddMembersModal({
  open,
  onClose,
  companyMembers,
  existingMemberIds,
  onAdd,
  loading,
}: AddMembersModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const available = useMemo(
    () =>
      companyMembers.filter(
        (m) =>
          !existingMemberIds.has(m.profile_id) &&
          (m.full_name.toLowerCase().includes(search.toLowerCase()) ||
            m.email.toLowerCase().includes(search.toLowerCase()))
      ),
    [companyMembers, existingMemberIds, search]
  );

  function toggle(profileId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  function handleClose() {
    setSearch("");
    setSelected(new Set());
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Members</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ScrollArea className="h-52 rounded-lg border border-border p-1">
            {available.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No members to add
              </p>
            ) : (
              available.map((m) => (
                <div
                  key={m.profile_id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent"
                  onClick={() => toggle(m.profile_id)}
                >
                  <Checkbox
                    checked={selected.has(m.profile_id)}
                    onCheckedChange={() => toggle(m.profile_id)}
                  />
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={m.avatar_url ?? ""} />
                    <AvatarFallback className="text-[10px]">
                      {initials(m.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.full_name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {m.email}
                    </p>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
          {selected.size > 0 && (
            <p className="text-xs text-muted-foreground">
              {selected.size} member{selected.size !== 1 ? "s" : ""} selected
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0 || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ChatPage ──────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { session, role } = useAuth();
  const { toast } = useToast();
  const log = useLogActivity();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id ?? "";
  const isAdmin = role === "admin" || role === "manager";

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createTopicOpen, setCreateTopicOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const employeesQuery = useQuery({
    queryKey: ["chat_employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, profile_id, full_name, email, role, status, avatar_url")
        .not("profile_id", "is", null)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as CompanyMember[];
    },
  });

  const groupsQuery = useQuery({
    queryKey: ["chat_groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_groups")
        .select("id, name, description, created_by, created_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ChatGroup[];
    },
  });

  const myMembershipsQuery = useQuery({
    queryKey: ["chat_my_memberships", currentUserId],
    enabled: !!currentUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_group_members")
        .select("group_id")
        .eq("user_id", currentUserId);
      if (error) throw error;
      return new Set((data ?? []).map((m) => m.group_id as string));
    },
  });

  const groupMembersQuery = useQuery({
    queryKey: ["chat_group_members", selectedGroupId],
    enabled: !!selectedGroupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_group_members")
        .select("id, group_id, user_id, joined_at")
        .eq("group_id", selectedGroupId!);
      if (error) throw error;
      return (data ?? []) as ChatGroupMember[];
    },
  });

  const topicsQuery = useQuery({
    queryKey: ["chat_topics", selectedGroupId],
    enabled: !!selectedGroupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_topics")
        .select("id, group_id, title, description, created_by, created_at")
        .eq("group_id", selectedGroupId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ChatTopic[];
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["chat_messages", selectedTopicId],
    enabled: !!selectedTopicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, topic_id, sender_id, content, created_at")
        .eq("topic_id", selectedTopicId!)
        .order("created_at")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  // ── Realtime subscription ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedTopicId) return;
    const channel = supabase
      .channel(`chat:topic:${selectedTopicId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `topic_id=eq.${selectedTopicId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["chat_messages", selectedTopicId],
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTopicId, queryClient]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  // Reset selected topic when group changes
  useEffect(() => {
    setSelectedTopicId(null);
  }, [selectedGroupId]);

  // ── Derived data ──────────────────────────────────────────────────────────────

  const companyMembers = employeesQuery.data ?? [];
  const memberMap = useMemo(
    () => new Map(companyMembers.map((m) => [m.profile_id, m])),
    [companyMembers]
  );

  const myMemberships = myMembershipsQuery.data ?? new Set<string>();

  const visibleGroups = useMemo(() => {
    const all = groupsQuery.data ?? [];
    const base = isAdmin ? all : all.filter((g) => myMemberships.has(g.id));
    if (!groupSearch.trim()) return base;
    const q = groupSearch.toLowerCase();
    return base.filter((g) => g.name.toLowerCase().includes(q));
  }, [groupsQuery.data, isAdmin, myMemberships, groupSearch]);

  const selectedGroup = useMemo(
    () => (groupsQuery.data ?? []).find((g) => g.id === selectedGroupId) ?? null,
    [groupsQuery.data, selectedGroupId]
  );

  const selectedTopic = useMemo(
    () => (topicsQuery.data ?? []).find((t) => t.id === selectedTopicId) ?? null,
    [topicsQuery.data, selectedTopicId]
  );

  const groupMemberIds = useMemo(
    () => new Set((groupMembersQuery.data ?? []).map((m) => m.user_id)),
    [groupMembersQuery.data]
  );

  const canManageGroup =
    selectedGroup
      ? isAdmin || selectedGroup.created_by === currentUserId
      : false;

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createGroupMutation = useMutation({
    mutationFn: async ({
      name,
      description,
      memberIds,
    }: {
      name: string;
      description: string;
      memberIds: string[];
    }) => {
      const { data: group, error } = await supabase
        .from("chat_groups")
        .insert({
          name,
          description: description || null,
          created_by: currentUserId,
        })
        .select()
        .single();
      if (error) throw error;
      const rows = [currentUserId, ...memberIds].map((uid) => ({
        group_id: (group as ChatGroup).id,
        user_id: uid,
      }));
      const { error: memErr } = await supabase
        .from("chat_group_members")
        .insert(rows);
      if (memErr) throw memErr;
      return group as ChatGroup;
    },
    onSuccess: (group) => {
      toast({ title: "Group created" });
      setCreateGroupOpen(false);
      queryClient.invalidateQueries({ queryKey: ["chat_groups"] });
      queryClient.invalidateQueries({
        queryKey: ["chat_my_memberships", currentUserId],
      });
      setSelectedGroupId(group.id);
      log({
        action: "chat_group_created",
        entityType: "chat_groups",
        entityId: group.id,
        metadata: { group_name: group.name },
      });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: "Failed to create group",
        description: err.message,
      }),
  });

  const createTopicMutation = useMutation({
    mutationFn: async ({
      title,
      description,
    }: {
      title: string;
      description: string;
    }) => {
      const { data, error } = await supabase
        .from("chat_topics")
        .insert({
          group_id: selectedGroupId!,
          title,
          description: description || null,
          created_by: currentUserId,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ChatTopic;
    },
    onSuccess: (topic) => {
      toast({ title: "Topic created" });
      setCreateTopicOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["chat_topics", selectedGroupId],
      });
      setSelectedTopicId(topic.id);
      log({
        action: "chat_topic_created",
        entityType: "chat_topics",
        entityId: topic.id,
        metadata: { group_id: selectedGroupId, title: topic.title },
      });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: "Failed to create topic",
        description: err.message,
      }),
  });

  const addMembersMutation = useMutation({
    mutationFn: async (profileIds: string[]) => {
      const rows = profileIds.map((uid) => ({
        group_id: selectedGroupId!,
        user_id: uid,
      }));
      const { error } = await supabase
        .from("chat_group_members")
        .upsert(rows, { onConflict: "group_id,user_id" });
      if (error) throw error;
      return profileIds;
    },
    onSuccess: (profileIds) => {
      toast({ title: "Members added" });
      setAddMembersOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["chat_group_members", selectedGroupId],
      });
      profileIds.forEach((uid) => {
        log({
          action: "chat_member_added",
          entityType: "chat_groups",
          entityId: selectedGroupId,
          metadata: { user_id: uid },
        });
      });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: "Failed to add members",
        description: err.message,
      }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("chat_group_members")
        .delete()
        .eq("group_id", selectedGroupId!)
        .eq("user_id", userId);
      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({
        queryKey: ["chat_group_members", selectedGroupId],
      });
      log({
        action: "chat_member_removed",
        entityType: "chat_groups",
        entityId: selectedGroupId,
        metadata: { user_id: userId },
      });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: "Failed to remove member",
        description: err.message,
      }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("chat_messages").insert({
        topic_id: selectedTopicId!,
        sender_id: currentUserId,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessageInput("");
      queryClient.invalidateQueries({
        queryKey: ["chat_messages", selectedTopicId],
      });
      log({
        action: "chat_message_sent",
        entityType: "chat_topics",
        entityId: selectedTopicId,
        metadata: { group_id: selectedGroupId },
      });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: "Failed to send message",
        description: err.message,
      }),
  });

  const handleSend = useCallback(() => {
    const text = messageInput.trim();
    if (!text || !selectedTopicId) return;
    sendMessageMutation.mutate(text);
  }, [messageInput, selectedTopicId, sendMessageMutation]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Chat">
      <div
        className="flex overflow-hidden rounded-xl border border-border bg-background"
        style={{ height: "calc(100vh - 9rem)" }}
      >
        {/* ── Groups sidebar ──────────────────────────────────────────────── */}
        <div className="flex w-56 shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Groups
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded-lg"
              onClick={() => setCreateGroupOpen(true)}
              title="Create group"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="px-2 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-7 pl-7 text-xs"
                placeholder="Search groups…"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {groupsQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : visibleGroups.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No groups yet</p>
                <button
                  className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setCreateGroupOpen(true)}
                >
                  Create one
                </button>
              </div>
            ) : (
              <div className="space-y-0.5 p-2">
                {visibleGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                      selectedGroupId === g.id
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <p className="truncate text-sm font-medium leading-tight">
                      {g.name}
                    </p>
                    {g.description && (
                      <p
                        className={`mt-0.5 truncate text-[11px] leading-tight ${
                          selectedGroupId === g.id
                            ? "text-background/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        {g.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ── Topics panel ────────────────────────────────────────────────── */}
        {selectedGroupId && (
          <div className="flex w-44 shrink-0 flex-col border-r border-border">
            <div className="border-b border-border px-3 py-2.5">
              <p className="truncate text-xs font-semibold text-foreground">
                {selectedGroup?.name}
              </p>
              {selectedGroup?.description && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {selectedGroup.description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Topics
              </span>
              {canManageGroup && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 rounded-md"
                  onClick={() => setCreateTopicOpen(true)}
                  title="Add topic"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1">
              {topicsQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (topicsQuery.data ?? []).length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <Hash className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">No topics yet</p>
                  {canManageGroup && (
                    <button
                      className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setCreateTopicOpen(true)}
                    >
                      Create one
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5 p-2">
                  {(topicsQuery.data ?? []).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTopicId(t.id)}
                      className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        selectedTopicId === t.id
                          ? "bg-foreground text-background"
                          : "text-foreground hover:bg-accent"
                      }`}
                    >
                      <Hash className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate text-sm">{t.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* ── Messages panel ───────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!selectedGroupId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-muted-foreground">
                  Select a group to start chatting
                </p>
                <p className="mt-1 text-sm text-muted-foreground/60">
                  Or create a new group from the sidebar
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateGroupOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Group
              </Button>
            </div>
          ) : !selectedTopicId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Hash className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-muted-foreground">
                  Select a topic to view messages
                </p>
                {canManageGroup && (
                  <p className="mt-1 text-sm text-muted-foreground/60">
                    Or create a topic in the panel on the left
                  </p>
                )}
              </div>
              {canManageGroup && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateTopicOpen(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Topic
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Topic header */}
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-semibold">{selectedTopic?.title}</span>
                {selectedTopic?.description && (
                  <span className="hidden text-sm text-muted-foreground sm:block">
                    — {selectedTopic.description}
                  </span>
                )}
              </div>

              {/* Messages list */}
              <ScrollArea className="flex-1 px-4">
                {messagesQuery.isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (messagesQuery.data ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <MessageSquare className="mb-3 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      No messages yet. Be the first to say something!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    {(messagesQuery.data ?? []).map((msg, i, arr) => {
                      const sender = memberMap.get(msg.sender_id);
                      const senderName = sender?.full_name ?? "Unknown";
                      const isMe = msg.sender_id === currentUserId;
                      const prevMsg = arr[i - 1];
                      const showHeader =
                        !prevMsg || prevMsg.sender_id !== msg.sender_id;

                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                        >
                          {showHeader ? (
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarImage src={sender?.avatar_url ?? ""} />
                              <AvatarFallback className="text-[11px]">
                                {initials(senderName)}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <div className="w-8 shrink-0" />
                          )}
                          <div
                            className={`flex max-w-[70%] flex-col gap-0.5 ${
                              isMe ? "items-end" : "items-start"
                            }`}
                          >
                            {showHeader && (
                              <div
                                className={`flex items-baseline gap-2 ${
                                  isMe ? "flex-row-reverse" : "flex-row"
                                }`}
                              >
                                <span className="text-xs font-semibold">
                                  {isMe ? "You" : senderName}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {fmtTime(msg.created_at)}
                                </span>
                              </div>
                            )}
                            <div
                              className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                isMe
                                  ? "rounded-tr-sm bg-foreground text-background"
                                  : "rounded-tl-sm bg-muted text-foreground"
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

              {/* Message input */}
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                  <Textarea
                    className="max-h-28 min-h-[1.5rem] flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                    placeholder={`Message #${selectedTopic?.title ?? "…"}`}
                    value={messageInput}
                    rows={1}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-lg"
                    onClick={handleSend}
                    disabled={
                      !messageInput.trim() || sendMessageMutation.isPending
                    }
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Enter to send · Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Members panel ────────────────────────────────────────────────── */}
        {selectedGroupId && (
          <div className="flex w-48 shrink-0 flex-col border-l border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Members
              </span>
              {canManageGroup && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 rounded-lg"
                  onClick={() => setAddMembersOpen(true)}
                  title="Add members"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Group members */}
            <ScrollArea className="flex-1">
              {groupMembersQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (groupMembersQuery.data ?? []).length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <Users className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">No members</p>
                </div>
              ) : (
                <div className="space-y-px p-2">
                  {(groupMembersQuery.data ?? []).map((gm) => {
                    const member = memberMap.get(gm.user_id);
                    const name = member?.full_name ?? "Unknown";
                    const memberRole = member?.role;
                    const isCurrentUser = gm.user_id === currentUserId;
                    const isCreator = gm.user_id === selectedGroup?.created_by;

                    return (
                      <div
                        key={gm.id}
                        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={member?.avatar_url ?? ""} />
                          <AvatarFallback className="text-[10px]">
                            {initials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {name}
                            {isCurrentUser && (
                              <span className="ml-1 text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </p>
                          {memberRole && (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {ROLE_LABELS[memberRole as AppRole] ?? memberRole}
                            </p>
                          )}
                        </div>
                        {isCreator && (
                          <Badge
                            variant="outline"
                            className="shrink-0 px-1 py-0 text-[9px]"
                          >
                            Owner
                          </Badge>
                        )}
                        {canManageGroup && !isCurrentUser && !isCreator && (
                          <button
                            className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                            onClick={() =>
                              removeMemberMutation.mutate(gm.user_id)
                            }
                            title="Remove member"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* All company staff section */}
            <div className="border-t border-border">
              <div className="px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  All Staff
                </span>
              </div>
              <ScrollArea className="h-40">
                <div className="space-y-px px-2 pb-2">
                  {companyMembers.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No employees found
                    </p>
                  ) : (
                    companyMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent"
                      >
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={m.avatar_url ?? ""} />
                          <AvatarFallback className="text-[9px]">
                            {initials(m.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium">
                            {m.full_name}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {m.role
                              ? (ROLE_LABELS[m.role as AppRole] ?? m.role)
                              : m.email}
                          </p>
                        </div>
                        <div
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            m.status === "active"
                              ? "bg-green-500"
                              : "bg-muted-foreground/40"
                          }`}
                        />
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        companyMembers={companyMembers}
        currentUserId={currentUserId}
        onSubmit={(name, description, memberIds) =>
          createGroupMutation.mutate({ name, description, memberIds })
        }
        loading={createGroupMutation.isPending}
      />

      <CreateTopicModal
        open={createTopicOpen}
        onClose={() => setCreateTopicOpen(false)}
        onSubmit={(title, description) =>
          createTopicMutation.mutate({ title, description })
        }
        loading={createTopicMutation.isPending}
      />

      {selectedGroupId && (
        <AddMembersModal
          open={addMembersOpen}
          onClose={() => setAddMembersOpen(false)}
          companyMembers={companyMembers}
          existingMemberIds={groupMemberIds}
          onAdd={(profileIds) => addMembersMutation.mutate(profileIds)}
          loading={addMembersMutation.isPending}
        />
      )}
    </AppLayout>
  );
}
