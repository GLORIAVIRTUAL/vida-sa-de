import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Agendamento, Paciente, Medico, Lancamento, Procedimento, Exame, CategoriaPreco } from "@/entities/all";
import { OrdemServico } from "@/entities/OrdemServico";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Search, RefreshCw, Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

import FormularioOS from "../components/os/FormularioOS";
import DetalhesOS from "../components/os/DetalhesOS";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow } from
"@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth } from "date-fns";

const statusPagamentoColors = {
  "Pendente": "bg-yellow-100 text-yellow-800",
  "Pago": "bg-green-100 text-green-800",
  "Cancelado": "bg-red-100 text-red-800"
};

export default function OrdemDeServico() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Buscar agendamento via URL params ou state
  const urlParams = new URLSearchParams(window.location.search);
  const agendamentoId = urlParams.get('agendamento_id');
  const agendamentoInicial = location.state?.agendamento;

  const [ordens, setOrdens] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [exames, setExames] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [osSelecionada, setOsSelecionada] = useState(null);
  const [agendamentoParaOS, setAgendamentoParaOS] = useState(null);
  const [pacienteFormulario, setPacienteFormulario] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [corrigindo, setCorrigindo] = useState(false);
  const carregandoRef = useRef(false);

  // Filtros - padrão: últimos 3 meses para evitar carga gigante
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return format(d, 'yyyy-MM-dd');
  });
  const [dataFim, setDataFim] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [statusPagamentoFiltro, setStatusPagamentoFiltro] = useState("todos");

  const handleCorrigirNomes = async () => {
    setCorrigindo(true);
    try {
      toast({ title: "Sincronizando...", description: "Buscando e corrigindo nomes faltantes..." });
      const res = await base44.functions.invoke('fixOsPatientNames', {});
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

  // Carregamento inicial e quando filtros de data mudam
  const initialLoadDone = useRef(false);
  const debounceRef = useRef(null);
  
  useEffect(() => {
    if (!initialLoadDone.current) {
      // Primeiro carregamento
      initialLoadDone.current = true;
      if (agendamentoId) {
        carregarDados(true);
      } else {
        carregarDados(false);
      }
      return;
    }
    
    // Mudanças subsequentes de filtro - debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      carregandoRef.current = false;
      carregarDados(false);
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [agendamentoId, dataInicio, dataFim]);

  const handleAbrirFormOS = useCallback(async (agendamento) => {
    console.log('═══════════════════════════════════════');
    console.log('🔍 ABRINDO FORMULÁRIO DE OS');
    console.log('═══════════════════════════════════════');
    console.log('Agendamento completo:', agendamento);
    console.log('categoria_preco_id:', agendamento?.categoria_preco_id);

    if (!agendamento?.categoria_preco_id) {
      console.error('❌ AGENDAMENTO SEM CATEGORIA!');
      toast({
        title: "Erro",
        description: "Este agendamento não possui categoria de preço. Por favor, edite o agendamento primeiro.",
        variant: "destructive"
      });
      setAgendamentoParaOS(null);
      setMostrarForm(false);
      return;
    }

    const categoria = categorias.find((c) => c.id === agendamento.categoria_preco_id);
    console.log('✅ Categoria encontrada:', categoria?.nome);
    console.log('═══════════════════════════════════════\n');

    // Buscar paciente se não estiver na lista carregada
    let paciente = pacientes.find((p) => p.id === agendamento.paciente_id);
    if (!paciente && agendamento.paciente_id) {
      try {
        console.log('🔍 Paciente não encontrado na lista local, buscando na API...');
        const res = await Paciente.filter({ id: agendamento.paciente_id });
        if (res && res.length > 0) {
          paciente = res[0];
          console.log('✅ Paciente recuperado da API:', paciente.nome);
        }
      } catch (e) {
        console.error('❌ Erro ao buscar paciente:', e);
      }
    }

    setPacienteFormulario(paciente);
    setAgendamentoParaOS(agendamento);
    setMostrarForm(true);
  }, [categorias, toast, pacientes]);

  // Carregar agendamento via ID se vier na URL
  useEffect(() => {
    const carregarAgendamentoPorId = async () => {
      if (agendamentoId && !agendamentoInicial && categorias.length > 0) {
        console.log('🔄 Carregando agendamento via ID da URL:', agendamentoId);
        try {
          const agendamentos = await Agendamento.filter({ id: agendamentoId });
          if (agendamentos && agendamentos.length > 0) {
            const agendamento = agendamentos[0];
            console.log('✅ Agendamento encontrado:', agendamento);
            handleAbrirFormOS(agendamento);
          } else {
            console.error('❌ Agendamento não encontrado');
            toast({
              title: "Erro",
              description: "Agendamento não encontrado",
              variant: "destructive"
            });
          }
        } catch (error) {
          console.error('❌ Erro ao carregar agendamento:', error);
          toast({
            title: "Erro",
            description: "Erro ao carregar agendamento: " + error.message,
            variant: "destructive"
          });
        }
      }
    };

    carregarAgendamentoPorId();
  }, [agendamentoId, agendamentoInicial, categorias, handleAbrirFormOS, toast]);

  useEffect(() => {
    if (agendamentoInicial && categorias.length > 0) {
      handleAbrirFormOS(agendamentoInicial);
    }
  }, [agendamentoInicial, categorias, handleAbrirFormOS]);

  const carregarDados = async (modoRapido = false) => {
    // Evitar chamadas simultâneas
    if (carregandoRef.current) {
      console.log('⏳ Carregamento já em andamento, ignorando...');
      return;
    }
    
    carregandoRef.current = true;
    
    try {
      setLoading(true);
      console.log(modoRapido ? '⚡ Carregamento rápido (apenas essenciais)' : '🔄 Carregamento completo');

      // Delay para evitar rate limit (aumentado)
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // Etapa 1: SEMPRE carregar Médicos e Categorias (essenciais) - sequencial
      const medicosData = await Medico.list("nome", 500);
      setMedicos(medicosData || []);
      await delay(200); // Delay entre chamadas
      
      const categoriasData = await CategoriaPreco.list();
      setCategorias(categoriasData || []);
      await delay(200);
      
      // Se for modo rápido (vindo de um agendamento específico), carregar só o mínimo
      if (modoRapido) {
        console.log('⚡ Modo rápido: carregando apenas procedimentos e exames');
        
        const procedimentosData = await Procedimento.list("-created_date", 100);
        setProcedimentos(procedimentosData || []);
        await delay(200);
        
        const examesData = await Exame.list("-created_date", 100);
        setExames(examesData || []);
        
        // Não carregar ordens antigas no modo rápido
        setOrdens([]);
        setPacientes([]);
        setAgendamentos([]);
      } else {
        // Modo completo: carregar tudo sequencialmente
        await delay(300);

        // Etapa 2: Ordens de Serviço
        let ordensData = [];
        try {
          console.log('🔄 Carregando OS via função backend...', { dataInicio, dataFim });
          const res = await base44.functions.invoke('listOrdensServico', { dataInicio, dataFim });
          if (res?.data?.ordens) {
            ordensData = res.data.ordens;
            console.log('✅ OS carregadas via função:', ordensData.length);
          } else {
            throw new Error("Formato de resposta inválido");
          }
        } catch (err) {
          console.warn("⚠️ Falha na função backend, usando fallback SDK:", err);
          await delay(300);
          ordensData = await OrdemServico.list("-data_execucao", 200);
          console.log('✅ OS carregadas via fallback:', ordensData?.length);
        }
        setOrdens(ordensData || []);
        await delay(300);

        // Etapa 3: Pacientes
        const pacientesData = await Paciente.list("nome", 500);
        setPacientes(pacientesData || []);
        await delay(300);

        // Etapa 4: Procedimentos
        const procedimentosData = await Procedimento.list("-created_date", 200);
        setProcedimentos(procedimentosData || []);
        await delay(300);
        
        // Etapa 5: Exames
        const examesData = await Exame.list("-created_date", 200);
        setExames(examesData || []);
        await delay(300);

        // Etapa 6: Agendamentos
        const agendamentosData = await Agendamento.list("-data_agendamento", 200);
        setAgendamentos(agendamentosData || []);
      }

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro ao Carregar",
        description: "Tente recarregar a página.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      carregandoRef.current = false;
    }
  };

  const getNome = useCallback((id, tipo) => {
    const lista = tipo === 'paciente' ? pacientes : medicos;
    const item = lista.find((i) => i.id === id);
    return item ? item.nome : "Não encontrado";
  }, [pacientes, medicos]);

  const handleSalvarOS = async (novaOS) => {
    try {
      console.log("💾 OS salva, processando:", novaOS);

      if (!novaOS) {
        console.error('❌ novaOS está undefined!');
        setMostrarForm(false);
        setOsSelecionada(null);
        setAgendamentoParaOS(null);
        navigate(createPageUrl('Agendamentos'));
        return;
      }

      // Adicionar OS à lista imediatamente (otimista)
      setOrdens(prev => [novaOS, ...prev]);

      if (novaOS.status_pagamento === 'Pago' && agendamentoParaOS) {
        // Tenta pegar nome da OS (snapshot histórico) ou da lista
        const nomePaciente = novaOS.paciente_nome || pacientes.find((p) => p.id === novaOS.paciente_id)?.nome || 'Paciente Não Identificado';
        const tipoServico = agendamentoParaOS.tipo_servico;

        let categoriaReceita = "Outros";
        if (tipoServico === "Consulta") categoriaReceita = "Receita Consultas";else
        if (tipoServico === "Procedimento") categoriaReceita = "Receita Procedimentos";else
        if (tipoServico === "Exame") categoriaReceita = "Receita Exames";

        let descricaoConvenio = "";
        if (agendamentoParaOS.convenio) {
          descricaoConvenio = agendamentoParaOS.convenio === "Prefeituras" ?
          `(${agendamentoParaOS.convenio} - ${agendamentoParaOS.nome_prefeitura || ''})` :
          `(${agendamentoParaOS.convenio})`;
        }

        const dadosLancamento = {
          tipo: "Entrada",
          categoria: categoriaReceita,
          descricao: `Receita: ${tipoServico} de ${nomePaciente} ${descricaoConvenio}`,
          valor: novaOS.valor_final,
          data_lancamento: new Date().toISOString().split('T')[0],
          forma_pagamento: novaOS.forma_pagamento,
          ordem_servico_id: novaOS.id,
          status: "Realizado"
        };

        await Lancamento.create(dadosLancamento);
        console.log("✅ Lançamento financeiro de receita criado.");

        await Agendamento.update(agendamentoParaOS.id, { status: 'Pago' });
        console.log("✅ Status do agendamento atualizado para 'Pago'");
      }

      setMostrarForm(false);
      setOsSelecionada(null);
      setAgendamentoParaOS(null);
      
      // Navegar imediatamente sem esperar recarregar
      navigate(createPageUrl('Agendamentos'));
    } catch (error) {
      console.error("Erro ao processar OS salva:", error);
    }
  };

  const handleVerDetalhes = (os) => {
    console.log("🔍 Abrindo detalhes da OS:", os);
    setOsSelecionada(os);
  };

  const handleCancelarForm = () => {
    setMostrarForm(false);
    setAgendamentoParaOS(null);
    setPacienteFormulario(null);
    setOsSelecionada(null);
    navigate(createPageUrl('Agendamentos'));
  };

  const handleFecharDetalhes = () => {
    console.log("❌ Fechando detalhes da OS");
    setOsSelecionada(null);
  };

  const handleAtualizarOS = async () => {
    await carregarDados();
    setOsSelecionada(null);
  };

  const ordensFiltradas = useMemo(() => {
    return ordens.filter((os) => {
      // Filtro de status de pagamento
      if (statusPagamentoFiltro !== "todos" && os.status_pagamento !== statusPagamentoFiltro) {
        return false;
      }

      // Filtro de busca por texto
      if (searchTerm) {
        const termoBusca = searchTerm.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const nomePacienteOS = (os.paciente_nome || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const nomePacienteLista = getNome(os.paciente_id, 'paciente').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const nomeMedico = getNome(os.medico_id, 'medico').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const numeroOS = (os.numero_os || '').toLowerCase();
        return nomePacienteOS.includes(termoBusca) || nomePacienteLista.includes(termoBusca) || nomeMedico.includes(termoBusca) || numeroOS.includes(termoBusca);
      }

      return true;
    });
  }, [ordens, statusPagamentoFiltro, searchTerm, getNome]);

  const osFormData = useMemo(() => {
    if (!agendamentoParaOS || !medicos.length || !categorias.length) {
      return null;
    }

    // Usar pacienteFormulario se disponível, senão tentar buscar na lista
    const paciente = pacienteFormulario || pacientes.find((p) => p.id === agendamentoParaOS.paciente_id);

    const medico = medicos.find((m) => m.id === agendamentoParaOS.medico_id);
    const categoriaPreco = categorias.find((c) => c.id === agendamentoParaOS.categoria_preco_id);

    let procedimento = null;
    if (agendamentoParaOS.tipo_servico === 'Procedimento' && agendamentoParaOS.procedimento_id) {
      procedimento = procedimentos.find((p) => p.id === agendamentoParaOS.procedimento_id);
    }

    let examesSelecionados = [];
    if (agendamentoParaOS.tipo_servico === 'Exame' && agendamentoParaOS.exames_ids) {
      examesSelecionados = exames.filter((e) => agendamentoParaOS.exames_ids.includes(e.id));
    }

    return { paciente, medico, procedimento, exames: examesSelecionados, categoriaPreco };
  }, [agendamentoParaOS, pacienteFormulario, pacientes, medicos, procedimentos, exames, categorias]);

  const detalhesData = useMemo(() => {
    if (!osSelecionada || !pacientes.length || !medicos.length || !agendamentos.length) {
      return null;
    }

    const paciente = pacientes.find((p) => p.id === osSelecionada.paciente_id);
    const medico = medicos.find((m) => m.id === osSelecionada.medico_id);
    const agendamento = agendamentos.find((a) => a.id === osSelecionada.agendamento_id);
    const categoria = categorias.find((c) => c.id === osSelecionada.categoria_preco_id);

    return { paciente, medico, agendamento, categoria };
  }, [osSelecionada, pacientes, medicos, agendamentos, categorias]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-cyan-500 text-3xl font-bold flex items-center gap-2">Ordem de Serviço


            </h1>
            <p className="text-gray-600 mt-1">
              Gerencie e visualize as Ordens de Serviço da clínica.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleCorrigirNomes}
            disabled={corrigindo}
            className="gap-2">

            <RefreshCw className={`w-4 h-4 ${corrigindo ? 'animate-spin' : ''}`} />
            Sincronizar Nomes
          </Button>
        </div>

        {mostrarForm && osFormData &&
        <FormularioOS
          agendamento={agendamentoParaOS}
          paciente={osFormData.paciente}
          medico={osFormData.medico}
          procedimento={osFormData.procedimento}
          exames={osFormData.exames}
          categorias={categorias}
          medicos={medicos}
          procedimentos={procedimentos}
          onSalvar={handleSalvarOS}
          onCancelar={handleCancelarForm} />

        }

        {!mostrarForm &&
        <Card>
            <CardHeader>
              <CardTitle>Histórico de Ordens de Serviço</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Filtros */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-gray-500" />
                  <span className="font-medium text-gray-700">Filtros:</span>
                </div>
                
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="dataInicio" className="text-sm text-gray-600">De:</Label>
                    <Input
                    id="dataInicio"
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-40" />

                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="dataFim" className="text-sm text-gray-600">Até:</Label>
                    <Input
                    id="dataFim"
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-40" />

                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="statusPagamento" className="text-sm text-gray-600">Status:</Label>
                    <Select value={statusPagamentoFiltro} onValueChange={setStatusPagamentoFiltro}>
                      <SelectTrigger id="statusPagamento" className="w-40">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="Pendente">Pendente</SelectItem>
                        <SelectItem value="Pago">Pago</SelectItem>
                        <SelectItem value="Cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-1">
                    <Search className="w-5 h-5 text-gray-500" />
                    <Input
                    placeholder="Buscar por paciente ou médico..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm" />

                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Médico</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status Pag.</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ?
                Array(5).fill(0).map((_, i) =>
                <TableRow key={i}>
                        <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                      </TableRow>
                ) :
                ordensFiltradas.length === 0 ?
                <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        Nenhuma ordem de serviço encontrada.
                      </TableCell>
                    </TableRow> :

                ordensFiltradas.map((os) => {
                  const dataRef = os.data_execucao || os.created_date;
                  const dataApenas = dataRef ? dataRef.split('T')[0] : null;
                  const dataExecucao = dataApenas ? new Date(dataApenas + 'T00:00:00') : null;
                  return (
                    <TableRow key={os.id}>
                          <TableCell>{dataExecucao && !isNaN(dataExecucao.getTime()) ? format(dataExecucao, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                          <TableCell>{os.paciente_nome || getNome(os.paciente_id, 'paciente')}</TableCell>
                          <TableCell>{getNome(os.medico_id, 'medico')}</TableCell>
                          <TableCell>R$ {os.valor_final?.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={`${statusPagamentoColors[os.status_pagamento]}`}>
                              {os.status_pagamento}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => handleVerDetalhes(os)}>
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>);

                })
                }
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        }

        {osSelecionada && detalhesData &&
        <DetalhesOS
          os={osSelecionada}
          pacienteNome={osSelecionada.paciente_nome || detalhesData.paciente?.nome || 'N/A'}
          medicoNome={detalhesData.medico?.nome || 'N/A'}
          categoriaNome={detalhesData.categoria?.nome || ''}
          open={true}
          onClose={handleFecharDetalhes}
          onUpdate={handleAtualizarOS} />

        }
      </div>
    </div>);

}