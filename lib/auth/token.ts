"use client";

// ─── CRM token + user storage ────────────────────────────────────────────────
//
// Distinct keys so the three Vision7 frontends never collide on *.vision7.sa:
//   site/admin → vision7_admin_token   ·   platform → vision7_token
//   crm        → vision7_crm_token
//
// The token is ALSO mirrored into a non-HttpOnly cookie of the same name so the
// edge middleware (which cannot read localStorage) can guard routes. The cookie
// is purely a presence signal for redirects — the backend still enforces auth on
// every request via the Authorization header.

export const TOKEN_KEY = "vision7_crm_token";
export const USER_KEY = "vision7_crm_user";

const COOKIE_NAME = "vision7_crm_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function setCookie(value: string): void {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

function clearCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

// ─── Token ────────────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  setCookie(token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearCookie();
}

// ─── User ───────────────────────────────────────────────────────────────────

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  permissions?: string[];
  roleSlug?: string | null;
}

export function getUser<T = StoredUser>(): T | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setUser(user: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}
