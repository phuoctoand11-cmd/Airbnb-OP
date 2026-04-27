import { Loader2 } from "lucide-react";
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
  const { loading, session, role } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !session) {
      setLocation("/login");
    }
  }, [loading, session, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect in useEffect
  }

  if (permission && !hasPermission(role, permission)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You do not have permission to view this page. Please contact your administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
