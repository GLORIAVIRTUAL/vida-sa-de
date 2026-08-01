import React from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TagBarChart({ tags }) {
  const principais = tags.slice(0, 12);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tags mais marcadas</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={principais} layout="vertical" margin={{ left: 20, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="nome" type="category" width={130} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(valor) => [valor, 'Pacientes']} />
              <Bar dataKey="quantidade" fill="#2563eb" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}