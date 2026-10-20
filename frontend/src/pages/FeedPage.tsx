import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api/client";
import { dashboardApi } from "../api/dashboard";
import { postsApi } from "../api/posts";
import { surveysApi } from "../api/surveys";
import type { Post } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import { EmptyState, ErrorBox, Loading, Pagination, formatDateTime } from "../components/ui";

const MAX = 2000;

function Composer() {
  const toast = useToast();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [surveyId, setSurveyId] = useState("");
  const [shareId, setShareId] = useState("");

  // Attachable: surveys you created that others can open, and your active share links.
  const mine = useQuery({ queryKey: ["surveys", "mine", 1], queryFn: () => surveysApi.mine(1) });
  const shares = useQuery({ queryKey: ["shares"], queryFn: dashboardApi.shares });
  const surveyOptions = (mine.data?.results ?? []).filter((s) => s.status !== "draft");
  const shareOptions = (shares.data?.results ?? []).filter((s) => s.is_active);

  const create = useMutation({
    mutationFn: () =>
      postsApi.create({ body: body.trim(), survey_id: surveyId || null, dashboard_share_id: shareId || null }),
    onSuccess: () => {
      setBody("");
      setSurveyId("");
      setShareId("");
      qc.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post published");
    },
    onError: (e) => toast.error(e),
  });

  const remaining = MAX - body.length;
  return (
    <form
      className="panel p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) create.mutate();
      }}
    >
      <label htmlFor="post-body" className="label">Share an opinion with other investors</label>
      <textarea
        id="post-body"
        className="input min-h-28"
        maxLength={MAX}
        placeholder="What are you seeing in the market?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="attach-survey">Attach one of your surveys</label>
          <select id="attach-survey" className="input" value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
            <option value="">None</option>
            {surveyOptions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="attach-share">Attach your dashboard link</label>
          <select id="attach-share" className="input" value={shareId} onChange={(e) => setShareId(e.target.value)} disabled={shareOptions.length === 0}>
            <option value="">{shareOptions.length ? "None" : "No active links. Create one on your dashboard."}</option>
            {shareOptions.map((s) => (
              <option key={s.id} value={s.id}>Link created {new Date(s.created_at).toLocaleDateString("en-IN")}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className={`num text-sm ${remaining < 100 ? "text-brick" : "text-muted"}`}>{remaining} characters left</span>
        <button className="btn-primary" disabled={!body.trim() || create.isPending}>
          {create.isPending ? "Publishing…" : "Publish post"}
        </button>
      </div>
    </form>
  );
}

function PostCard({ post }: { post: Post }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canDelete = user?.role === "admin" || user?.id === post.author.id;
  const remove = useMutation({
    mutationFn: () => postsApi.remove(post.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post deleted");
    },
    onError: (e) => toast.error(e),
  });
  return (
    <article className="py-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link to={`/?author=${post.author.id}`} className="font-semibold hover:underline">{post.author.name}</Link>
          <span className="ml-2 text-sm text-muted">{formatDateTime(post.created_at)}</span>
        </div>
        {canDelete && (
          <button
            className="btn-link text-sm text-brick decoration-brick/40"
            disabled={remove.isPending}
            onClick={() => window.confirm("Delete this post?") && remove.mutate()}
          >
            Delete{user?.id !== post.author.id && " as admin"}
          </button>
        )}
      </header>
      <p className="mt-2 whitespace-pre-wrap break-words">{post.body}</p>
      {(post.survey || post.dashboard_url) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.survey && (
            <Link to={`/surveys/${post.survey.id}`} className="rounded border border-line bg-surface px-3 py-1.5 text-sm hover:border-ink/40">
              Survey: <span className="font-semibold">{post.survey.title}</span>
            </Link>
          )}
          {post.dashboard_url && (
            <a href={post.dashboard_url} target="_blank" rel="noreferrer" className="rounded border border-marigold/50 bg-marigold-soft/40 px-3 py-1.5 text-sm font-semibold hover:border-marigold">
              View {post.author.name.split(" ")[0]}'s dashboard
            </a>
          )}
        </div>
      )}
    </article>
  );
}

export default function FeedPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const author = params.get("author") ?? "";
  const q = useQuery({
    queryKey: ["posts", page, author],
    queryFn: () => postsApi.list(page, author),
    placeholderData: keepPreviousData,
  });
  const authorName = author ? q.data?.results[0]?.author.name : undefined;

  return (
    <div className="max-w-2xl">
      <PageHeader title={author ? `Posts by ${authorName ?? "this investor"}` : "Investor feed"} />
      {author ? (
        <Link to="/" className="btn-link">Show everyone's posts</Link>
      ) : (
        <Composer />
      )}
      <div className="mt-8">
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <ErrorBox>{errorMessage(q.error)}</ErrorBox>
        ) : q.data!.results.length === 0 ? (
          <EmptyState title="No posts yet">Write the first one, or <Link to="/surveys" className="btn-link">answer a survey</Link>.</EmptyState>
        ) : (
          <>
            <div className="divide-y divide-line border-y border-line">
              {q.data!.results.map((p) => <PostCard key={p.id} post={p} />)}
            </div>
            <Pagination
              page={page}
              count={q.data!.count}
              onChange={(p) => setParams({ ...(author ? { author } : {}), page: String(p) })}
            />
          </>
        )}
      </div>
    </div>
  );
}
