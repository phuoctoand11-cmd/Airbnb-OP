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
import { ROLE_PERMISSIONS, type Permission } from "./role-permissions";
export { ROLE_PERMISSIONS };
export type { Permission };

export interface EmployeeRow {
  id: string;
  profile_id: string | null;
  full_name: string | null;
  email: string | null;
  status: string;
  role: string | null;
  team_id: string | null;
}

interface AuthContextValue {
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  /** Set when login is blocked due to employee status; survives SIGNED_OUT event */
  blockError: string | null;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  employee: EmployeeRow | null;
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

// Statuses that block login
const BLOCKED_EMPLOYEE_STATUSES = ["inactive", "resigned", "terminated", "rejected"] as const;
// Statuses that explicitly allow login
const ALLOWED_EMPLOYEE_STATUSES = ["active", "probation", "candidate", "interviewing"] as const;

/** Single source of truth: fetch employee row by profile_id from the employees table. */
async function getCurrentEmployee(userId: string): Promise<EmployeeRow | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, profile_id, full_name, email, status, role, team_id")
    .eq("profile_id", userId)
    .maybeSingle();

  // eslint-disable-next-line no-console
  console.info("[auth] getCurrentEmployee result", {
    userId,
    employee: data
      ? { id: data.id, profile_id: data.profile_id, email: data.email, status: data.status }
      : null,
    error: error ? { message: error.message, code: error.code } : null,
  });

  if (error) return null;
  return (data as EmployeeRow | null) ?? null;
}

