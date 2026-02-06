import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button"; 
import { Clock, User, Calendar, Edit, CalendarPlus } from "lucide-react"; 
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Agendamento } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import FormularioPaciente from "../pacientes/FormularioPaciente";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const statusColors = {
  "Agendado": "bg-blue-100 text-blue-800 border-blue-200",
  "Confirmado": "bg-green-100 text-green-800 border-green-200",
  "Pago": "bg-teal-100 text-teal-800 border-teal-200",
  "Em Atendimento": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Finalizado": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Cancelado": "bg-red-100 text-red-800 border-red-200",
  "Não Compareceu": "bg-gray-100 text-gray-800 border-gray-200"
};

export default function AgendamentosHoje({ agendamentos = [], medicos = [], pacientes = [], loading, onUpdate }) {
  const [pacienteEditando, setPacienteEditando] = useState(null);
  
  const getNomePaciente = (agendamento) => {
    // Priorizar paciente_nome se existir
    if (agendamento.paciente_nome) {
      return agendamento.paciente_nome;
    }
    // Buscar na lista de pacientes
    if (agendamento.paciente_id) {
      const paciente = pacientes.find(p => p.id === agendamento.paciente_id);
      if (paciente) return paciente.nome;
    }
    return "Paciente não encontrado";
  };

  const getNomeMedico = (medicoId) => {
    const medico = medicos.find(m => m.id === medicoId);
    return medico ? `Dr(a). ${medico.nome}` : "Médico não encontrado";
  };
  
  const normStr = (s) => s ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';

  const handleEditarPaciente = async (agendamento) => {
    let paciente = null;
    
    // 1. Busca local por ID (instantânea)
    if (agendamento.paciente_id) {
      paciente = pacientes.find(p => p.id === agendamento.paciente_id);
    }
    
    // 2. Busca local por nome normalizado (instantânea)
    if (!paciente && agendamento.paciente_nome) {
      const nomeNorm = normStr(agendamento.paciente_nome);
      paciente = pacientes.find(p => normStr(p.nome) === nomeNorm);
    }
    
    // 3. Fallback: buscar via backend por nome (rápido)
    if (!paciente && agendamento.paciente_nome) {
      try {
        const response = await base44.functions.invoke('searchPatients', { termo: agendamento.paciente_nome });
        const resultados = response?.data;
        if (Array.isArray(resultados) && resultados.length > 0) {
          const nomeNorm = normStr(agendamento.paciente_nome);
          paciente = resultados.find(p => normStr(p.nome) === nomeNorm) || resultados[0];
        }
      } catch (error) {
        console.error('Erro ao buscar paciente via API:', error);
      }
    }
    
    if (paciente) {
      setPacienteEditando(paciente);
    }
  };
  
  const handleSalvarPaciente = async (dadosPaciente) => {
    try {
      const { Paciente } = await import('@/entities/all');
      await Paciente.update(pacienteEditando.id, dadosPaciente);
      setPacienteEditando(null);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Erro ao salvar paciente:', error);
      throw error;
    }
  };

  // atualizarStatus function removed as per new requirements
  // const atualizarStatus = async (agendamentoId, novoStatus) => {
  //   try {
  //     await Agendamento.update(agendamentoId, { status: novoStatus });
  //     onUpdate();
  //   } catch (error) {
  //     console.error("Erro ao atualizar status:", error);
  //   }
  // };

  return (
    <Card className="shadow-lg">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Clock className="w-5 h-5 text-blue-600" />
          Agendamentos de Hoje
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-4">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="p-4 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-24 mb-1" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        ) : agendamentos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Nenhum agendamento para hoje</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {agendamentos
              .sort((a, b) => a.horario.localeCompare(b.horario))
              .map((agendamento) => (
                <div key={agendamento.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="font-semibold">{agendamento.horario}</span>
                    </div>
                    <Badge className={`${statusColors[agendamento.status]} border`}>
                      {agendamento.status}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm flex-1">
                        <User className="w-4 h-4 text-gray-400" />
                        <span 
                          className="font-medium text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                          onClick={() => handleEditarPaciente(agendamento)}
                        >
                          {getNomePaciente(agendamento)}
                        </span>
                      </p>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditarPaciente(agendamento)}
                          className="h-7 w-7 p-0 text-gray-500 hover:text-blue-600"
                          title="Editar cadastro do paciente"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 ml-6">
                      {getNomeMedico(agendamento.medico_id)} • {agendamento.tipo_servico}
                    </p>
                  </div>
                  {/* Botões de ação foram removidos daqui */}
                  {/*
                  {agendamento.status === "Agendado" && (
                    <div className="flex gap-2 mt-3">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => atualizarStatus(agendamento.id, "Confirmado")}
                        className="text-green-600 hover:bg-green-50"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Confirmar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => atualizarStatus(agendamento.id, "Cancelado")}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  )}
                  
                  {agendamento.status === "Confirmado" && (
                    <div className="flex gap-2 mt-3">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => atualizarStatus(agendamento.id, "Em Atendimento")}
                        className="text-yellow-600 hover:bg-yellow-50"
                      >
                        Iniciar Atendimento
                      </Button>
                    </div>
                  )}
                  
                  {agendamento.status === "Em Atendimento" && (
                    <div className="flex gap-2 mt-3">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => atualizarStatus(agendamento.id, "Finalizado")}
                        className="text-emerald-600 hover:bg-emerald-50"
                      >
                        Finalizar
                      </Button>
                    </div>
                  )}
                  */}
                </div>
              ))}
          </div>
        )}
      </CardContent>
      
      {/* Modal de edição de paciente */}
      {pacienteEditando && (
        <FormularioPaciente
          paciente={pacienteEditando}
          onSalvar={handleSalvarPaciente}
          onCancelar={() => setPacienteEditando(null)}
        />
      )}
    </Card>
  );
}