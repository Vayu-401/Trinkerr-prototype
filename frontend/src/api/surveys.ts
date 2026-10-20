import { api } from "./client";
import type { MyResponse, Paginated, QuestionType, SurveyDetail, SurveyListItem, SurveyResults } from "./types";

export interface SurveyInput {
  title: string;
  description: string;
  publish: boolean;
  questions: { text: string; type: QuestionType; options: { text: string }[] }[];
}

export const surveysApi = {
  list: (page = 1, search = "") =>
    api
      .get<Paginated<SurveyListItem>>("/surveys", { params: { page, search: search || undefined } })
      .then((r) => r.data),
  mine: (page = 1) => api.get<Paginated<SurveyListItem>>("/surveys/mine", { params: { page } }).then((r) => r.data),
  get: (id: string) => api.get<SurveyDetail>(`/surveys/${id}`).then((r) => r.data),
  create: (body: SurveyInput) => api.post<SurveyDetail>("/surveys", body).then((r) => r.data),
  update: (id: string, body: SurveyInput) => api.put<SurveyDetail>(`/surveys/${id}`, body).then((r) => r.data),
  publish: (id: string) => api.patch<SurveyDetail>(`/surveys/${id}/publish`).then((r) => r.data),
  close: (id: string) => api.patch<SurveyDetail>(`/surveys/${id}/close`).then((r) => r.data),
  remove: (id: string) => api.delete(`/surveys/${id}`),
  submit: (id: string, answers: { question_id: string; option_ids: string[] }[]) =>
    api.post<{ id: string; submitted_at: string }>(`/surveys/${id}/responses`, { answers }).then((r) => r.data),
  results: (id: string) => api.get<SurveyResults>(`/surveys/${id}/results`).then((r) => r.data),
  myResponses: (page = 1) => api.get<Paginated<MyResponse>>("/me/responses", { params: { page } }).then((r) => r.data),
};
