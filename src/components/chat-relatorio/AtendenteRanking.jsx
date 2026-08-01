import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AtendenteRanking({ atendentes, criterio }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tags por atendente</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {atendentes.length ? atendentes.map((item, index) => (
          <div key={item.nome} className="flex items-center gap-3 border-b pb-3 last:border-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{index + 1}</span>
            <span className="flex-1 font-medium">{item.nome}</span>
            <Badge className="bg-blue-600">{item.quantidade} tags</Badge>
          </div>
        )) : <p className="text-sm text-gray-500">Nenhum atendente identificado.</p>}
        <p className="pt-2 text-xs leading-relaxed text-gray-500">{criterio}</p>
      </CardContent>
    </Card>
  );
}