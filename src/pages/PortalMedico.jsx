
import React, { useState, useEffect } from "react";
import { User, Medico, Agendamento, Paciente } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, User as UserIcon, Calendar, Phone, CheckCircle, Users, FileText, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import ProtectedRoute from "../components/auth/ProtectedRoute";
import ProntuarioPaciente from "../components/medico/ProntuarioPaciente";

const statusColors = {
  "Pago": "bg-green-100 text-green-800 border-green-200",
  "Em Atendimento": "bg-yellow-100 text-yellow-800 border-yellow-200",
};

const prioridadeColors = {
  "Normal": "",
  "Idoso (60+ anos)": "bg-blue-50 border-l-4 border-l-blue-400",
  "Deficiente Físico": "bg-purple-50 border-l-4 border-l-purple-400",
  "Gestante": "bg-pink-50 border-l-4 border-l-pink-400",
  "Lactante": "bg-green-50 border-l-4 border-l-green-400",
  "Criança de Colo": "bg-orange-50 border-l-4 border-l-orange-400",
  "Pessoa com Criança de Colo": "bg-red-50 border-l-4 border-l-red-400"
};

const prioridadeIcons = {
  "Normal": null,
  "Idoso (60+ anos)": "🧓",
  "Deficiente Físico": "♿",
  "Gestante": "🤱",
  "Lactante": "🍼",
  "Criança de Colo": "👶",
  "Pessoa com Criança de Colo": "👨‍👶"
};

