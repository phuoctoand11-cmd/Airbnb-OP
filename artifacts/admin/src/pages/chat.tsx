import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ChevronLeft,
  Hash,
  ImageIcon,
  Loader2,
  Maximize2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Trash2,
  UserMinus,
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
import { supabase, ROLE_LABELS, SUPABASE_URL_FOR_DEBUG, type AppRole, type ChatAttachment } from "@/lib/supabase";

// ── Constants ───────────────────────────────────────────────────────────────
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const BUCKET = "chat-attachments";

/** Returns the public URL for a stored attachment.
 *  Swap the body of this function to `createSignedUrl(path, 3600)`
 *  if you switch the bucket to private. */
function getAttachmentUrl(attachment: ChatAttachment): string {
  return attachment.file_url;
}

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
  profile_id?: string | null;
  user_id: string;
  role?: "owner" | "admin" | "member" | null;
  created_at?: string;
}

/** Flat view of a group member used by the sidebar and remove mutation. */
interface GroupMemberView {
  membership_id: string;        // chat_group_members.id — the ONLY delete key
  group_id: string;
  profile_id: string | null;
  user_id: string;
  group_role: string;
  full_name: string;
  email: string;
  employee_role: string | null;
  avatar_url: string | null;
  is_current_user: boolean;
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
  group_id: string;
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
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<GroupMemberView | null>(null);
  const [removedMemberIds, setRemovedMemberIds] = useState<Set<string>>(new Set());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const employeesQuery = useQuery({
    queryKey: ["chat_employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, profile_id, full_name, email, role, status, avatar_url")
        .not("profile_id", "is", null)
        .eq("status", "active")
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
      console.log("[CHAT_SELECTED_GROUP_ID]", selectedGroupId);
      // Use * so the query never fails if optional columns (id, profile_id, role)
      // don't exist yet (pre-v2-migration tables).
      const { data, error } = await supabase
        .from("chat_group_members")
        .select("*")
        .eq("group_id", selectedGroupId!);
      console.log("[CHAT_GROUP_MEMBERS_RAW]", {
        count: data?.length ?? 0,
        data,
        error,
      });
      if (error) throw error;
      return (data ?? []) as ChatGroupMember[];
    },
  });

  const topicsQuery = useQuery({
    queryKey: ["chat_topics", selectedGroupId],
    enabled: !!selectedGroupId,
    queryFn: async () => {
      console.log("[CHAT_TOPICS_FOR_GROUP]", { selectedGroupId });
      const { data, error } = await supabase
        .from("chat_topics")
        .select("id, group_id, title, description, created_by, created_at")
        .eq("group_id", selectedGroupId!)
        .order("created_at");
      if (error) throw error;
      console.log("[CHAT_TOPICS_FOR_GROUP] result", { count: data?.length, topics: data });
      return (data ?? []) as ChatTopic[];
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["chat_messages", selectedGroupId, selectedTopicId],
    enabled: !!selectedGroupId && !!selectedTopicId,
    queryFn: async () => {
      console.log("[CHAT_MESSAGES_FOR_TOPIC]", { selectedGroupId, selectedTopicId });
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, group_id, topic_id, sender_id, content, created_at")
        .eq("group_id", selectedGroupId!)
        .eq("topic_id", selectedTopicId!)
        .order("created_at")
        .limit(200);
      if (error) throw error;
      console.log("[CHAT_MESSAGES_FETCHED]", { count: data?.length, messages: data });
      return (data ?? []) as ChatMessage[];
    },
  });

  const attachmentsQuery = useQuery({
    queryKey: ["chat_attachments", selectedTopicId],
    enabled: !!selectedTopicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_attachments")
        .select("*")
        .eq("topic_id", selectedTopicId!)
        .order("created_at");
      if (error) {
        // Table may not exist yet — return empty gracefully
        console.warn("[chat_attachments] query failed:", error.message);
        return [] as ChatAttachment[];
      }
      return (data ?? []) as ChatAttachment[];
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
          queryClient.invalidateQueries({
            queryKey: ["chat_attachments", selectedTopicId],
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

  // Auto-select first topic once topics load for a group
  useEffect(() => {
    if (selectedTopicId) return;
    const topics = topicsQuery.data;
    if (topics && topics.length > 0) {
      console.log("[CHAT_SELECTED_TOPIC] auto-select first", topics[0]);
      setSelectedTopicId(topics[0].id);
    }
  }, [topicsQuery.data, selectedTopicId]);

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

  // Include both profile_id and user_id so the AddMembersModal correctly
  // treats already-added members as existing regardless of which field was used.
  const groupMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of groupMembersQuery.data ?? []) {
      ids.add(m.user_id);
      if (m.profile_id) ids.add(m.profile_id);
    }
    return ids;
  }, [groupMembersQuery.data]);

  // Sorted, stable list of IDs used as the query key for member detail fetching.
  const memberIdList = useMemo(
    () => [...groupMemberIds].sort(),
    [groupMemberIds]
  );

  // Dedicated employee-details fetch for the selected group's members.
  // Avoids relying on the global employees list and works even if status != active.
  const groupMemberDetailsQuery = useQuery({
    queryKey: ["chat_member_details", memberIdList],
    enabled: memberIdList.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, profile_id, full_name, email, role, status, avatar_url")
        .in("profile_id", memberIdList);
      if (error) throw error;
      return (data ?? []) as CompanyMember[];
    },
  });

  // Map keyed by profile_id for O(1) lookup.
  const groupMemberDetailsMap = useMemo(() => {
    const map = new Map<string, CompanyMember>();
    for (const emp of groupMemberDetailsQuery.data ?? []) {
      if (emp.profile_id) map.set(emp.profile_id, emp);
    }
    return map;
  }, [groupMemberDetailsQuery.data]);

  // Flat GroupMemberView list — membership_id is the only delete key.
  const groupMemberViews = useMemo((): GroupMemberView[] => {
    const rows = groupMembersQuery.data ?? [];
    const views = rows.map((gm) => {
      const emp =
        groupMemberDetailsMap.get(gm.profile_id ?? "") ??
        groupMemberDetailsMap.get(gm.user_id) ??
        memberMap.get(gm.profile_id ?? "") ??
        memberMap.get(gm.user_id);
      const isCreator =
        gm.user_id === selectedGroup?.created_by ||
        gm.profile_id === selectedGroup?.created_by;
      return {
        membership_id: gm.id,
        group_id: gm.group_id,
        profile_id: gm.profile_id ?? null,
        user_id: gm.user_id,
        group_role: gm.role ?? (isCreator ? "owner" : "member"),
        full_name: emp?.full_name ?? "Unknown",
        email: emp?.email ?? "",
        employee_role: emp?.role ?? null,
        avatar_url: emp?.avatar_url ?? null,
        is_current_user:
          gm.user_id === currentUserId || gm.profile_id === currentUserId,
      } satisfies GroupMemberView;
    });
    console.log("[CHAT_GROUP_MEMBERS_RENDERED]", {
      count: views.length,
      members: views.map((v) => ({
        membership_id: v.membership_id,
        full_name: v.full_name,
        group_role: v.group_role,
      })),
    });
    return views;
  }, [groupMembersQuery.data, groupMemberDetailsMap, memberMap, selectedGroup, currentUserId]);

  const attachmentMap = useMemo(
    () => new Map((attachmentsQuery.data ?? []).map((a) => [a.message_id, a])),
    [attachmentsQuery.data]
  );

  const canManageGroup =
    selectedGroup
      ? isAdmin || selectedGroup.created_by === currentUserId
      : false;

  /** Per-member permission: can the current user remove this specific member? */
  function canRemoveThisMember(gm: ChatGroupMember): boolean {
    // Cannot remove yourself (check both profile_id and user_id)
    const gmIdentity = gm.profile_id ?? gm.user_id;
    if (gmIdentity === currentUserId || gm.user_id === currentUserId) return false;

    const isTargetOwner =
      gm.role === "owner" ||
      gm.user_id === selectedGroup?.created_by ||
      gm.profile_id === selectedGroup?.created_by;

    // Never remove the last/only owner — count owners in this group
    if (isTargetOwner) {
      const ownerCount = (groupMembersQuery.data ?? []).filter(
        (m) =>
          m.role === "owner" ||
          m.user_id === selectedGroup?.created_by ||
          m.profile_id === selectedGroup?.created_by
      ).length;
      if (ownerCount <= 1) return false;
    }

    // admin/manager can remove anyone (including extra owners)
    if (isAdmin) return true;

    // Group owner can remove non-owner members only
    if (selectedGroup?.created_by === currentUserId) {
      return !isTargetOwner;
    }

    // Regular members cannot remove anyone
    return false;
  }

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
      const groupId = (group as ChatGroup).id;
      // Creator row first — role = "owner"
      const creatorRow = {
        group_id: groupId,
        profile_id: currentUserId,
        user_id: currentUserId,
        role: "owner",
      };
      // Additional member rows — role = "member"
      const memberRows = memberIds.map((uid) => ({
        group_id: groupId,
        profile_id: uid,
        user_id: uid,
        role: "member",
      }));
      const { error: memErr } = await supabase
        .from("chat_group_members")
        .insert([creatorRow, ...memberRows]);
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

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from("chat_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat_groups"] });
      setSelectedGroupId(null);
      toast({ title: "Đã xóa nhóm" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Không xóa được nhóm", description: err.message }),
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
      // Always use employee.profile_id (not employee.id) for both columns
      const rows = profileIds.map((profileId) => ({
        group_id: selectedGroupId!,
        profile_id: profileId,
        user_id: profileId,
        role: "member" as const,
      }));

      console.log("[CHAT_ADD_MEMBERS_PAYLOAD]", {
        group_id: selectedGroupId,
        count: rows.length,
        rows,
      });

      // Path A: upsert with conflict on (group_id, profile_id)
      let { error } = await supabase
        .from("chat_group_members")
        .upsert(rows, { onConflict: "group_id,profile_id" });

      console.log("[CHAT_ADD_MEMBERS_RESULT]", { strategy: "upsert", error });

      // Path B: if upsert not supported (no unique constraint yet), fall back to
      // individual inserts and silently ignore duplicate-key errors (23505).
      if (error) {
        const insertErrors: string[] = [];
        for (const row of rows) {
          const { error: insErr } = await supabase
            .from("chat_group_members")
            .insert(row);
          console.log("[CHAT_ADD_MEMBERS_RESULT]", {
            strategy: "insert_fallback",
            row,
            error: insErr,
          });
          // 23505 = unique_violation — member already in group, skip
          if (insErr && (insErr as { code?: string }).code !== "23505") {
            insertErrors.push(insErr.message);
          }
        }
        if (insertErrors.length > 0) {
          throw new Error(insertErrors.join("; "));
        }
      }

      return profileIds;
    },
    onSuccess: (profileIds) => {
      setAddMembersOpen(false);
      // refetchQueries forces an immediate re-fetch (not just mark-stale)
      queryClient.refetchQueries({
        queryKey: ["chat_group_members", selectedGroupId],
      });
      queryClient.invalidateQueries({ queryKey: ["chat_groups"] });
      toast({ title: `Đã thêm ${profileIds.length} thành viên vào nhóm` });
      profileIds.forEach((uid) => {
        log({
          action: "chat_member_added",
          entityType: "chat_groups",
          entityId: selectedGroupId,
          metadata: {
            group_id: selectedGroupId,
            group_name: selectedGroup?.name ?? "",
            profile_id: uid,
          },
        });
      });
    },
    onError: (err: Error) =>
      toast({
        variant: "destructive",
        title: "Không thể thêm thành viên",
        description: err.message,
      }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (member: GroupMemberView) => {
      console.log("[REMOVE_MEMBER_CLICK]", member);
      console.log("[REMOVE_MEMBER_MEMBERSHIP_ID]", member.membership_id);

      if (!member.membership_id) {
        toast({ variant: "destructive", title: "Không thể xóa: thiếu membership_id" });
        throw new Error("Không thể xóa: thiếu membership_id");
      }

      const { error } = await supabase
        .from("chat_group_members")
        .delete()
        .eq("id", member.membership_id);

      console.log("[REMOVE_MEMBER_DELETE_ERROR]", error);

      if (error) throw error;
      return { membership_id: member.membership_id };
    },
    onSuccess: ({ membership_id }) => {
      setConfirmRemoveMember(null);
      setRemovedMemberIds((prev) => new Set([...prev, membership_id]));
      queryClient.refetchQueries({ queryKey: ["chat_group_members", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["chat_groups"] });
      toast({ title: "Đã xóa thành viên khỏi nhóm" });
    },
    onError: (err: unknown) => {
      const raw = err as { message?: string; details?: string; code?: string };
      const description = [raw?.message, raw?.details].filter(Boolean).join(" — ") || String(err);
      toast({ variant: "destructive", title: "Không thể xóa thành viên", description });
    },
  });

  async function removeMemberDebug(member: GroupMemberView) {
    console.log("[REMOVE_MEMBER_CLICK]", member);
    console.log("[REMOVE_MEMBER_ID]", member.membership_id);
    const result = await supabase
      .from("chat_group_members")
      .delete()
      .eq("id", member.membership_id);
    console.log("[REMOVE_MEMBER_DELETE_RESULT]", result);
    if (!result.error) {
      setRemovedMemberIds((prev) => new Set([...prev, member.membership_id]));
      queryClient.refetchQueries({ queryKey: ["chat_group_members", selectedGroupId] });
      toast({ title: "Đã xóa thành viên khỏi nhóm" });
    }
  }

  /** Direct remove — no confirm dialog, always fires for debugging. */
  async function handleRemoveMember(member: GroupMemberView) {
    console.log("[REMOVE_MEMBER_CLICK]", member);
    console.log("[REMOVE_MEMBER_ID]", member.membership_id);

    if (!member.membership_id) {
      toast({ variant: "destructive", title: "Thiếu membership_id" });
      return;
    }

    const { error } = await supabase
      .from("chat_group_members")
      .delete()
      .eq("id", member.membership_id);

    console.log("[REMOVE_MEMBER_DELETE_RESULT]", { error });

    if (error) {
      toast({ variant: "destructive", title: "Không thể xóa thành viên", description: error.message });
      return;
    }

    setRemovedMemberIds((prev) => new Set([...prev, member.membership_id]));
    queryClient.refetchQueries({ queryKey: ["chat_group_members", selectedGroupId] });
    queryClient.invalidateQueries({ queryKey: ["chat_groups"] });
    toast({ title: "Đã xóa thành viên khỏi nhóm" });
  }

  const sendMutation = useMutation({
    mutationFn: async ({
      text,
      file,
    }: {
      text: string;
      file: File | null;
    }) => {
      // 1. Upload image first — abort everything if this fails
      let attachmentPayload: Omit<
        ChatAttachment,
        "id" | "message_id" | "group_id" | "topic_id" | "uploaded_by" | "created_at"
      > | null = null;

      if (file) {
        const path = `chat/${selectedGroupId}/${selectedTopicId}/${Date.now()}_${file.name}`;

        // ── Debug: log every upload attempt ──────────────────────────────────
        // eslint-disable-next-line no-console
        console.info("[CHAT_UPLOAD] attempting upload", {
          supabaseUrl: (supabase as unknown as { supabaseUrl?: string }).supabaseUrl
            ?? import.meta.env.VITE_SUPABASE_URL,
          bucketName: BUCKET,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          uploadPath: path,
        });

        const { error: uploadErr } = await supabase.storage
          .from("chat-attachments")          // ← literal string intentionally (rules out constant issues)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadErr) {
          // eslint-disable-next-line no-console
          console.error("[CHAT_UPLOAD_ERROR]", {
            message: uploadErr.message,
            name: uploadErr.name,
            status: (uploadErr as unknown as { status?: number }).status,
            bucketName: BUCKET,
            uploadPath: path,
            supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          });
          throw new Error(`Upload failed: ${uploadErr.message}`);
        }

        // eslint-disable-next-line no-console
        console.info("[CHAT_UPLOAD] success", { uploadPath: path });

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        attachmentPayload = {
          file_path: path,
          file_url: urlData.publicUrl,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
        };
      }

      // 2. Insert the message — group_id is required (NOT NULL in schema)
      if (!selectedGroupId || !selectedTopicId) {
        throw new Error("Cannot send: no group or topic selected");
      }
      const payload = {
        group_id: selectedGroupId,
        topic_id: selectedTopicId,
        sender_id: currentUserId,
        content: text || "",
      };
      console.log("[CHAT_SEND_PAYLOAD]", payload);
      const { data: message, error: msgErr } = await supabase
        .from("chat_messages")
        .insert(payload)
        .select()
        .single();
      if (msgErr) throw msgErr;
      console.log("[CHAT_SEND_RESULT]", message);

      // 3. Insert the attachment record
      if (attachmentPayload) {
        const { error: attErr } = await supabase.from("chat_attachments").insert({
          message_id: (message as ChatMessage).id,
          group_id: selectedGroupId!,
          topic_id: selectedTopicId!,
          uploaded_by: currentUserId,
          ...attachmentPayload,
        });
        if (attErr) throw attErr;
      }

      return { hasAttachment: !!attachmentPayload, attachmentPayload };
    },
    onSuccess: ({ hasAttachment, attachmentPayload }) => {
      setMessageInput("");
      clearImage();
      queryClient.invalidateQueries({ queryKey: ["chat_messages", selectedGroupId, selectedTopicId] });
      if (hasAttachment) {
        queryClient.invalidateQueries({ queryKey: ["chat_attachments", selectedTopicId] });
        log({
          action: "chat_image_sent",
          entityType: "chat_topics",
          entityId: selectedTopicId,
          metadata: {
            group_id: selectedGroupId,
            topic_id: selectedTopicId,
            file_name: attachmentPayload?.file_name,
            file_size: attachmentPayload?.file_size,
          },
        });
      } else {
        log({
          action: "chat_message_sent",
          entityType: "chat_topics",
          entityId: selectedTopicId,
          metadata: { group_id: selectedGroupId },
        });
      }
    },
    onError: (err: Error) => {
      const isStorageError = err.message.toLowerCase().includes("bucket") ||
        err.message.toLowerCase().includes("upload");
      toast({
        variant: "destructive",
        title: "Failed to send",
        description: isStorageError
          ? `${err.message} — Check that bucket "chat-attachments" exists in Supabase project: ${SUPABASE_URL_FOR_DEBUG}`
          : err.message,
      });
    },
  });

  // ── Image helpers ─────────────────────────────────────────────────────────────

  function clearImage() {
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({ variant: "destructive", title: "Only JPG, PNG, and WebP images are allowed" });
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast({ variant: "destructive", title: "Image must be under 5 MB" });
      e.target.value = "";
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setImageFile(file);
    setImagePreviewUrl(previewUrl);
  }

  const handleSend = useCallback(() => {
    const text = messageInput.trim();
    if (!text && !imageFile) return;
    if (!selectedGroupId || !selectedTopicId) return;
    sendMutation.mutate({ text, file: imageFile });
  }, [messageInput, imageFile, selectedGroupId, selectedTopicId, sendMutation]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="Chat" fullWidth>
      <div className="flex h-full w-full overflow-hidden border-t border-border bg-background">
        {/* ── Groups sidebar ──────────────────────────────────────────────── */}
        <div className={`${selectedGroupId ? "hidden md:flex" : "flex"} w-full md:w-[260px] shrink-0 flex-col border-r border-border`}>
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
                    onClick={() => {
                      console.log("[CHAT_SELECTED_GROUP]", g);
                      setSelectedGroupId(g.id);
                    }}
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
          <div className="hidden sm:flex w-[220px] shrink-0 flex-col border-r border-border">
            <div className="border-b border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {selectedGroup?.name}
                </p>
                {role === "admin" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm("Xóa nhóm này? Toàn bộ tin nhắn, thành viên và file trong nhóm sẽ bị xóa vĩnh viễn, không thể khôi phục.")) {
                        deleteGroupMutation.mutate(selectedGroup!.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
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
                      onClick={() => {
                        console.log("[CHAT_SELECTED_TOPIC]", t);
                        setSelectedTopicId(t.id);
                      }}
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
        <div className={`${selectedGroupId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`} style={{ minWidth: 0 }}>
          {/* Mobile back bar — only visible on small screens when a group is selected */}
          {selectedGroupId && (
            <div className="md:hidden flex items-center gap-1 border-b border-border px-2 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 shrink-0"
                onClick={() => setSelectedGroupId(null)}
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lại
              </Button>
              <span className="font-semibold text-sm truncate flex-1">{selectedGroup?.name}</span>
              {role === "admin" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (window.confirm("Xóa nhóm này? Toàn bộ tin nhắn, thành viên và file trong nhóm sẽ bị xóa vĩnh viễn, không thể khôi phục.")) {
                      deleteGroupMutation.mutate(selectedGroup!.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
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
                            {/* Text bubble — omit if content is empty (image-only) */}
                            {msg.content.trim() !== "" && (
                              <div
                                className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                  isMe
                                    ? "rounded-tr-sm bg-foreground text-background"
                                    : "rounded-tl-sm bg-muted text-foreground"
                                }`}
                              >
                                {msg.content}
                              </div>
                            )}
                            {/* Image attachment */}
                            {(() => {
                              const att = attachmentMap.get(msg.id);
                              if (!att) return null;
                              return (
                                <div className="group relative mt-0.5">
                                  <img
                                    src={getAttachmentUrl(att)}
                                    alt={att.file_name}
                                    title="Click to view full size"
                                    className="max-h-64 max-w-[420px] cursor-pointer rounded-xl object-cover shadow-sm transition-opacity hover:opacity-90"
                                    onClick={() => setImageViewerUrl(getAttachmentUrl(att))}
                                  />
                                  <button
                                    className="absolute bottom-1.5 right-1.5 hidden rounded-lg bg-black/50 p-1 text-white group-hover:flex"
                                    onClick={() => setImageViewerUrl(getAttachmentUrl(att))}
                                    title="View full size"
                                  >
                                    <Maximize2 className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })()}
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
                {/* Image preview strip */}
                {imagePreviewUrl && (
                  <div className="mb-2 flex items-start gap-2">
                    <div className="relative">
                      <img
                        src={imagePreviewUrl}
                        alt="Preview"
                        className="h-20 w-20 rounded-lg object-cover border border-border"
                      />
                      <button
                        onClick={clearImage}
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background shadow"
                        title="Remove image"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <div className="min-w-0 pt-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {imageFile?.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {imageFile ? `${(imageFile.size / 1024).toFixed(0)} KB` : ""}
                      </p>
                    </div>
                  </div>
                )}

                {/* Input row */}
                <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                  {/* Hidden file input */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  {/* Image attach button */}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={sendMutation.isPending}
                    className="mb-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    title="Attach image"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
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
                      (!messageInput.trim() && !imageFile) || sendMutation.isPending
                    }
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Enter to send · Shift+Enter for new line · 📎 images up to 5 MB
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Members panel ────────────────────────────────────────────────── */}
        {selectedGroupId && (
          <div className="hidden lg:flex w-[300px] shrink-0 flex-col border-l border-border">
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
              {groupMembersQuery.isLoading || groupMemberDetailsQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : groupMemberViews.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <Users className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Chưa có thành viên</p>
                </div>
              ) : (
                <div className="space-y-px p-2">
                  {groupMemberViews
                    .filter((m) => !removedMemberIds.has(m.membership_id))
                    .map((member) => {
                      console.log("[MEMBER_ROW]", member);
                      return (
                    <div
                      key={member.membership_id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={member.avatar_url ?? ""} />
                        <AvatarFallback className="text-[10px]">
                          {initials(member.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {member.full_name}
                          {member.is_current_user && (
                            <span className="ml-1 text-muted-foreground">(bạn)</span>
                          )}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {member.employee_role
                            ? (ROLE_LABELS[member.employee_role as AppRole] ?? member.employee_role)
                            : member.email}
                        </p>
                      </div>
                      <Badge
                        variant={member.group_role === "owner" ? "default" : "outline"}
                        className="shrink-0 px-1 py-0 text-[9px]"
                      >
                        {member.group_role === "owner" ? "Owner" : "Member"}
                      </Badge>
                      <button
                        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-destructive border border-destructive/40 hover:bg-destructive hover:text-white transition-colors"
                        onClick={() => setConfirmRemoveMember(member)}
                        title="Xóa khỏi nhóm"
                      >
                        Xóa
                      </button>
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

      {/* ── Confirm remove member dialog ────────────────────────────────────── */}
      {confirmRemoveMember && (
        <Dialog
          open={!!confirmRemoveMember}
          onOpenChange={(o) => !o && setConfirmRemoveMember(null)}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Xóa khỏi nhóm</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Bạn có chắc muốn xóa{" "}
              <span className="font-semibold text-foreground">
                {confirmRemoveMember.full_name}
              </span>{" "}
              khỏi nhóm này không?
            </p>
            <p className="text-xs text-muted-foreground">
              membership_id: {confirmRemoveMember.membership_id}
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmRemoveMember(null)}
                disabled={removeMemberMutation.isPending}
              >
                Hủy
              </Button>
              <Button
                variant="destructive"
                disabled={removeMemberMutation.isPending}
                onClick={() => removeMemberMutation.mutate(confirmRemoveMember)}
              >
                {removeMemberMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <UserMinus className="mr-1.5 h-4 w-4" />
                Xóa khỏi nhóm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Image viewer ────────────────────────────────────────────────────── */}
      <Dialog open={!!imageViewerUrl} onOpenChange={(o) => !o && setImageViewerUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          {imageViewerUrl && (
            <img
              src={imageViewerUrl}
              alt="Full size"
              className="h-auto max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
