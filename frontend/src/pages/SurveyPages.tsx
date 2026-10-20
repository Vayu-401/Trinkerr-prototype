import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { surveysApi, type SurveyInput } from "../api/surveys";
import type { SurveyListItem, SurveyStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/Layout";
import SurveyBuilder from "../components/SurveyBuilder";
import type { SurveyForm } from "../components/surveySchema";
import { useToast } from "../components/Toast";
import { EmptyState, ErrorBox, Loading, Pagination, formatDate } from "../components/ui";

const toInput = (v: SurveyForm, publish: boolean): SurveyInput => ({
  title: v.title.trim(),
  description: v.description.trim(),
  publish,
  questions: v.questions.map((q) => ({ text: q.text.trim(), type: q.type, options: q.options.map((o) => ({ text: o.text.trim() })) })),
});

export function SurveyListPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const search = params.get("search") ?? "";
  const [draft, setDraft] = useState(search);
  const q = useQuery({
    queryKey: ["surveys", "list", page, search],
    queryFn: () => surveysApi.list(page, search),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="Open surveys"
        intro="Answer once per survey. After you answer, you can see how everyone else voted."
        actions={<Link to="/surveys/new" className="btn-primary">Create a survey</Link>}
      />
      <form
        className="mb-6 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(draft ? { search: draft } : {});
        }}
      >
        <label htmlFor="survey-search" className="sr-only">Search surveys</label>
        <input id="survey-search" className="input" placeholder="Search by title" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn-secondary">Search</button>
      </form>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox>{errorMessage(q.error)}</ErrorBox>
      ) : q.data!.results.length === 0 ? (
        <EmptyState title={search ? "No surveys match that search" : "No open surveys yet"}>
          {!search && <>Be the first: <Link to="/surveys/new" className="btn-link">create a survey</Link>.</>}
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {q.data!.results.map((s) => (
              <SurveyRow key={s.id} s={s} />
            ))}
          </ul>
          <Pagination page={page} count={q.data!.count} onChange={(p) => setParams({ ...(search ? { search } : {}), page: String(p) })} />
        </>
      )}
    </div>
  );
}

function SurveyRow({ s }: { s: SurveyListItem }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const own = user?.id === s.creator.id;
  const remove = useMutation({
    mutationFn: () => surveysApi.remove(s.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      toast.success("Survey deleted");
    },
    onError: (e) => toast.error(e),
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/surveys/${s.id}`} className="text-[17px] font-semibold hover:underline">{s.title}</Link>
          {s.has_responded && <span className="chip bg-sage-soft text-sage">Answered</span>}
        </div>
        {s.description && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{s.description}</p>}
        <p className="mt-1 text-sm text-muted">
          {s.question_count} {s.question_count === 1 ? "question" : "questions"}, by {own ? "you" : s.creator.name}, {formatDate(s.published_at)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {s.has_responded || own ? (
          <Link to={`/surveys/${s.id}/results`} className="btn-secondary">See results</Link>
        ) : (
          <Link to={`/surveys/${s.id}`} className="btn-primary">Answer</Link>
        )}
        {user?.role === "admin" && !own && (
          <button
            className="btn-danger"
            disabled={remove.isPending}
            onClick={() => window.confirm(`Delete "${s.title}" by ${s.creator.name}? Its responses are deleted too.`) && remove.mutate()}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

export function NewSurveyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (input: SurveyInput) => surveysApi.create(input),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      toast.success(s.status === "published" ? "Survey published" : "Draft saved");
      navigate(s.status === "published" ? `/surveys/${s.id}/results` : "/my/surveys");
    },
    onError: (e) => toast.error(e),
  });
  return (
    <div className="max-w-2xl">
      <PageHeader title="Create a survey" intro="Every verified investor will see it once it's published." />
      <SurveyBuilder busy={create.isPending} onSave={(v, publish) => create.mutate(toInput(v, publish))} />
    </div>
  );
}

export function EditSurveyPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["surveys", "detail", id], queryFn: () => surveysApi.get(id) });
  const save = useMutation({
    mutationFn: (input: SurveyInput) => surveysApi.update(id, input),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      toast.success(s.status === "published" ? "Survey published" : "Draft saved");
      navigate("/my/surveys");
    },
    onError: (e) => toast.error(e),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox>{errorMessage(q.error)}</ErrorBox>;
  const s = q.data!;
  if (s.status !== "draft") return <ErrorBox>Only drafts can be edited. This survey is {s.status}.</ErrorBox>;
  return (
    <div className="max-w-2xl">
      <PageHeader title="Edit draft" />
      <SurveyBuilder
        busy={save.isPending}
        initial={{
          title: s.title,
          description: s.description,
          questions: s.questions.map((qq) => ({ text: qq.text, type: qq.type, options: qq.options.map((o) => ({ text: o.text })) })),
        }}
        onSave={(v, publish) => save.mutate(toInput(v, publish))}
      />
    </div>
  );
}

const STATUS_CHIP: Record<SurveyStatus, string> = {
  draft: "bg-line text-ink",
  published: "bg-sage-soft text-sage",
  closed: "bg-ink/10 text-ink",
};
const STATUS_TEXT: Record<SurveyStatus, string> = { draft: "Draft", published: "Open", closed: "Closed" };

export function MySurveysPage() {
  const [page, setPage] = useState(1);
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["surveys", "mine", page], queryFn: () => surveysApi.mine(page), placeholderData: keepPreviousData });
  const done = (msg: string) => () => {
    qc.invalidateQueries({ queryKey: ["surveys"] });
    toast.success(msg);
  };
  const publish = useMutation({ mutationFn: surveysApi.publish, onSuccess: done("Survey published"), onError: (e) => toast.error(e) });
  const close = useMutation({ mutationFn: surveysApi.close, onSuccess: done("Survey closed"), onError: (e) => toast.error(e) });
  const remove = useMutation({ mutationFn: surveysApi.remove, onSuccess: done("Survey deleted"), onError: (e) => toast.error(e) });

  return (
    <div>
      <PageHeader title="My surveys" actions={<Link to="/surveys/new" className="btn-primary">Create a survey</Link>} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox>{errorMessage(q.error)}</ErrorBox>
      ) : q.data!.results.length === 0 ? (
        <EmptyState title="You haven't created a survey yet">
          Ask other verified investors a question. <Link to="/surveys/new" className="btn-link">Create a survey</Link>
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {q.data!.results.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`chip ${STATUS_CHIP[s.status]}`}>{STATUS_TEXT[s.status]}</span>
                    <span className="truncate font-semibold">{s.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {s.question_count} {s.question_count === 1 ? "question" : "questions"},{" "}
                    {s.status === "draft" ? `created ${formatDate(s.created_at)}` : `published ${formatDate(s.published_at)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.status === "draft" ? (
                    <>
                      <Link to={`/surveys/${s.id}/edit`} className="btn-secondary">Edit</Link>
                      <button className="btn-primary" disabled={publish.isPending} onClick={() => publish.mutate(s.id)}>Publish</button>
                    </>
                  ) : (
                    <Link to={`/surveys/${s.id}/results`} className="btn-secondary">Results</Link>
                  )}
                  {s.status === "published" && (
                    <button
                      className="btn-secondary"
                      disabled={close.isPending}
                      onClick={() => window.confirm("Close this survey? No one will be able to answer it after this.") && close.mutate(s.id)}
                    >
                      Close
                    </button>
                  )}
                  <button
                    className="btn-danger"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`Delete "${s.title}" and all its responses?`) && remove.mutate(s.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} count={q.data!.count} onChange={setPage} />
        </>
      )}
    </div>
  );
}