export default function PortalMedico() {
  const [medico, setMedico] = useState(null);
  const [agendamentos, setAgendamentos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [prontuarioAberto, setProntuarioAberto] = useState(false);
  const [pacienteAtendimento, setPacienteAtendimento] = useState(null);
  const [agendamentoAtendimento, setAgendamentoAtendimento] = useState(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const user = await User.me();
      setCurrentUser(user);
      
      console.log('👤 Usuário logado:', {
        id: user.id,
        email: user.email,
        nome: user.full_name,
        display_name: user.display_name
      });
      
      const medicos = await Medico.filter({ user_id: user.id });

      console.log('👨‍⚕️ Médicos encontrados para este usuário:', medicos.length);
      
      if (medicos.length === 0) {
        console.warn('⚠️ Nenhum médico associado a este usuário!');
        setMedico(null);
        setLoading(false);
        return;
      }
      
      const medicoAtual = medicos[0];
      console.log('✅ Médico selecionado:', {
        id: medicoAtual.id,
        nome: medicoAtual.nome,
        user_id: medicoAtual.user_id
      });
      
      setMedico(medicoAtual);

      const hoje = format(new Date(), "yyyy-MM-dd");
      
      const [agendamentosData, pacientesData] = await Promise.all([
        Agendamento.filter({ 
          medico_id: medicoAtual.id, 
          data_agendamento: hoje 
        }),
        Paciente.list()
      ]);

      const agendamentosValidos = Array.isArray(agendamentosData) ? agendamentosData : [];
      const pacientesValidos = Array.isArray(pacientesData) ? pacientesData : [];

      setAgendamentos(agendamentosValidos); 
      setPacientes(pacientesValidos);
    } catch (error) {
      console.error("Erro ao carregar dados do médico:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const getNomePaciente = (pacienteId) => {
    const paciente = pacientes.find(p => p.id === pacienteId);
    return paciente ? paciente.nome : "Carregando...";
  };

  const getTelefonePaciente = (pacienteId) => {
    const paciente = pacientes.find(p => p.id === pacienteId);
    return paciente ? paciente.telefone : "";
  };

  const chamarPaciente = async (agendamento) => {
    try {
      const paciente = pacientes.find(p => p.id === agendamento.paciente_id); 
      
      if (!paciente) {
          alert("Erro: Paciente não encontrado. Por favor, atualize a página.");
          return;
      }
      
      await Agendamento.update(agendamento.id, { 
        status: "Em Atendimento",
        data_inicio_atendimento: new Date().toISOString()
      });

      // NOVO: Criar chamada no banco de dados
      const { ChamadaPaciente } = await import('@/entities/all');
      await ChamadaPaciente.create({
        paciente_nome: paciente.nome,
        medico_nome: medico.nome,
        especialidade: medico.especialidade,
        horario: agendamento.horario,
        prioridade: paciente.prioridade || 'Normal',
        agendamento_id: agendamento.id,
        status: 'ativa'
      });

      console.log('📢 Chamada criada no banco de dados');

      setPacienteAtendimento(paciente);
      setAgendamentoAtendimento(agendamento);
      setProntuarioAberto(true);

      await carregarDados();
    } catch (error) {
      console.error("Erro ao chamar paciente:", error);
    }
  };

  const getPacienteInfo = (pacienteId) => {
    return pacientes.find(p => p.id === pacienteId) || {};
  };

  const handleFecharProntuario = () => {
    setProntuarioAberto(false);
    setPacienteAtendimento(null);
    setAgendamentoAtendimento(null);
  };

  const handleFinalizarConsulta = async () => {
    await carregarDados(); 
  };
  
  if (loading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }
  
  if (!medico) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-lg text-center shadow-lg">
              <CardHeader>
                  <CardTitle className="flex items-center justify-center gap-2 text-xl text-red-600">
                      <AlertCircle className="w-6 h-6" />
                      Associação de Médico Não Encontrada
                  </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <p>
                      O usuário com o qual você está logado não está associado a nenhum perfil de médico no sistema.
                  </p>
                  {currentUser && (
                      <div className="bg-gray-100 p-3 rounded-md border text-sm">
                          <p>
                              Você está logado com o e-mail: <strong className="text-gray-800">{currentUser.email}</strong>
                          </p>
                      </div>
                  )}
                  <div className="bg-blue-50 p-4 rounded-md border border-blue-200 text-left">
                      <h4 className="font-semibold text-blue-800 mb-2">Como corrigir:</h4>
                      <ol className="list-decimal list-inside space-y-1 text-blue-700 text-sm">
                          <li>Peça para um <strong>administrador</strong> acessar o sistema.</li>
                          <li>Navegue até <strong>Cadastros {'->'} Médicos</strong>.</li>
                          <li>Encontre o perfil do médico correto e clique em <strong>Editar</strong>.</li>
                          <li>No campo <strong>"Usuário do Sistema (Login)"</strong>, selecione o seu e-mail na lista.</li>
                          <li>Clique em <strong>Salvar</strong>.</li>
                      </ol>
                  </div>
              </CardContent>
          </Card>
      </div>
    );
  }

  const tipoAtendimento = medico.tipo_atendimento || "Horários Marcados";
  let agendamentosOrganizados = [];

  if (tipoAtendimento === "Ordem de Chegada") {
    agendamentosOrganizados = agendamentos.sort((a, b) => {
      if (a.status === "Em Atendimento" && b.status === "Em Atendimento") {
        return new Date(a.data_inicio_atendimento) - new Date(b.data_inicio_atendimento);
      }
      if (a.status === "Em Atendimento") return -1;
      if (b.status === "Em Atendimento") return 1;
      
      const pacienteA = getPacienteInfo(a.paciente_id);
      const pacienteB = getPacienteInfo(b.paciente_id);
      const prioridadeA = pacienteA.prioridade || 'Normal';
      const prioridadeB = pacienteB.prioridade || 'Normal';
      
      if (prioridadeA !== 'Normal' && prioridadeB === 'Normal') return -1;
      if (prioridadeA === 'Normal' && prioridadeB !== 'Normal') return 1;
      
      if (a.status === "Pago" && b.status !== "Pago") return -1;
      if (a.status !== "Pago" && b.status === "Pago") return 1;

      return a.horario.localeCompare(b.horario);
    });
  } else {
    agendamentosOrganizados = agendamentos.sort((a, b) => {
      const pacienteA = getPacienteInfo(a.paciente_id);
      const pacienteB = getPacienteInfo(b.paciente_id);
      const prioridadeA = pacienteA.prioridade || 'Normal';
      const prioridadeB = pacienteB.prioridade || 'Normal';
      
      if (prioridadeA !== 'Normal' && prioridadeB === 'Normal') return -1;
      if (prioridadeA === 'Normal' && prioridadeB !== 'Normal') return 1;
      
      return a.horario.localeCompare(b.horario);
    });
  }

  const pacientesAguardando = agendamentosOrganizados.filter(a => a.status === "Pago");
  const pacientesEmAtendimento = agendamentosOrganizados.filter(a => a.status === "Em Atendimento");
  const pacientesPrioritarios = pacientesAguardando.filter(a => {
    const paciente = getPacienteInfo(a.paciente_id);
    return paciente.prioridade && paciente.prioridade !== 'Normal';
  });

  return (
    <ProtectedRoute requiredRole="medico" fallbackMessage="Apenas médicos podem acessar este portal.">
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Portal do Médico</h1>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-gray-600">
                Dr(a). {medico.nome} • {medico.especialidade}
              </p>
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                {tipoAtendimento}
              </Badge>
              {pacientesPrioritarios.length > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                  ⭐ {pacientesPrioritarios.length} Prioritário(s)
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Hoje, {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Pacientes em Atendimento */}
            {pacientesEmAtendimento.length > 0 && (
              <Card className="shadow-lg border-yellow-200">
                <CardHeader className="border-b bg-yellow-50">
                  <CardTitle className="flex items-center gap-2 text-xl text-yellow-800">
                    <UserIcon className="w-5 h-5" />
                    Em Atendimento ({pacientesEmAtendimento.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {pacientesEmAtendimento.map((ag) => {
                      const pacienteInfo = getPacienteInfo(ag.paciente_id);
                      const prioridade = pacienteInfo.prioridade || 'Normal';
                      const icon = prioridadeIcons[prioridade];
                      
                      return (
                        <div 
                          key={ag.id} 
                          className={`p-4 border-2 border-yellow-300 rounded-lg bg-yellow-50 ${prioridadeColors[prioridade]}`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <Clock className="w-4 h-4 text-yellow-600" />
                                <span className="font-semibold text-lg text-yellow-800">{ag.horario}</span>
                                <Badge className={`${statusColors[ag.status]} border text-sm`}>
                                  {ag.status}
                                </Badge>
                                {prioridade !== 'Normal' && (
                                  <Badge className="bg-yellow-200 text-yellow-800 text-xs">
                                    {icon} {prioridade}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-lg font-medium text-yellow-900">
                                {getNomePaciente(ag.paciente_id)}
                              </p>
                              {getTelefonePaciente(ag.paciente_id) && (
                                <p className="text-sm text-yellow-700 mt-1">
                                  <Phone className="w-3 h-3 inline mr-1" />
                                  {getTelefonePaciente(ag.paciente_id)}
                                </p>
                              )}
                            </div>
                            <Button 
                              variant="outline"
                              className="bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                              onClick={() => {
                                setPacienteAtendimento(pacienteInfo);
                                setAgendamentoAtendimento(ag);
                                setProntuarioAberto(true);
                              }}
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              Prontuário
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pacientes Aguardando */}
            <Card className="shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Users className="w-5 h-5 text-green-600" />
                  {tipoAtendimento === "Ordem de Chegada" ? 
                    `Fila de Espera (${pacientesAguardando.length})` : 
                    `Agenda do Dia (${pacientesAguardando.length})`
                  }
                </CardTitle>
                <div className="flex flex-col gap-2 text-sm text-gray-600">
                  {tipoAtendimento === "Ordem de Chegada" && (
                    <p>Pacientes ordenados por prioridade e ordem de chegada</p>
                  )}
                  {pacientesPrioritarios.length > 0 && (
                    <p className="text-yellow-700 font-medium">
                      ⭐ Pacientes prioritários aparecem primeiro na lista
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {pacientesAguardando.length === 0 ? (
                  <div className="text-center py-16 text-gray-500">
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg">Nenhum paciente na fila de espera.</p>
                    <p className="text-sm">Pacientes aparecerão aqui após o check-in.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pacientesAguardando.map((ag, index) => {
                      const pacienteInfo = getPacienteInfo(ag.paciente_id);
                      const prioridade = pacienteInfo.prioridade || 'Normal';
                      const icon = prioridadeIcons[prioridade];
                      const isPrioritario = prioridade !== 'Normal';
                      
                      return (
                        <div 
                          key={ag.id} 
                          className={`p-4 border rounded-lg hover:shadow-md transition-shadow bg-white ${prioridadeColors[prioridade]} ${isPrioritario ? 'ring-2 ring-yellow-300' : ''}`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                {tipoAtendimento === "Ordem de Chegada" && (
                                  <div className={`${isPrioritario ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'} rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold`}>
                                    {index + 1}
                                  </div>
                                )}
                                <Clock className="w-4 h-4 text-gray-500" />
                                <span className="font-semibold text-lg text-gray-800">{ag.horario}</span>
                                <Badge className={`${statusColors[ag.status]} border text-sm`}>
                                  Check-in ✓
                                </Badge>
                                {isPrioritario && (
                                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
                                    {icon} PRIORITÁRIO
                                  </Badge>
                                )}
                              </div>
                              <p className="text-lg font-medium text-gray-900 ml-2">
                                {getNomePaciente(ag.paciente_id)}
                              </p>
                              {isPrioritario && (
                                <p className="text-sm text-yellow-700 ml-2 font-medium">
                                  {prioridade}
                                </p>
                              )}
                              {getTelefonePaciente(ag.paciente_id) && (
                                <p className="text-sm text-gray-600 ml-2 mt-1">
                                  <Phone className="w-3 h-3 inline mr-1" />
                                  {getTelefonePaciente(ag.paciente_id)}
                                </p>
                              )}
                            </div>
                            <Button 
                              onClick={() => chamarPaciente(ag)}
                              className={`${isPrioritario ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
                              size="lg"
                            >
                              {isPrioritario ? '⭐ Chamar Prioritário' : 'Chamar Paciente'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {(pacientesAguardando.length === 0 && pacientesEmAtendimento.length === 0) && (
            <Card className="shadow-lg mt-6">
              <CardContent className="p-8 text-center">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">Nenhum paciente no momento</h3>
                <p className="text-gray-600">
                  Os pacientes aparecerão aqui automaticamente após realizarem o check-in (pagamento).
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <ProntuarioPaciente
          paciente={pacienteAtendimento}
          agendamento={agendamentoAtendimento}
          medico={medico}
          aberto={prontuarioAberto}
          onFechar={handleFecharProntuario}
          onFinalizarConsulta={handleFinalizarConsulta}
        />
      </div>
    </ProtectedRoute>
  );
}
