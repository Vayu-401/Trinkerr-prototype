import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import type { Dashboard } from "../api/types";
import ResultsBody, { participantsLine } from "./ResultsCard";
import { formatDate } from "./ui";

const FONT = '"Schibsted Grotesk", system-ui, sans-serif';

function lastSixMonths(timeline: Dashboard["participation_timeline"]) {
  const byMonth = new Map(timeline.map((t) => [t.month.slice(0, 7), t.count]));
  const out: { label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), count: byMonth.get(key) ?? 0 });
  }
  return out;
}

/** Shared by the private /dashboard and the public /shared/:token page. */
export default function DashboardView({ data, linkSurveys }: { data: Dashboard; linkSurveys: boolean }) {
  const months = lastSixMonths(data.participation_timeline);
  return (
    <div className="space-y-12">
      <section className="grid gap-8 border-y border-line py-6 sm:grid-cols-[auto_auto_1fr] sm:items-end">
        <div className="pr-8 sm:border-r sm:border-line">
          <div className="num text-4xl font-bold">{data.surveys_created_count}</div>
          <div className="text-sm text-muted">{data.surveys_created_count === 1 ? "survey published" : "surveys published"}</div>
        </div>
        <div className="pr-8">
          <div className="num text-4xl font-bold">{data.surveys_participated_count}</div>
          <div className="text-sm text-muted">{data.surveys_participated_count === 1 ? "survey answered" : "surveys answered"}</div>
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-sm text-muted">Surveys answered, last six months</div>
          {months.every((m) => m.count === 0) ? (
            <p className="flex h-[90px] items-center text-sm text-muted">No surveys answered in the last six months.</p>
          ) : (
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={months} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#5F6F7C", fontSize: 12, fontFamily: FONT }} />
              <YAxis hide allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(27,42,58,0.04)" }}
                formatter={(v: number) => [v, "Answered"]}
                contentStyle={{ borderRadius: 6, border: "1px solid #D7DFE2", fontFamily: FONT }}
                itemStyle={{ color: "#1B2A3A" }}
              />
              <Bar dataKey="count" fill="#1B2A3A" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2>Results of surveys {linkSurveys ? "you" : data.owner_name.split(" ")[0]} published</h2>
        {data.created_surveys.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No published surveys yet.{" "}
            {linkSurveys && <Link to="/surveys/new" className="btn-link">Create a survey</Link>}
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {data.created_surveys.map((r) => (
              <article key={r.survey_id} className="panel p-6">
                <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg">
                    {linkSurveys ? <Link to={`/surveys/${r.survey_id}/results`} className="hover:underline">{r.title}</Link> : r.title}
                  </h3>
                  <span className="text-sm text-muted">
                    {participantsLine(r)}
                    {r.status === "closed" && ", closed"}
                  </span>
                </header>
                {r.pending_responses > 0 && (
                  <p className="mb-4 text-sm font-medium text-marigold-deep">
                    {r.pending_responses === 1 ? "1 response still processing" : `${r.pending_responses} responses still processing`}
                  </p>
                )}
                <ResultsBody results={r} compact />
              </article>
            ))}
          </div>
        )}
      </section>

      {data.history && (
        <section>
          <h2>Your poll history</h2>
          {data.history.length === 0 ? (
            <p className="mt-2 text-sm text-muted">You haven't answered a survey yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {data.history.map((h) => (
                <li key={h.survey_id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <Link to={`/surveys/${h.survey_id}/results`} className="font-medium hover:underline">{h.title}</Link>
                  <span className="text-sm text-muted">Answered {formatDate(h.submitted_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
