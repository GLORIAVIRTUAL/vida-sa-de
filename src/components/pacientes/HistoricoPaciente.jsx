import React, { useState, useEffect } from 'react';
import { Agendamento, Prontuario } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

export default function HistoricoPaciente({ pacienteId }) {
  const [agendamentos, setAgendamentos] = useState([]);
  const [prontuarios, setProntuarios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // CORRIGIDO: Só carregar se houver pacienteId válido
    if (!pacienteId) {
      setLoading(false);
      return;
    }

    const carregarHistorico = async () => {
      setLoading(true);
      try {
        const [agendamentosData, prontuariosData] = await Promise.all([
          Agendamento.filter({ paciente_id: pacienteId }),
          Prontuario.filter({ paciente_id: pacienteId })
        ]);

        setAgendamentos(Array.isArray(agendamentosData) ? agendamentosData : []);
        setProntuarios(Array.isArray(prontuariosData) ? prontuariosData : []);
      } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        setAgendamentos([]);
        setProntuarios([]);
      } finally {
        setLoading(false);
      }
    };

    carregarHistorico();
  }, [pacienteId]);

  if (!pacienteId) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Histórico do Paciente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusColors = {
    "Agendado": "bg-blue-100 text-blue-800",
    "Pago": "bg-green-100 text-green-800",
    "Em Atendimento": "bg-yellow-100 text-yellow-800",
    "Finalizado": "bg-emerald-100 text-emerald-800",
    "Cancelado": "bg-red-100 text-red-800"
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Histórico do Paciente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {agendamentos.length === 0 && prontuarios.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nenhum histórico registrado</p>
        ) : (
          <div className="space-y-4">
            {/* Agendamentos */}
            {agendamentos.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 text-sm text-gray-700">Agendamentos</h4>
                <div className="space-y-2">
                  {agendamentos
                    .sort((a, b) => new Date(b.data_agendamento) - new Date(a.data_agendamento))
                    .slice(0, 5)
                    .map((ag) => (
                      <div key={ag.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <div>
                            <p className="font-medium text-sm">
                              {format(new Date(ag.data_agendamento + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })} - {ag.horario}
                            </p>
                            <p className="text-xs text-gray-600">{ag.tipo_servico}</p>
                          </div>
                        </div>
                        <Badge className={statusColors[ag.status]}>
                          {ag.status}
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Prontuários */}
            {prontuarios.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 text-sm text-gray-700">Prontuários</h4>
                <div className="space-y-2">
                  {prontuarios
                    .sort((a, b) => new Date(b.data_atendimento) - new Date(a.data_atendimento))
                    .slice(0, 5)
                    .map((pront) => (
                      <div key={pront.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-sm">
                            {format(new Date(pront.data_atendimento + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                          <p className="text-xs text-gray-600 line-clamp-1">
                            {pront.queixa_principal || 'Sem queixa registrada'}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}