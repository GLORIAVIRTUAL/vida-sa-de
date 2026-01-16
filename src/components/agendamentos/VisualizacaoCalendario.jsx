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
        /* Container principal */
        .calendar-wrapper {
          width: 100%;
          display: flex;
          justify-content: center;
          overflow-x: auto;
          padding: 20px;
        }

        /* Calendário estilo grade */
        .calendar-grid {
          width: auto;
          min-width: max-content;
        }

        /* Cabeçalho com mês e navegação */
        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          gap: 16px;
        }

        .calendar-header button {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background-color: #f1f5f9;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          font-size: 18px;
          transition: all 0.2s ease;
        }

        .calendar-header button:hover {
          background-color: #e2e8f0;
        }

        .calendar-header h2 {
          font-size: 20px;
          font-weight: 700;
          color: #1e293b;
          text-transform: capitalize;
          flex: 1;
          text-align: center;
        }

        /* Dias da semana */
        .weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 16px;
          margin-bottom: 16px;
        }

        .weekday {
          text-align: center;
          font-size: 16px;
          font-weight: 700;
          color: #64748b;
          padding: 12px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Grid de dias */
        .days-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 16px;
        }

        /* Botão de dia */
        .day-cell {
          aspect-ratio: 1;
          min-height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          font-size: 24px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          background-color: #ffffff;
          color: #1e293b;
          border: 2px solid #e2e8f0;
        }

        .day-cell:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        /* Dia com agendamentos (Azul) */
        .day-with-events {
          background-color: #3b82f6 !important;
          color: white !important;
          border: none !important;
          box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
        }

        .day-with-events:hover {
          background-color: #2563eb !important;
        }

        /* Médico disponível (Verde) */
        .day-doctor-available {
          background-color: #ecfdf5 !important;
          color: #047857 !important;
          border: 2px solid #10b981 !important;
        }

        .day-doctor-available:hover {
          background-color: #d1fae5 !important;
        }

        /* Ambos (Azul com borda Verde) */
        .day-both {
          background-color: #3b82f6 !important;
          color: white !important;
          border: 3px solid #10b981 !important;
          box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.4);
        }

        .day-both:hover {
          background-color: #2563eb !important;
        }

        /* Dia fora do mês */
        .day-outside {
          color: #cbd5e1;
          pointer-events: none;
        }

        /* Dia de hoje */
        .day-today {
          background-color: #1e293b !important;
          color: white !important;
          border: 2px solid #1e293b !important;
        }
      `}</style>
      
      <div className="lg:col-span-2 bg-white p-12 rounded-xl shadow-sm border border-gray-100">
        <div className="mb-8 flex justify-center">
          <div className="inline-flex flex-wrap items-center gap-6 px-6 py-3 bg-gray-50 rounded-full border border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-md bg-blue-500 shadow-sm"></div>
              <span className="text-sm font-medium text-gray-600">Com agendamentos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-md bg-emerald-50 border-2 border-emerald-500"></div>
              <span className="text-sm font-medium text-gray-600">Médico disponível</span>
            </div>
          </div>
        </div>
        
        <div className="calendar-wrapper">
          <Calendar
            mode="single"
            selected={dataSelecionada}
            onSelect={setDataSelecionada}
            className="calendar-grid w-full"
            locale={ptBR}
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4 w-full",
              caption: "flex justify-center pt-1 relative items-center mb-4",
              caption_label: "text-xl font-bold text-gray-800",
              nav: "space-x-3 flex items-center",
              nav_button: "h-8 w-8 bg-gray-100 hover:bg-gray-200 rounded-lg p-0",
              nav_button_previous: "absolute left-0",
              nav_button_next: "absolute right-0",
              table: "w-full border-collapse space-y-3",
              head_row: "flex gap-3",
              head_cell: "text-gray-600 font-bold text-sm w-14 h-14 flex items-center justify-center",
              row: "flex w-full gap-3",
              cell: "relative p-0 text-center h-16 w-16",
              day: "h-16 w-16 p-0 font-semibold text-lg rounded-lg border-2 border-gray-200 hover:shadow-md transition-all",
              day_selected: "bg-gray-800 text-white border-gray-800",
              day_today: "bg-gray-200 text-gray-800",
              day_outside: "text-gray-300",
              day_disabled: "text-gray-300 opacity-50",
            }}
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