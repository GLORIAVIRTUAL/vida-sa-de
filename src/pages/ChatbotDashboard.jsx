import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageCircle, 
  Users, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  Calendar,
  Phone,
  Activity
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ChatbotDashboard() {
  const [conversas, setConversas] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroData, setFiltroData] = useState('hoje');

  useEffect(() => {
    carregarDados();
  }, [filtroData]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      
      // Carregar conversas do chatbot
      const conversasList = await base44.agents.listConversations({
        agent_name: 'chatbot_agendamentos'
      });
      setConversas(Array.isArray(conversasList) ? conversasList : []);

      // Carregar agendamentos recentes
      const hoje = new Date();
      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - 7);
      
      const agendamentosList = await base44.entities.Agendamento.filter({
        data_agendamento: { $gte: format(inicioSemana, 'yyyy-MM-dd') }
      });
      setAgendamentos(Array.isArray(agendamentosList) ? agendamentosList : []);

      // Carregar pacientes
      const pacientesList = await base44.entities.Paciente.list();
      setPacientes(Array.isArray(pacientesList) ? pacientesList : []);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Estatísticas
  const totalConversas = conversas.length;
  const conversasAtivas = conversas.filter(c => c.messages?.length > 0).length;
  const totalMensagens = conversas.reduce((acc, c) => acc + (c.messages?.length || 0), 0);
  const mediaMensagens = totalConversas > 0 ? (totalMensagens / totalConversas).toFixed(1) : 0;

  // Conversas por data
  const conversasHoje = conversas.filter(c => {
    const criado = new Date(c.created_date);
    const hoje = new Date();
    return criado.toDateString() === hoje.toDateString();
  }).length;

  const conversasSemana = conversas.filter(c => {
    const criado = new Date(c.created_date);
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - 7);
    return criado >= inicioSemana;
  }).length;

  // Agendamentos via chatbot (pode ser identificado por metadados)
  const agendamentosViaChatbot = agendamentos.filter(a => 
    a.observacoes?.toLowerCase().includes('chatbot') || 
    a.observacoes?.toLowerCase().includes('whatsapp')
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-8 h-8 text-green-600" />
              Dashboard do Chatbot
            </h1>
            <p className="text-gray-600 mt-2">Análise de desempenho e métricas do assistente de IA</p>
          </div>
          <Button onClick={carregarDados} variant="outline">
            Atualizar
          </Button>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total de Conversas
              </CardTitle>
              <MessageCircle className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalConversas}</div>
              <p className="text-xs text-gray-500 mt-1">
                {conversasHoje} hoje
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Conversas Ativas
              </CardTitle>
              <Activity className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{conversasAtivas}</div>
              <p className="text-xs text-gray-500 mt-1">
                Com mensagens trocadas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total de Mensagens
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMensagens}</div>
              <p className="text-xs text-gray-500 mt-1">
                Média: {mediaMensagens} por conversa
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Agendamentos
              </CardTitle>
              <Calendar className="w-4 h-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{agendamentosViaChatbot}</div>
              <p className="text-xs text-gray-500 mt-1">
                Via chatbot esta semana
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="conversas" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="conversas">Conversas Recentes</TabsTrigger>
            <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
            <TabsTrigger value="metricas">Métricas</TabsTrigger>
          </TabsList>

          {/* Tab: Conversas Recentes */}
          <TabsContent value="conversas" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Últimas Conversas</CardTitle>
                <CardDescription>Histórico de interações com o chatbot</CardDescription>
              </CardHeader>
              <CardContent>
                {conversas.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>Nenhuma conversa registrada ainda</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {conversas.slice(0, 10).map((conversa) => (
                      <div 
                        key={conversa.id}
                        className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50 transition"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <p className="font-medium">
                              {conversa.metadata?.senderName || 'Cliente WhatsApp'}
                            </p>
                            <Badge variant="outline" className="ml-2">
                              {conversa.messages?.length || 0} msgs
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            {conversa.metadata?.phone || 'Sem telefone'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {conversa.created_date && format(new Date(conversa.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          Ver Chat
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Agendamentos */}
          <TabsContent value="agendamentos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agendamentos Recentes</CardTitle>
                <CardDescription>Consultas agendadas nos últimos 7 dias</CardDescription>
              </CardHeader>
              <CardContent>
                {agendamentos.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>Nenhum agendamento registrado</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {agendamentos.slice(0, 10).map((agendamento) => (
                      <div 
                        key={agendamento.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{agendamento.paciente_nome}</p>
                          <p className="text-sm text-gray-500">
                            {format(new Date(agendamento.data_agendamento), "dd/MM/yyyy")} às {agendamento.horario}
                          </p>
                          {agendamento.observacoes && (
                            <p className="text-xs text-gray-400 mt-1">
                              {agendamento.observacoes}
                            </p>
                          )}
                        </div>
                        <Badge 
                          className={
                            agendamento.status === 'Agendado' ? 'bg-blue-100 text-blue-800' :
                            agendamento.status === 'Confirmado' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {agendamento.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Métricas */}
          <TabsContent value="metricas" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Desempenho Semanal</CardTitle>
                  <CardDescription>Últimos 7 dias</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Conversas Iniciadas</span>
                      <span className="text-sm font-bold">{conversasSemana}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${(conversasSemana / totalConversas * 100) || 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Taxa de Resposta</span>
                      <span className="text-sm font-bold">
                        {totalConversas > 0 ? ((conversasAtivas / totalConversas) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${totalConversas > 0 ? (conversasAtivas / totalConversas * 100) : 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Agendamentos Criados</span>
                      <span className="text-sm font-bold">{agendamentosViaChatbot}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full" 
                        style={{ width: `${(agendamentosViaChatbot / 20 * 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Status das Conversas</CardTitle>
                  <CardDescription>Distribuição atual</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-medium">Ativas</span>
                    </div>
                    <span className="text-xl font-bold text-green-700">
                      {conversasAtivas}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-gray-600" />
                      <span className="font-medium">Sem Resposta</span>
                    </div>
                    <span className="text-xl font-bold text-gray-700">
                      {totalConversas - conversasAtivas}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span className="font-medium">Pacientes Únicos</span>
                    </div>
                    <span className="text-xl font-bold text-blue-700">
                      {pacientes.length}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}