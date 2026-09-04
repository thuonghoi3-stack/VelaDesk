import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/lib/quant/types";
import { formatDateUtc, formatUsd } from "@/lib/utils";

type Props = {
  equity: EquityPoint[];
  buyHold?: EquityPoint[];
};

export function EquityChart({ equity, buyHold }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const bhMap = new Map(buyHold?.map((p) => [p.time, p.equity]));
  const data = equity.map((p) => ({
    t: p.time,
    strategy: p.equity,
    hold: bhMap.get(p.time),
  }));
  if (data.length === 0) {
    return <div className="rounded-lg bg-surface p-6 text-sm text-muted">Chưa có đường vốn.</div>;
  }
  if (!ready) {
    return <div className="h-56 w-full rounded-lg bg-surface md:h-64" />;
  }
  return (
    <div className="h-56 w-full rounded-lg bg-surface p-2 md:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d8d4cc" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#d8d4cc" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(232,230,225,0.06)" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v) => formatDateUtc(v).slice(2)}
            tick={{ fill: "#8b8d94", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(v) => formatUsd(v, 0)}
            tick={{ fill: "#8b8d94", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: "#1a1d24",
              border: "1px solid rgba(232,230,225,0.12)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v) => formatDateUtc(Number(v))}
            formatter={(value, name) => [formatUsd(Number(value)), name === "strategy" ? "Chiến lược" : "Buy & hold"]}
          />
          <Area type="monotone" dataKey="strategy" stroke="#d8d4cc" fill="url(#eq)" strokeWidth={1.5} />
          <Area type="monotone" dataKey="hold" stroke="#7a8799" fill="none" strokeWidth={1} strokeDasharray="4 4" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
