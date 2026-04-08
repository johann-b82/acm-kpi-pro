import type { AuthUser } from "@acm-kpi/core";
import { useCallback, useEffect, useState } from "react";

interface AuthState {
  user: Omit<AuthUser, "userId"> | null;
  loading: boolean;
  error: string | null;
}

/**
 * Auth hook: fetches current user from /api/v1/auth/me.
 * Used by ProtectedRoute and Header components.
 * (AUTH-06: any 401 response redirects to /login)
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { credentials: "include" });
      if (res.status === 401) {
        setState({ user: null, loading: false, error: null });
        return;
      }
      if (!res.ok) {
        setState({ user: null, loading: false, error: "Server error" });
        return;
      }
      const user = (await res.json()) as Omit<AuthUser, "userId">;
      setState({ user, loading: false, error: null });
    } catch {
      setState({ user: null, loading: false, error: "Network error" });
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    setState({ user: null, loading: false, error: null });
    window.location.href = "/login";
  }, []);

  return { ...state, logout, refetch: checkAuth };
}
