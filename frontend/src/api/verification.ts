import axios from "axios";
import { api } from "./client";
import type { AdminInvestor, MyVerification, Paginated, VerificationDocument, VerificationStatus } from "./types";

export const DOC_TYPES = [
  { value: "pan", label: "PAN card" },
  { value: "aadhaar", label: "Aadhaar card" },
  { value: "demat_statement", label: "Demat statement" },
  { value: "bank_statement", label: "Bank statement" },
  { value: "other", label: "Other" },
] as const;

export const docTypeLabel = (v: string) => DOC_TYPES.find((d) => d.value === v)?.label ?? v;

export const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_BYTES = 5 * 1024 * 1024;

export const verificationApi = {
  me: () => api.get<MyVerification>("/verification/me").then((r) => r.data),

  /** presigned POST -> direct browser upload to storage -> register metadata */
  async upload(file: File, docType: string) {
    const { data } = await api.post<{ upload: { url: string; fields: Record<string, string> }; storage_key: string }>(
      "/verification/upload-url",
      { doc_type: docType, filename: file.name, content_type: file.type, size_bytes: file.size },
    );
    const form = new FormData();
    Object.entries(data.upload.fields).forEach(([k, v]) => form.append(k, v));
    form.append("file", file); // must be last
    await axios.post(data.upload.url, form); // no credentials, straight to S3/MinIO
    return api
      .post<VerificationDocument>("/verification/documents", {
        storage_key: data.storage_key,
        doc_type: docType,
        original_filename: file.name,
      })
      .then((r) => r.data);
  },
};

export const adminApi = {
  investors: (params: { status?: VerificationStatus | ""; search?: string; page?: number }) =>
    api
      .get<Paginated<AdminInvestor>>("/admin/investors", {
        params: { status: params.status || undefined, search: params.search || undefined, page: params.page },
      })
      .then((r) => r.data),
  investor: (id: string) =>
    api
      .get<{ investor: AdminInvestor; documents: VerificationDocument[] }>(`/admin/investors/${id}/documents`)
      .then((r) => r.data),
  decide: (id: string, decision: "approve" | "reject", note?: string) =>
    api.patch<AdminInvestor>(`/admin/investors/${id}/verification`, { decision, note }).then((r) => r.data),
  remove: (id: string) => api.delete(`/admin/investors/${id}`),
};
