import React, { useMemo } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, User, Edit, Calendar, Stethoscope } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusColors = {
  "Agendado": "bg-sky-100 text-sky-700 border-sky-200",
  "Confirmado": "bg-green-200 text-green-700 border-green-300",
  "Pago": "bg-teal-100 text-teal-700 border-teal-200",
  "Em Atendimento": "bg-amber-100 text-amber-700 border-amber-200",
  "Finalizado": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Cancelado": "bg-red-100 text-red-700 border-red-200",
  "Não Compareceu": "bg-gray-200 text-gray-600 border-gray-300"
};

const colunaColors = [
  "border-t-blue-500",
  "border-t-emerald-500",
  "border-t-purple-500",
  "border-t-amber-500",
  "border-t-rose-500",
  "border-t-cyan-500",
  "border-t-indigo-500",
  "border-t-lime-500",
  "border-t-orange-500",
  "border-t-teal-500",
];

export default function VisualizacaoKanban({ agendamentos, medicos, pacientes, onEditarAgendamento, loading, dia }) {

  const getNomePaciente = (agendamento) => {
    if (!agendamento) return "Paciente não informado";
    const paciente = pacientes.find((p) => p.id === agendamento.paciente_id);
    if (paciente) return paciente.nome;
    return agendamento.paciente_nome || "Paciente não encontrado";
  };

  // Agrupar agendamentos por médico
  const colunas = useMemo(() => {
    const agrupado = {};

    // Filtrar cancelados e ordenar por horário
    const agendamentosOrdenados = [...agendamentos]
      .filter(a => a && a.status !== 'Cancelado')
      .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));

    agendamentosOrdenados.forEach(ag => {
      const medicoId = ag.medico_id || 'sem_medico';
      if (!agrupado[medicoId]) {
        agrupado[medicoId] = [];
      }
      agrupado[medicoId].push(ag);
    });

    // Converter para array com dados do médico
    const resultado = Object.entries(agrupado).map(([medicoId, ags]) => {
      const medico = medicos.find(m => m.id === medicoId);
      return {
        medicoId,
        nome: medico ? medico.nome : 'Sem Médico',
        especialidade: medico?.especialidade || '',
        agendamentos: ags,
        total: ags.length
      };
    });

    // Ordenar colunas por nome do médico
    resultado.sort((a, b) => a.nome.localeCompare(b.nome));

    return resultado;
  }, [agendamentos, medicos]);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="min-w-[280px] w-[300px] flex-shrink-0">
            <Skeleton className="h-12 w-full mb-3 rounded-lg" />
            {Array(4).fill(0).map((_, j) => (
              <Skeleton key={j} className="h-20 w-full mb-2 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (agendamentos.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardContent className="p-8">
          <div className="text-center text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Nenhum agendamento encontrado para este período</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <Card className="shadow-lg mb-4">
        <CardHeader className="border-b py-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-cyan-600 text-xl font-semibold tracking-tight flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-blue-600" />
              Kanban por Médico
            </CardTitle>
            {dia && (
              <span className="text-sm text-gray-500">
                {format(dia, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {colunas.map((coluna, idx) => (
          <div key={coluna.medicoId} className="min-w-[280px] w-[300px] flex-shrink-0">
            {/* Cabeçalho da coluna */}
            <div className={`bg-white rounded-t-lg border border-b-0 border-t-4 ${colunaColors[idx % colunaColors.length]} p-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-gray-800 truncate" title={coluna.nome}>
                    Dr(a). {coluna.nome}
                  </h3>
                  {coluna.especialidade && (
                    <p className="text-xs text-gray-500 truncate">{coluna.especialidade}</p>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs">
                  {coluna.total}
                </Badge>
              </div>
            </div>

            {/* Lista de pacientes */}
            <div className="bg-gray-50 border border-t-0 rounded-b-lg p-2 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
              {coluna.agendamentos.map(ag => (
                <div
                  key={ag.id}
                  className="bg-white rounded-lg border p-3 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onEditarAgendamento(ag)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-gray-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {ag.horario || '--:--'}
                    </span>
                    <Badge className={`${statusColors[ag.status]} border text-[10px] px-1.5 py-0`}>
                      {ag.status}
                    </Badge>
                  </div>

                  <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5" title={getNomePaciente(ag)}>
                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    {ag.is_reserva ? '🔖 Reserva de Horário' : getNomePaciente(ag)}
                  </p>

                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[11px] text-gray-500">{ag.tipo_servico || ''}</span>
                    {ag.is_encaixe && (
                      <Badge className="bg-orange-100 text-orange-600 text-[9px] px-1 py-0 border-0">Encaixe</Badge>
                    )}
                    {ag.is_recorrente && (
                      <Badge className="bg-purple-100 text-purple-600 text-[9px] px-1 py-0 border-0">Recorrente</Badge>
                    )}
                  </div>

                  {ag.observacoes && (
                    <p className="text-[10px] text-gray-400 mt-1 truncate" title={ag.observacoes}>
                      {ag.observacoes.replace(/Dentista:.*(\n|$)/g, '').replace(/Especialidade:.*(\n|$)/g, '').trim()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}