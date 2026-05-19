import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User, CheckCircle, XCircle, ArrowUpCircle, DollarSign, FileText, Edit, MessageSquare, Repeat, Trash2, UserCog } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Agendamento, Paciente } from "@/entities/all";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { safeApiCall } from "@/components/shared/apiThrottle";
import { base44 } from "@/api/base44Client";
import EnviarNotificacao from './EnviarNotificacao';
import ConfirmacaoExclusao from '../shared/ConfirmacaoExclusao';
import { useToast } from "@/components/ui/use-toast";
import FormularioPaciente from '../pacientes/FormularioPaciente';

const statusColors = {
  "Agendado": "bg-sky-100 text-sky-700 border-sky-200",
  "Confirmado": "bg-green-200 text-green-700 border-green-300",
  "Pago": "bg-teal-100 text-teal-700 border-teal-200",
  "Em Atendimento": "bg-amber-100 text-amber-700 border-amber-200",
  "Finalizado": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Cancelado": "bg-red-100 text-red-700 border-red-200",
  "Não Compareceu": "bg-gray-200 text-gray-600 border-gray-300"
};

export default function VisualizacaoDiaria({ agendamentos, medicos, pacientes, onEditarAgendamento, loading, dia, onUpdate, periodo, buscaAtiva }) {
  const [atualizandoStatus, setAtualizandoStatus] = useState(null);
  const [notificacaoAberta, setNotificacaoAberta] = useState(false);
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null);
  const [confirmacaoExclusaoAberta, setConfirmacaoExclusaoAberta] = useState(false);
  const [agendamentoParaExcluir, setAgendamentoParaExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [formularioPacienteAberto, setFormularioPacienteAberto] = useState(false);
  const [pacienteParaEditar, setPacienteParaEditar] = useState(null);
  const { toast } = useToast();

  const getNomePaciente = (agendamento) => {
    if (!agendamento) return "Paciente não informado";
    const paciente = pacientes.find((p) => p.id === agendamento.paciente_id);
    if (paciente) return paciente.nome;
    return agendamento.paciente_nome || "Paciente não encontrado";
  };

  const normalizeString = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  };

  const getNomeMedico = (medicoId, observacoes) => {
    const medico = medicos.find((m) => m.id === medicoId);
    if (!medico) return "Médico não encontrado";
    
    // Se for odontologia, mostrar "Odontologia" como especialidade
    if (normalizeString(medico.especialidade) === 'ODONTOLOGIA') {
      return "Odontologia";
    }
    
    return `Dr(a). ${medico.nome}`;
  };

  const getDentistaDoAgendamento = (observacoes) => {
    if (!observacoes) return null;
    // Buscar padrão "Dentista: ..." nas observações
    const match = observacoes.match(/Dentista:\s*(.+?)(\n|$)/);
    if (match) {
      let dentista = match[1].trim();
      // Remover "Dr(a)." duplicado se já existir no início
      dentista = dentista.replace(/^Dr\(a\)\.\s*/i, '').replace(/^Dra?\.\s*/i, '');
      return dentista;
    }
    return null;
  };

  const atualizarStatus = async (agendamentoId, novoStatus) => {
    try {
      setAtualizandoStatus(agendamentoId);
      await safeApiCall(() =>
      Agendamento.update(agendamentoId, {
        status: novoStatus,
        ...(novoStatus === "Em Atendimento" && { data_inicio_atendimento: new Date().toISOString() }),
        ...(novoStatus === "Finalizado" && { data_fim_atendimento: new Date().toISOString() })
      })
      );
      onUpdate();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
    } finally {
      setAtualizandoStatus(null);
    }
  };

  const normStr = (s) => s ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';

  const handleAbrirPaciente = async (pacienteId, agendamento) => {
    let paciente = null;
    
    // 1. Busca local por ID (instantânea)
    if (pacienteId) {
      paciente = pacientes.find((p) => p.id === pacienteId);
    }
    
    // 2. Busca local por nome normalizado (instantânea, ignora acentos)
    if (!paciente && agendamento?.paciente_nome) {
      const nomeNorm = normStr(agendamento.paciente_nome);
      paciente = pacientes.find((p) => normStr(p.nome) === nomeNorm);
    }

    // Se encontrou localmente, abrir imediatamente
    if (paciente) {
      setPacienteParaEditar(paciente);
      setFormularioPacienteAberto(true);
      return;
    }
    
    // 3. Busca direta por ID via SDK (rápida)
    if (pacienteId) {
      try {
        const resultados = await Paciente.filter({ id: pacienteId });
        if (resultados.length > 0) {
          setPacienteParaEditar(resultados[0]);
          setFormularioPacienteAberto(true);
          return;
        }
      } catch (error) {
        console.error('Erro ao buscar paciente por ID:', error);
      }
    }
    
    // 4. Último recurso: abrir formulário para CRIAR novo paciente com o nome do agendamento
    if (agendamento?.paciente_nome) {
      setPacienteParaEditar({ nome: agendamento.paciente_nome, _isNew: true });
      setFormularioPacienteAberto(true);
      return;
    }
    
    toast({
      title: "Paciente não encontrado",
      description: "Não foi possível localizar o cadastro deste paciente.",
      variant: "destructive"
    });
  };

  const handleSalvarPaciente = async (data) => {
    try {
      if (pacienteParaEditar._isNew) {
        // Criar novo paciente
        await Paciente.create(data);
        toast({
          title: "Paciente cadastrado!",
          description: "O cadastro do paciente foi criado com sucesso."
        });
      } else {
        await Paciente.update(pacienteParaEditar.id, data);
        toast({
          title: "Paciente atualizado!",
          description: "Os dados do paciente foram salvos com sucesso."
        });
      }

      setFormularioPacienteAberto(false);
      setPacienteParaEditar(null);
      onUpdate();
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

  const handleEnviarNotificacao = (agendamento) => {
    setAgendamentoSelecionado(agendamento);
    setNotificacaoAberta(true);
  };

  const handleFecharNotificacao = () => {
    setNotificacaoAberta(false);
    setAgendamentoSelecionado(null);
  };

  const handleAbrirConfirmacaoExclusao = (agendamento) => {
    setAgendamentoParaExcluir(agendamento);
    setConfirmacaoExclusaoAberta(true);
  };

  const handleExcluirAgendamento = async () => {
    if (!agendamentoParaExcluir) return;

    setExcluindo(true);
    try {
      await safeApiCall(() => Agendamento.delete(agendamentoParaExcluir.id));

      toast({
        title: "Agendamento excluído!",
        description: "O agendamento foi removido do sistema com sucesso."
      });

      setConfirmacaoExclusaoAberta(false);
      setAgendamentoParaExcluir(null);
      onUpdate();
    } catch (error) {
      console.error("Erro ao excluir agendamento:", error);
      toast({
        title: "Erro ao excluir",
        description: error.message || "Não foi possível excluir o agendamento.",
        variant: "destructive"
      });
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <>
      <Card className="shadow-lg">
        <CardHeader className="border-b">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-cyan-600 text-xl font-semibold tracking-tight flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                {periodo === 'dia' ? 'Agendamentos do Dia' :
                periodo === 'semana' ? 'Agendamentos da Semana' :
                'Agendamentos do Mês'}
              </CardTitle>
              {periodo === 'dia' && dia &&
              <p className="text-gray-600">
                  {format(dia, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              }
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading ?
          <div className="space-y-4">
              {Array(4).fill(0).map((_, i) =>
            <div key={i} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-3 w-28" />
                </div>
            )}
            </div> :
          agendamentos.length === 0 ?
          <div className="text-center py-8 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhum agendamento encontrado</p>
            </div> :

          <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {agendamentos.
            filter(a => a && a.data_agendamento).
          sort((a, b) => {
              const dateA = new Date(`${a.data_agendamento}T${a.horario || '00:00'}`);
              const dateB = new Date(`${b.data_agendamento}T${b.horario || '00:00'}`);
              return dateA - dateB;
            }).
            map((agendamento) =>
            <div key={agendamento.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow bg-white">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                           {/* Mostrar data quando não for visualização diária OU quando há busca ativa */}
                           {(periodo !== 'dia' || buscaAtiva) &&
                        <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                               {format(new Date(agendamento.data_agendamento + 'T00:00:00'), "EEE, dd/MM", { locale: ptBR })}
                             </span>
                        }
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span className="font-semibold text-lg">{agendamento.horario || 'Sem horário'}</span>
                          <Badge className={`${statusColors[agendamento.status]} border`}>
                            {agendamento.status}
                          </Badge>
                          {agendamento.is_reserva &&
                    <Badge className="bg-orange-100 text-orange-700 border-orange-300">
                              🔖 Reserva de Horário
                            </Badge>
                    }
                          {agendamento.is_encaixe &&
                    <Badge className="bg-orange-100 text-orange-700 border-orange-300">
                              🔄 Encaixe
                            </Badge>
                    }
                          {agendamento.is_recorrente &&
                    <Badge className="bg-purple-100 text-purple-700 border-purple-300">
                              <Repeat className="w-3 h-3 mr-1" />
                              Recorrente
                            </Badge>
                    }
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!agendamento.is_reserva &&
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAbrirPaciente(agendamento.paciente_id, agendamento)}
                    title="Editar cadastro do paciente"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">

                            <UserCog className="w-4 h-4" />
                          </Button>
                  }
                        <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEnviarNotificacao(agendamento)}
                    title="Enviar notificação WhatsApp/SMS"
                    className="text-green-600 hover:text-green-700 hover:bg-green-50">

                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditarAgendamento(agendamento)}
                    title="Editar agendamento">

                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAbrirConfirmacaoExclusao(agendamento)}
                    title="Excluir agendamento"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50">

                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-1 ml-7">
                      {agendamento.is_reserva ?
                <>
                          <p className="flex items-center gap-2 text-sm font-medium text-orange-700">
                            🔖 Horário Reservado - Aguardando dados do paciente
                          </p>
                          <p className="text-sm text-gray-600">
                            {agendamento.medico_id ? getNomeMedico(agendamento.medico_id) + ' • ' : ''}
                            {agendamento.tipo_servico}
                          </p>
                        </> :

                <>
                          <p className="flex items-center gap-2 text-sm">
                            <User className="w-4 h-4 text-gray-400" />
                            <button
                      onClick={() => handleAbrirPaciente(agendamento.paciente_id, agendamento)} className="text-cyan-600 font-medium hover:text-blue-800 hover:underline cursor-pointer transition-colors"

                      title="Clique para editar o cadastro do paciente">

                              {getNomePaciente(agendamento)}
                            </button>
                          </p>
                          <p className="text-sm text-gray-600">
                            {(() => {
                              const medico = medicos.find(m => m.id === agendamento.medico_id);
                              const isOdontologia = medico && normalizeString(medico.especialidade) === 'ODONTOLOGIA';
                              const dentistaObs = getDentistaDoAgendamento(agendamento.observacoes);
                              
                              if (isOdontologia && dentistaObs) {
                                // Tem dentista nas observações - mostrar "Dr(a). NomeDentista"
                                return `Dr(a). ${dentistaObs}`;
                              } else if (isOdontologia && medico) {
                                // Não tem nas observações, usa o médico vinculado
                                return `Dr(a). ${medico.nome}`;
                              } else if (medico) {
                                return `Dr(a). ${medico.nome}`;
                              }
                              return "Médico não encontrado";
                            })()} • {agendamento.tipo_servico}
                          </p>
                          {/* Mostrar Odontologia como tag se for dentista */}
                          {medicos.find(m => m.id === agendamento.medico_id && normalizeString(m.especialidade) === 'ODONTOLOGIA') && (
                            <p className="text-xs text-cyan-600">
                              🦷 Odontologia
                            </p>
                          )}
                          {/* Mostrar especialidade se for Dr. Ruben com múltiplas especialidades */}
                          {(() => {
                            const medico = medicos.find(m => m.id === agendamento.medico_id);
                            if (medico && normalizeString(medico.nome).includes('RUBEN')) {
                              // Verificar se tem especialidade nas observações
                              const especialidadeObs = agendamento.observacoes?.match(/Especialidade:\s*(.+?)(\n|$)/)?.[1]?.trim();
                              if (especialidadeObs) {
                                return (
                                  <p className="text-xs text-green-600">
                                    🩺 {especialidadeObs}
                                  </p>
                                );
                              }
                            }
                            return null;
                          })()}
                        </>
                }
                      {/* Mostrar observações, excluindo a linha do dentista */}
                      {agendamento.observacoes && !agendamento.observacoes.match(/^Dentista:/) && (
                        <p className="text-xs text-gray-500 mt-2">
                          {agendamento.observacoes.replace(/Dentista:.*(\n|$)/g, '').trim()}
                        </p>
                      )}
                    </div>

                    {/* Botões de ação baseados no status */}
                    <div className="flex gap-2 mt-3 ml-7">
                      {agendamento.is_reserva &&
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEditarAgendamento(agendamento)}
                  className="text-orange-600 hover:bg-orange-50 border-orange-300">

                          <Edit className="w-3 h-3 mr-1" />
                          Completar Dados da Reserva
                        </Button>
                }
                      
                      {!agendamento.is_reserva && agendamento.status === "Agendado" &&
                <>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-green-600 hover:bg-green-50"
                            onClick={() => {
                              console.log('🚀 Navegando para OS com agendamento:', agendamento);
                              window.location.href = createPageUrl('ordem-servico') + `?agendamento_id=${agendamento.id}`;
                            }}
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            Check-in / Pagar
                          </Button>
                          <Button
                    size="sm"
                    variant="outline"
                    onClick={() => atualizarStatus(agendamento.id, "Cancelado")}
                    disabled={atualizandoStatus === agendamento.id}
                    className="text-red-600 hover:bg-red-50">

                            <XCircle className="w-3 h-3 mr-1" />
                            Cancelar
                          </Button>
                        </>
                }
                      
                      {!agendamento.is_reserva && agendamento.status === "Pago" &&
                <Link to={createPageUrl('ordem-servico')} state={{ agendamento }}>
                          <Button size="sm" variant="outline" className="text-blue-600 hover:bg-blue-50">
                            <FileText className="w-3 h-3 mr-1" />
                            Editar OS
                          </Button>
                        </Link>
                }
                      
                      {!agendamento.is_reserva && (agendamento.status === "Em Atendimento" || agendamento.status === "Finalizado") &&
                <Link to={createPageUrl('ordem-servico')} state={{ agendamento }}>
                          <Button size="sm" variant="outline" className="text-blue-600 hover:bg-blue-50">
                            <FileText className="w-3 h-3 mr-1" />
                            Editar OS
                          </Button>
                        </Link>
                }
                    </div>
                  </div>
            )}
            </div>
          }
        </CardContent>
      </Card>

      {agendamentoSelecionado &&
      <EnviarNotificacao
        agendamento={agendamentoSelecionado}
        paciente={pacientes.find((p) => p.id === agendamentoSelecionado.paciente_id)}
        medico={medicos.find((m) => m.id === agendamentoSelecionado.medico_id)}
        aberto={notificacaoAberta}
        onFechar={handleFecharNotificacao} />

      }

      {agendamentoParaExcluir &&
      <ConfirmacaoExclusao
        aberto={confirmacaoExclusaoAberta}
        onFechar={() => {
          setConfirmacaoExclusaoAberta(false);
          setAgendamentoParaExcluir(null);
        }}
        onConfirmar={handleExcluirAgendamento}
        titulo="Excluir Agendamento"
        mensagem={
        <div>
              <p className="mb-2">Tem certeza que deseja excluir este agendamento?</p>
              <div className="bg-gray-50 p-3 rounded-md text-sm space-y-1">
                <p><strong>Paciente:</strong> {getNomePaciente(agendamentoParaExcluir)}</p>
                <p><strong>Médico:</strong> {getNomeMedico(agendamentoParaExcluir.medico_id)}</p>
                <p><strong>Data:</strong> {format(new Date(agendamentoParaExcluir.data_agendamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}</p>
                <p><strong>Horário:</strong> {agendamentoParaExcluir.horario}</p>
              </div>
              <p className="mt-3 text-red-600 font-semibold">⚠️ Esta ação não pode ser desfeita!</p>
            </div>
        }
        carregando={excluindo} />

      }

      {formularioPacienteAberto && pacienteParaEditar &&
      <FormularioPaciente
        paciente={pacienteParaEditar}
        onSalvar={handleSalvarPaciente}
        onCancelar={() => {
          setFormularioPacienteAberto(false);
          setPacienteParaEditar(null);
        }} />

      }
    </>);

}