/** Clear all cached auth state from browser storage. */
function clearAuthStorage() {
  try {
    // Remove the Supabase session storage key
    localStorage.removeItem("airbnb-ops-admin-auth");
    // Remove any other auth-related cached keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {
    // ignore storage errors
  }
}

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
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const mountedRef = useRef(true);

  const loadProfile = useCallback(async (userId: string) => {
    // eslint-disable-next-line no-console
    console.info("[auth] loadProfile start", { userId });
    setProfileLoading(true);
    setProfileError(null);

    try {
      // ── Step 1: Fetch profile ───────────────────────────────────────────
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
      console.info("[auth] profile result", {
        userId,
        email: (data as { email?: string } | null)?.email ?? null,
        role: (data as { role?: { name?: string } | null } | null)?.role?.name ?? null,
        error: error ? { message: error.message, code: error.code } : null,
      });

      if (error) {
        if (error.code === "PGRST116") {
          setProfileError("User profile not found. Please contact admin.");
          setProfile(null);
          setEmployee(null);
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[auth] profile query error", {
          message: error.message,
          code: error.code,
        });
        setProfileError(error.message);
        setProfile(null);
        setEmployee(null);
        return;
      }

      if (!data) {
        setProfileError("User profile not found. Please contact admin.");
        setProfile(null);
        setEmployee(null);
        return;
      }

      setProfileError(null);

      const rawRole = (data as { role?: { name?: string } | null })?.role?.name;
      const derivedRole = rawRole === "sale" ? "sales" : rawRole;

      // ── Step 2: Fetch employee row ──────────────────────────────────────
      // Admin bypasses the check entirely
      if (derivedRole === "admin") {
        // eslint-disable-next-line no-console
        console.info("[auth] employee check skipped — admin role", { userId });
        setEmployee(null);
        setBlockError(null);
        setProfile(data as UserProfile);
        return;
      }

      const empRow = await getCurrentEmployee(userId);
      if (!mountedRef.current) return;

      setEmployee(empRow);

      // eslint-disable-next-line no-console
      console.info("[auth] auth check summary", {
        userId,
        profileEmail: (data as { email?: string } | null)?.email ?? null,
        profileRole: derivedRole,
        employeeId: empRow?.id ?? null,
        employeeStatus: empRow?.status ?? null,
      });

      // ── Step 3: Enforce employee status ─────────────────────────────────
      if (!empRow) {
        // No linked employee — allow login with a soft warning
        setBlockError("Employee profile is not linked yet. Please ask your admin to link it.");
        setProfile(data as UserProfile);
        return;
      }

      const status = empRow.status as string;
      const isBlocked = (BLOCKED_EMPLOYEE_STATUSES as readonly string[]).includes(status);

      if (isBlocked) {
        // eslint-disable-next-line no-console
        console.warn("[auth] blocked — employee status is deactivated", { userId, status });
        await supabase.auth.signOut();
        clearAuthStorage();
        if (!mountedRef.current) return;
        setProfile(null);
        setEmployee(null);
        setBlockError("Your account has been deactivated. Please contact admin.");
        return;
      }

      // Active / probation / candidate / interviewing — allow
      setBlockError(null);
      setProfile(data as UserProfile);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "Unknown profile fetch error";
      // eslint-disable-next-line no-console
      console.error("[auth] loadProfile threw", msg);
      setProfileError(msg);
      setProfile(null);
      setEmployee(null);
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
        setLoading(false);

        if (data.session?.user) {
          loadProfile(data.session.user.id);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        // eslint-disable-next-line no-console
        console.error("[auth] init failed", err instanceof Error ? err.message : err);
        setLoading(false);
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
        setLoading(false);
        if (newSession?.user) {
          loadProfile(newSession.user.id);
        } else {
          setProfile(null);
          setEmployee(null);
          setProfileError(null);
          // blockError intentionally NOT cleared here — must survive forced sign-out
          // so the login page can display the deactivated message.
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
    clearAuthStorage();
    setProfile(null);
    setEmployee(null);
    setProfileError(null);
    setBlockError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  // Derive role from the nested role relation.
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
      employee,
      role,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [loading, profileLoading, profileError, blockError, session, profile, employee, role, signIn, signUp, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function hasPermission(role: AppRole | null, perm: Permission) {
  if (!role) return false;
  if (role === "admin") return true;
  return (ROLE_PERMISSIONS[perm] as readonly AppRole[]).includes(role);
}

export function canViewDashboard(role: AppRole | null): boolean {
  return hasPermission(role, "viewDashboard");
}

export function canViewPrices(role: AppRole | null): boolean {
  if (!role) return false;
  const NO_PRICE_ROLES: AppRole[] = ["sales", "maintenance", "cleaner", "cleaningstaff", "staff"];
  return !NO_PRICE_ROLES.includes(role);
}

export function canViewFinance(role: AppRole | null): boolean {
  return hasPermission(role, "manageFinance") || hasPermission(role, "viewReports");
}

export function canManageUsers(role: AppRole | null): boolean {
  return hasPermission(role, "manageUsers");
}

export function canCreateBooking(role: AppRole | null): boolean {
  return hasPermission(role, "manageBookings") &&
    (role === "admin" || role === "manager" || role === "sales");
}

export function canViewAllTasks(role: AppRole | null): boolean {
  if (!role) return false;
  return role === "admin" || role === "manager";
}

export function canCreateTask(role: AppRole | null): boolean {
  return role === "admin" || role === "manager";
}

export function canAssignTask(role: AppRole | null): boolean {
  return role === "admin" || role === "manager";
}

export function canViewTaskPhotos(role: AppRole | null): boolean {
  return hasPermission(role, "manageTasks");
}

export function canManageHR(role: AppRole | null): boolean {
  return hasPermission(role, "manageHR");
}

/** Only admin can see salary_base — manager uses employee_basic_view which omits it. */
export function canViewSalary(role: AppRole | null): boolean {
  return role === "admin";
}

export function getDefaultRouteByRole(role: AppRole | null): string {
  if (role === "accountant") return "/revenues";
  if (role === "maintenance" || role === "cleaner" || role === "cleaningstaff" || role === "staff") return "/tasks";
  if (role === "sales") return "/listings";
  if (role === "admin" || role === "manager") return "/dashboard";
  return "/listings";
}

