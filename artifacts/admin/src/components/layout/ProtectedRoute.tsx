import { Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useEffect } from "react";
import type { ReactNode } from "react";
import type { Permission } from "@/lib/auth-context";
import { hasPermission } from "@/lib/auth-context";

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: Permission;
}

export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const { loading, session, role, profileError, profileLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !session) {
      setLocation("/login");
    }
  }, [loading, session, setLocation]);

  // Session check still in progress — show spinner (max 5s due to timeout in AuthProvider)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated — redirect handled by useEffect, render nothing here
  if (!session) {
    return null;
  }

  // Profile fetch failed — show the actual error so it's diagnosable
  if (profileError && !profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-lg w-full rounded-lg border border-destructive/40 bg-destructive/5 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h2 className="font-semibold text-destructive">Profile load error</h2>
              <p className="text-sm text-muted-foreground">
                You are authenticated but your profile could not be loaded. This usually means the
                profiles table or RLS policy is not set up correctly in Supabase.
              </p>
              <pre className="mt-2 rounded bg-muted px-3 py-2 text-xs text-foreground break-all whitespace-pre-wrap">
                {profileError}
              </pre>
              <p className="text-xs text-muted-foreground">
                Make sure you have run the full schema SQL in your Supabase SQL editor and that a
                row exists in <code>public.profiles</code> with your user ID.
              </p>
              <button
                className="mt-2 text-xs underline text-muted-foreground hover:text-foreground"
                onClick={() => setLocation("/login")}
              >
                Sign out and try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Profile is still loading — show a lightweight inline spinner but don't block
  // (role-gated pages will show "access denied" until profile resolves, which is acceptable)
  if (permission && !profileLoading && !hasPermission(role, permission)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You do not have permission to view this page. Please contact your administrator if you
            believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
