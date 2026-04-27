import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[auth] failed to load profile", error);
      setProfile(null);
      return;
    }
    setProfile((data as UserProfile | null) ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        if (newSession?.user) {
          await loadProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
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
    try {
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
          url: SUPABASE_URL_FOR_DEBUG,
        });
        throw error;
      }
      // eslint-disable-next-line no-console
      console.info("[auth] signIn success", { userId: data.user?.id });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[auth] signIn threw", {
        name: (err as Error).name,
        message: (err as Error).message,
        url: SUPABASE_URL_FOR_DEBUG,
      });
      throw err;
    }
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
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [loading, session, profile, signIn, signUp, signOut, refreshProfile]
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
  manageBookings: ["admin", "manager"] as AppRole[],
  manageTasks: ["admin", "manager", "staff"] as AppRole[],
  manageFinance: ["admin", "manager", "accountant"] as AppRole[],
  manageUsers: ["admin"] as AppRole[],
  viewReports: ["admin", "manager", "accountant"] as AppRole[],
} as const;

export type Permission = keyof typeof ROLE_PERMISSIONS;

export function hasPermission(role: AppRole | null, perm: Permission) {
  if (!role) return false;
  return (ROLE_PERMISSIONS[perm] as readonly AppRole[]).includes(role);
}
