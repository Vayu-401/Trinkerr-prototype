import type { ReactNode } from "react";
import type { VerificationStatus } from "../api/types";

const statusStyle: Record<VerificationStatus, { cls: string; text: string }> = {
  unverified: { cls: "bg-line text-ink", text: "Not submitted" },
  pending: { cls: "bg-marigold-soft text-marigold-deep", text: "Under review" },
  verified: { cls: "bg-sage-soft text-sage", text: "Verified" },
  rejected: { cls: "bg-brick-soft text-brick", text: "Rejected" },
};

export function StatusChip({ status }: { status: VerificationStatus }) {
  const s = statusStyle[status];
  return <span className={`chip ${s.cls}`}>{s.text}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="py-10 text-sm text-muted" role="status">
      {label}
    </p>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded border border-brick/20 bg-brick-soft px-4 py-3 text-sm text-brick">
      {children}
    </p>
  );
}

export function Pagination({
  page,
  count,
  pageSize = 20,
  onChange,
}: {
  page: number;
  count: number;
  pageSize?: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
      <button className="btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span className="num text-muted">
        Page {page} of {pages}
      </span>
      <button className="btn-secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "—";

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
