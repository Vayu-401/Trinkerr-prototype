import { api } from "./client";
import type { User } from "./types";

export interface Session {
  access: string;
  user: User;
}

export const authApi = {
  register: (body: { email: string; name: string; password: string }) =>
    api.post<Session>("/auth/register", body).then((r) => r.data),
  login: (body: { email: string; password: string }) => api.post<Session>("/auth/login", body).then((r) => r.data),
  logout: () => api.post("/auth/logout"),
  me: () => api.get<User>("/users/me").then((r) => r.data),
  deleteMe: (password: string) => api.delete("/users/me", { data: { password } }),
};
