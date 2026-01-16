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
        /* Estilização Geral do Calendário */
        .calendar-large {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .calendar-large table {
          width: 100%;
          max-width: 600px; /* Limita largura máxima para não esticar demais */
          margin: 0 auto;
          border-collapse: separate;
          border-spacing: 8px; /* Espaço entre as células */
        }
        .calendar-large th {
          text-align: center;
          padding-bottom: 12px;
          font-size: 14px;
          font-weight: 600;
          color: #64748b;
          text-transform: capitalize;
        }
        .calendar-large td {
          padding: 0;
          text-align: center;
        }

        /* Estilo Base dos Botões de Dia */
        .calendar-large button.rdp-day {
          width: 52px !important;
          height: 52px !important;
          font-size: 16px;
          border-radius: 14px !important; /* Quadrado arredondado */
          margin: 0 auto;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1e293b !important; /* Cor padrão do texto */
        }
        
        /* Dia Selecionado (padrão do componente) */
        .calendar-large button.rdp-day_selected:not(.day-with-events):not(.day-both) {
          background-color: #1e293b !important;
          color: white !important;
        }

        /* Modificador: Dia com Agendamentos (Azul) */
        .day-with-events {
          background-color: #3b82f6 !important;
          color: white !important;
          font-weight: 600;
          box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
        }
        .day-with-events:hover {
          background-color: #2563eb !important;
          transform: translateY(-2px);
        }

        /* Modificador: Médico Disponível (Verde) */
        .day-doctor-available {
          background-color: #ecfdf5 !important;
          color: #047857 !important;
          font-weight: 600;
          border: 2px solid #10b981 !important;
        }
        .day-doctor-available:hover {
          background-color: #d1fae5 !important;
          transform: translateY(-2px);
        }

        /* Modificador: Ambos (Azul com borda Verde) */
        .day-both {
          background-color: #3b82f6 !important;
          color: white !important;
          font-weight: 600;
          border: 3px solid #4ade80 !important; /* Borda verde indicando disponibilidade extra */
          box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.4);
        }
        .day-both:hover {
          background-color: #2563eb !important;
          transform: translateY(-2px);
        }

        /* Navegação */
        .calendar-large [role="heading"] {
          font-size: 1.25rem !important;
          font-weight: 700;
          text-transform: capitalize;
          margin-bottom: 16px;
          color: #334155;
        }
        .calendar-large nav button {
          width: 40px !important;
          height: 40px !important;
          border-radius: 10px;
          background-color: #f1f5f9;
        }
        .calendar-large nav button:hover {
          background-color: #e2e8f0;
        }
      `}</style>
      
      <div className="lg:col-span-2 bg-white p-8 rounded-xl shadow-sm border border-gray-100 calendar-large">
        <div className="w-full max-w-[600px] mb-8 flex justify-center">
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