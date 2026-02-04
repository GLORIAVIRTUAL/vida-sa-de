import React, { useState, useEffect, useMemo, useCallback } from "react";
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

  // Filtros
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
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

  useEffect(() => {
    carregarDados();
  }, []);

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

  useEffect(() => {
    if (agendamentoInicial && categorias.length > 0) {
      handleAbrirFormOS(agendamentoInicial);
    }
  }, [agendamentoInicial, categorias, handleAbrirFormOS]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      console.log('🔄 Carregando dados da página OS...');

      // Etapa 1: Dados essenciais (2 chamadas)
      const medicosData = await Medico.list("nome", 500);
      setMedicos(medicosData || []);
      
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      const categoriasData = await CategoriaPreco.list();
      setCategorias(categoriasData || []);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Etapa 2: Ordens de Serviço
      let ordensData = [];
      try {
        console.log('🔄 Tentando carregar OS via função backend...');
        const res = await base44.functions.invoke('listOrdensServico', {});
        if (res?.data?.ordens) {
          ordensData = res.data.ordens;
          console.log('✅ OS carregadas via função:', ordensData.length);
        } else {
          throw new Error("Formato de resposta inválido");
        }
      } catch (err) {
        console.warn("⚠️ Falha na função backend, usando fallback SDK:", err);
        ordensData = await OrdemServico.list("-data_execucao", 500);
        console.log('✅ OS carregadas via fallback:', ordensData?.length);
      }

      setOrdens(ordensData || []);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Etapa 3: Pacientes
      const pacientesData = await Paciente.list("nome", 1000);
      setPacientes(pacientesData || []);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Etapa 4: Procedimentos
      const procedimentosData = await Procedimento.list("-created_date", 500);
      setProcedimentos(procedimentosData || []);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Etapa 5: Exames
      const examesData = await Exame.list("-created_date", 500);
      setExames(examesData || []);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Etapa 6: Agendamentos
      const agendamentosData = await Agendamento.list("-data_agendamento", 500);
      setAgendamentos(agendamentosData || []);

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro ao Carregar",
        description: "Tente recarregar a página. " + error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
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
        await carregarDados();
        navigate(createPageUrl('Agendamentos'));
        return;
      }

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
      await carregarDados();

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
      // Filtro de data
      if (os.data_execucao) {
        const dentroData = os.data_execucao >= dataInicio && os.data_execucao <= dataFim;
        if (!dentroData) return false;
      }

      // Filtro de status de pagamento
      if (statusPagamentoFiltro !== "todos" && os.status_pagamento !== statusPagamentoFiltro) {
        return false;
      }

      // Filtro de busca por texto
      if (searchTerm) {
        const termoBusca = searchTerm.toLowerCase();
        const nomePaciente = getNome(os.paciente_id, 'paciente').toLowerCase();
        const nomeMedico = getNome(os.medico_id, 'medico').toLowerCase();
        return nomePaciente.includes(termoBusca) || nomeMedico.includes(termoBusca);
      }

      return true;
    });
  }, [ordens, dataInicio, dataFim, statusPagamentoFiltro, searchTerm, getNome]);

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
                  const dataExecucao = os.data_execucao ? new Date(os.data_execucao + 'T00:00:00') : null;
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