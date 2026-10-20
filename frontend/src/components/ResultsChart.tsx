import { useEffect, useState } from "react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OptionResult } from "../api/types";

const MARIGOLD = "#E3A72F";
const TRACK = "#E6ECEE";
const FONT = '"Schibsted Grotesk", system-ui, sans-serif';

function useNarrow(breakpoint = 560) {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return narrow;
}

export function ResultsChart({ options }: { options: OptionResult[] }) {
  const narrow = useNarrow();
  const max = narrow ? 14 : 28;
  const data = options.map((o) => ({ ...o, label: o.text.length > max ? `${o.text.slice(0, max - 1)}…` : o.text }));
  return (
    <ResponsiveContainer width="100%" height={options.length * 46 + 16}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 52, top: 4, bottom: 4 }} barCategoryGap={10}>
        {/* Bars are measured against 100% of participants, so lengths match the labels. */}
        <XAxis type="number" hide domain={[0, 100]} />
        <YAxis
          type="category"
          dataKey="label"
          width={narrow ? 92 : 150}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#1B2A3A", fontSize: 14, fontFamily: FONT }}
        />
        <Tooltip
          cursor={{ fill: "rgba(27,42,58,0.04)" }}
          formatter={(_v: number, _n, p) => {
            const o = p.payload as OptionResult;
            return [`${o.selection_count} (${o.percentage}%)`, "Selections"];
          }}
          labelFormatter={(_l, payload) => (payload?.[0]?.payload as OptionResult | undefined)?.text ?? ""}
          contentStyle={{ borderRadius: 6, border: "1px solid #D7DFE2", fontFamily: FONT }}
          itemStyle={{ color: "#1B2A3A" }}
        />
        <Bar dataKey="percentage" fill={MARIGOLD} radius={3} background={{ fill: TRACK, radius: 3 }} isAnimationActive={false}>
          <LabelList
            dataKey="percentage"
            position="right"
            formatter={(v: number) => `${v}%`}
            style={{ fill: "#1B2A3A", fontWeight: 700, fontSize: 14, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Accessible text alternative for the chart (also what screen readers get). */
export function ResultsTable({ options }: { options: OptionResult[] }) {
  return (
    <table className="sr-only">
      <thead>
        <tr><th>Option</th><th>Selections</th><th>Percent of participants</th></tr>
      </thead>
      <tbody>
        {options.map((o) => (
          <tr key={o.id}><td>{o.text}</td><td>{o.selection_count}</td><td>{o.percentage}%</td></tr>
        ))}
      </tbody>
    </table>
  );
}
