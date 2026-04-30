import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  supabase,
  SUPABASE_ANON_KEY_LOADED,
  SUPABASE_URL_FOR_DEBUG,
  type AppRole,
  type UserProfile,
  isSupabaseConfigured,
} from "./supabase";

interface AuthContextValue {
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  /** Set when login is blocked due to employee status; survives SIGNED_OUT event */
  blockError: string | null;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: AppRole
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROFILE_FETCH_TIMEOUT_MS = 5000;
const SESSION_INIT_TIMEOUT_MS = 5000;

// Statuses that explicitly block login when an employee row exists
const BLOCKED_EMPLOYEE_STATUSES = ["inactive", "resigned", "terminated", "rejected"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  /**
   * blockError is intentionally NOT cleared by the SIGNED_OUT auth event —
   * it must survive the forced sign-out so the login page can display it.
   * It is cleared only when a fresh, successful login passes all checks.
   */
  const [blockError, setBlockError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const mountedRef = useRef(true);

  const loadProfile = useCallback(async (userId: string) => {
    // eslint-disable-next-line no-console
    console.info("[auth] loadProfile start", { userId });
    setProfileLoading(true);
    setProfileError(null);

    try {
      const fetchPromise = supabase
        .from("users")
        .select(`
          *,
          role:roles!users_role_id_fkey(name),
          team:teams!users_team_id_fkey(id, name)
        `)
        .eq("id", userId)
        .single();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Profile fetch timed out after 5s")),
          PROFILE_FETCH_TIMEOUT_MS
        )
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as Awaited<typeof fetchPromise>;

      if (!mountedRef.current) return;

      // eslint-disable-next-line no-console
      console.info("[auth] profile query result", { data, error });

      if (error) {
        // PGRST116 = no rows returned by .single()
        if (error.code === "PGRST116") {
          setProfileError("User profile not found. Please contact admin.");
          setProfile(null);
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[auth] profile query error", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setProfileError(error.message);
        setProfile(null);
        return;
      }

      if (!data) {
        setProfileError("User profile not found. Please contact admin.");
        setProfile(null);
        return;
      }

      setProfileError(null);

      // ── Employee status enforcement ─────────────────────────────────────
      // Rules:
      //   - Admin: skip check entirely
      //   - No employee row: allow login, show info warning (not a hard block)
      //   - Employee row with blocked status: force sign-out, show deactivated message
      //   - Employee row with any other status: allow login
      const rawRole = (data as { role?: { name?: string } | null })?.role?.name;
      const derivedRole = rawRole === "sale" ? "sales" : rawRole;

      const userEmail = (data as { email?: string | null })?.email ?? null;

      // eslint-disable-next-line no-console
      console.info("[auth] employee check start", { userId, userEmail, derivedRole });

      if (derivedRole !== "admin") {
        // ── Strategy 1: match by profile_id via the view (RLS-safe for non-admins)
        // The raw `employees` table has RLS that blocks non-admin reads; the view is open.
        let empRow: { status: string } | null = null;
        let empError: unknown = null;

        const byProfileId = await supabase
          .from("employee_basic_view")
          .select("status, profile_id")
          .eq("profile_id", userId)
          .maybeSingle();

        // eslint-disable-next-line no-console
        console.info("[auth] employee query by profile_id", {
          userId,
          row: byProfileId.data,
          error: byProfileId.error,
        });

        if (!mountedRef.current) return;
        empError = byProfileId.error;
        empRow = byProfileId.data as { status: string } | null;

        // ── Strategy 2: fallback — match by email if profile_id not yet set in view
        if (!empRow && userEmail && !byProfileId.error) {
          const byEmail = await supabase
            .from("employee_basic_view")
            .select("status, profile_id")
            .ilike("email", userEmail)
            .maybeSingle();

          // eslint-disable-next-line no-console
          console.info("[auth] employee query by email (fallback)", {
            userEmail,
            row: byEmail.data,
            error: byEmail.error,
          });

          if (!mountedRef.current) return;
          if (!byEmail.error && byEmail.data) {
            empRow = byEmail.data as { status: string };
          }
        }

        if (empError) {
          // eslint-disable-next-line no-console
          console.warn("[auth] employee query error — allowing login", { empError });
        }

        if (!empRow) {
          // No linked employee record — allow login but surface an info warning
          // eslint-disable-next-line no-console
          console.info("[auth] employee check result", {
            userId,
            userEmail,
            derivedRole,
            employeeStatus: null,
            reason: "allowed — no employee row found (not required)",
          });
          setBlockError("Employee profile is not linked yet. Please ask your admin to link it.");
        } else {
          const status = empRow.status as string;
          const isBlocked = (BLOCKED_EMPLOYEE_STATUSES as readonly string[]).includes(status);

          // eslint-disable-next-line no-console
          console.info("[auth] employee check result", {
            userId,
            userEmail,
            derivedRole,
            employeeStatus: status,
            reason: isBlocked ? "blocked — deactivated status" : "allowed",
          });

          if (isBlocked) {
            await supabase.auth.signOut();
            if (!mountedRef.current) return;
            setProfile(null);
            setBlockError("Your account has been deactivated. Please contact admin.");
            return;
          }

          // Employee exists and status is fine — clear any previous block error
          setBlockError(null);
        }
      } else {
        // eslint-disable-next-line no-console
        console.info("[auth] employee check result", {
          userId,
          derivedRole,
          employeeStatus: "skipped",
          reason: "allowed — admin role bypasses check",
        });
        setBlockError(null);
      }

      setProfile(data as UserProfile);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "Unknown profile fetch error";
      // eslint-disable-next-line no-console
      console.error("[auth] loadProfile threw", msg);
      setProfileError(msg);
      setProfile(null);
    } finally {
      if (mountedRef.current) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      // eslint-disable-next-line no-console
      console.info("[auth] init start", {
        url: SUPABASE_URL_FOR_DEBUG,
        anonKeyLoaded: SUPABASE_ANON_KEY_LOADED,
      });

      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("getSession timed out after 5s")),
            SESSION_INIT_TIMEOUT_MS
          )
        );

        const { data } = await Promise.race([sessionPromise, timeoutPromise]) as Awaited<typeof sessionPromise>;

        if (!mountedRef.current) return;

        // eslint-disable-next-line no-console
        console.info("[auth] init getSession result", {
          hasSession: !!data.session,
          userId: data.session?.user?.id ?? null,
        });

        setSession(data.session);
        setLoading(false); // Unblock routing immediately after session is known

        if (data.session?.user) {
          // Load profile in background — does not block navigation
          loadProfile(data.session.user.id);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        // eslint-disable-next-line no-console
        console.error("[auth] init failed", err instanceof Error ? err.message : err);
        setLoading(false); // Always unblock on error too
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mountedRef.current) return;
        // eslint-disable-next-line no-console
        console.info("[auth] onAuthStateChange", {
          event: _event,
          userId: newSession?.user?.id ?? null,
        });
        setSession(newSession);
        setLoading(false); // Ensure loading is cleared on any auth event
        if (newSession?.user) {
          loadProfile(newSession.user.id);
        } else {
          setProfile(null);
          setProfileError(null);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    // eslint-disable-next-line no-console
    console.info("[auth] signIn attempt", {
      url: SUPABASE_URL_FOR_DEBUG,
      anonKeyLoaded: SUPABASE_ANON_KEY_LOADED,
      email,
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] signIn error", {
        name: error.name,
        message: error.message,
        status: (error as unknown as { status?: number }).status,
      });
      throw error;
    }
    // eslint-disable-next-line no-console
    console.info("[auth] signIn success", {
      userId: data.user?.id,
      sessionExpiry: data.session?.expires_at,
    });
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: AppRole
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
        },
      });
      if (error) throw error;
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  // Derive role from the nested role relation (aliased FK).
  // Normalize legacy DB value "sale" → "sales" for backward compatibility.
  const rawRoleName = profile?.role?.name;
  const normalizedRoleName = rawRoleName === "sale" ? "sales" : rawRoleName;
  const role = (normalizedRoleName as AppRole | undefined) ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      profileLoading,
      profileError,
      blockError,
      session,
      user: session?.user ?? null,
      profile,
      role,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [loading, profileLoading, profileError, blockError, session, profile, role, signIn, signUp, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const ROLE_PERMISSIONS = {
  manageListings: ["admin", "manager"] as AppRole[],
  manageAmenities: ["admin", "manager"] as AppRole[],
  manageCalendar: ["admin", "manager"] as AppRole[],
  managePricing: ["admin", "manager"] as AppRole[],
  // sales can create bookings; accountant has read-only bookings access
  manageBookings: ["admin", "manager", "sales", "accountant"] as AppRole[],
  // operational roles can see/update tasks; admin/manager manage all
  manageTasks: ["admin", "manager", "maintenance", "cleaner", "staff"] as AppRole[],
  // revenues & expenses: admin + accountant only (manager excluded)
  manageFinance: ["admin", "accountant"] as AppRole[],
  manageUsers: ["admin"] as AppRole[],
  viewReports: ["admin", "manager", "accountant"] as AppRole[],
  viewHR: ["admin", "manager", "accountant"] as AppRole[],
  // dashboard overview: admin + manager only
  viewDashboard: ["admin", "manager"] as AppRole[],
} as const;

export type Permission = keyof typeof ROLE_PERMISSIONS;

export function hasPermission(role: AppRole | null, perm: Permission) {
  if (!role) return false;
  // Admin always has full access to all menus
  if (role === "admin") return true;
  return (ROLE_PERMISSIONS[perm] as readonly AppRole[]).includes(role);
}

// ── Role-based capability helpers ──────────────────────────────────────────
// Use these instead of raw role comparisons so changes stay in one place.

/** Only admin and manager see the dashboard overview. */
export function canViewDashboard(role: AppRole | null): boolean {
  return hasPermission(role, "viewDashboard");
}

/**
 * Roles that may see price/financial values on listings.
 * sales, maintenance, cleaner, and staff must NEVER see prices.
 */
export function canViewPrices(role: AppRole | null): boolean {
  if (!role) return false;
  const NO_PRICE_ROLES: AppRole[] = ["sales", "maintenance", "cleaner", "staff"];
  return !NO_PRICE_ROLES.includes(role);
}

/** Finance pages (revenues, expenses) + reports: admin, accountant, manager (reports only). */
export function canViewFinance(role: AppRole | null): boolean {
  return hasPermission(role, "manageFinance") || hasPermission(role, "viewReports");
}

/** User/team management — admin only. */
export function canManageUsers(role: AppRole | null): boolean {
  return hasPermission(role, "manageUsers");
}

/**
 * Returns true for roles that can create new bookings.
 * admin, manager, sales only.
 */
export function canCreateBooking(role: AppRole | null): boolean {
  return hasPermission(role, "manageBookings") &&
    (role === "admin" || role === "manager" || role === "sales");
}

/**
 * Returns true for roles that see ALL tasks (not just their own).
 * maintenance, cleaner, and staff only see tasks assigned to them.
 */
export function canViewAllTasks(role: AppRole | null): boolean {
  if (!role) return false;
  return role === "admin" || role === "manager";
}

/** Default landing route after login, keyed by role. */
export function getDefaultRouteByRole(role: AppRole | null): string {
  if (role === "accountant") return "/revenues";
  if (role === "maintenance" || role === "cleaner" || role === "staff") return "/tasks";
  if (role === "sales") return "/listings";
  if (role === "admin" || role === "manager") return "/dashboard";
  return "/listings";
}
