"use client";

// Typed API client for the Vision7 CRM control plane.
// Talks to the shared NestJS backend (https://api.vision7.sa) over JWT Bearer.
// Mirrors platform/lib/api.ts (apiFetch<T> + envelope unwrap + qs + uploadFile)
// and reproduces the resource surface of site/src/lib/admin-api.js as a typed `api`.

import { getToken, clearToken, TOKEN_KEY, USER_KEY } from "@/lib/auth/token";

// Tolerate env values with or without the /api suffix (some deployments set
// NEXT_PUBLIC_API_URL=https://api.vision7.sa instead of .../api).
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.vision7.sa/api";
const API_URL = RAW_API_URL.replace(/\/+$/, "").replace(/\/api$/, "") + "/api";

export { TOKEN_KEY, USER_KEY };

// ─── Core fetcher ───────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `API error: ${res.status}`);
  }

  const json: ApiEnvelope<T> = await res.json();
  return json.data;
}

// ─── Helper: build query string ─────────────────────────────────────────────────

function qs(params?: Record<string, unknown>): string {
  const filtered = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (filtered.length === 0) return "";
  return "?" + filtered.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

// ─── Shared response shapes ──────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatar?: string;
    athleteId?: string | null;
  };
}

export interface ProfileResult {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  athleteId?: string | null;
  /** Resolved by the JWT strategy / resolvePermissions(). `['*']` = Administrator. */
  permissions: string[];
  roleSlug?: string | null;
}

export interface PresignResult {
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
  expiresIn: number;
  maxSize: number;
}

/**
 * Permission-aware dashboard bundle from GET /dashboard/overview. Every section
 * is optional — present only when the caller holds the matching dashboard:<card>
 * permission. `dashboard:revenue` → revenue, `:memberships` → memberships,
 * `:pipeline` → pipeline, `:bookings` → bookings, `:followups` → followups,
 * `:club` → club.
 */
export interface DashboardOverview {
  generatedAt: string;
  revenue?: {
    invoices: number;
    total: number;
    paid: number;
    outstanding: number;
    byStatus: { status: string; count: number; total: number; paid: number; outstanding: number }[];
  };
  memberships?: {
    byStatus: { status: string; count: number }[];
    active: number;
    expiringNext30Days: number;
  };
  pipeline?: {
    totalContacts: number;
    byStage: { stage: string; count: number }[];
    open: number;
  };
  bookings?: { total: number; last30Days: number };
  followups?: { overdue: number; today: number };
  club?: { teams: number; athletes: number; upcomingEvents: number };
}

type Params = Record<string, unknown>;

