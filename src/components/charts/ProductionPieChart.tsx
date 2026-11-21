'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export type PieSlice = { key: string; name: string; value: number; fill: string };

/** Dashboard: today's production by product type. Loaded lazily (see ./lazy.tsx). */
export default function ProductionPieChart({ slices, height }: { slices: PieSlice[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={slices} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={4}>
          {slices.map((s) => (
            <Cell key={s.key} fill={s.fill} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => [`${(v as number).toLocaleString()} pcs`, '']} />
      </PieChart>
    </ResponsiveContainer>
  );
}
