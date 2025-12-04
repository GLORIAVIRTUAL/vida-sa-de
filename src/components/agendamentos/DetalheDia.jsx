import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, User, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors = {
  "Agendado": "bg-blue-100 text-blue-800",
  "Pago": "bg-teal-100 text-teal-800",
  "Em Atendimento": "bg-yellow-100 text-yellow-800",
  "Finalizado": "bg-emerald-100 text-emerald-800",
  "Cancelado": "bg-red-100 text-red-800",
  "Não Compareceu": "bg-gray-100 text-gray-800"
};

// Helper para converter HH:mm em minutos
const timeToMinutes = (time) => {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Helper para adicionar minutos a um horário HH:mm
const addMinutes = (time, minutes) => {
  const totalMinutes = timeToMinutes(time) + minutes;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export default function DetalheDia({ dia, agendamentos, medicos, pacientes, loading }) {

  const getNome = (id, tipo) => {
    const lista = tipo === 'paciente' ? pacientes : medicos;
    const item = lista.find(i => i.id === id);
    if (tipo === 'medico' && item) return `Dr(a). ${item.nome}`;
    return item ? item.nome : 'Não encontrado';
  };

  // Memoize a lista combinada de agendamentos e horários disponíveis
  const itensAgenda = useMemo(() => {
    if (loading) return [];

    const items = [];
    const diaSemana = dia.getDay();
    const diaDoMes = dia.getDate();
    const semanaDoMes = Math.ceil(diaDoMes / 7);

    // 1. Adicionar agendamentos existentes
    agendamentos.forEach(ag => {
      items.push({
        type: 'booked',
        key: ag.id,
        horario: ag.horario,
        data: ag,
        medico_id: ag.medico_id
      });
    });

    // 2. Calcular horários disponíveis
    if (medicos && medicos.length > 0) {
      medicos.forEach(medico => {
        if (!medico.horarios_atendimento) return;

        medico.horarios_atendimento.forEach(config => {
          // Verifica dia da semana
          if (config.dia_semana !== diaSemana) return;

          // Verifica recorrência
          const recorrencia = config.recorrencia || 'Toda Semana';
          let atende = false;
          
          switch (recorrencia) {
            case 'Toda Semana': atende = true; break;
            case '1ª e 3ª Semana do Mês': atende = (semanaDoMes === 1 || semanaDoMes === 3); break;
            case '2ª e 4ª Semana do Mês': atende = (semanaDoMes === 2 || semanaDoMes === 4); break;
            case 'Apenas 1ª Semana do Mês': atende = (semanaDoMes === 1); break;
            case 'Apenas 2ª Semana do Mês': atende = (semanaDoMes === 2); break;
            case 'Apenas 3ª Semana do Mês': atende = (semanaDoMes === 3); break;
            case 'Apenas 4ª Semana do Mês': atende = (semanaDoMes === 4); break;
            default: atende = true;
          }

          if (!atende) return;

          // Gera slots disponíveis
          let current = config.horario_inicio;
          const end = config.horario_fim;
          const duration = medico.tempo_consulta_minutos || 30;

          while (timeToMinutes(current) + duration <= timeToMinutes(end)) {
            // Verifica se já existe agendamento para este médico neste horário (que não esteja cancelado)
            const isBooked = agendamentos.some(ag => 
              ag.medico_id === medico.id && 
              ag.horario === current &&
              ag.status !== 'Cancelado'
            );

            if (!isBooked) {
              items.push({
                type: 'available',
                key: `avail-${medico.id}-${current}`,
                horario: current,
                medico: medico,
                medico_id: medico.id
              });
            }
            
            current = addMinutes(current, duration);
          }
        });
      });
    }

    // Ordenar por horário
    return items.sort((a, b) => {
      const timeDiff = timeToMinutes(a.horario) - timeToMinutes(b.horario);
      if (timeDiff !== 0) return timeDiff;
      // Se mesmo horário, agendados primeiro
      return a.type === 'booked' ? -1 : 1;
    });

  }, [agendamentos, medicos, dia, loading]);

  return (
    <Card className="shadow-lg h-full">
      <CardHeader>
        <CardTitle className="capitalize text-lg">
          {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {loading ? (
          Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))
        ) : itensAgenda.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            Nenhum agendamento ou horário disponível para este dia.
          </p>
        ) : (
          itensAgenda.map(item => {
            if (item.type === 'booked') {
              const ag = item.data;
              return (
                <div key={item.key} className="p-3 border rounded-lg bg-white hover:shadow-md transition-shadow border-l-4 border-l-blue-500">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 font-semibold text-gray-800">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{item.horario}</span>
                    </div>
                    <Badge className={statusColors[ag.status]}>{ag.status}</Badge>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{getNome(ag.paciente_id, 'paciente')}</span>
                    </p>
                    <p className="ml-6 text-gray-600 text-xs">
                      {getNome(ag.medico_id, 'medico')}
                    </p>
                  </div>
                </div>
              );
            } else {
              // Render Available Slot
              return (
                <div key={item.key} className="p-3 border rounded-lg bg-green-50 hover:bg-green-100 transition-colors border-l-4 border-l-green-500 border-dashed">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2 font-semibold text-green-800">
                      <Clock className="w-4 h-4 text-green-600" />
                      <span>{item.horario}</span>
                    </div>
                    <Badge variant="outline" className="bg-white text-green-700 border-green-200">
                      Disponível
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <p className="ml-6 text-gray-600 text-xs">
                      Dr(a). {item.medico.nome}
                    </p>
                  </div>
                </div>
              );
            }
          })
        )}
      </CardContent>
    </Card>
  );
}