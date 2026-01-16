import React, { useState, useEffect, useMemo } from 'react';
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import DetalheDia from './DetalheDia';

export default function VisualizacaoCalendario({ agendamentos, medicos, pacientes, loading, onUpdate }) {
  const [dataSelecionada, setDataSelecionada] = useState(new Date());

  // CORREÇÃO: Debugging das datas dos agendamentos
  useEffect(() => {
    // Ensure agendamentos is an array before mapping
    if (Array.isArray(agendamentos)) {
      console.log('📅 Debug - Agendamentos recebidos:', agendamentos.map((a) => ({
        id: a.id,
        data_agendamento: a.data_agendamento,
        horario: a.horario,
        paciente_id: a.paciente_id
      })));
    }
  }, [agendamentos]);

  // CORREÇÃO: Lógica para colorir dias com eventos
  const diasComEventos = useMemo(() => {
    if (!agendamentos || agendamentos.length === 0) return new Set();
    const datas = agendamentos.map((a) => a.data_agendamento);
    console.log('📅 Debug - Datas dos agendamentos:', datas);
    return new Set(datas);
  }, [agendamentos]);

  // Função para verificar se o médico atende em uma data específica considerando recorrência
  const verificarMedicoAtendeNaData = (medico, data) => {
    if (!medico.horarios_atendimento || !Array.isArray(medico.horarios_atendimento)) {
      return false;
    }

    const diaSemana = data.getDay();
    const diaDoMes = data.getDate();

    // Calcular qual semana do mês é essa data (1ª, 2ª, 3ª, 4ª)
    const semanaDoMes = Math.ceil(diaDoMes / 7);

    return medico.horarios_atendimento.some((horario) => {
      if (horario.dia_semana !== diaSemana) return false;

      const recorrencia = horario.recorrencia || 'Toda Semana';

      switch (recorrencia) {
        case 'Toda Semana':
          return true;
        case '1ª e 3ª Semana do Mês':
          return semanaDoMes === 1 || semanaDoMes === 3;
        case '2ª e 4ª Semana do Mês':
          return semanaDoMes === 2 || semanaDoMes === 4;
        case 'Apenas 1ª Semana do Mês':
          return semanaDoMes === 1;
        case 'Apenas 2ª Semana do Mês':
          return semanaDoMes === 2;
        case 'Apenas 3ª Semana do Mês':
          return semanaDoMes === 3;
        case 'Apenas 4ª Semana do Mês':
          return semanaDoMes === 4;
        default:
          return true;
      }
    });
  };

  // Função para verificar se algum médico atende na data
  const verificarAlgumMedicoAtendeNaData = (data) => {
    if (!medicos || medicos.length === 0) return false;
    return medicos.some((medico) => verificarMedicoAtendeNaData(medico, data));
  };

  const agendamentosDoDia = useMemo(() => {
    // CORREÇÃO: Usar as mesmas partes da data para comparação
    const ano = dataSelecionada.getFullYear();
    const mes = String(dataSelecionada.getMonth() + 1).padStart(2, '0');
    const dia = String(dataSelecionada.getDate()).padStart(2, '0');
    const dataFormatada = `${ano}-${mes}-${dia}`;

    console.log('📅 Debug - Data selecionada formatada:', dataFormatada);
    // Ensure agendamentos is an array before filtering
    const filteredAgendamentos = Array.isArray(agendamentos) ?
    agendamentos.filter((a) => a.data_agendamento === dataFormatada) :
    [];
    console.log('📅 Debug - Agendamentos filtrados:', filteredAgendamentos);

    return filteredAgendamentos;
  }, [dataSelecionada, agendamentos]);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <style>{`
        .day-with-events {
          background-color: #3b82f6; /* Azul vivo para dias com agendamentos */
          color: white;
          border-radius: 50%;
          font-weight: bold;
        }
        .day-with-events:hover {
          background-color: #2563eb !important;
        }
        .day-doctor-available {
          background-color: #dcfce7; /* Verde claro para dias de atendimento médico */
          color: #166534;
          font-weight: bold;
          border: 2px solid #16a34a;
        }
        .day-doctor-available:hover {
          background-color: #bbf7d0 !important;
        }
        .day-both {
          background: linear-gradient(135deg, #3b82f6 0%, #3b82f6 50%, #dcfce7 50%, #dcfce7 100%);
          color: white;
          font-weight: bold;
          border: 2px solid #16a34a;
        }
        
        /* Aumentar tamanho do calendário */
        .calendar-large table {
          width: 100%;
        }
        .calendar-large td, .calendar-large th {
          padding: 8px;
        }
        .calendar-large button {
          width: 48px !important;
          height: 48px !important;
          font-size: 16px;
          color: #000 !important;
        }
        .calendar-large .day-with-events {
          color: white !important;
        }
        .calendar-large .day-both {
          color: white !important;
        }
        /* Dias da semana e navegação do mês */
        .calendar-large th {
          font-size: 14px;
          font-weight: 600;
        }
        .calendar-large [role="heading"] {
          font-size: 18px !important;
          font-weight: 600;
        }
        .calendar-large nav button {
          width: 36px !important;
          height: 36px !important;
        }
      `}</style>
      
      <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow calendar-large">
        <div className="mb-4 text-sm text-gray-600">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-blue-500 rounded w-4 h-4"></div>
              <span>Dias com agendamentos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-200 border-2 border-green-500"></div>
              <span>Dias de atendimento médico</span>
            </div>
          </div>
          
          {/* DEBUG: Mostrar quantos agendamentos existem */}
          <div className="mt-2 text-xs text-gray-500">
            Total de agendamentos: {Array.isArray(agendamentos) ? agendamentos.length : 0} | 
            Dias com eventos: {diasComEventos.size} |
            Data selecionada: {format(dataSelecionada, 'yyyy-MM-dd')} |
            Agendamentos do dia: {agendamentosDoDia.length}
          </div>
        </div>
        
        <Calendar
          mode="single"
          selected={dataSelecionada}
          onSelect={setDataSelecionada}
          className="p-0"
          locale={ptBR}
          modifiers={{
            comEventos: (date) => {
              const ano = date.getFullYear();
              const mes = String(date.getMonth() + 1).padStart(2, '0');
              const dia = String(date.getDate()).padStart(2, '0');
              const dataFormatada = `${ano}-${mes}-${dia}`;

              const temAgendamento = diasComEventos.has(dataFormatada);
              const medicoAtende = verificarAlgumMedicoAtendeNaData(date);

              return temAgendamento && !medicoAtende;
            },
            medicoDisponivel: (date) => {
              const ano = date.getFullYear();
              const mes = String(date.getMonth() + 1).padStart(2, '0');
              const dia = String(date.getDate()).padStart(2, '0');
              const dataFormatada = `${ano}-${mes}-${dia}`;

              const temAgendamento = diasComEventos.has(dataFormatada);
              const medicoAtende = verificarAlgumMedicoAtendeNaData(date);

              return medicoAtende && !temAgendamento;
            },
            ambos: (date) => {
              const ano = date.getFullYear();
              const mes = String(date.getMonth() + 1).padStart(2, '0');
              const dia = String(date.getDate()).padStart(2, '0');
              const dataFormatada = `${ano}-${mes}-${dia}`;

              const temAgendamento = diasComEventos.has(dataFormatada);
              const medicoAtende = verificarAlgumMedicoAtendeNaData(date);

              return temAgendamento && medicoAtende;
            }
          }}
          modifiersClassNames={{
            comEventos: 'day-with-events',
            medicoDisponivel: 'day-doctor-available',
            ambos: 'day-both'
          }} />

      </div>

      <div className="lg:col-span-1">
        <DetalheDia
          dia={dataSelecionada}
          agendamentos={agendamentosDoDia}
          medicos={medicos}
          pacientes={pacientes}
          loading={loading}
          onUpdate={onUpdate} />

      </div>
    </div>);

}