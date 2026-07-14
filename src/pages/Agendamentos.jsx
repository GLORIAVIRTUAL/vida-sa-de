import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Agendamento, Medico, Paciente, Procedimento, Exame, Notification, CategoriaPreco, TabelaPreco } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Plus, List, Grid3x3, Printer, Clock, Stethoscope, User, RefreshCw, Columns3 } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast"; // Import useToast
import { Card, CardContent } from "@/components/ui/card"; // Import Card and CardContent
import { Label } from "@/components/ui/label"; // Import Label
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select components
import { Badge } from "@/components/ui/badge"; // Import Badge
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import ProtectedRoute from "../components/auth/ProtectedRoute";
import VisualizacaoDiaria from "../components/agendamentos/VisualizacaoDiaria";
import VisualizacaoCalendario from "../components/agendamentos/VisualizacaoCalendario";
import VisualizacaoKanban from "../components/agendamentos/VisualizacaoKanban";
import FormularioAgendamento from "../components/agendamentos/FormularioAgendamento";
import FormularioReserva from "../components/agendamentos/FormularioReserva";
import FiltrosAgendamento from "../components/agendamentos/FiltrosAgendamento";
import { cachedApiCall, clearCache } from "@/components/shared/apiThrottle";

export default function Agendamentos() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = useQuery({ queryKey: ['agendamentos'], queryFn: () => base44.entities.Agendamento.list('-data_agendamento', 3000), staleTime: 60000 });
  const { data: medicos = [], isLoading: loadingMedicos } = useQuery({ queryKey: ['medicos'], queryFn: () => base44.entities.Medico.list(), staleTime: 60000 });
  const { data: pacientes = [], isLoading: loadingPacientes } = useQuery({ queryKey: ['pacientes'], queryFn: () => base44.entities.Paciente.list('-created_date', 5000), staleTime: 60000 });
  const { data: procedimentos = [] } = useQuery({ queryKey: ['procedimentos'], queryFn: () => base44.entities.Procedimento.list(), staleTime: 60000 });
  const { data: exames = [] } = useQuery({ queryKey: ['exames'], queryFn: () => base44.entities.Exame.list(), staleTime: 60000 });
  const { data: categorias = [] } = useQuery({ queryKey: ['categorias'], queryFn: () => base44.entities.CategoriaPreco.list(), staleTime: 60000 });
  const { data: tabelaPrecos = [] } = useQuery({ queryKey: ['tabelaPrecos'], queryFn: () => base44.entities.TabelaPreco.list(), staleTime: 60000 });
  
  const loading = loadingAgendamentos || loadingMedicos || loadingPacientes;
  const [diaSelecionado, setDiaSelecionado] = useState(new Date());
  const handleDiaSelecionado = (date) => {
    if (date) setDiaSelecionado(date);
  };
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isReservaOpen, setIsReservaOpen] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] = useState(null);
  const [dadosIniciaisAgendamento, setDadosIniciaisAgendamento] = useState(null);
  const [visualizacao, setVisualizacao] = useState("lista");
  const [filtros, setFiltros] = useState({
    periodo: "dia",
    medico: "todos",
    status: "todos",
    tipo: "todos",
    busca: ""
  });
  const [filtroMedicoCalendario, setFiltroMedicoCalendario] = useState("todos"); // New state for calendar doctor filter
  const [filtroDentistaOdonto, setFiltroDentistaOdonto] = useState("todos"); // Filtro Lidiane/Ramão
  const [corrigindo, setCorrigindo] = useState(false); // Novo estado para correção

  const { toast } = useToast(); // Initialize useToast

  const handleCorrigirNomes = async () => {
    setCorrigindo(true);
    try {
      toast({ title: "Sincronizando...", description: "Buscando e corrigindo nomes faltantes..." });
      const res = await base44.functions.invoke('fixAppointmentPatientNames', {});
      if (res.data?.success) {
        toast({
          title: "Sucesso",
          description: res.data.message || "Nomes sincronizados com sucesso!",
          className: "bg-green-50 border-green-200"
        });
        await carregarDados();
      } else {
        toast({ title: "Aviso", description: "Não foi possível completar a sincronização.", variant: "destructive" });
      }
    } catch (error) {
      console.error(error);
      toast({ title: "Erro", description: "Falha ao chamar função de correção.", variant: "destructive" });
    } finally {
      setCorrigindo(false);
    }
  };

  const carregarDados = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  // Verificar se há dados iniciais vindos da navegação (do Dashboard)
  useEffect(() => {
    if (location.state?.dadosIniciais) {
      setDadosIniciaisAgendamento(location.state.dadosIniciais);
      setIsFormOpen(true);
    }
  }, [location.state]);

  // Subscription para atualizar automaticamente quando agendamentos mudam
  useEffect(() => {
    console.log('🔌 Configurando subscription de agendamentos...');
    
    const unsubscribe = base44.entities.Agendamento.subscribe((event) => {
      console.log('🔔 Agendamento atualizado via subscription:', event.type, event.id, event.data?.status);
      
      // Limpar cache imediatamente
      clearCache('agendamentos');
      
      if (event.type === 'update' && event.data) {
        queryClient.setQueryData(['agendamentos'], (prev = []) => {
          const updated = prev.map(ag => 
            ag.id === event.id ? { ...ag, ...event.data } : ag
          );
          return updated;
        });
      } else if (event.type === 'create' && event.data) {
        queryClient.setQueryData(['agendamentos'], (prev = []) => [event.data, ...prev]);
      } else if (event.type === 'delete') {
        queryClient.setQueryData(['agendamentos'], (prev = []) => prev.filter(ag => ag.id !== event.id));
      }
    });

    return () => {
      console.log('🔌 Removendo subscription de agendamentos');
      unsubscribe();
    };
  }, []);

  const getAgendamentosPorPeriodo = () => {
    const dataBase = diaSelecionado instanceof Date && !isNaN(diaSelecionado) ? diaSelecionado : new Date();
    let dataInicio, dataFim;

    switch (filtros.periodo) {
      case "semana":
        dataInicio = startOfWeek(dataBase, { weekStartsOn: 1 });
        dataFim = endOfWeek(dataBase, { weekStartsOn: 1 });
        break;
      case "mes":
        dataInicio = startOfMonth(dataBase);
        dataFim = endOfMonth(dataBase);
        break;
      default: // "dia"
        dataInicio = dataBase;
        dataFim = dataBase;
        break;
    }

    const inicioFormatado = format(dataInicio, "yyyy-MM-dd");
    const fimFormatado = format(dataFim, "yyyy-MM-dd");

    const agendamentosArray = Array.isArray(agendamentos) ? agendamentos : [];
    return agendamentosArray.filter((agendamento) => {
      // Ensure data_agendamento is comparable
      const agendamentoDate = new Date(agendamento.data_agendamento + 'T00:00:00'); // Add T00:00:00 for correct date comparison
      const inicioDate = new Date(inicioFormatado + 'T00:00:00');
      const fimDate = new Date(fimFormatado + 'T00:00:00');

      return agendamento &&
      agendamento.data_agendamento &&
      agendamentoDate >= inicioDate &&
      agendamentoDate <= fimDate;
    });
  };

  const agendamentosPorPeriodo = getAgendamentosPorPeriodo();

  // Função para normalizar strings (remover acentos e converter para maiúsculas)
  const normalizeString = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  };

  // Identificar médicos de odontologia
  const medicosOdontologia = useMemo(() => {
    return medicos.filter(m => normalizeString(m.especialidade) === 'ODONTOLOGIA').map(m => m.id);
  }, [medicos]);

  // Verificar se o filtro atual é odontologia
  const filtroEhOdontologia = useMemo(() => {
    return filtros.medico !== "todos" && medicosOdontologia.includes(filtros.medico);
  }, [filtros.medico, medicosOdontologia]);

  // Resetar filtro de dentista quando mudar o filtro de médico
  useEffect(() => {
    if (!filtroEhOdontologia) {
      setFiltroDentistaOdonto("todos");
    }
  }, [filtroEhOdontologia]);

  // Função para detectar dentista real de um agendamento (Lidiane nas observações)
  const obterDentistaReal = useCallback((ag) => {
    const obs = ag.observacoes || '';
    const matchDentista = obs.match(/Dentista:\s*(Dr[a]?\.\s*.+?)(?:\n|$)/i);
    if (matchDentista) {
      const nomeDentista = matchDentista[1].trim().toLowerCase();
      const medEncontrado = medicos.find(m => {
        const nNorm = m.nome.toLowerCase().replace(/^dr[a]?\.\s*/i, '').trim();
        const dNorm = nomeDentista.replace(/^dr[a]?\.\s*/i, '').trim();
        return nNorm === dNorm || nNorm.includes(dNorm) || dNorm.includes(nNorm);
      });
      if (medEncontrado) return medEncontrado.id;
    }
    return ag.medico_id;
  }, [medicos]);

  // Identificar médicos "Dr. Ruben" (múltiplas especialidades)
  const medicosRuben = useMemo(() => {
    return medicos.filter(m => normalizeString(m.nome).includes('RUBEN')).map(m => m.id);
  }, [medicos]);

  // Identificar médicos "Dr. Delazeri" (agendas unificadas Neurologia/Neuropediatra)
  const medicosDelazeri = useMemo(() => {
    return medicos.filter(m => normalizeString(m.nome).includes('DELAZERI')).map(m => m.id);
  }, [medicos]);

  const [filtroAgendaDelazeri, setFiltroAgendaDelazeri] = useState("todos");

  const filtroEhDelazeri = useMemo(() => {
    return filtros.medico !== "todos" && medicosDelazeri.includes(filtros.medico);
  }, [filtros.medico, medicosDelazeri]);

  useEffect(() => {
    if (!filtroEhDelazeri) {
      setFiltroAgendaDelazeri("todos");
    }
  }, [filtroEhDelazeri]);

  // Se há busca, ignora o filtro de período e busca em todos os agendamentos
  const buscaAtiva = (filtros.busca || '').trim().length > 0;
  const baseAgendamentos = buscaAtiva
    ? (Array.isArray(agendamentos) ? agendamentos : [])
    : (Array.isArray(agendamentosPorPeriodo) ? agendamentosPorPeriodo : []);

  // Mapa rápido id -> paciente para busca por telefone
  const pacientesMap = useMemo(() => {
    const map = {};
    (pacientes || []).forEach(p => { if (p?.id) map[p.id] = p; });
    return map;
  }, [pacientes]);

  const termoBusca = normalizeString((filtros.busca || '').trim());
  const termoBuscaTel = (filtros.busca || '').replace(/\D/g, '');

  const agendamentosFiltrados = baseAgendamentos.filter((agendamento) => {
    if (!agendamento) return false;

    // Lógica especial para odontologia e Dr. Ruben: se filtrar por qualquer um do grupo, mostrar todos do grupo
    let filtroMedico = false;
    if (filtros.medico === "todos") {
      filtroMedico = true;
    } else if (medicosOdontologia.includes(filtros.medico)) {
      // Se o filtro é um dentista, mostrar agendamentos de TODOS os dentistas
      filtroMedico = medicosOdontologia.includes(agendamento.medico_id);
      
      // Sub-filtro por dentista específico (Lidiane/Ramão)
      if (filtroMedico && filtroDentistaOdonto !== "todos") {
        const dentistaReal = obterDentistaReal(agendamento);
        filtroMedico = dentistaReal === filtroDentistaOdonto;
      }
    } else if (medicosRuben.includes(filtros.medico)) {
      // Se o filtro é um "Ruben", mostrar agendamentos de TODOS os "Rubens"
      filtroMedico = medicosRuben.includes(agendamento.medico_id);
    } else if (medicosDelazeri.includes(filtros.medico)) {
      // Se o filtro é um "Delazeri", mostrar agendamentos de TODAS as agendas dele
      filtroMedico = medicosDelazeri.includes(agendamento.medico_id);

      // Sub-filtro por agenda específica (Neurologia/Neuropediatra)
      if (filtroMedico && filtroAgendaDelazeri !== "todos") {
        filtroMedico = agendamento.medico_id === filtroAgendaDelazeri;
      }
    } else {
      filtroMedico = agendamento.medico_id === filtros.medico;
    }

    const filtroStatus = filtros.status === "todos" || agendamento.status === filtros.status;
    const filtroTipo = filtros.tipo === "todos" || agendamento.tipo_servico === filtros.tipo;

    // Filtro de busca por nome do paciente ou telefone
    let filtroBusca = true;
    if (buscaAtiva) {
      const paciente = pacientesMap[agendamento.paciente_id];
      const nomeAg = normalizeString(agendamento.paciente_nome || paciente?.nome || '');
      const telPaciente = (paciente?.telefone || '').replace(/\D/g, '');
      const telSecundario = (paciente?.telefone_secundario || '').replace(/\D/g, '');

      const matchNome = termoBusca.length > 0 && nomeAg.includes(termoBusca);
      const matchTel = termoBuscaTel.length >= 3 && (
        telPaciente.includes(termoBuscaTel) || telSecundario.includes(termoBuscaTel)
      );

      filtroBusca = matchNome || matchTel;
    }

    return filtroMedico && filtroStatus && filtroTipo && filtroBusca;
  });

  // CORRIGIDO: Filtrar agendamentos do calendário por médico E por mês atual
  const agendamentosCalendario = useMemo(() => {
    const mesAtual = format(diaSelecionado, 'yyyy-MM');

    return agendamentos.filter((a) => {
      if (!a || !a.data_agendamento) return false;

      // Filtrar pelo mês sendo visualizado
      const mesAgendamento = a.data_agendamento.substring(0, 7); // "2025-01"
      const dentroDoMes = mesAgendamento === mesAtual;

      // Filtrar por médico se selecionado
      const filtroMedico = filtroMedicoCalendario === "todos" || a.medico_id === filtroMedicoCalendario;

      return dentroDoMes && filtroMedico;
    });
  }, [agendamentos, diaSelecionado, filtroMedicoCalendario]);

  const handleSave = async () => {
    try {
      console.log('📝 handleSave chamado');

      // Limpar cache e recarregar
      clearCache('agendamentos');
      await carregarDados();

      console.log('✅ Dados recarregados');
    } catch (error) {
      console.error('❌ Erro ao recarregar dados:', error);
    }
  };

  const handleOpenForm = (agendamento = null) => {
    setSelectedAgendamento(agendamento);
    setDadosIniciaisAgendamento(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedAgendamento(null);
    setDadosIniciaisAgendamento(null);
  };

  const handleEditarAgendamento = (agendamento) => {
    handleOpenForm(agendamento);
  };

  const getTituloPeriodo = () => {
    switch (filtros.periodo) {
      case "semana":
        const inicioSemana = startOfWeek(diaSelecionado, { weekStartsOn: 1 });
        const fimSemana = endOfWeek(diaSelecionado, { weekStartsOn: 1 });
        return `Semana de ${format(inicioSemana, "dd/MM", { locale: ptBR })} a ${format(fimSemana, "dd/MM", { locale: ptBR })} de ${format(diaSelecionado, "yyyy", { locale: ptBR })}`;
      case "mes":
        return format(diaSelecionado, "MMMM 'de' yyyy", { locale: ptBR });
      default:
        return format(diaSelecionado, "PPP", { locale: ptBR });
    }
  };

  const handleImprimirAgenda = () => {
    // Usar os agendamentos corretos dependendo da visualização
    let agendamentosParaImpressao;
    let medicoParaImpressao;
    let tituloPeriodo;

    if (visualizacao === "calendario") {
      // CORRIGIDO: Modo calendário - filtrar apenas pelo DIA selecionado
      const dataFormatada = format(diaSelecionado, 'yyyy-MM-dd');

      agendamentosParaImpressao = agendamentos.filter((a) => {
        if (!a || !a.data_agendamento) return false;

        // Filtrar pelo dia selecionado
        const mesmoDia = a.data_agendamento === dataFormatada;

        // Filtrar por médico se selecionado
        const filtroMedico = filtroMedicoCalendario === "todos" || a.medico_id === filtroMedicoCalendario;

        return mesmoDia && filtroMedico;
      });

      medicoParaImpressao = filtroMedicoCalendario !== "todos" ?
      medicos.find((m) => m.id === filtroMedicoCalendario) :
      null;
      tituloPeriodo = format(diaSelecionado, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } else {
      // Modo lista: usar agendamentosFiltrados
      agendamentosParaImpressao = Array.isArray(agendamentosFiltrados) ? agendamentosFiltrados : [];
      medicoParaImpressao = filtros.medico !== "todos" ?
      medicos.find((m) => m.id === filtros.medico) :
      null;
      tituloPeriodo = getTituloPeriodo();
    }

    // Ordenar por horário, remover cancelados
    agendamentosParaImpressao = agendamentosParaImpressao.
    filter((a) => a && a.status !== 'Cancelado').
    sort((a, b) => {
      if ((a.data_agendamento || '') !== (b.data_agendamento || '')) {
        return (a.data_agendamento || '').localeCompare(b.data_agendamento || '');
      }
      return (a.horario || '').localeCompare(b.horario || '');
    });

    // Função para gerar HTML de uma linha de agendamento
    const gerarLinhaAgendamento = (ag) => {
      const paciente = pacientes.find((p) => p.id === ag.paciente_id);
      const categoria = categorias.find((c) => c.id === ag.categoria_preco_id);
      const nomePaciente = paciente?.nome || ag.paciente_nome || 'N/A';
      const cpfPaciente = paciente?.cpf || '';
      const telefonePaciente = paciente?.telefone || '';
      const convenioPaciente = paciente?.convenio || '';
      const tipoServico = ag.tipo_servico || '';
      let tipoLabel = tipoServico;
      let tipoStyle = '';
      if (tipoServico === 'Retorno') { tipoLabel = '↩ Retorno'; tipoStyle = 'color: #7c3aed; font-weight: bold;'; }
      else if (tipoServico === 'Consulta') { tipoLabel = 'Consulta'; tipoStyle = 'color: #2563eb; font-weight: bold;'; }
      else if (tipoServico === 'Procedimento') { tipoLabel = 'Proced.'; tipoStyle = 'color: #d97706;'; }
      else if (tipoServico === 'Exame') { tipoLabel = 'Exame'; tipoStyle = 'color: #059669;'; }
      let obsLimpa = ag.observacoes || '';
      if (obsLimpa) {
        obsLimpa = obsLimpa.split('\n').filter(linha => {
          const lu = linha.toUpperCase();
          return !lu.includes('CONVÊNIO:') && !lu.includes('CATEGORIA') && !lu.includes('CARTÃO') && !lu.includes('DENTISTA:') && !lu.includes('ESPECIALIDADE:');
        }).join(' | ').trim();
      }
      return `<tr>
        <td>${format(new Date(ag.data_agendamento + 'T00:00:00'), 'dd/MM/yyyy')}</td>
        <td><strong>${ag.horario}</strong></td>
        <td style="${tipoStyle}">${tipoLabel}</td>
        <td>${cpfPaciente ? cpfPaciente + ' - ' : ''}${nomePaciente}</td>
        <td>${convenioPaciente}</td>
        <td>${telefonePaciente}</td>
        <td>${categoria?.nome || ''}</td>
        <td>${obsLimpa}</td>
        <td>${ag.created_by?.split('@')[0]?.toUpperCase() || ''}</td>
      </tr>`;
    };

    // Verificar se é odontologia para separar por dentista
    const ehOdontologia = medicoParaImpressao && medicosOdontologia.includes(medicoParaImpressao.id);
    
    let corpoTabelas = '';
    if (ehOdontologia && filtroDentistaOdonto === "todos") {
      // Separar agendamentos por dentista real
      const dentistasOdonto = medicos.filter(m => medicosOdontologia.includes(m.id));
      dentistasOdonto.forEach(dentista => {
        const agsDentista = agendamentosParaImpressao.filter(ag => obterDentistaReal(ag) === dentista.id);
        if (agsDentista.length === 0) return;
        corpoTabelas += `
          <div class="profissional" style="margin-top: 8px; background: #e0f2f1; border-left: 3px solid #009688;">
            🦷 ${dentista.nome.toUpperCase()} (${agsDentista.length} agendamentos)
          </div>
          <table>
            <thead><tr>
              <th style="width: 55px;">Data</th><th style="width: 35px;">Hora</th><th style="width: 45px;">Tipo</th>
              <th>Descrição</th><th style="width: 65px;">Conv. Paciente</th><th style="width: 70px;">Celular</th>
              <th style="width: 80px;">Categoria</th><th style="width: 60px;">Observação</th><th style="width: 50px;">Atendente</th>
            </tr></thead>
            <tbody>${agsDentista.map(gerarLinhaAgendamento).join('')}</tbody>
          </table>`;
      });
    } else {
      // Impressão normal (não odontologia, ou dentista específico selecionado)
      const nomeProfissional = (ehOdontologia && filtroDentistaOdonto !== "todos") 
        ? medicos.find(m => m.id === filtroDentistaOdonto)?.nome 
        : medicoParaImpressao?.nome;
      
      if (nomeProfissional) {
        corpoTabelas += `<div class="profissional">Profissional: ${nomeProfissional.toUpperCase()}</div>`;
      }
      corpoTabelas += `
        <table>
          <thead><tr>
            <th style="width: 55px;">Data</th><th style="width: 35px;">Hora</th><th style="width: 45px;">Tipo</th>
            <th>Descrição</th><th style="width: 65px;">Conv. Paciente</th><th style="width: 70px;">Celular</th>
            <th style="width: 80px;">Categoria</th><th style="width: 60px;">Observação</th><th style="width: 50px;">Atendente</th>
          </tr></thead>
          <tbody>${agendamentosParaImpressao.length === 0 ? `<tr><td colspan="9" style="text-align: center; padding: 20px;">Nenhum agendamento</td></tr>` : agendamentosParaImpressao.map(gerarLinhaAgendamento).join('')}</tbody>
        </table>`;
    }

    console.log('📋 Imprimindo:', {
      modo: visualizacao,
      dia: visualizacao === "calendario" ? format(diaSelecionado, 'yyyy-MM-dd') : 'N/A',
      total: agendamentosParaImpressao.length,
      medico: medicoParaImpressao?.nome || 'Todos',
      periodo: tituloPeriodo,
      ehOdontologia,
      filtroDentista: filtroDentistaOdonto
    });

    const conteudoImpressao = `
      <html>
      <head>
        <title>Agendamentos - ${tituloPeriodo}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 5px; font-size: 7px; line-height: 1; }
          .header { margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px solid #000; }
          .header h1 { font-size: 11px; font-weight: bold; margin-bottom: 0; line-height: 1.2; }
          .header .subtitle { font-size: 9px; margin-bottom: 0; line-height: 1.2; }
          .info-line { font-size: 8px; margin: 0; line-height: 1.2; }
          .profissional { font-weight: bold; margin: 3px 0 2px 0; font-size: 9px; background: #f5f5f5; padding: 1px 2px; line-height: 1.2; }
          table { width: 100%; border-collapse: collapse; margin-top: 1px; font-size: 7px; }
          th, td { border: 1px solid #ccc; padding: 1px 2px; text-align: left; line-height: 1; vertical-align: top; }
          th { background-color: #e0e0e0; font-weight: bold; font-size: 7px; padding: 1px 2px; }
          .footer { margin-top: 4px; font-size: 6px; text-align: right; color: #666; line-height: 1.2; }
          @media print { body { padding: 3px; } @page { margin: 6mm; size: A4; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Centro Vida Saúde</h1>
          <div class="subtitle">Agendamentos</div>
          <div class="info-line">${visualizacao === "lista" ? getTituloPeriodo() : format(diaSelecionado, "dd/MM/yyyy", { locale: ptBR })}</div>
        </div>
        
        ${corpoTabelas}
        
        <div class="footer">
          Impresso em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </div>
      </body>
      </html>
    `;

    const janelaImpressao = window.open('', '_blank');
    if (janelaImpressao) {
      janelaImpressao.document.write(conteudoImpressao);
      janelaImpressao.document.close();
      janelaImpressao.focus();

      setTimeout(() => {
        janelaImpressao.print();
      }, 250);
    } else {
      console.error("Could not open print window. Please ensure pop-ups are not blocked.");
      toast({
        title: "Erro ao imprimir",
        description: "Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está desativado.",
        variant: "destructive"
      });
    }
  };

  return (
    <ProtectedRoute requiredRole={["admin", "user"]} fallbackMessage="Você não tem permissão para gerenciar agendamentos.">
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-cyan-500 mb-2 text-3xl font-bold">Agendamentos</h1>
              <p className="text-gray-600 mt-1"></p>
              <div className="flex items-center gap-4">
                {(visualizacao === "lista" || visualizacao === "kanban") &&
                <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-64 justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {getTituloPeriodo()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                      mode="single"
                      selected={diaSelecionado}
                      onSelect={handleDiaSelecionado}
                      initialFocus
                      locale={ptBR} />

                    </PopoverContent>
                  </Popover>
                }
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCorrigirNomes}
                disabled={corrigindo}
                className="gap-2">

                <RefreshCw className={`w-4 h-4 ${corrigindo ? 'animate-spin' : ''}`} />
                Corrigir Nomes
              </Button>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <Button
                  variant={visualizacao === "lista" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setVisualizacao("lista")}
                  className="gap-2">
                  <List className="w-4 h-4" />
                  Lista
                </Button>
                <Button
                  variant={visualizacao === "kanban" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setVisualizacao("kanban")}
                  className="gap-2">
                  <Columns3 className="w-4 h-4" />
                  Kanban
                </Button>
                <Button
                  variant={visualizacao === "calendario" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setVisualizacao("calendario")}
                  className="gap-2">
                  <Grid3x3 className="w-4 h-4" />
                  Calendário
                </Button>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleImprimirAgenda}
                className="gap-2">

                <Printer className="w-4 h-4" />
                Imprimir Agenda
              </Button>

              <Button
                onClick={() => setIsReservaOpen(true)}
                variant="outline"
                size="sm"
                className="gap-2">

                <Clock className="w-4 h-4" />
                Reserva de Horário
              </Button>

              <Button
                onClick={() => handleOpenForm(null)}
                className="bg-blue-600 hover:bg-blue-700">

                <Plus className="w-4 h-4 mr-2" />
                Novo Agendamento
              </Button>
            </div>
          </div>

          {/* NOVO: Filtro por médico para visualização de calendário */}
          {visualizacao === "calendario" &&
          <Card className="mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Label htmlFor="filtroMedicoCalendario" className="text-sm font-medium text-gray-700">Filtrar por Médico:</Label>
                  <Select
                  value={filtroMedicoCalendario}
                  onValueChange={setFiltroMedicoCalendario}>

                    <SelectTrigger id="filtroMedicoCalendario" className="w-64">
                      <SelectValue placeholder="Selecione o médico" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">
                        <div className="flex items-center gap-2">
                          <Stethoscope className="w-4 h-4" />
                          Todos os Médicos
                        </div>
                      </SelectItem>
                      {medicos.map((medico) =>
                    <SelectItem key={medico.id} value={medico.id}>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Dr(a). {medico.nome} - {medico.especialidade}
                          </div>
                        </SelectItem>
                    )}
                    </SelectContent>
                  </Select>
                  {filtroMedicoCalendario !== "todos" &&
                <Badge className="bg-blue-100 text-blue-800">
                      {medicos.find((m) => m.id === filtroMedicoCalendario)?.nome}
                    </Badge>
                }
                </div>
              </CardContent>
            </Card>
          }

          {(visualizacao === "lista" || visualizacao === "kanban") &&
          <FiltrosAgendamento
            filtros={filtros}
            onFiltrosChange={setFiltros}
            medicos={Array.isArray(medicos) ? medicos : []} />

          }

          {/* Barra de seleção Lidiane / Ramão quando filtro é Odontologia */}
          {(visualizacao === "lista" || visualizacao === "kanban") && filtroEhOdontologia && (() => {
            const dentistasOdonto = medicos.filter(m => medicosOdontologia.includes(m.id));
            return (
              <div className="mb-4 flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg p-3">
                <span className="text-sm font-medium text-teal-800 mr-2">🦷 Agenda de:</span>
                <div className="flex bg-white rounded-lg p-1 border border-teal-200">
                  <Button
                    variant={filtroDentistaOdonto === "todos" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setFiltroDentistaOdonto("todos")}
                    className={filtroDentistaOdonto === "todos" ? "bg-teal-600 hover:bg-teal-700 text-white" : "text-teal-700"}>
                    Todos
                  </Button>
                  {dentistasOdonto.map(d => (
                    <Button
                      key={d.id}
                      variant={filtroDentistaOdonto === d.id ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFiltroDentistaOdonto(d.id)}
                      className={filtroDentistaOdonto === d.id ? "bg-teal-600 hover:bg-teal-700 text-white" : "text-teal-700"}>
                      {d.nome}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Barra de seleção de agenda quando filtro é Dr. Delazeri */}
          {(visualizacao === "lista" || visualizacao === "kanban") && filtroEhDelazeri && (() => {
            const agendasDelazeri = medicos.filter(m => medicosDelazeri.includes(m.id));
            return (
              <div className="mb-4 flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <span className="text-sm font-medium text-indigo-800 mr-2">🧠 Agenda de:</span>
                <div className="flex bg-white rounded-lg p-1 border border-indigo-200">
                  <Button
                    variant={filtroAgendaDelazeri === "todos" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setFiltroAgendaDelazeri("todos")}
                    className={filtroAgendaDelazeri === "todos" ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "text-indigo-700"}>
                    Todos
                  </Button>
                  {agendasDelazeri.map(d => (
                    <Button
                      key={d.id}
                      variant={filtroAgendaDelazeri === d.id ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFiltroAgendaDelazeri(d.id)}
                      className={filtroAgendaDelazeri === d.id ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "text-indigo-700"}>
                      {d.especialidade}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })()}

          {visualizacao === "lista" ?
          <VisualizacaoDiaria
            agendamentos={Array.isArray(agendamentosFiltrados) ? agendamentosFiltrados : []}
            medicos={Array.isArray(medicos) ? medicos : []}
            pacientes={Array.isArray(pacientes) ? pacientes : []}
            onEditarAgendamento={handleEditarAgendamento}
            loading={loading}
            dia={diaSelecionado}
            onUpdate={carregarDados}
            periodo={filtros.periodo}
            buscaAtiva={buscaAtiva} /> :

          visualizacao === "kanban" ?
          <VisualizacaoKanban
            agendamentos={Array.isArray(agendamentosFiltrados) ? agendamentosFiltrados : []}
            medicos={Array.isArray(medicos) ? medicos : []}
            pacientes={Array.isArray(pacientes) ? pacientes : []}
            onEditarAgendamento={handleEditarAgendamento}
            loading={loading}
            dia={diaSelecionado} /> :

          <VisualizacaoCalendario
            agendamentos={Array.isArray(agendamentosCalendario) ? agendamentosCalendario : []} // Use filtered list for calendar
            medicos={filtroMedicoCalendario !== "todos" ?
            medicos.filter((m) => m.id === filtroMedicoCalendario) :
            Array.isArray(medicos) ? medicos : []}
            pacientes={Array.isArray(pacientes) ? pacientes : []}
            loading={loading}
            onUpdate={carregarDados} />

          }

          {isFormOpen && categorias.length > 0 && tabelaPrecos.length > 0 &&
          <FormularioAgendamento
            key={selectedAgendamento?.id || 'new'}
            agendamento={selectedAgendamento}
            dadosIniciais={dadosIniciaisAgendamento}
            todosAgendamentos={agendamentos}
            medicos={Array.isArray(medicos) ? medicos : []}
            pacientes={Array.isArray(pacientes) ? pacientes : []}
            procedimentos={Array.isArray(procedimentos) ? procedimentos : []}
            exames={Array.isArray(exames) ? exames : []}
            categorias={Array.isArray(categorias) ? categorias : []}
            tabelaPrecos={Array.isArray(tabelaPrecos) ? tabelaPrecos : []}
            onSave={handleSave}
            onClose={handleCloseForm} />

          }

          {isReservaOpen &&
          <FormularioReserva
            medicos={Array.isArray(medicos) ? medicos : []}
            onSave={handleSave}
            onClose={() => setIsReservaOpen(false)} />

          }
        </div>
      </div>
    </ProtectedRoute>);

}