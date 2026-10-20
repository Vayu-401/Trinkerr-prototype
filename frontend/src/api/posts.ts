import { api } from "./client";
import type { Paginated, Post } from "./types";

export const postsApi = {
  list: (page = 1, author?: string) =>
    api.get<Paginated<Post>>("/posts", { params: { page, author: author || undefined } }).then((r) => r.data),
  create: (body: { body: string; survey_id?: string | null; dashboard_share_id?: string | null }) =>
    api.post<Post>("/posts", body).then((r) => r.data),
  remove: (id: string) => api.delete(`/posts/${id}`),
};