// ─── Typed API namespaces (surface mirrors admin-api.js) ──────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<LoginResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    profile: () => apiFetch<ProfileResult>("/auth/profile"),
  },

  plans: {
    list: (params?: Params) => apiFetch<any>(`/membership-plans${qs(params)}`),
    public: () => apiFetch<any>(`/membership-plans/public`),
    get: (id: string) => apiFetch<any>(`/membership-plans/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/membership-plans`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/membership-plans/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<any>(`/membership-plans/${id}`, { method: "DELETE" }),
  },

  memberships: {
    list: (params?: Params) => apiFetch<any>(`/memberships${qs(params)}`),
    // Members directory grouped by person (one entry per person, memberships[] nested).
    listGrouped: (params?: Params) => apiFetch<any>(`/memberships/grouped${qs(params)}`),
    get: (id: string) => apiFetch<any>(`/memberships/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/memberships`, { method: "POST", body: JSON.stringify(data) }),
    // Assign a membership AND bill for it (membership PENDING + invoice; payNow
    // records payment and activates, else issued/owed until paid). Returns { membership, invoice }.
    assign: (data: any) =>
      apiFetch<any>(`/invoices/assign-membership`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/memberships/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<any>(`/memberships/${id}`, { method: "DELETE" }),
    currentForAthlete: (athleteId: string) =>
      apiFetch<any>(`/memberships/athletes/${athleteId}/current`),
    // Temporary freeze: auto-extends endDate by freezeDays.
    freeze: (id: string, data: { freezeDays: number; freezeStartDate?: string }) =>
      apiFetch<any>(`/memberships/${id}/freeze`, { method: "POST", body: JSON.stringify(data) }),
    unfreeze: (id: string) => apiFetch<any>(`/memberships/${id}/unfreeze`, { method: "POST" }),
    // Session packs: delta -1 = use a session, +1 = restore one.
    useSession: (id: string, delta = -1) =>
      apiFetch<any>(`/memberships/${id}/use-session`, { method: "POST", body: JSON.stringify({ delta }) }),
  },

  invoices: {
    list: (params?: Params) => apiFetch<any>(`/invoices${qs(params)}`),
    get: (id: string) => apiFetch<any>(`/invoices/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/invoices`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<any>(`/invoices/${id}`, { method: "DELETE" }),
    send: (id: string) => apiFetch<any>(`/invoices/${id}/send`, { method: "POST" }),
    // Force a (re-)push of this invoice to Zoho Books. Returns { zohoInvoiceId }.
    pushZoho: (id: string) =>
      apiFetch<{ zohoInvoiceId: string }>(`/invoices/${id}/zoho`, { method: "POST" }),
    cancel: (id: string) => apiFetch<any>(`/invoices/${id}/cancel`, { method: "POST" }),
    // Guided status change: SENT (issue, no email) / DRAFT (reopen) / CANCELLED.
    setStatus: (id: string, status: string) =>
      apiFetch<any>(`/invoices/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    // Mark fully paid — records the remaining balance as a payment.
    markPaid: (id: string, data?: { method?: string; reference?: string }) =>
      apiFetch<any>(`/invoices/${id}/mark-paid`, { method: "POST", body: JSON.stringify(data || {}) }),
    addPayment: (id: string, data: any) =>
      apiFetch<any>(`/invoices/${id}/payments`, { method: "POST", body: JSON.stringify(data) }),
    // Record a refund against an invoice (recomputes balance/status)
    refund: (id: string, data: { amount: number; method?: string; reason?: string }) =>
      apiFetch<any>(`/payments/${id}/refund`, { method: "POST", body: JSON.stringify(data) }),
    markOverdue: () => apiFetch<any>(`/invoices/mark-overdue`, { method: "POST" }),
    /**
     * Download the invoice PDF as a Blob and return an object URL. Caller is
     * responsible for URL.revokeObjectURL once done.
     */
    pdfBlobUrl: async (id: string): Promise<string> => {
      const token = getToken();
      const res = await fetch(`${API_URL}/invoices/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`PDF request failed: ${res.status}`);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
  },

  // Cross-invoice payments ledger (filters: method, invoiceId, isRefund, from, to)
  payments: {
    list: (params?: Params) => apiFetch<any>(`/payments${qs(params)}`),
    // BNPL/gateway availability — which providers have keys configured.
    // [{ provider:"tabby"|"tamara"|"telr", enabled:boolean }]. @Public route.
    providers: () =>
      apiFetch<Array<{ provider: "tabby" | "tamara" | "telr"; enabled: boolean }>>(
        `/payments/providers`,
      ),
    // Register this CRM's Tabby webhook URL + signing secret with Tabby.
    // Needs the Tabby secret key + merchant code configured. Returns { id, url }.
    registerTabbyWebhook: () =>
      apiFetch<{ id: string; url: string }>(`/payments/tabby/register-webhook`, { method: "POST" }),
  },

  accounting: {
    overview: () => apiFetch<any>(`/accounting/overview`),
    revenueByMonth: (year: number | string) =>
      apiFetch<any>(`/accounting/revenue-by-month${qs({ year })}`),
    topPlans: (limit?: number) => apiFetch<any>(`/accounting/top-plans${qs({ limit })}`),
    upcomingExpirations: (days?: number) =>
      apiFetch<any>(`/accounting/upcoming-expirations${qs({ days })}`),
  },

  athletes: {
    list: (params?: Params) => apiFetch<PaginatedResponse<any>>(`/athletes${qs(params)}`),
    get: (id: string) => apiFetch<any>(`/athletes/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/athletes`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/athletes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<any>(`/athletes/${id}`, { method: "DELETE" }),
    ensureContact: (id: string) =>
      apiFetch<any>(`/athletes/${id}/ensure-contact`, { method: "POST" }),
  },

  users: {
    list: (params?: Params) => apiFetch<PaginatedResponse<any>>(`/users${qs(params)}`),
    get: (id: string) => apiFetch<any>(`/users/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/users`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<any>(`/users/${id}`, { method: "DELETE" }),
    sendLogin: (id: string) => apiFetch<any>(`/users/${id}/send-login`, { method: "POST" }),
    /** Lightweight staff picker (id/name/role) — any authenticated staff, no users:view needed. */
    directory: (search?: string) => apiFetch<any[]>(`/users/directory${qs(search ? { search } : undefined)}`),
  },

  reports: {
    billing: (params?: Params) => apiFetch<any>(`/reports/billing${qs(params)}`),
    customers: (params?: Params) => apiFetch<any>(`/reports/customers${qs(params)}`),
    bookings: (params?: Params) => apiFetch<any>(`/reports/bookings${qs(params)}`),
    facilities: (params?: Params) => apiFetch<any>(`/reports/facilities${qs(params)}`),
    // Per-customer AR aging / statements
    statements: (params?: Params) => apiFetch<any>(`/reports/statements${qs(params)}`),
    // §control-plane — cross-app KPI bundle for the dashboard / single pane of glass
    overview: () => apiFetch<any>(`/reports/overview`),
  },

  // Permission-aware dashboard bundle: returns only the sections (cards) the
  // caller's dashboard:<card> permissions allow, so each role sees realistic
  // data instead of the all-or-nothing /reports/overview blob.
  dashboard: {
    overview: () => apiFetch<DashboardOverview>(`/dashboard/overview`),
  },

  // §control-plane — audit trail (role/user/settings changes)
  auditLogs: {
    list: (params?: Params) => apiFetch<any>(`/audit-logs${qs(params)}`),
  },

  // Tours — facility tour bookings + daily slot config.
  tours: {
    list: (params?: Params) => apiFetch<any>(`/tours${qs(params)}`),
    overview: () => apiFetch<any>(`/tours/overview`),
    get: (id: string) => apiFetch<any>(`/tours/${id}`),
    create: (data: any) => apiFetch<any>(`/tours`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch<any>(`/tours/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => apiFetch<any>(`/tours/${id}`, { method: "DELETE" }),
    convert: (id: string) => apiFetch<any>(`/tours/${id}/convert`, { method: "POST" }),
    availability: (date: string) => apiFetch<any>(`/tours/availability${qs({ date })}`),
    slots: () => apiFetch<any>(`/tours/slots`),
    createSlot: (data: any) => apiFetch<any>(`/tours/slots`, { method: "POST", body: JSON.stringify(data) }),
    updateSlot: (id: string, data: any) => apiFetch<any>(`/tours/slots/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteSlot: (id: string) => apiFetch<any>(`/tours/slots/${id}`, { method: "DELETE" }),
    getConfig: () => apiFetch<any>(`/tours/config`),
    updateConfig: (data: any) => apiFetch<any>(`/tours/config`, { method: "PATCH", body: JSON.stringify(data) }),
  },

  uploads: {
    presign: (data: {
      filename: string;
      contentType: string;
      category?: "image" | "pdf" | "video" | "file";
      folder?: string;
      size?: number;
    }) => apiFetch<PresignResult>(`/uploads/presign`, { method: "POST", body: JSON.stringify(data) }),
    /**
     * Convenience upload: presign → PUT to S3 → return the public URL only.
     * Mirrors admin-api.js `uploads.file` so ported site pages keep working.
     * For progress/metadata use the standalone `uploadFile` export below.
     */
    file: async (
      file: File,
      opts?: { category?: "image" | "pdf" | "video" | "file"; folder?: string },
    ): Promise<string> => {
      const { url } = await uploadFile(file, {
        category: opts?.category || "file",
        folder: opts?.folder || "members",
      });
      return url;
    },
  },

  crm: {
    overview: () => apiFetch<any>(`/crm/overview`),
    list: (params?: Params) => apiFetch<any>(`/crm/contacts${qs(params)}`),
    get: (id: string) => apiFetch<any>(`/crm/contacts/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/crm/contacts`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/crm/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<any>(`/crm/contacts/${id}`, { method: "DELETE" }),
    addActivity: (id: string, data: any) =>
      apiFetch<any>(`/crm/contacts/${id}/activities`, { method: "POST", body: JSON.stringify(data) }),
    deleteActivity: (id: string, activityId: string) =>
      apiFetch<any>(`/crm/contacts/${id}/activities/${activityId}`, { method: "DELETE" }),
    sendEmail: (id: string, data: any) =>
      apiFetch<any>(`/crm/contacts/${id}/emails`, { method: "POST", body: JSON.stringify(data) }),
    // Kanban / pipeline
    // No args → grouped initial load. With { stage } → that column's next page.
    board: (params?: { stage?: string; page?: number; limit?: number }) =>
      apiFetch<any>(`/crm/board${qs(params)}`),
    setStage: (id: string, stage: string, position?: number) =>
      apiFetch<any>(`/crm/contacts/${id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage, position }),
      }),
    reorderStage: (stage: string, orderedIds: string[]) =>
      apiFetch<any>(`/crm/board/reorder`, {
        method: "POST",
        body: JSON.stringify({ stage, orderedIds }),
      }),
    // Follow-ups
    listFollowUps: (params?: Params) => apiFetch<any>(`/crm/followups${qs(params)}`),
    createFollowUp: (id: string, data: any) =>
      apiFetch<any>(`/crm/contacts/${id}/followups`, { method: "POST", body: JSON.stringify(data) }),
    updateFollowUp: (id: string, data: any) =>
      apiFetch<any>(`/crm/followups/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteFollowUp: (id: string) =>
      apiFetch<any>(`/crm/followups/${id}`, { method: "DELETE" }),
    // Sales follow-up report + reminder digest trigger
    followUpReport: (params?: Params) => apiFetch<any>(`/crm/reports/followups${qs(params)}`),
    runFollowUpDigest: () => apiFetch<any>(`/crm/followups/run-digest`, { method: "POST" }),
    // Family members of a contact
    listFamily: (contactId: string) => apiFetch<any>(`/crm/contacts/${contactId}/family`),
    addFamily: (contactId: string, data: any) =>
      apiFetch<any>(`/crm/contacts/${contactId}/family`, { method: "POST", body: JSON.stringify(data) }),
    updateFamily: (id: string, data: any) =>
      apiFetch<any>(`/family/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteFamily: (id: string) => apiFetch<any>(`/family/${id}`, { method: "DELETE" }),
    // Deduplication — likely-duplicate groups (shared phone) + merge source→target
    duplicates: () => apiFetch<any>(`/crm/duplicates`),
    merge: (targetId: string, sourceId: string) =>
      apiFetch<any>(`/crm/contacts/${targetId}/merge`, { method: "POST", body: JSON.stringify({ sourceId }) }),
    // Enquiries inbox — list (status/q), staff-create, convert (dedups), archive
    enquiries: (params?: Params) => apiFetch<any>(`/crm/enquiries${qs(params)}`),
    createEnquiry: (data: any) =>
      apiFetch<any>(`/crm/enquiries`, { method: "POST", body: JSON.stringify(data) }),
    // Bulk import — dedups by email/phone against existing contacts + enquiries + within the file.
    importEnquiries: (data: { rows: any[] }) =>
      apiFetch<{ created: number; skipped: { row: number; reason: string }[]; totalRows: number }>(
        `/crm/enquiries/import`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    convertEnquiry: (id: string) =>
      apiFetch<any>(`/crm/enquiries/${id}/convert`, { method: "POST" }),
    updateEnquiry: (id: string, data: { status?: string }) =>
      apiFetch<any>(`/crm/enquiries/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },

  // Dynamic roles / permissions
  roles: {
    list: () => apiFetch<any>(`/roles`),
    permissions: () => apiFetch<any>(`/roles/permissions`),
    get: (id: string) => apiFetch<any>(`/roles/${id}`),
    create: (data: any) => apiFetch<any>(`/roles`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<any>(`/roles/${id}`, { method: "DELETE" }),
  },

  facilities: {
    list: () => apiFetch<any>(`/facilities`),
    public: () => apiFetch<any>(`/facilities/public`),
    create: (data: any) =>
      apiFetch<any>(`/facilities`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/facilities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<any>(`/facilities/${id}`, { method: "DELETE" }),
  },

  bookings: {
    list: (params?: Params) => apiFetch<any>(`/bookings${qs(params)}`),
    get: (id: string) => apiFetch<any>(`/bookings/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/bookings`, { method: "POST", body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      apiFetch<any>(`/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    delete: (id: string) => apiFetch<any>(`/bookings/${id}`, { method: "DELETE" }),
  },

  // ─── Card Access (card registry) ───────────────────────────────────────────
  // Vision7 records which card each person (staff or member) holds and ties it to
  // their membership status. Door permissions are configured directly in BioStar's
  // own software — not here. Gated by accesscontrol:view / accesscontrol:manage.
  accessControl: {
    // Searchable member picker (athletes + crm contacts + family who hold memberships).
    members: (params?: Params) => apiFetch<any>(`/access-control/members${qs(params)}`),
    // Full access detail for one subject: subject, membership gate, link, cards.
    member: (subjectKind: string, subjectId: string) =>
      apiFetch<any>(`/access-control/members/${subjectKind}/${subjectId}`),
    // Issue a card by entering its number manually (+ optional type). Records the
    // card + history and ties it to the subject's membership status.
    issueCard: (data: {
      subjectKind: string;
      subjectId: string;
      cardId: string;
      cardType?: string;
      displayCardId?: string;
    }) => apiFetch<any>(`/access-control/cards/issue`, { method: "POST", body: JSON.stringify(data) }),
    // Revoke a card (marks DISABLED locally + history).
    revokeCard: (id: string, data?: { note?: string }) =>
      apiFetch<any>(`/access-control/cards/${id}/revoke`, {
        method: "POST",
        body: JSON.stringify(data || {}),
      }),
    // Reassign a card to a different subject (moves the card + writes history).
    reassignCard: (id: string, data: { subjectKind: string; subjectId: string; note?: string }) =>
      apiFetch<any>(`/access-control/cards/${id}/reassign`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // App settings (admin-configurable key-value store)
  settings: {
    public: () => apiFetch<Record<string, string>>(`/settings/public`),
    list: () => apiFetch<Record<string, string>>(`/settings`),
    // §control-plane — typed settings catalog (namespaced keys + metadata)
    catalog: () =>
      apiFetch<Array<{ key: string; label: string; group: string; type: string; public: boolean; secret: boolean }>>(
        `/settings/catalog`,
      ),
    set: (key: string, value: string) =>
      apiFetch<any>(`/settings/${key}`, { method: "PATCH", body: JSON.stringify({ value }) }),
    bulkSet: (data: Record<string, string>) =>
      apiFetch<Record<string, string>>(`/settings`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (key: string) => apiFetch<any>(`/settings/${key}`, { method: "DELETE" }),
  },
};

// ─── Upload helper: full pre-signed-URL flow with XHR progress ───────────────────
export async function uploadFile(
  file: File,
  options?: {
    category?: "image" | "pdf" | "video" | "file";
    folder?: string;
    onProgress?: (pct: number) => void;
  },
): Promise<{ url: string; fileKey: string; name: string; size: number; mimeType: string }> {
  const category = options?.category || "file";
  const folder = options?.folder || "uploads";

  // 1. Get pre-signed URL from backend
  const presign = await api.uploads.presign({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    category,
    folder,
    size: file.size,
  });

  // 2. Upload the file directly to S3 via PUT (with progress)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presign.uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options?.onProgress) {
        options.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });

  return {
    url: presign.publicUrl,
    fileKey: presign.fileKey,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}
