import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Loader2, RefreshCw, Search, Bell, CheckCircle, Clock, 
  XCircle, Eye, MessageCircle, Send, ChevronLeft, Bot, User
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  enviado: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Send },
  entregue: { label: 'Entregue', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  lido: { label: 'Lido', color: 'bg-purple-100 text-purple-700', icon: Eye },
  falhou: { label: 'Falhou', color: 'bg-red-100 text-red-700', icon: XCircle },
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;
  const Icon = config.icon;
  return (
    <Badge className={`${config.color} text-[10px] gap-1`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

function TipoBadge({ tipo }) {
  if (tipo === 'automatica') {
    return <Badge className="bg-indigo-100 text-indigo-700 text-[10px] gap-1"><Bot className="w-3 h-3" />Automática</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-700 text-[10px] gap-1"><User className="w-3 h-3" />Manual</Badge>;
}

function ConfirmacaoBadge({ confirmado }) {
  if (confirmado === true) {
    return <Badge className="bg-green-100 text-green-700 text-[10px] gap-1"><CheckCircle className="w-3 h-3" />Confirmou</Badge>;
  }
  if (confirmado === false) {
    return <Badge className="bg-orange-100 text-orange-700 text-[10px] gap-1"><Clock className="w-3 h-3" />Pendente</Badge>;
  }
  return <Badge className="bg-gray-100 text-gray-500 text-[10px]">-</Badge>;
}

export default function NotificacoesTab({ onAbrirChat }) {
  const [logs, setLogs] = useState([]);
  const [agendamentos, setAgendamentos] = useState({});
  const [loading, setLoading] = useState(true);
  const [filtroData, setFiltroData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroConfirmacao, setFiltroConfirmacao] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [notificacaoSelecionada, setNotificacaoSelecionada] = useState(null);

  const [allLogs, setAllLogs] = useState([]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Buscar TODOS os logs paginando de 500 em 500 para garantir contagens precisas
      let todosLogs = [];
      let offset = 0;
      const pageSize = 500;
      while (true) {
        const page = await base44.entities.NotificationLog.list('-created_date', pageSize, offset);
        todosLogs = todosLogs.concat(page);
        if (page.length < pageSize) break; // última página
        offset += pageSize;
      }
      setAllLogs(todosLogs);

      // Buscar TODOS os agendamentos paginando (para ter status correto de cada um)
      const agMap = {};
      let agOffset = 0;
      const agPageSize = 500;
      while (true) {
        const agPage = await base44.entities.Agendamento.list('-created_date', agPageSize, agOffset);
        agPage.forEach(ag => { agMap[ag.id] = ag; });
        if (agPage.length < agPageSize) break;
        agOffset += agPageSize;
      }
      
      console.log(`📊 NotificacoesTab: ${todosLogs.length} logs, ${Object.keys(agMap).length} agendamentos carregados`);
      
      setAgendamentos(agMap);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregarDados(); }, []);

  // Filtrar por data localmente (mais confiável)
  useEffect(() => {
    if (filtroData) {
      const filtered = allLogs.filter(l => {
        const dataLog = (l.timestamp_envio || l.created_date || '').substring(0, 10);
        return dataLog === filtroData;
      });
      setLogs(filtered);
    } else {
      setLogs(allLogs);
    }
  }, [filtroData, allLogs]);

  // Determinar tipo de notificação
  const getTipoNotificacao = (log) => {
    const msg = (log.mensagem_enviada || '').toLowerCase();
    if (msg.includes('[lembrete 24h]') || msg.includes('lembrar da sua consulta *amanhã')) return 'automatica';
    return 'manual';
  };



  // Filtrar logs (data já filtrada no backend, apenas filtros locais)
  const logsFiltrados = logs.filter(log => {
    // Filtro por status de entrega
    if (filtroStatus !== 'todos' && log.status_entrega !== filtroStatus) return false;

    // Filtro por tipo (manual/automática)
    if (filtroTipo !== 'todos') {
      const tipo = getTipoNotificacao(log);
      if (filtroTipo !== tipo) return false;
    }

    // Filtro por confirmação
    if (filtroConfirmacao !== 'todos') {
      const ag = agendamentos[log.agendamento_id];
      const confirmou = ag?.status === 'Confirmado';
      if (filtroConfirmacao === 'confirmado' && !confirmou) return false;
      if (filtroConfirmacao === 'pendente' && confirmou) return false;
    }

    // Filtro por busca
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      const nome = (log.paciente_nome || '').toLowerCase();
      const tel = (log.telefone_destino || '').toLowerCase();
      if (!nome.includes(termo) && !tel.includes(termo)) return false;
    }

    return true;
  });

  // Estatísticas calculadas sobre TODOS os logs (não filtrados por data)
  const hojeStr = useRef(format(new Date(), 'yyyy-MM-dd')).current;

  const stats = useMemo(() => {
    const total = allLogs.length;
    const hoje = allLogs.filter(l => {
      const dataLog = l.timestamp_envio || l.created_date || '';
      return dataLog.substring(0, 10) === hojeStr;
    }).length;
    // Contar como "confirmado" agendamentos que foram confirmados pelo paciente
    // Isso inclui status Confirmado, Pago, Em Atendimento e Finalizado
    // (pois após confirmar, o agendamento avança no fluxo)
    const statusConfirmados = ['Confirmado', 'Pago', 'Em Atendimento', 'Finalizado'];
    const confirmados = allLogs.filter(l => {
      const ag = agendamentos[l.agendamento_id];
      return ag && statusConfirmados.includes(ag.status);
    }).length;
    const falhou = allLogs.filter(l => l.status_entrega === 'falhou').length;
    const automaticas = allLogs.filter(l => getTipoNotificacao(l) === 'automatica').length;
    const manuais = total - automaticas;
    return { total, hoje, confirmados, falhou, automaticas, manuais };
  }, [allLogs, agendamentos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // Detalhe de uma notificação
  if (notificacaoSelecionada) {
    const log = notificacaoSelecionada;
    const ag = agendamentos[log.agendamento_id];
    const confirmou = ag?.status === 'Confirmado';

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setNotificacaoSelecionada(null)}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Detalhes da Notificação</span>
              <div className="flex gap-2">
                <TipoBadge tipo={getTipoNotificacao(log)} />
                <StatusBadge status={log.status_entrega} />
                <ConfirmacaoBadge confirmado={ag ? confirmou : null} />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Paciente</p>
                <p className="font-medium">{log.paciente_nome || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Telefone</p>
                <p className="font-medium">{log.telefone_destino}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Enviado em</p>
                <p className="font-medium">
                  {log.timestamp_envio 
                    ? format(new Date(log.timestamp_envio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : log.created_date 
                      ? format(new Date(log.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Canal</p>
                <p className="font-medium capitalize">{log.tipo_canal || 'whatsapp'}</p>
              </div>
              {ag && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Data da Consulta</p>
                    <p className="font-medium">
                      {format(new Date(ag.data_agendamento + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })} às {ag.horario}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status do Agendamento</p>
                    <Badge className={ag.status === 'Confirmado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                      {ag.status}
                    </Badge>
                  </div>
                </>
              )}
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">Mensagem Enviada</p>
              <div className="bg-gray-50 border rounded-lg p-4 text-sm whitespace-pre-wrap">
                {log.mensagem_enviada}
              </div>
            </div>

            {log.erro && (
              <div>
                <p className="text-xs text-red-500 mb-1">Erro</p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {log.erro}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onAbrirChat && onAbrirChat(log.telefone_destino, log.paciente_nome);
                }}
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                Abrir Conversa
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Estatísticas */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500">Total</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-blue-100 p-2 rounded-lg">
              <Bell className="w-4 h-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500">Automáticas</p>
              <p className="text-xl font-bold text-indigo-600">{stats.automaticas}</p>
            </div>
            <div className="bg-indigo-100 p-2 rounded-lg">
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500">Manuais</p>
              <p className="text-xl font-bold text-amber-600">{stats.manuais}</p>
            </div>
            <div className="bg-amber-100 p-2 rounded-lg">
              <User className="w-4 h-4 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500">Hoje</p>
              <p className="text-xl font-bold">{stats.hoje}</p>
            </div>
            <div className="bg-purple-100 p-2 rounded-lg">
              <Send className="w-4 h-4 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500">Confirmados</p>
              <p className="text-xl font-bold text-green-600">{stats.confirmados}</p>
            </div>
            <div className="bg-green-100 p-2 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500">Falhas</p>
              <p className="text-xl font-bold text-red-600">{stats.falhou}</p>
            </div>
            <div className="bg-red-100 p-2 rounded-lg">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Data</p>
              <Input
                type="date"
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Buscar</p>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Nome ou telefone..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-8 text-xs pl-7 w-48"
                />
              </div>
            </div>
            <div className="flex gap-1">
              {[
                { value: 'todos', label: 'Todos' },
                { value: 'enviado', label: 'Enviado' },
                { value: 'entregue', label: 'Entregue' },
                { value: 'lido', label: 'Lido' },
                { value: 'falhou', label: 'Falhou' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setFiltroStatus(f.value)}
                  className={`text-[10px] px-2 py-1 rounded-full border transition ${
                    filtroStatus === f.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[
                { value: 'todos', label: 'Todos' },
                { value: 'confirmado', label: '✅ Confirmou' },
                { value: 'pendente', label: '⏳ Pendente' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setFiltroConfirmacao(f.value)}
                  className={`text-[10px] px-2 py-1 rounded-full border transition ${
                    filtroConfirmacao === f.value
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[
                { value: 'todos', label: 'Todos' },
                { value: 'manual', label: '👤 Manual' },
                { value: 'automatica', label: '🤖 Automática' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setFiltroTipo(f.value)}
                  className={`text-[10px] px-2 py-1 rounded-full border transition ${
                    filtroTipo === f.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => carregarDados()} className="h-8">
              <RefreshCw className="w-3 h-3" />
            </Button>
            {filtroData && (
              <button onClick={() => setFiltroData('')} className="text-[10px] text-blue-600 hover:underline">
                Limpar data
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Notificações */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">
            Notificações ({logsFiltrados.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsFiltrados.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Nenhuma notificação encontrada</p>
            </div>
          ) : (
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {logsFiltrados.map((log) => {
                const ag = agendamentos[log.agendamento_id];
                const confirmou = ag?.status === 'Confirmado';

                return (
                  <button
                    key={log.id}
                    onClick={() => setNotificacaoSelecionada(log)}
                    className="w-full text-left p-3 hover:bg-gray-50 transition flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{log.paciente_nome || 'N/A'}</p>
                        <span className="text-[10px] text-gray-400">
                          {log.timestamp_envio 
                            ? format(new Date(log.timestamp_envio), 'dd/MM HH:mm', { locale: ptBR })
                            : log.created_date 
                              ? format(new Date(log.created_date), 'dd/MM HH:mm', { locale: ptBR })
                              : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {log.telefone_destino} • {(log.mensagem_enviada || '').substring(0, 60)}...
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <TipoBadge tipo={getTipoNotificacao(log)} />
                      <StatusBadge status={log.status_entrega} />
                      {ag && <ConfirmacaoBadge confirmado={confirmou} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}