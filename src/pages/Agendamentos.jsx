import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Agendamento, Medico, Paciente, Procedimento, Exame, Notification, CategoriaPreco, TabelaPreco } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Plus, List, Grid3x3, Printer, Clock, Stethoscope, User, RefreshCw } from "lucide-react"; // Import Stethoscope and User icons
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

import ProtectedRoute from "../components/auth/ProtectedRoute";
import VisualizacaoDiaria from "../components/agendamentos/VisualizacaoDiaria";
import VisualizacaoCalendario from "../components/agendamentos/VisualizacaoCalendario";
import FormularioAgendamento from "../components/agendamentos/FormularioAgendamento";
import FormularioReserva from "../components/agendamentos/FormularioReserva";
import FiltrosAgendamento from "../components/agendamentos/FiltrosAgendamento";
import { cachedApiCall, clearCache } from "@/components/shared/apiThrottle";

export default function Agendamentos() {
  const location = useLocation();
  const [agendamentos, setAgendamentos] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [exames, setExames] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tabelaPrecos, setTabelaPrecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [diaSelecionado, setDiaSelecionado] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isReservaOpen, setIsReservaOpen] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] = useState(null);
  const [dadosIniciaisAgendamento, setDadosIniciaisAgendamento] = useState(null);
  const [visualizacao, setVisualizacao] = useState("lista");
  const [filtros, setFiltros] = useState({
    periodo: "dia",
    medico: "todos",
    status: "todos",
    tipo: "todos"
  });
  const [filtroMedicoCalendario, setFiltroMedicoCalendario] = useState("todos"); // New state for calendar doctor filter
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
    setLoading(true);
    try {
      console.log('🚀 Carregando dados com prioridades...');

      // PRIORIDADE ALTA - Dados essenciais em paralelo (3 requisições)
      const [agendamentosData, medicosData, pacientesData] = await Promise.all([
      cachedApiCall('agendamentos', () => Agendamento.list('-data_agendamento', 2000), []),
      cachedApiCall('medicos', () => Medico.list(), []),
      cachedApiCall('pacientes', () => Paciente.list('-created_date', 2000), [])]
      );

      setAgendamentos(Array.isArray(agendamentosData) ? agendamentosData : []);
      setMedicos(Array.isArray(medicosData) ? medicosData : []);
      setPacientes(Array.isArray(pacientesData) ? pacientesData : []);
      console.log('✅ Dados essenciais carregados');

      // PRIORIDADE MÉDIA - Dados complementares em paralelo (3 requisições)
      const [procedimentosData, examesData, categoriasData] = await Promise.all([
      cachedApiCall('procedimentos', () => Procedimento.list(), []),
      cachedApiCall('exames', () => Exame.list(), []),
      cachedApiCall('categorias', () => CategoriaPreco.list(), [])]
      );

      setProcedimentos(Array.isArray(procedimentosData) ? procedimentosData : []);
      setExames(Array.isArray(examesData) ? examesData : []);
      setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      console.log('✅ Dados complementares carregados');

      // PRIORIDADE BAIXA - Tabela de preços (última requisição)
      const tabelaPrecosData = await cachedApiCall(
        'tabelaPrecos',
        () => TabelaPreco.list(),
        []
      );
      setTabelaPrecos(Array.isArray(tabelaPrecosData) ? tabelaPrecosData : []);
      console.log('✅ Tabela de preços carregada');

      console.log('🎉 Todos os dados carregados!');

    } catch (error) {
      console.error("❌ Erro ao carregar dados:", error);
      setAgendamentos([]);
      setMedicos([]);
      setPacientes([]);
      setProcedimentos([]);
      setExames([]);
      setCategorias([]);
      setTabelaPrecos([]);
    } finally {
      setLoading(false);
    }
  }, [setAgendamentos, setMedicos, setPacientes, setProcedimentos, setExames, setCategorias, setTabelaPrecos, setLoading]);

  // Verificar se há dados iniciais vindos da navegação (do Dashboard)
  useEffect(() => {
    if (location.state?.dadosIniciais) {
      setDadosIniciaisAgendamento(location.state.dadosIniciais);
      setIsFormOpen(true);
    }
  }, [location.state]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Subscription para atualizar automaticamente quando agendamentos mudam
  useEffect(() => {
    console.log('🔌 Configurando subscription de agendamentos...');
    
    const unsubscribe = base44.entities.Agendamento.subscribe((event) => {
      console.log('🔔 Agendamento atualizado via subscription:', event.type, event.id, event.data?.status);
      
      // Limpar cache imediatamente
      clearCache('agendamentos');
      
      if (event.type === 'update' && event.data) {
        // Atualizar o agendamento específico no estado
        setAgendamentos(prev => {
          const updated = prev.map(ag => 
            ag.id === event.id ? { ...ag, ...event.data } : ag
          );
          console.log('✅ Estado atualizado para agendamento:', event.id, '-> status:', event.data.status);
          return updated;
        });
      } else if (event.type === 'create' && event.data) {
        // Adicionar novo agendamento
        setAgendamentos(prev => [event.data, ...prev]);
      } else if (event.type === 'delete') {
        // Remover agendamento
        setAgendamentos(prev => prev.filter(ag => ag.id !== event.id));
      }
    });

    return () => {
      console.log('🔌 Removendo subscription de agendamentos');
      unsubscribe();
    };
  }, []);

  const getAgendamentosPorPeriodo = () => {
    const dataBase = diaSelecionado;
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

  // Identificar médicos "Dr. Ruben" (múltiplas especialidades)
  const medicosRuben = useMemo(() => {
    return medicos.filter(m => normalizeString(m.nome).includes('RUBEN')).map(m => m.id);
  }, [medicos]);

  const agendamentosFiltrados = Array.isArray(agendamentosPorPeriodo) ? agendamentosPorPeriodo.filter((agendamento) => {
    if (!agendamento) return false;

    // Lógica especial para odontologia e Dr. Ruben: se filtrar por qualquer um do grupo, mostrar todos do grupo
    let filtroMedico = false;
    if (filtros.medico === "todos") {
      filtroMedico = true;
    } else if (medicosOdontologia.includes(filtros.medico)) {
      // Se o filtro é um dentista, mostrar agendamentos de TODOS os dentistas
      filtroMedico = medicosOdontologia.includes(agendamento.medico_id);
    } else if (medicosRuben.includes(filtros.medico)) {
      // Se o filtro é um "Ruben", mostrar agendamentos de TODOS os "Rubens"
      filtroMedico = medicosRuben.includes(agendamento.medico_id);
    } else {
      filtroMedico = agendamento.medico_id === filtros.medico;
    }

    const filtroStatus = filtros.status === "todos" || agendamento.status === filtros.status;
    const filtroTipo = filtros.tipo === "todos" || agendamento.tipo_servico === filtros.tipo;

    return filtroMedico && filtroStatus && filtroTipo;
  }) : [];

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
      if (a.data_agendamento !== b.data_agendamento) {
        return a.data_agendamento.localeCompare(b.data_agendamento);
      }
      return a.horario.localeCompare(b.horario);
    });

    console.log('📋 Imprimindo:', {
      modo: visualizacao,
      dia: visualizacao === "calendario" ? format(diaSelecionado, 'yyyy-MM-dd') : 'N/A',
      total: agendamentosParaImpressao.length,
      medico: medicoParaImpressao?.nome || 'Todos',
      periodo: tituloPeriodo
    });

    const conteudoImpressao = `
      <html>
      <head>
        <title>Agendamentos - ${tituloPeriodo}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            padding: 5px;
            font-size: 7px;
            line-height: 1;
          }
          .header {
            margin-bottom: 4px;
            padding-bottom: 2px;
            border-bottom: 1px solid #000;
          }
          .header h1 { 
            font-size: 11px;
            font-weight: bold;
            margin-bottom: 0;
            line-height: 1.2;
          }
          .header .subtitle {
            font-size: 9px;
            margin-bottom: 0;
            line-height: 1.2;
          }
          .info-line {
            font-size: 8px;
            margin: 0;
            line-height: 1.2;
          }
          .profissional {
            font-weight: bold;
            margin: 3px 0 2px 0;
            font-size: 9px;
            background: #f5f5f5;
            padding: 1px 2px;
            line-height: 1.2;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 1px;
            font-size: 7px;
          }
          th, td { 
            border: 1px solid #ccc;
            padding: 1px 2px;
            text-align: left;
            line-height: 1;
            vertical-align: top;
          }
          th { 
            background-color: #e0e0e0;
            font-weight: bold;
            font-size: 7px;
            padding: 1px 2px;
          }
          .footer {
            margin-top: 4px;
            font-size: 6px;
            text-align: right;
            color: #666;
            line-height: 1.2;
          }
          @media print {
            body { padding: 3px; }
            @page { 
              margin: 6mm;
              size: A4;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Centro Vida Saúde</h1>
          <div class="subtitle">Agendamentos</div>
          <div class="info-line">Entre ${visualizacao === "lista" ? getTituloPeriodo() : format(diaSelecionado, "dd/MM/yyyy", { locale: ptBR })}</div>
          <div class="info-line">Página 1 de 1</div>
        </div>
        
        ${medicoParaImpressao ? `
        <div class="profissional">
          Profissional: ${medicoParaImpressao.nome.toUpperCase()}
        </div>
        ` : ''}
        
        <table>
          <thead>
            <tr>
              <th style="width: 55px;">Data</th>
              <th style="width: 35px;">Hora</th>
              <th>Descrição</th>
              <th style="width: 65px;">Conv. Paciente</th>
              <th style="width: 70px;">Celular</th>
              <th style="width: 80px;">Categoria</th>
              <th style="width: 70px;">Observação</th>
              <th style="width: 55px;">Atendente</th>
            </tr>
          </thead>
          <tbody>
            ${agendamentosParaImpressao.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align: center; padding: 20px;">
                  Nenhum agendamento
                </td>
              </tr>
            ` : agendamentosParaImpressao.map((ag) => {
      const paciente = pacientes.find((p) => p.id === ag.paciente_id);
      const medico = medicos.find((m) => m.id === ag.medico_id);
      const categoria = categorias.find((c) => c.id === ag.categoria_preco_id);
      
      // Usar nome do paciente encontrado OU o nome salvo no agendamento
      const nomePaciente = paciente?.nome || ag.paciente_nome || 'N/A';
      const cpfPaciente = paciente?.cpf || '';
      const telefonePaciente = paciente?.telefone || '';
      const convenioPaciente = paciente?.convenio || '';

      // Limpar observações removendo info duplicada
      let obsLimpa = ag.observacoes || '';
      if (obsLimpa) {
        // Remover linhas que mencionam convênio, categoria, cartão (já aparecem em outras colunas)
        obsLimpa = obsLimpa
          .split('\n')
          .filter(linha => {
            const linhaUpper = linha.toUpperCase();
            return !linhaUpper.includes('CONVÊNIO:') && 
                   !linhaUpper.includes('CATEGORIA') && 
                   !linhaUpper.includes('CARTÃO');
          })
          .join(' | ') // Juntar em uma linha com separador
          .trim();
      }

      return `
                <tr>
                  <td>${format(new Date(ag.data_agendamento + 'T00:00:00'), 'dd/MM/yyyy')}</td>
                  <td><strong>${ag.horario}</strong></td>
                  <td>${cpfPaciente ? cpfPaciente + ' - ' : ''}${nomePaciente}</td>
                  <td>${convenioPaciente}</td>
                  <td>${telefonePaciente}</td>
                  <td>${categoria?.nome || ''}</td>
                  <td>${obsLimpa}</td>
                  <td>${ag.created_by?.split('@')[0]?.toUpperCase() || ''}</td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
        
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
                {visualizacao === "lista" &&
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
                      onSelect={setDiaSelecionado}
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

          {visualizacao === "lista" &&
          <FiltrosAgendamento
            filtros={filtros}
            onFiltrosChange={setFiltros}
            medicos={Array.isArray(medicos) ? medicos : []} />

          }

          {visualizacao === "lista" ?
          <VisualizacaoDiaria
            agendamentos={Array.isArray(agendamentosFiltrados) ? agendamentosFiltrados : []}
            medicos={Array.isArray(medicos) ? medicos : []}
            pacientes={Array.isArray(pacientes) ? pacientes : []}
            onEditarAgendamento={handleEditarAgendamento}
            loading={loading}
            dia={diaSelecionado}
            onUpdate={carregarDados}
            periodo={filtros.periodo} /> :


          <VisualizacaoCalendario
            agendamentos={Array.isArray(agendamentosCalendario) ? agendamentosCalendario : []} // Use filtered list for calendar
            medicos={filtroMedicoCalendario !== "todos" ?
            medicos.filter((m) => m.id === filtroMedicoCalendario) :
            Array.isArray(medicos) ? medicos : []}
            pacientes={Array.isArray(pacientes) ? pacientes : []}
            loading={loading}
            onUpdate={carregarDados} />

          }

          {isFormOpen &&
          <FormularioAgendamento
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