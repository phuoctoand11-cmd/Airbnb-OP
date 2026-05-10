import { useCallback } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActivityLogPayload {
  action: string;
  module: string;
  target_table?: string | null;
  target_id?: string | null;
  target_label?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

interface ActivityLogInsert extends ActivityLogPayload {
  actor_profile_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
}

// ── Core function (no hooks — safe to call anywhere) ─────────────────────────

export async function logActivity(log: ActivityLogInsert): Promise<void> {
  try {
    const { error } = await supabase.from("activity_logs").insert({
      actor_profile_id: log.actor_profile_id ?? null,
      actor_name: log.actor_name ?? null,
      actor_role: log.actor_role ?? null,
      action: log.action,
      module: log.module,
      target_table: log.target_table ?? null,
      target_id: log.target_id ?? null,
      target_label: log.target_label ?? null,
      old_data: log.old_data ?? null,
      new_data: log.new_data ?? null,
      metadata: log.metadata ?? null,
    });
    if (error) {
      console.warn("[activity-log] write failed:", error.message);
    }
  } catch (err) {
    console.warn("[activity-log] exception:", err);
  }
}

// ── Hook — auto-injects actor info from auth context ─────────────────────────

export function useLogActivity() {
  const { profile, role, session } = useAuth();

  return useCallback(
    (payload: ActivityLogPayload) => {
      return logActivity({
        ...payload,
        actor_profile_id: session?.user?.id ?? null,
        actor_name: profile?.full_name ?? profile?.email ?? null,
        actor_role: role ?? null,
      });
    },
    [profile, role, session],
  );
}
