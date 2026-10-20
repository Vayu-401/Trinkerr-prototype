import axios, { AxiosError } from "axios";

const baseURL = import.meta.env.VITE_API_URL;

// The access token lives only in memory, never in localStorage.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

export const api = axios.create({ baseURL, withCredentials: true });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

// One shared refresh promise so parallel 401s trigger a single refresh call.
let refreshing: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  refreshing ??= axios
    .post(`${baseURL}/auth/refresh`, null, { withCredentials: true })
    .then((r) => r.data.access as string)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as (typeof err.config & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes("/auth/");
    if (original && err.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        setAccessToken(token);
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        setAccessToken(null);
        if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  },
);

/** Turn any API error into one readable sentence for a toast or form. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as unknown;
    if (status === 429) return "Too many requests. Wait a minute and try again.";
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (typeof d.detail === "string") return d.detail;
      const first = Object.entries(d)[0];
      if (first) {
        const [field, value] = first;
        const text = Array.isArray(value) ? flatten(value) : String(value);
        return field === "non_field_errors" ? text : `${field.replace(/_/g, " ")}: ${text}`;
      }
    }
    if (Array.isArray(data)) return flatten(data);
    if (!err.response) return "Can't reach the server. Check your connection.";
  }
  return fallback;
}

function flatten(v: unknown[]): string {
  return v
    .map((x) => (typeof x === "string" ? x : typeof x === "object" && x ? Object.values(x).flat().join(" ") : String(x)))
    .join(" ");
}
