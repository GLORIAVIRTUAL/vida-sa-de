import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isSameDay, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusColors = {
  "Agendado": "bg-blue-100 text-blue-800",
  "Confirmado": "bg-green-100 text-green-800",
  "Em Atendimento": "bg-yellow-100 text-yellow-800",
  "Finalizado": "bg-emerald-100 text-emerald-800",
  "Cancelado": "bg-red-100 text-red-800",
  "Não Compareceu": "bg-gray-100 text-gray-800"
};

export default function AgendamentosSemana({ agendamentos = [], medicos = [], pacientes = [], loading }) {
  const getNomePaciente = (agendamento) => {
    if (!agendamento) return "Paciente não encontrado";
    const paciente = pacientes.find(p => p.id === agendamento.paciente_id);
    return paciente ? paciente.nome : (agendamento.paciente_nome || "Paciente não encontrado");
  };

  const getNomeMedico = (medicoId) => {
    const medico = medicos.find(m => m.id === medicoId);
    return medico ? `Dr(a). ${medico.nome}` : "Médico não encontrado";
  };

  // Agrupar agendamentos por dia
  const agendamentosPorDia = agendamentos.reduce((grupos, agendamento) => {
    if (!agendamento || !agendamento.data_agendamento) return grupos;
    const data = agendamento.data_agendamento;
    if (!grupos[data]) {
      grupos[data] = [];
    }
    grupos[data].push(agendamento);
    return grupos;
  }, {});

  // Ordenar as datas
  const datasOrdenadas = Object.keys(agendamentosPorDia).sort();

  const totalSemana = agendamentos.length;
  const confirmados = agendamentos.filter(a => a.status === "Confirmado").length;
  const finalizados = agendamentos.filter(a => a.status === "Finalizado").length;

  return (
    <Card className="shadow-lg">
      <CardHeader className="border-b">
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2 text-xl">
            <CalendarIcon className="w-5 h-5 text-purple-600" />
            Visão Semanal
          </CardTitle>
          <div className="flex items-center gap-1 text-sm text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span>{totalSemana} agendamentos</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-4">
            {Array(5).fill(0).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-5 w-32 mb-2" />
                <div className="space-y-2 ml-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : datasOrdenadas.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Nenhum agendamento nesta semana</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {/* Resumo da semana */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-semibold text-lg">{totalSemana}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Confirmados</p>
                  <p className="font-semibold text-lg text-green-600">{confirmados}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Finalizados</p>
                  <p className="font-semibold text-lg text-emerald-600">{finalizados}</p>
                </div>
              </div>
            </div>

            {datasOrdenadas.map((data) => {
              const dataObj = parseISO(data);
              if (!isValid(dataObj)) return null;

              return (
              <div key={data}>
                <h4 className="font-semibold text-gray-900 mb-2 capitalize">
                  {format(dataObj, "EEEE, dd/MM", { locale: ptBR })}
                  {isSameDay(dataObj, new Date()) && (
                    <Badge className="ml-2 bg-blue-100 text-blue-800">Hoje</Badge>
                  )}
                </h4>
                <div className="space-y-2 ml-4">
                  {agendamentosPorDia[data]
                    .sort((a, b) => a.horario.localeCompare(b.horario))
                    .map((agendamento) => (
                      <div key={agendamento.id} className="flex items-center justify-between p-2 bg-white border rounded-lg text-sm">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{agendamento.horario}</span>
                            <span>•</span>
                            <span>{getNomePaciente(agendamento)}</span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {getNomeMedico(agendamento.medico_id)}
                          </p>
                        </div>
                        <Badge className={`${statusColors[agendamento.status]} text-xs`}>
                          {agendamento.status}
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}