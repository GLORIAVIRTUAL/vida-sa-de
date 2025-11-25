import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors = {
  "Agendado": "bg-blue-100 text-blue-800",
  "Pago": "bg-teal-100 text-teal-800",
  "Em Atendimento": "bg-yellow-100 text-yellow-800",
  "Finalizado": "bg-emerald-100 text-emerald-800",
  "Cancelado": "bg-red-100 text-red-800",
  "Não Compareceu": "bg-gray-100 text-gray-800"
};

export default function DetalheDia({ dia, agendamentos, medicos, pacientes, loading }) {

  const getNome = (id, tipo) => {
    const lista = tipo === 'paciente' ? pacientes : medicos;
    const item = lista.find(i => i.id === id);
    if (tipo === 'medico' && item) return `Dr(a). ${item.nome}`;
    return item ? item.nome : 'Não encontrado';
  };

  return (
    <Card className="shadow-lg h-full">
      <CardHeader>
        <CardTitle className="capitalize text-lg">
          {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
        {loading ? (
          Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))
        ) : agendamentos.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Nenhum agendamento para este dia.</p>
        ) : (
          agendamentos
            .sort((a, b) => a.horario.localeCompare(b.horario))
            .map(ag => (
              <div key={ag.id} className="p-3 border rounded-lg bg-white hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span>{ag.horario}</span>
                  </div>
                  <Badge className={statusColors[ag.status]}>{ag.status}</Badge>
                </div>
                <div className="text-sm space-y-1">
                  <p className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{getNome(ag.paciente_id, 'paciente')}</span>
                  </p>
                  <p className="ml-6 text-gray-600">
                    {getNome(ag.medico_id, 'medico')}
                  </p>
                </div>
              </div>
            ))
        )}
      </CardContent>
    </Card>
  );
}