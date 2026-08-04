import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareText, Loader2, Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import exportarRelatorioPdf from '@/components/chat-relatorio/exportarRelatorioPdf';
import MetricCard from '@/components/chat-relatorio/MetricCard';
import TagBarChart from '@/components/chat-relatorio/TagBarChart';
import AtendenteRanking from '@/components/chat-relatorio/AtendenteRanking';
import TagTable from '@/components/chat-relatorio/TagTable';

export default function RelatorioChat({ embedded = false }) {
  const { toast } = useToast();
  const [mes, setMes] = useState('2026-07');
  const mesesDisponiveis = Array.from({ length: 12 }, (_, indice) => {
    const valor = `2026-${String(indice + 1).padStart(2, '0')}`;
    const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long' })
      .format(new Date(2026, indice, 1));
    return { valor, nome: `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de 2026` };
  });
  const mesFormatado = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${mes}-01T12:00:00Z`));
  const { data, isLoading, error } = useQuery({
    queryKey: ['relatorio-chat', mes, 'conversas-unicas'],
    queryFn: async () => {
      const response = await base44.functions.invoke('relatorioChatMensal', { mes });
      return response.data;
    },
    staleTime: 300000
  });

  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (error) return <div className="p-6"><Alert variant="destructive"><AlertDescription>Não foi possível carregar o relatório: {error.message}</AlertDescription></Alert></div>;

  const handleExportar = () => {
    const abriu = exportarRelatorioPdf(data);
    toast({
      title: abriu ? 'Relatório preparado' : 'Pop-up bloqueado',
      description: abriu ? 'Escolha “Salvar como PDF” na tela de impressão.' : 'Permita pop-ups para exportar o relatório.'
    });
  };

  return (
    <div className={embedded ? "py-2" : "min-h-screen bg-gray-50 p-4 md:p-6"}>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-3 text-white"><MessageSquareText className="h-6 w-6" /></div>
            <div><h1 className="text-2xl font-bold text-gray-900">Relatório do Chat</h1><p className="text-sm text-gray-500">Dados de {mesFormatado}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="mes-relatorio" className="text-sm font-medium text-gray-700">Mês</label>
            <select
              id="mes-relatorio"
              value={mes}
              onChange={(event) => setMes(event.target.value)}
              className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              {mesesDisponiveis.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.nome}</option>
              ))}
            </select>
            <Button onClick={handleExportar} className="bg-blue-600 hover:bg-blue-700">
              <Download className="mr-2 h-4 w-4" />Exportar em PDF
            </Button>
          </div>
        </header>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard titulo="Conversas únicas no mês" valor={data.conversas} destaque="text-blue-600" />
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