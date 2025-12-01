import React, { useState, useEffect, useCallback } from "react";
import { Agendamento, Medico, Paciente } from "@/entities/all";
import { format, startOfWeek, endOfWeek, getDayOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Heart } from "lucide-react";
import { safeApiCall } from "@/components/shared/apiThrottle";
import { getDashboardStats } from "@/functions/getDashboardStats";

import AgendamentosHoje from "../components/dashboard/AgendamentosHoje";
import AgendamentosSemana from "../components/dashboard/AgendamentosSemana";
import EstatisticasRapidas from "../components/dashboard/EstatisticasRapidas";
import AssistenteIA from "../components/dashboard/AssistenteIA";

const mensagensMotivacionais = [
  "✨ Cada paciente atendido é uma vida transformada!",
  "❤️ Sua dedicação faz a diferença na saúde de muitas pessoas!",
  "🌟 Juntos, construímos um futuro mais saudável!",
  "💪 Excelência no atendimento é o que nos move!",
  "🎯 Cada dia é uma nova oportunidade de cuidar bem!",
  "🌈 Transformando vidas através do cuidado humanizado!",
  "🚀 Inovação e cuidado caminhando juntos!",
  "💙 O bem-estar dos pacientes é nossa maior conquista!"
];

export default function Dashboard() {
  const [agendamentosHoje, setAgendamentosHoje] = useState([]);
  const [agendamentosSemana, setAgendamentosSemana] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [totalPacientesCount, setTotalPacientesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mensagemMotivacional, setMensagemMotivacional] = useState("");

  useEffect(() => {
    // Lógica da Mensagem Motivacional Diária
    const today = new Date();
    const todayFormatted = format(today, "yyyy-MM-dd");
    const lastMessageDate = localStorage.getItem('lastMessageDate');

    if (lastMessageDate !== todayFormatted) {
      const dayOfYear = getDayOfYear(today);
      const messageIndex = dayOfYear % mensagensMotivacionais.length;
      const newMessage = mensagensMotivacionais[messageIndex];
      
      setMensagemMotivacional(newMessage);
      localStorage.setItem('dailyMessage', newMessage);
      localStorage.setItem('lastMessageDate', todayFormatted);
    } else {
      const storedMessage = localStorage.getItem('dailyMessage');
      setMensagemMotivacional(storedMessage || mensagensMotivacionais[0]);
    }
  }, []);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🔄 Dashboard: Iniciando carregamento controlado de dados...');
      
      // CORRIGIDO: Carregamento sequencial para evitar rate limit
      const agendamentosData = await safeApiCall(() => Agendamento.list(), []);
      const medicosData = await safeApiCall(() => Medico.list(), []);
      const pacientesData = await safeApiCall(() => Paciente.list(), []);
      
      // Buscar contagem real de pacientes via backend function
      const statsResponse = await safeApiCall(() => getDashboardStats(), { data: { totalPacientes: 0 } });
      const totalPacientesReal = statsResponse.data?.totalPacientes || 0;

      console.log('📊 Dashboard: Dados carregados com sucesso');
      
      const agendamentosArray = Array.isArray(agendamentosData) ? agendamentosData : [];
      const medicosArray = Array.isArray(medicosData) ? medicosData : [];
      const pacientesArray = Array.isArray(pacientesData) ? pacientesData : [];
      
      setTotalPacientesCount(totalPacientesReal || pacientesArray.length);

      const hoje = new Date();
      const inicioSemana = startOfWeek(hoje, { weekStartsOn: 1 });
      const fimSemana = endOfWeek(hoje, { weekStartsOn: 1 });
      const hojeFormatado = format(hoje, "yyyy-MM-dd");
      
      const agendamentosHojeFiltered = agendamentosArray.filter(
        agendamento => agendamento && agendamento.data_agendamento === hojeFormatado
      );

      const agendamentosSemanaFiltered = agendamentosArray.filter(agendamento => {
        if (!agendamento || !agendamento.data_agendamento) return false;
        const dataAgendamento = new Date(agendamento.data_agendamento);
        return dataAgendamento >= inicioSemana && dataAgendamento <= fimSemana;
      });

      setAgendamentosHoje(agendamentosHojeFiltered);
      setAgendamentosSemana(agendamentosSemanaFiltered);
      setMedicos(medicosArray);
      setPacientes(pacientesArray);

    } catch (error) {
      console.error("Erro ao carregar dados do dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const estatisticas = {
    totalPacientes: totalPacientesCount,
    totalMedicos: medicos.length,
    agendamentosHoje: agendamentosHoje.length,
    agendamentosSemana: agendamentosSemana.length,
    confirmados: agendamentosHoje.filter(a => a && a.status === "Pago").length,
    finalizados: agendamentosHoje.filter(a => a && a.status === "Finalizado").length,
    cancelados: agendamentosHoje.filter(a => a && a.status === "Cancelado").length
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600 mb-4">
            Visão geral da clínica - {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          
          {/* Mensagem Motivacional */}
          <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg mb-6">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <Sparkles className="w-8 h-8 text-yellow-300" />
                </div>
                <div className="flex-1">
                  <p className="text-lg font-medium">{mensagemMotivacional}</p>
                  <p className="text-blue-100 text-sm mt-1">Centro Vida Saúde - Cuidando de você com excelência</p>
                </div>
                <div className="flex-shrink-0">
                  <Heart className="w-6 h-6 text-pink-300" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <EstatisticasRapidas estatisticas={estatisticas} loading={loading} />

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <AgendamentosHoje 
            agendamentos={agendamentosHoje}
            medicos={medicos}
            pacientes={pacientes}
            loading={loading}
            onUpdate={carregarDados}
          />
          
          <AgendamentosSemana 
            agendamentos={agendamentosSemana}
            medicos={medicos}
            pacientes={pacientes}
            loading={loading}
          />
        </div>

        <div className="mt-6">
          <AssistenteIA />
        </div>
      </div>
    </div>
  );
}