import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import type { VerificationStatus } from "../api/types";
import { adminApi, docTypeLabel } from "../api/verification";
import { PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import { EmptyState, ErrorBox, Loading, Pagination, StatusChip, formatBytes, formatDate } from "../components/ui";

const FILTERS: { value: VerificationStatus | ""; label: string }[] = [
  { value: "pending", label: "Waiting for review" },
  { value: "", label: "All investors" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "unverified", label: "Not submitted" },
];

export function AdminInvestorsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "pending") as VerificationStatus | "";
  const page = Number(params.get("page") ?? 1);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const appliedSearch = params.get("search") ?? "";

  const q = useQuery({
    queryKey: ["admin", "investors", status, appliedSearch, page],
    queryFn: () => adminApi.investors({ status, search: appliedSearch, page }),
    placeholderData: keepPreviousData,
  });

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => p.set(k, v));
    if (!("page" in next)) p.set("page", "1");
    setParams(p);
  };

  return (
    <div>
      <PageHeader title="Investors" intro="Review uploaded documents and decide who can use surveys." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => update({ status: f.value })}
            aria-pressed={status === f.value}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              status === f.value ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink/40"
            }`}
          >
            {f.label}
          </button>
        ))}
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ search });
          }}
        >
          <label className="sr-only" htmlFor="investor-search">Search by name or email</label>
          <input
            id="investor-search"
            className="input w-56"
            placeholder="Name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-secondary">Search</button>
        </form>
      </div>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox>{errorMessage(q.error)}</ErrorBox>
      ) : q.data!.results.length === 0 ? (
        <EmptyState title={status === "pending" ? "No one is waiting for review" : "No investors match"}>
          {status === "pending" ? "New uploads will appear here." : "Try another filter or search term."}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Investor</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 text-right font-medium">Documents</th>
                  <th className="py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data!.results.map((i) => (
                  <tr key={i.id} className="hover:bg-surface">
                    <td className="py-3 pr-4">
                      <Link to={`/admin/investors/${i.id}`} className="font-semibold hover:underline">{i.name}</Link>
                      <div className="text-muted">{i.email}</div>
                    </td>
                    <td className="py-3 pr-4"><StatusChip status={i.verification_status} /></td>
                    <td className="num py-3 pr-4 text-right">{i.document_count}</td>
                    <td className="py-3">{formatDate(i.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={q.data!.count} onChange={(p) => update({ page: String(p) })} />
        </>
      )}
    </div>
  );
}

export function AdminInvestorDetailPage() {
  const { id = "" } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const q = useQuery({ queryKey: ["admin", "investor", id], queryFn: () => adminApi.investor(id) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
  };

  const decide = useMutation({
    mutationFn: (d: "approve" | "reject") => adminApi.decide(id, d, d === "reject" ? note : undefined),
    onSuccess: (inv) => {
      toast.success(inv.verification_status === "verified" ? "Investor approved" : "Investor rejected");
      setRejecting(false);
      setNote("");
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: () => adminApi.remove(id),
    onSuccess: () => {
      toast.success("Investor removed");
      refresh();
      navigate("/admin/investors");
    },
    onError: (e) => toast.error(e),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox>{errorMessage(q.error)}</ErrorBox>;
  const { investor, documents } = q.data!;
  const pending = investor.verification_status === "pending";

  return (
    <div className="max-w-3xl">
      <Link to="/admin/investors" className="btn-link">Back to investors</Link>
      <div className="mt-4">
        <PageHeader title={investor.name} intro={investor.email} actions={<StatusChip status={investor.verification_status} />} />
      </div>

      {investor.verification_status === "rejected" && investor.verification_note && (
        <p className="mb-6 border-l-4 border-brick bg-brick-soft/60 px-4 py-3 text-sm">
          <span className="font-semibold">Rejection note:</span> {investor.verification_note}
        </p>
      )}

      <h2>Documents</h2>
      <p className="mt-1 text-sm text-muted">Links open a private copy that expires two minutes after this page loaded.</p>
      {documents.length === 0 ? (
        <p className="mt-3 text-sm text-muted">This investor hasn't uploaded anything.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <div className="font-medium">{docTypeLabel(d.doc_type)}</div>
                <div className="text-sm text-muted">
                  {d.original_filename}, {formatBytes(d.size_bytes)}, {formatDate(d.uploaded_at)}
                </div>
              </div>
              <a className="btn-secondary" href={d.download_url} target="_blank" rel="noreferrer">
                Open document
              </a>
            </li>
          ))}
        </ul>
      )}
      <button className="btn-link mt-3" onClick={() => q.refetch()}>Refresh links</button>

      {pending && (
        <section className="panel mt-8 p-6">
          <h2>Decision</h2>
          {!rejecting ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="btn-primary"
                disabled={decide.isPending || documents.length === 0}
                onClick={() => decide.mutate("approve")}
              >
                Approve investor
              </button>
              <button className="btn-danger" onClick={() => setRejecting(true)}>Reject…</button>
            </div>
          ) : (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                decide.mutate("reject");
              }}
            >
              <label className="label" htmlFor="reject-note">Tell the investor what to fix</label>
              <textarea
                id="reject-note"
                className="input min-h-24"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="For example: the PAN card photo is blurry. Upload a clear scan."
                required
              />
              <div className="mt-3 flex gap-3">
                <button className="btn-danger" disabled={!note.trim() || decide.isPending}>Reject investor</button>
                <button type="button" className="btn-secondary" onClick={() => setRejecting(false)}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="mt-12 border-t border-line pt-6">
        <h3>Remove this investor</h3>
        <p className="mt-1 text-sm text-muted">Deletes their account, surveys, responses, posts and share links. This can't be undone.</p>
        <button
          className="btn-danger mt-3"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Remove ${investor.name} and everything they created?`)) remove.mutate();
          }}
        >
          Remove investor
        </button>
      </section>
    </div>
  );
}
