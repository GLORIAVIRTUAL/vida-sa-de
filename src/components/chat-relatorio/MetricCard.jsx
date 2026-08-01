import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default function MetricCard({ titulo, valor, destaque }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-gray-500">{titulo}</p>
        <p className={`mt-2 text-3xl font-bold ${destaque || 'text-gray-900'}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}