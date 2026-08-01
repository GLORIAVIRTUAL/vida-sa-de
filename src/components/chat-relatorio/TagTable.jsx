import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TagTable({ tags }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Quantidade por tag</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
          {tags.map((tag) => (
            <div key={tag.nome} className="flex items-center justify-between border-b py-2 text-sm">
              <span>{tag.nome}</span><strong>{tag.quantidade}</strong>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}