import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  Clock, 
  User, 
  Edit, 
  Trash2, 
  MessageSquare,
  Phone,
  CheckCircle,
  XCircle,
  AlertCircle,
  UserCog
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import EnviarNotificacao from './EnviarNotificacao';
import FormularioPaciente from '../pacientes/FormularioPaciente';
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

const statusColors = {
  "Agendado": "bg-blue-100 text-blue-800",
  "Confirmado": "bg-green-100 text-green-800",
  "Pago": "bg-teal-100 text-teal-800",
  "Em Atendimento": "bg-yellow-100 text-yellow-800",
  "Finalizado": "bg-emerald-100 text-emerald-800",
  "Cancelado": "bg-red-100 text-red-800",
  "Não Compareceu": "bg-gray-100 text-gray-800"
};

// statusIcons is no longer used for rendering directly inside the badge,
// but could be kept if needed for other logic. For now, it's not removed
// unless specified, but the Badge icon is removed per outline.
const statusIcons = {
  "Agendado": Clock,
  "Confirmado": CheckCircle,
  "Pago": CheckCircle,
  "Em Atendimento": AlertCircle,
  "Finalizado": CheckCircle,
  "Cancelado": XCircle,
  "Não Compareceu": XCircle
};

export default function ListaAgendamentos({
  agendamentos,
  medicos,
  pacientes,
  loading,
  onEditarAgendamento,
  onExcluirAgendamento,
  onAtualizarStatus
}) {
  const [notificacaoAberta, setNotificacaoAberta] = useState(false);
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null);
  const [pacienteSelecionado, setPacienteSelecionado] = useState(null);
  const [medicoSelecionado, setMedicoSelecionado] = useState(null);
  const [formularioPacienteAberto, setFormularioPacienteAberto] = useState(false);
  const [pacienteParaEditar, setPacienteParaEditar] = useState(null);
  const { toast } = useToast();

  const getNome = (obj, type) => {
    if (type === "medico") {
      const medico = medicos.find(m => m.id === obj.medico_id);
      return medico ? `Dr(a). ${medico.nome}` : "Médico não encontrado";
    }
    if (type === "paciente") {
      const paciente = pacientes.find(p => p.id === obj.paciente_id);
      return paciente ? paciente.nome : (obj.paciente_nome || "Paciente não encontrado");
    }
    return "";
  };

  const handleEnviarNotificacao = (agendamento) => {
    const paciente = pacientes.find(p => p.id === agendamento.paciente_id);
    const medico = medicos.find(m => m.id === agendamento.medico_id);
    
    if (!paciente || !medico) {
      alert('Dados do paciente ou médico não encontrados.');
      return;
    }

    setAgendamentoSelecionado(agendamento);
    setPacienteSelecionado(paciente);
    setMedicoSelecionado(medico);
    setNotificacaoAberta(true);
  };

  const handleFecharNotificacao = () => {
    setNotificacaoAberta(false);
    setAgendamentoSelecionado(null);
    setPacienteSelecionado(null);
    setMedicoSelecionado(null);
  };

  const normStr = (s) => s ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';

  const handleAbrirPaciente = async (pacienteId, agendamento) => {
    let paciente = null;
    
    // 1. Busca local por ID (instantânea)
    if (pacienteId) {
      paciente = pacientes.find((p) => p.id === pacienteId);
    }
    
    // 2. Busca local por nome normalizado (instantânea)
    const nomeBusca = agendamento?.paciente_nome;
    if (!paciente && nomeBusca) {
      const nomeNorm = normStr(nomeBusca);
      paciente = pacientes.find((p) => normStr(p.nome) === nomeNorm);
    }
    
    // 3. Fallback: buscar via backend por nome (rápido)
    if (!paciente && nomeBusca) {
      try {
        const response = await base44.functions.invoke('searchPatients', { termo: nomeBusca });
        const resultados = response?.data;
        if (Array.isArray(resultados) && resultados.length > 0) {
          const nomeNorm = normStr(nomeBusca);
          paciente = resultados.find(p => normStr(p.nome) === nomeNorm) || resultados[0];
        }
      } catch (error) {
        console.error('Erro ao buscar paciente via API:', error);
      }
    }
    
    if (paciente) {
      setPacienteParaEditar(paciente);
      setFormularioPacienteAberto(true);
    } else {
      toast({
        title: "Paciente não encontrado",
        description: "Não foi possível localizar o cadastro deste paciente.",
        variant: "destructive"
      });
    }
  };

  const handleSalvarPaciente = async (data) => {
    try {
      const { Paciente } = await import('@/entities/all');
      await Paciente.update(pacienteParaEditar.id, data);

      toast({
        title: "Paciente atualizado!",
        description: "Os dados do paciente foram salvos com sucesso."
      });

      setFormularioPacienteAberto(false);
      setPacienteParaEditar(null);
    } catch (error) {
      console.error("Erro ao salvar paciente:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar os dados do paciente.",
        variant: "destructive"
      });
      throw error;
    }
  };

  return (
    <>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Agendamentos ({agendamentos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : agendamentos.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Nenhum agendamento encontrado
              </h3>
              <p className="text-gray-500">
                Os agendamentos aparecerão aqui conforme forem sendo criados.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {agendamentos.map((agendamento) => {
                // const StatusIcon = statusIcons[agendamento.status] || Clock; // Removed as StatusIcon is no longer rendered inside Badge
                
                return (
                  <div
                    key={agendamento.id}
                    className="p-4 border rounded-lg hover:shadow-md transition-shadow bg-white"
                  >
                    <div className="flex flex-col lg:flex-row justify-between gap-4">
                      <div className="flex-1">
                        {/* New structure for time, status, and encaixe badge */}
                        <div className="flex items-center gap-3 mb-2">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span className="font-semibold text-lg">{agendamento.horario}</span>
                          <Badge className={`${statusColors[agendamento.status]} border`}>
                            {agendamento.status}
                          </Badge>
                          {agendamento.is_encaixe && (
                            <Badge className="bg-orange-100 text-orange-700 border-orange-300">
                              🔄 Encaixe
                            </Badge>
                          )}
                        </div>
                        
                        {/* New structure for patient, doctor, service, date, value, and observations */}
                        <div className="space-y-1 ml-7">
                          <p className="flex items-center gap-2 text-sm">
                            <User className="w-4 h-4 text-gray-400" />
                            <button
                              onClick={() => handleAbrirPaciente(agendamento.paciente_id, agendamento)}
                              className="text-cyan-600 font-medium hover:text-blue-800 hover:underline cursor-pointer transition-colors"
                              title="Clique para editar o cadastro do paciente"
                            >
                              {getNome(agendamento, "paciente")}
                            </button>
                          </p>
                          <p className="text-sm text-gray-600">
                            {getNome(agendamento, "medico")} • {agendamento.tipo_servico}
                          </p>
                          <p className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {agendamento.data_agendamento ? format(new Date(agendamento.data_agendamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR }) : "Data não definida"}
                          </p>
                          {agendamento.valor_total > 0 && (
                            <p className="text-sm font-semibold text-green-600">
                              R$ {agendamento.valor_total.toFixed(2)}
                            </p>
                          )}
                          {agendamento.observacoes && (
                            <p className="text-xs text-gray-500">
                              📝 {agendamento.observacoes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAbrirPaciente(agendamento.paciente_id, agendamento)}
                        className="text-blue-600 hover:bg-blue-50"
                      >
                        <UserCog className="w-3 h-3 mr-1" />
                        Editar Paciente
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEditarAgendamento(agendamento)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEnviarNotificacao(agendamento)}
                        className="text-green-600 hover:bg-green-50"
                      >
                        <MessageSquare className="w-3 h-3 mr-1" />
                        Notificar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onExcluirAgendamento(agendamento)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <EnviarNotificacao
        agendamento={agendamentoSelecionado}
        paciente={pacienteSelecionado}
        medico={medicoSelecionado}
        aberto={notificacaoAberta}
        onFechar={handleFecharNotificacao}
      />

      {formularioPacienteAberto && pacienteParaEditar && (
        <FormularioPaciente
          paciente={pacienteParaEditar}
          onSalvar={handleSalvarPaciente}
          onCancelar={() => {
            setFormularioPacienteAberto(false);
            setPacienteParaEditar(null);
          }}
        />
      )}
    </>
  );
}