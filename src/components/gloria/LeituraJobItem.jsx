import React from 'react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const CAMPOS = { especialidade: 'Especialidade', especialidade_no_cadastro: 'No cadastro', medico: 'Profissional', data: 'Data', hora: 'Hora', opcao: 'Opção' };

export default function LeituraJobItem({ job }) {
  const leitura = job.interpretacao || {};
  const campos = leitura.campos || {};
  const extras = Object.entries(CAMPOS).filter(([k]) => campos[k] !== null && campos[k] !== undefined && campos[k] !== '');
  return (
    <div className="border rounded-lg p-3 bg-white space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-gray-800">{job.remetente_nome || job.telefone_canonico}</span>
        <span>{format(new Date(job.created_date), 'dd/MM/yyyy HH:mm')}</span>
        <Badge variant="outline">{job.status}</Badge>
      </div>
      <p className="text-sm"><span className="text-gray-500">Cliente: </span>{job.texto || (job.media_tipo ? '[' + job.media_tipo + ']' : '—')}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Entendeu: {leitura.intencao || '—'}</Badge>
        {leitura.confirmacao && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Sim</Badge>}
        {leitura.negativa && <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Não</Badge>}
        <Badge variant="secondary">{job.estado_anterior || '—'} → {job.estado_novo || (job.status === 'Ignorado' ? 'humano' : '—')}</Badge>
        {extras.map(([k, rotulo]) => <Badge key={k} variant="outline">{rotulo}: {String(campos[k])}</Badge>)}
        {(campos.itens || []).length > 0 && <Badge variant="outline">Itens: {campos.itens.join(', ')}</Badge>}
      </div>
      {job.resposta_texto && <p className="text-sm whitespace-pre-wrap text-gray-700 bg-gray-50 rounded p-2"><span className="text-gray-500">Glória: </span>{job.resposta_texto}</p>}
      {['AGUARDANDO_HUMANO', 'ATENDIMENTO_HUMANO'].includes(job.erro) && <p className="text-xs text-amber-700">Conversa com atendente humano — a Glória não respondeu.</p>}
      {job.erro && !['AGUARDANDO_HUMANO', 'ATENDIMENTO_HUMANO'].includes(job.erro) && <p className="text-xs text-red-600">Erro: {job.erro}</p>}
    </div>
  );
}