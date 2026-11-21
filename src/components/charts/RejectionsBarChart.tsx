'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type RejectionBar = { name: string; 'On hand': number; Rejected: number };

/** Rejections: on hand vs rejected per product. Loaded lazily (see ./lazy.tsx). */
export default function RejectionsBarChart({
  data,
  height,
  formatName,
}: {
  data: RejectionBar[];
  height: number;
  formatName: (name: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={formatName} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="On hand" fill="#6B3FA0" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Rejected" fill="#d32f2f" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
