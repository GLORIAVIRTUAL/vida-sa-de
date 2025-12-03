import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Agendamento, Medico, Paciente, Procedimento, Exame, Notification, CategoriaPreco, TabelaPreco } from "@/entities/all";
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


import ProtectedRoute from "../components/auth/ProtectedRoute";
import VisualizacaoDiaria from "../components/agendamentos/VisualizacaoDiaria";
import VisualizacaoCalendario from "../components/agendamentos/VisualizacaoCalendario";
import FormularioAgendamento from "../components/agendamentos/FormularioAgendamento";
import FormularioReserva from "../components/agendamentos/FormularioReserva";
import FiltrosAgendamento from "../components/agendamentos/FiltrosAgendamento";
import { cachedApiCall, clearCache } from "@/components/shared/apiThrottle";

export default function Agendamentos() {
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
      // Aumentado o limite de pacientes para 3000 para garantir que todos sejam carregados e os nomes apareçam
      const [agendamentosData, medicosData, pacientesData] = await Promise.all([
        cachedApiCall('agendamentos', () => Agendamento.list('-data_agendamento', 2000), []),
        cachedApiCall('medicos', () => Medico.list(), []),
        cachedApiCall('pacientes', () => Paciente.list('-created_date', 3000), [])
      ]);
      
      setAgendamentos(Array.isArray(agendamentosData) ? agendamentosData : []);
      setMedicos(Array.isArray(medicosData) ? medicosData : []);
      setPacientes(Array.isArray(pacientesData) ? pacientesData : []);
      console.log('✅ Dados essenciais carregados');
      
      // PRIORIDADE MÉDIA - Dados complementares em paralelo (3 requisições)
      const [procedimentosData, examesData, categoriasData] = await Promise.all([
        cachedApiCall('procedimentos', () => Procedimento.list(), []),
        cachedApiCall('exames', () => Exame.list(), []),
        cachedApiCall('categorias', () => CategoriaPreco.list(), [])
      ]);
      
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

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

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
    return agendamentosArray.filter(agendamento => {
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

  const agendamentosFiltrados = Array.isArray(agendamentosPorPeriodo) ? agendamentosPorPeriodo.filter(agendamento => {
    if (!agendamento) return false;
    
    const filtroMedico = filtros.medico === "todos" || agendamento.medico_id === filtros.medico;
    const filtroStatus = filtros.status === "todos" || agendamento.status === filtros.status;
    const filtroTipo = filtros.tipo === "todos" || agendamento.tipo_servico === filtros.tipo;

    return filtroMedico && filtroStatus && filtroTipo;
  }) : [];

  // CORRIGIDO: Filtrar agendamentos do calendário por médico E por mês atual
  const agendamentosCalendario = useMemo(() => {
    const mesAtual = format(diaSelecionado, 'yyyy-MM');
    
    return agendamentos.filter(a => {
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
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedAgendamento(null);
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
      
      agendamentosParaImpressao = agendamentos.filter(a => {
        if (!a || !a.data_agendamento) return false;
        
        // Filtrar pelo dia selecionado
        const mesmoDia = a.data_agendamento === dataFormatada;
        
        // Filtrar por médico se selecionado
        const filtroMedico = filtroMedicoCalendario === "todos" || a.medico_id === filtroMedicoCalendario;
        
        return mesmoDia && filtroMedico;
      });
      
      medicoParaImpressao = filtroMedicoCalendario !== "todos" 
        ? medicos.find(m => m.id === filtroMedicoCalendario) 
        : null;
      tituloPeriodo = format(diaSelecionado, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } else {
      // Modo lista: usar agendamentosFiltrados
      agendamentosParaImpressao = Array.isArray(agendamentosFiltrados) ? agendamentosFiltrados : [];
      medicoParaImpressao = filtros.medico !== "todos" 
        ? medicos.find(m => m.id === filtros.medico) 
        : null;
      tituloPeriodo = getTituloPeriodo();
    }

    // Ordenar por horário, remover cancelados
    agendamentosParaImpressao = agendamentosParaImpressao
      .filter(a => a && a.status !== 'Cancelado')
      .sort((a, b) => {
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
        <title>Agenda - ${tituloPeriodo}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px;
            max-width: 900px;
            margin: 0 auto;
          }
          h1 { 
            text-align: center; 
            color: #1e40af;
            margin-bottom: 10px;
          }
          h2 {
            text-align: center;
            color: #64748b;
            font-size: 18px;
            font-weight: normal;
            margin-bottom: 30px;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
          }
          th, td { 
            border: 1px solid #ddd; 
            padding: 10px 8px; 
            text-align: left;
            font-size: 13px;
          }
          th { 
            background-color: #3b82f6; 
            color: white;
            font-weight: bold;
          }
          tr:nth-child(even) { 
            background-color: #f8fafc; 
          }
          .status-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
          }
          .status-agendado { background-color: #dbeafe; color: #1e40af; }
          .status-pago { background-color: #ccfbf1; color: #0f766e; }
          .status-confirmado { background-color: #ddd6fe; color: #5b21b6; }
          .status-em-atendimento { background-color: #fef3c7; color: #92400e; }
          .status-finalizado { background-color: #d1fae5; color: #065f46; }
          .status-cancelado { background-color: #fee2e2; color: #991b1b; }
          .status-nao-compareceu { background-color: #f3f4f6; color: #4b5563; }
          .categoria-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            background-color: #e0e7ff;
            color: #3730a3;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            color: #64748b;
            font-size: 12px;
          }
          .summary {
            margin: 20px 0;
            padding: 15px;
            background-color: #f1f5f9;
            border-radius: 8px;
          }
          .summary-item {
            display: inline-block;
            margin-right: 20px;
            font-weight: bold;
            font-size: 13px;
          }
          .filters-info {
            margin: 20px 0;
            padding: 10px 15px;
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            border-radius: 4px;
            font-size: 12px;
          }
          .filters-info strong {
            color: #92400e;
          }
          @media print {
            body { padding: 10px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>🏥 Centro Vida Saúde</h1>
        <h2>Agenda de Atendimentos</h2>
        <h2>${tituloPeriodo}</h2>
        ${medicoParaImpressao ? `<h2>Dr(a). ${medicoParaImpressao.nome} - ${medicoParaImpressao.especialidade}</h2>` : '<h2>Todos os Médicos</h2>'}
        
        ${visualizacao === "lista" ? `
        <div class="filters-info">
          <strong>🔍 Filtros Aplicados:</strong><br/>
          Período: <strong>${filtros.periodo === 'dia' ? 'Dia' : filtros.periodo === 'semana' ? 'Semana' : 'Mês'}</strong> | 
          Médico: <strong>${medicoParaImpressao ? medicoParaImpressao.nome : 'Todos'}</strong> | 
          Status: <strong>${filtros.status === 'todos' ? 'Todos' : filtros.status}</strong> | 
          Tipo: <strong>${filtros.tipo === 'todos' ? 'Todos' : filtros.tipo}</strong>
        </div>
        ` : `
        <div class="filters-info">
          <strong>🔍 Visualização:</strong> Calendário - Dia Selecionado<br/>
          <strong>Médico:</strong> ${medicoParaImpressao ? medicoParaImpressao.nome : 'Todos os Médicos'}
        </div>
        `}
        
        <div class="summary">
          <span class="summary-item">📋 Total: ${agendamentosParaImpressao.length} agendamentos</span>
          <span class="summary-item">✅ Pagos: ${agendamentosParaImpressao.filter(a => a.status === 'Pago').length}</span>
          <span class="summary-item">🔄 Em Atendimento: ${agendamentosParaImpressao.filter(a => a.status === 'Em Atendimento').length}</span>
          <span class="summary-item">✔️ Finalizados: ${agendamentosParaImpressao.filter(a => a.status === 'Finalizado').length}</span>
        </div>
        
        <table>
          <thead>
            ${visualizacao === "calendario" ? `
            <tr>
              <th>Horário</th>
              <th>Paciente</th>
              <th>Médico</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Status</th>
            </tr>
            ` : `
            <tr>
              <th>Data</th>
              <th>Horário</th>
              <th>Paciente</th>
              <th>Médico</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Status</th>
            </tr>
            `}
          </thead>
          <tbody>
            ${agendamentosParaImpressao.length === 0 ? `
              <tr>
                <td colspan="${visualizacao === "calendario" ? '6' : '7'}" style="text-align: center; padding: 40px; color: #64748b;">
                  Nenhum agendamento encontrado para este dia.
                </td>
              </tr>
            ` : agendamentosParaImpressao.map(ag => {
              const paciente = pacientes.find(p => p.id === ag.paciente_id);
              const medico = medicos.find(m => m.id === ag.medico_id);
              const categoria = categorias.find(c => c.id === ag.categoria_preco_id);
              const statusClass = ag.status.toLowerCase().replace(/\s+/g, '-');
              
              return `
                <tr>
                  ${visualizacao === "lista" ? `<td><strong>${format(new Date(ag.data_agendamento + 'T00:00:00'), 'dd/MM/yyyy')}</strong></td>` : ''}
                  <td><strong>${ag.horario}</strong></td>
                  <td>${paciente?.nome || 'N/A'}</td>
                  <td>${medico ? `Dr(a). ${medico.nome}` : 'N/A'}</td>
                  <td>${ag.tipo_servico}</td>
                  <td><span class="categoria-badge">${categoria?.nome || 'N/A'}</span></td>
                  <td><span class="status-badge status-${statusClass}">${ag.status}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Impresso em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
          <p><strong>Centro Vida Saúde</strong> - Sistema de Gestão Clínica</p>
          <p>gloriavirtual.com | CNPJ: 51.424.200/0001-02</p>
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Agendamentos</h1>
              <p className="text-gray-600 mt-1">Gerencie os agendamentos da clínica</p>
              <div className="flex items-center gap-4">
                {visualizacao === "lista" && (
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
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCorrigirNomes} 
                disabled={corrigindo}
                className="gap-2 text-gray-600"
              >
                <RefreshCw className={`w-4 h-4 ${corrigindo ? 'animate-spin' : ''}`} />
                Corrigir Nomes
              </Button>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <Button
                  variant={visualizacao === "lista" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setVisualizacao("lista")}
                  className="gap-2"
                >
                  <List className="w-4 h-4" />
                  Lista
                </Button>
                <Button
                  variant={visualizacao === "calendario" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setVisualizacao("calendario")}
                  className="gap-2"
                >
                  <Grid3x3 className="w-4 h-4" />
                  Calendário
                </Button>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleImprimirAgenda}
                className="gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir Agenda
              </Button>

              <Button 
                onClick={() => setIsReservaOpen(true)}
                variant="outline"
                className="bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100"
              >
                <Clock className="w-4 h-4 mr-2" />
                Reserva de Horário
              </Button>

              <Button 
                onClick={() => handleOpenForm(null)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Agendamento
              </Button>
            </div>
          </div>

          {/* NOVO: Filtro por médico para visualização de calendário */}
          {visualizacao === "calendario" && (
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Label htmlFor="filtroMedicoCalendario" className="text-sm font-medium text-gray-700">Filtrar por Médico:</Label>
                  <Select 
                    value={filtroMedicoCalendario} 
                    onValueChange={setFiltroMedicoCalendario}
                  >
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
                      {medicos.map((medico) => (
                        <SelectItem key={medico.id} value={medico.id}>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Dr(a). {medico.nome} - {medico.especialidade}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filtroMedicoCalendario !== "todos" && (
                    <Badge className="bg-blue-100 text-blue-800">
                      {medicos.find(m => m.id === filtroMedicoCalendario)?.nome}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {visualizacao === "lista" && (
            <FiltrosAgendamento 
              filtros={filtros}
              onFiltrosChange={setFiltros}
              medicos={Array.isArray(medicos) ? medicos : []}
            />
          )}

          {visualizacao === "lista" ? (
            <VisualizacaoDiaria
              agendamentos={Array.isArray(agendamentosFiltrados) ? agendamentosFiltrados : []}
              medicos={Array.isArray(medicos) ? medicos : []}
              pacientes={Array.isArray(pacientes) ? pacientes : []}
              onEditarAgendamento={handleEditarAgendamento}
              loading={loading}
              dia={diaSelecionado}
              onUpdate={carregarDados}
              periodo={filtros.periodo}
            />
          ) : (
            <VisualizacaoCalendario
              agendamentos={Array.isArray(agendamentosCalendario) ? agendamentosCalendario : []} // Use filtered list for calendar
              medicos={filtroMedicoCalendario !== "todos" 
                ? medicos.filter(m => m.id === filtroMedicoCalendario) 
                : (Array.isArray(medicos) ? medicos : [])}
              pacientes={Array.isArray(pacientes) ? pacientes : []}
              loading={loading}
              onUpdate={carregarDados}
            />
          )}

          {isFormOpen && (
            <FormularioAgendamento
              agendamento={selectedAgendamento}
              agendamentosDoDia={Array.isArray(agendamentosPorPeriodo) ? agendamentosPorPeriodo : []}
              medicos={Array.isArray(medicos) ? medicos : []}
              pacientes={Array.isArray(pacientes) ? pacientes : []}
              procedimentos={Array.isArray(procedimentos) ? procedimentos : []}
              exames={Array.isArray(exames) ? exames : []}
              categorias={Array.isArray(categorias) ? categorias : []}
              tabelaPrecos={Array.isArray(tabelaPrecos) ? tabelaPrecos : []}
              onSave={handleSave}
              onClose={handleCloseForm}
            />
          )}

          {isReservaOpen && (
            <FormularioReserva
              medicos={Array.isArray(medicos) ? medicos : []}
              onSave={handleSave}
              onClose={() => setIsReservaOpen(false)}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}