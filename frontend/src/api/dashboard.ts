import axios from "axios";
import { api } from "./client";
import type { Dashboard, DashboardShare, Paginated } from "./types";

export const dashboardApi = {
  mine: () => api.get<Dashboard>("/me/dashboard").then((r) => r.data),
  shares: () => api.get<Paginated<DashboardShare>>("/me/dashboard/shares").then((r) => r.data),
  createShare: (expires_in_days: number | null) =>
    api.post<DashboardShare>("/me/dashboard/shares", { expires_in_days }).then((r) => r.data),
  revokeShare: (id: string) => api.delete(`/me/dashboard/shares/${id}`),
  // Public, no auth header and no cookies.
  shared: (token: string) =>
    axios.get<Dashboard>(`${import.meta.env.VITE_API_URL}/public/dashboards/${encodeURIComponent(token)}`).then((r) => r.data),
};
