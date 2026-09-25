import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import LeituraJobItem from '@/components/gloria/LeituraJobItem';

export default function LeituraGloria() {
  const [busca, setBusca] = useState('');
  const { data: jobs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['leitura-gloria'],
    queryFn: () => base44.entities.GloriaJob.list('-created_date', 100)
  });
  const termo = busca.trim().toLowerCase();
  const filtrados = jobs.filter((j) => !termo ||
    [j.remetente_nome, j.telefone_canonico, j.texto].some((v) => String(v || '').toLowerCase().includes(termo)));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">O que a Glória entendeu</h1>
          <p className="text-sm text-gray-500">Últimas 100 mensagens: intenção entendida, etapa antes e depois, dados extraídos e resposta.</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>
      <Input placeholder="Buscar por nome, telefone ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : filtrados.length === 0 ? (
        <p className="text-center text-gray-500 py-12">Nenhuma mensagem encontrada.</p>
      ) : (
        <div className="space-y-3">{filtrados.map((job) => <LeituraJobItem key={job.id} job={job} />)}</div>
      )}
    </div>
  );
}