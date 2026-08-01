import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareText, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import MetricCard from '@/components/chat-relatorio/MetricCard';
import TagBarChart from '@/components/chat-relatorio/TagBarChart';
import AtendenteRanking from '@/components/chat-relatorio/AtendenteRanking';
import TagTable from '@/components/chat-relatorio/TagTable';

export default function RelatorioChat() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['relatorio-chat', '2026-07'],
    queryFn: async () => {
      const response = await base44.functions.invoke('relatorioChatMensal', { mes: '2026-07' });
      return response.data;
    },
    staleTime: 300000
  });

  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (error) return <div className="p-6"><Alert variant="destructive"><AlertDescription>Não foi possível carregar o relatório: {error.message}</AlertDescription></Alert></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600 p-3 text-white"><MessageSquareText className="h-6 w-6" /></div>
          <div><h1 className="text-2xl font-bold text-gray-900">Relatório do Chat</h1><p className="text-sm text-gray-500">Dados de julho de 2026</p></div>
        </header>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard titulo="Conversas no mês" valor={data.conversas} destaque="text-blue-600" />
          <MetricCard titulo="Pacientes com tags" valor={data.pacientes_com_tags} destaque="text-green-600" />
          <MetricCard titulo="Marcações de tags" valor={data.total_tags} destaque="text-purple-600" />
        </section>
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><TagBarChart tags={data.tags} /></div>
          <AtendenteRanking atendentes={data.atendentes} criterio={data.criterio_atendentes} />
        </section>
        <TagTable tags={data.tags} />
      </div>
    </div>
  );
}