import type { SurveyResults } from "../api/types";
import { ResultsChart, ResultsTable } from "./ResultsChart";

export function participantsLine(r: SurveyResults) {
  const n = r.participant_count.toLocaleString("en-IN");
  return r.participant_count === 1 ? "1 investor answered" : `${n} investors answered`;
}

/** One survey's aggregated results: participants, then a bar chart per question. */
export default function ResultsBody({ results, compact = false }: { results: SurveyResults; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-6" : "space-y-10"}>
      {results.questions.map((q, i) => (
        <section key={q.id} aria-labelledby={`rq-${q.id}`}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`rq-${q.id}`} className={compact ? "text-[15px]" : "text-lg"}>
              {results.questions.length > 1 && <span className="num mr-2 text-muted">Q{i + 1}</span>}
              {q.text}
            </h3>
            <span className="text-xs text-muted">
              {q.type === "multiple" ? "Select all that apply, so totals can pass 100%. Each bar is the % of participants who chose it." : "Pick one. Each bar is the % of participants."}
            </span>
          </div>
          {results.participant_count === 0 ? (
            <p className="rounded border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              No answers counted yet.
            </p>
          ) : (
            <>
              <ResultsChart options={q.options} />
              <ResultsTable options={q.options} />
            </>
          )}
        </section>
      ))}
    </div>
  );
}
