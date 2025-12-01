import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Stethoscope, Calendar, CheckCircle, XCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function EstatisticasRapidas({ estatisticas, loading, loadingPacientes }) {
  const cards = [
    {
      title: "Pacientes Cadastrados",
      value: estatisticas.totalPacientes,
      icon: Users,
      bgColor: "bg-blue-500",
      textColor: "text-blue-600",
      isLoading: loadingPacientes
    },
    {
      title: "Médicos Ativos",
      value: estatisticas.totalMedicos,
      icon: Stethoscope,
      bgColor: "bg-green-500",
      textColor: "text-green-600"
    },
    {
      title: "Agendamentos Hoje",
      value: estatisticas.agendamentosHoje,
      icon: Calendar,
      bgColor: "bg-purple-500",
      textColor: "text-purple-600"
    },
    {
      title: "Confirmados",
      value: estatisticas.confirmados,
      icon: CheckCircle,
      bgColor: "bg-emerald-500",
      textColor: "text-emerald-600"
    },
    {
      title: "Finalizados",
      value: estatisticas.finalizados,
      icon: Clock,
      bgColor: "bg-orange-500",
      textColor: "text-orange-600"
    },
    {
      title: "Cancelados",
      value: estatisticas.cancelados,
      icon: XCircle,
      bgColor: "bg-red-500",
      textColor: "text-red-600"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
      {cards.map((card, index) => (
        <Card key={index} className="relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-20 h-20 transform translate-x-6 -translate-y-6 ${card.bgColor} rounded-full opacity-10`} />
          <CardHeader className="p-4 pb-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">{card.title}</p>
                {loading || card.isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <CardTitle className="text-2xl font-bold">
                    {card.value !== null ? card.value : '-'}
                  </CardTitle>
                )}
              </div>
              <div className={`p-2 rounded-lg ${card.bgColor} bg-opacity-20`}>
                <card.icon className={`w-4 h-4 ${card.textColor}`} />
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}