import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { dashboardApi } from "../api/dashboard";
import DashboardView from "../components/DashboardView";
import { Logo, PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import { ErrorBox, Loading, formatDate, formatDateTime } from "../components/ui";

export function DashboardPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardApi.mine,
    refetchInterval: (query) =>
      query.state.data?.created_surveys.some((s) => s.pending_responses > 0) ? 4000 : false,
  });
  return (
    <div>
      <PageHeader title="Your dashboard" intro="Your activity and the results of surveys you published." />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorBox>{errorMessage(q.error)}</ErrorBox> : <DashboardView data={q.data!} linkSurveys />}
      <ShareManager />
    </div>
  );
}

const EXPIRY = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "", label: "Never" },
];

function ShareManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const [expiry, setExpiry] = useState("30");
  const q = useQuery({ queryKey: ["shares"], queryFn: dashboardApi.shares });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  };

  const create = useMutation({
    mutationFn: () => dashboardApi.createShare(expiry ? Number(expiry) : null),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["shares"] });
      toast.success("Share link created");
      copy(s.url);
    },
    onError: (e) => toast.error(e),
  });
  const revoke = useMutation({
    mutationFn: dashboardApi.revokeShare,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shares"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Link revoked. It stops working immediately.");
    },
    onError: (e) => toast.error(e),
  });

  const shares = q.data?.results ?? [];
  const active = shares.filter((s) => s.is_active);
  const inactive = shares.filter((s) => !s.is_active);

  return (
    <section className="mt-14 border-t border-line pt-8" aria-labelledby="share-heading">
      <h2 id="share-heading">Share your dashboard</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Anyone with the link sees your published survey results and activity counts. They don't see your email or which surveys you answered.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <label className="label" htmlFor="expiry">Link expires after</label>
          <select id="expiry" className="input w-40" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {EXPIRY.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={create.isPending}>Create share link</button>
      </form>

      {q.isLoading ? (
        <Loading />
      ) : active.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {active.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <input readOnly aria-label="Share link" className="input min-w-0 flex-1 font-normal text-muted" value={s.url} onFocus={(e) => e.target.select()} />
              <span className="text-sm text-muted">{s.expires_at ? `Expires ${formatDate(s.expires_at)}` : "No expiry"}</span>
              <button className="btn-secondary" onClick={() => copy(s.url)}>Copy</button>
              <button className="btn-danger" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>Revoke</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">No active links.</p>
      )}
      {inactive.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">{inactive.length} revoked or expired</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {inactive.map((s) => (
              <li key={s.id}>
                Created {formatDate(s.created_at)}, {s.revoked_at ? `revoked ${formatDate(s.revoked_at)}` : `expired ${formatDate(s.expires_at)}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function SharedDashboardPage() {
  const { token = "" } = useParams();
  const q = useQuery({ queryKey: ["shared", token], queryFn: () => dashboardApi.shared(token), retry: false });
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 md:px-10">
          <Logo />
          <Link to="/register" className="btn-link">Join as an investor</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-10">
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <div className="max-w-lg">
            <h1>This link doesn't work</h1>
            <p className="mt-2 text-muted">
              {errorMessage(q.error) === "Too many requests. Wait a minute and try again."
                ? errorMessage(q.error)
                : "It may have been revoked, expired, or copied incorrectly. Ask the person who shared it for a new link."}
            </p>
          </div>
        ) : (
          <>
            <PageHeader
              title={`${q.data!.owner_name}'s investor dashboard`}
              intro={`Shared view of aggregated poll results. Generated ${formatDateTime(q.data!.generated_at)}.`}
            />
            <DashboardView data={q.data!} linkSurveys={false} />
          </>
        )}
      </main>
    </div>
  );
}
