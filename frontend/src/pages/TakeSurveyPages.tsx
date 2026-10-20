import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { surveysApi } from "../api/surveys";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/Layout";
import ResultsBody, { participantsLine } from "../components/ResultsCard";
import { useToast } from "../components/Toast";
import { ErrorBox, Loading, formatDate, formatDateTime } from "../components/ui";

export function TakeSurveyPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [conflict, setConflict] = useState(false);

  const q = useQuery({ queryKey: ["surveys", "detail", id], queryFn: () => surveysApi.get(id) });

  const submit = useMutation({
    mutationFn: () =>
      surveysApi.submit(
        id,
        q.data!.questions.map((qq) => ({ question_id: qq.id, option_ids: picks[qq.id] ?? [] })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Response submitted");
      navigate(`/surveys/${id}/results`);
    },
    onError: (e) => {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        setConflict(true);
        toast.error("You have already responded to this survey");
      } else toast.error(e);
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox>{errorMessage(q.error)}</ErrorBox>;
  const s = q.data!;
  const own = s.creator.id === user?.id;

  if (s.has_responded || conflict) {
    return (
      <div className="max-w-2xl">
        <PageHeader title={s.title} intro="You've already answered this survey. Each investor answers once." />
        <Link to={`/surveys/${id}/results`} className="btn-primary">See results</Link>
      </div>
    );
  }
  if (s.status !== "published") {
    return (
      <div className="max-w-2xl">
        <PageHeader
          title={s.title}
          intro={s.status === "draft" ? "This is a draft. Publish it from My surveys before anyone can answer." : "This survey is closed to new answers."}
        />
        {(own || s.status === "closed") && <Link to={`/surveys/${id}/results`} className="btn-secondary">See results</Link>}
      </div>
    );
  }

  const answered = s.questions.filter((qq) => (picks[qq.id]?.length ?? 0) > 0).length;
  const complete = answered === s.questions.length;

  const toggle = (qid: string, oid: string, single: boolean) =>
    setPicks((p) => {
      const cur = p[qid] ?? [];
      if (single) return { ...p, [qid]: [oid] };
      return { ...p, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] };
    });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={s.title}
        intro={
          <>
            {s.description && <span className="block text-ink">{s.description}</span>}
            <span className="mt-1 block text-sm">By {own ? "you" : s.creator.name}, published {formatDate(s.published_at)}. You can answer once.</span>
          </>
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (complete) submit.mutate();
        }}
        className="space-y-6"
      >
        {s.questions.map((qq, i) => {
          const single = qq.type === "single";
          return (
            <fieldset key={qq.id} className="panel p-5">
              <legend className="sr-only">{qq.text}</legend>
              <div className="flex gap-3">
                <span className="num pt-0.5 text-sm font-semibold text-muted">Q{i + 1}</span>
                <div className="flex-1">
                  <p className="font-semibold" aria-hidden="true">{qq.text}</p>
                  <p className="text-sm text-muted">{single ? "Pick one" : "Select all that apply"}</p>
                  <div className="mt-3 grid gap-2">
                    {qq.options.map((o) => {
                      const checked = picks[qq.id]?.includes(o.id) ?? false;
                      return (
                        <label
                          key={o.id}
                          className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2.5 transition-colors ${
                            checked ? "border-ink bg-marigold-soft/50" : "border-line bg-surface hover:border-ink/40"
                          }`}
                        >
                          <input
                            type={single ? "radio" : "checkbox"}
                            name={qq.id}
                            checked={checked}
                            onChange={() => toggle(qq.id, o.id, single)}
                            className="h-4 w-4 accent-ink"
                          />
                          <span>{o.text}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </fieldset>
          );
        })}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-4 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur">
          <button className="btn-primary" disabled={!complete || submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit response"}
          </button>
          <span className="num text-sm text-muted">
            {complete ? "All questions answered" : `${answered} of ${s.questions.length} answered`}
          </span>
        </div>
      </form>
    </div>
  );
}

export function ResultsPage() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["surveys", "results", id],
    queryFn: () => surveysApi.results(id),
    // Keep polling while the worker is still counting new responses.
    refetchInterval: (query) => ((query.state.data?.pending_responses ?? 0) > 0 ? 3000 : false),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) {
    const status = axios.isAxiosError(q.error) ? q.error.response?.status : undefined;
    return (
      <div className="max-w-2xl">
        <ErrorBox>{errorMessage(q.error)}</ErrorBox>
        {status === 403 && <Link to={`/surveys/${id}`} className="btn-primary mt-4">Answer this survey</Link>}
      </div>
    );
  }
  const r = q.data!;
  return (
    <div>
      <Link to="/surveys" className="btn-link">All surveys</Link>
      <div className="mt-4">
        <PageHeader
          title={r.title}
          intro={
            <>
              <span className="text-ink">{participantsLine(r)}</span>
              {r.status === "closed" && <span>. This survey is closed.</span>}
              {r.stats_updated_at && <span className="block text-sm">Counts updated {formatDateTime(r.stats_updated_at)}</span>}
            </>
          }
        />
      </div>
      {r.pending_responses > 0 && (
        <p role="status" className="mb-6 inline-flex items-center gap-2 rounded bg-marigold-soft px-3 py-1.5 text-sm font-medium text-marigold-deep">
          <span className="h-2 w-2 animate-pulse rounded-full bg-marigold-deep" aria-hidden="true" />
          {r.pending_responses === 1 ? "1 response is still being counted" : `${r.pending_responses} responses are still being counted`}
        </p>
      )}
      <ResultsBody results={r} />
    </div>
  );
}
