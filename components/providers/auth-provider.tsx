"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "@/lib/api";
import {
  getToken,
  setToken,
  clearToken,
  getUser,
  setUser as storeUser,
  type StoredUser,
} from "@/lib/auth/token";
import { canAccessCrm } from "@/lib/auth/permissions";

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  /** Resolved capability list from /auth/profile. `['*']` = Administrator. */
  permissions: string[];
  roleSlug?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  /** Returns true on success; false if credentials are bad OR the account lacks CRM capability. */
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Read the cached user synchronously so the first client render already has the
 * role + permissions. Skipped on the server (SSR gets `null`, matching hydration);
 * the useState initializer re-runs on client hydration with the localStorage
 * value, so the sidebar/topbar never flash "Guest".
 */
function readStoredUser(): User | null {
  const u = getUser<StoredUser>();
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatar: u.avatar,
    permissions: u.permissions ?? [],
    roleSlug: u.roleSlug ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(readStoredUser);
  // Only "loading" if we have a token but haven't re-validated with the server yet.
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !!getToken();
  });

  useEffect(() => {
    const token = getToken();

    if (token) {
      // We already hydrated `user` from localStorage in the initializer; re-validate
      // the token in the background and refresh the cached copy from /auth/profile.
      api.auth
        .profile()
        .then((profile) => {
          const perms = profile.permissions ?? [];
          if (!canAccessCrm(perms)) {
            // A valid login that lacks CRM capability — treat as logged out here.
            clearToken();
            setUserState(null);
            return;
          }
          const u: User = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            role: profile.role?.toLowerCase() || "viewer",
            avatar: profile.avatar,
            permissions: perms,
            roleSlug: profile.roleSlug ?? null,
          };
          setUserState(u);
          storeUser(u);
        })
        .catch(() => {
          clearToken();
          setUserState(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      clearToken();
      setUserState(null);
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = await api.auth.login(email, password);
      // Persist the token first so the follow-up profile call is authorized.
      setToken(result.accessToken);

      // Enrich with resolved permissions and ADMIT BY CAPABILITY.
      const profile = await api.auth.profile();
      const perms = profile.permissions ?? [];
      if (!canAccessCrm(perms)) {
        // Pure member/athlete/parent (empty perms) — reject.
        clearToken();
        setUserState(null);
        setIsLoading(false);
        return false;
      }

      const u: User = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role?.toLowerCase() || "viewer",
        avatar: profile.avatar,
        permissions: perms,
        roleSlug: profile.roleSlug ?? null,
      };
      // Persist BEFORE updating state so consumers that remount during navigation
      // (re-reading the useState initializer from localStorage) get the new user.
      storeUser(u);
      setUserState(u);
      setIsLoading(false);
      return true;
    } catch {
      clearToken();
      setUserState(null);
      setIsLoading(false);
      return false;
    }
  };

  const logout = () => {
    clearToken();
    setUserState(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
