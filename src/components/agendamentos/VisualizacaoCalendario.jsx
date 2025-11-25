
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
      console.log('📅 Debug - Agendamentos recebidos:', agendamentos.map(a => ({
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
    const datas = agendamentos.map(a => a.data_agendamento);
    console.log('📅 Debug - Datas dos agendamentos:', datas);
    return new Set(datas);
  }, [agendamentos]);

  // Criar um mapa dos dias que os médicos atendem
  const diasAtendimentoMedicos = useMemo(() => {
    if (!medicos || medicos.length === 0) return new Set();
    
    const diasSet = new Set();
    medicos.forEach(medico => {
      if (medico.horarios_atendimento && Array.isArray(medico.horarios_atendimento)) {
        medico.horarios_atendimento.forEach(horario => {
          if (horario.dia_semana !== undefined && horario.dia_semana !== null) {
            diasSet.add(horario.dia_semana);
          }
        });
      }
    });
    
    return diasSet;
  }, [medicos]);

  const agendamentosDoDia = useMemo(() => {
    // CORREÇÃO: Usar as mesmas partes da data para comparação
    const ano = dataSelecionada.getFullYear();
    const mes = String(dataSelecionada.getMonth() + 1).padStart(2, '0');
    const dia = String(dataSelecionada.getDate()).padStart(2, '0');
    const dataFormatada = `${ano}-${mes}-${dia}`;
    
    console.log('📅 Debug - Data selecionada formatada:', dataFormatada);
    // Ensure agendamentos is an array before filtering
    const filteredAgendamentos = Array.isArray(agendamentos) 
      ? agendamentos.filter(a => a.data_agendamento === dataFormatada)
      : [];
    console.log('📅 Debug - Agendamentos filtrados:', filteredAgendamentos);
    
    return filteredAgendamentos;
  }, [dataSelecionada, agendamentos]);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <style>{`
        .day-with-events {
          background-color: #e0f2fe; /* Azul claro para dias com agendamentos */
          color: #0c4a6e;
          border-radius: 50%;
          font-weight: bold;
        }
        .day-with-events:hover {
          background-color: #bae6fd !important;
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
          background: linear-gradient(135deg, #e0f2fe 0%, #e0f2fe 50%, #dcfce7 50%, #dcfce7 100%);
          color: #0c4a6e;
          font-weight: bold;
          border: 2px solid #16a34a;
        }
      `}</style>
      
      <div className="lg:col-span-2 bg-white p-4 rounded-lg shadow">
        <div className="mb-4 text-sm text-gray-600">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-200 border-2 border-blue-500"></div>
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
              // CORREÇÃO: Usar as mesmas partes da data para comparação
              const ano = date.getFullYear();
              const mes = String(date.getMonth() + 1).padStart(2, '0');
              const dia = String(date.getDate()).padStart(2, '0');
              const dataFormatada = `${ano}-${mes}-${dia}`;
              
              const diaSemana = date.getDay();
              const temAgendamento = diasComEventos.has(dataFormatada);
              const medicoAtende = diasAtendimentoMedicos.has(diaSemana);
              
              return temAgendamento && !medicoAtende;
            },
            medicoDisponivel: (date) => {
              // CORREÇÃO: Usar as mesmas partes da data para comparação
              const ano = date.getFullYear();
              const mes = String(date.getMonth() + 1).padStart(2, '0');
              const dia = String(date.getDate()).padStart(2, '0');
              const dataFormatada = `${ano}-${mes}-${dia}`;
              
              const diaSemana = date.getDay();
              const temAgendamento = diasComEventos.has(dataFormatada);
              const medicoAtende = diasAtendimentoMedicos.has(diaSemana);
              
              return medicoAtende && !temAgendamento;
            },
            ambos: (date) => {
              // CORREÇÃO: Usar as mesmas partes da data para comparação
              const ano = date.getFullYear();
              const mes = String(date.getMonth() + 1).padStart(2, '0');
              const dia = String(date.getDate()).padStart(2, '0');
              const dataFormatada = `${ano}-${mes}-${dia}`;
              
              const diaSemana = date.getDay();
              const temAgendamento = diasComEventos.has(dataFormatada);
              const medicoAtende = diasAtendimentoMedicos.has(diaSemana);
              
              return temAgendamento && medicoAtende;
            }
          }}
          modifiersClassNames={{
            comEventos: 'day-with-events',
            medicoDisponivel: 'day-doctor-available',
            ambos: 'day-both'
          }}
        />
      </div>

      <div className="lg:col-span-1">
        <DetalheDia
          dia={dataSelecionada}
          agendamentos={agendamentosDoDia}
          medicos={medicos}
          pacientes={pacientes}
          loading={loading}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}
