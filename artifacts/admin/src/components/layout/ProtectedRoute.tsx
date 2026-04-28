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
  const { loading, session, role, profileError, profileLoading, signOut } = useAuth();
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

  // Profile fetch failed — show user-friendly message
  if (profileError && !profileLoading) {
    const isNotFound =
      profileError === "User profile not found. Please contact admin." ||
      profileError.includes("PGRST116");
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h2 className="mb-2 text-lg font-semibold text-destructive">
            {isNotFound ? "Profile not found" : "Could not load profile"}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {isNotFound
              ? "User profile not found. Please contact admin."
              : profileError}
          </p>
          <button
            className="text-sm underline text-muted-foreground hover:text-foreground"
            onClick={() => signOut().then(() => setLocation("/login"))}
          >
            Sign out and try again
          </button>
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
