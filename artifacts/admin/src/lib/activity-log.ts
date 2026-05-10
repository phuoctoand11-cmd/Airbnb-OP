import { useCallback } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

// ── Types matching the real public.activity_logs schema ───────────────────────

export interface LogPayload {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ── Core function (no hooks — safe to call anywhere, needs userId passed in) ──

export async function logActivity(
  payload: LogPayload & { userId?: string | null },
): Promise<void> {
  try {
    const row = {
      user_id: payload.userId ?? null,
      action: payload.action,
      entity_type: payload.entityType ?? null,
      entity_id: payload.entityId ?? null,
      metadata: payload.metadata ?? null,
    };

    const { error } = await supabase.from("activity_logs").insert(row);

    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[ACTIVITY_LOG] failed", { action: payload.action, error: error.message });
    } else {
      // eslint-disable-next-line no-console
      console.log("[ACTIVITY_LOG] success", { action: payload.action, entity_type: payload.entityType, entity_id: payload.entityId });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ACTIVITY_LOG] failed (exception)", { action: payload.action, err });
  }
}

// ── Hook — auto-injects user_id + actor info from auth context ────────────────

export function useLogActivity() {
  const { profile, role, session } = useAuth();

  return useCallback(
    (payload: LogPayload) => {
      return logActivity({
        ...payload,
        userId: session?.user?.id ?? null,
        metadata: {
          ...payload.metadata,
          actor_name: profile?.full_name ?? profile?.email ?? null,
          actor_role: role ?? null,
        },
      });
    },
    [profile, role, session],
  );
}
