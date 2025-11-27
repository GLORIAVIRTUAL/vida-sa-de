import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Agendamento, Paciente, Medico, Lancamento, Procedimento, Exame, CategoriaPreco } from "@/entities/all";
import { OrdemServico } from "@/entities/OrdemServico";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Search } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

import FormularioOS from "../components/os/FormularioOS";
import DetalhesOS from "../components/os/DetalhesOS";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const statusPagamentoColors = {
  "Pendente": "bg-yellow-100 text-yellow-800",
  "Pago": "bg-green-100 text-green-800",
  "Cancelado": "bg-red-100 text-red-800",
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
  const [mostrarForm, setMostrarForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    carregarDados();
  }, []);

  const handleAbrirFormOS = useCallback((agendamento) => {
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

    const categoria = categorias.find(c => c.id === agendamento.categoria_preco_id);
    console.log('✅ Categoria encontrada:', categoria?.nome);
    console.log('═══════════════════════════════════════\n');

    setAgendamentoParaOS(agendamento);
    setMostrarForm(true);
  }, [categorias, toast]);

  useEffect(() => {
    if (agendamentoInicial && categorias.length > 0) {
      handleAbrirFormOS(agendamentoInicial);
    }
  }, [agendamentoInicial, categorias, handleAbrirFormOS]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      console.log('🔄 Carregando dados da página OS...');
      
      const [ordensData, pacientesData, medicosData, procedimentosData, examesData, agendamentosData, categoriasData] = await Promise.all([
        OrdemServico.list("-created_date"),
        Paciente.list(),
        Medico.list(),
        Procedimento.list(),
        Exame.list(),
        Agendamento.list(),
        CategoriaPreco.list(),
      ]);
      
      console.log('✅ Dados carregados:', {
        ordens: ordensData?.length,
        pacientes: pacientesData?.length,
        medicos: medicosData?.length,
        procedimentos: procedimentosData?.length,
        exames: examesData?.length,
        agendamentos: agendamentosData?.length,
        categorias: categoriasData?.length
      });
      
      setOrdens(ordensData || []);
      setPacientes(pacientesData || []);
      setMedicos(medicosData || []);
      setProcedimentos(procedimentosData || []);
      setExames(examesData || []);
      setAgendamentos(agendamentosData || []);
      setCategorias(categoriasData || []);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      setOrdens([]);
      setPacientes([]);
      setMedicos([]);
      setProcedimentos([]);
      setExames([]);
      setAgendamentos([]);
      setCategorias([]);
      
      toast({
        title: "Erro",
        description: "Erro ao carregar dados: " + error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getNome = useCallback((id, tipo) => {
    const lista = tipo === 'paciente' ? pacientes : medicos;
    const item = lista.find(i => i.id === id);
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
        const paciente = pacientes.find(p => p.id === novaOS.paciente_id);
        const tipoServico = agendamentoParaOS.tipo_servico;

        let categoriaReceita = "Outros";
        if (tipoServico === "Consulta") categoriaReceita = "Receita Consultas";
        else if (tipoServico === "Procedimento") categoriaReceita = "Receita Procedimentos";
        else if (tipoServico === "Exame") categoriaReceita = "Receita Exames";

        const descricaoConvenio = agendamentoParaOS.convenio === "Prefeituras"
          ? `(${agendamentoParaOS.convenio} - ${agendamentoParaOS.nome_prefeitura})`
          : `(${agendamentoParaOS.convenio})`;

        const dadosLancamento = {
          tipo: "Entrada",
          categoria: categoriaReceita,
          descricao: `Receita: ${tipoServico} de ${paciente?.nome || 'N/A'} ${descricaoConvenio}`,
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
    if (!searchTerm) {
      return ordens;
    }

    const termoBusca = searchTerm.toLowerCase();
    return ordens.filter(os => {
      const nomePaciente = getNome(os.paciente_id, 'paciente').toLowerCase();
      const nomeMedico = getNome(os.medico_id, 'medico').toLowerCase();

      return nomePaciente.includes(termoBusca) || nomeMedico.includes(termoBusca);
    });
  }, [searchTerm, ordens, getNome]);

  const osFormData = useMemo(() => {
    if (!agendamentoParaOS || !pacientes.length || !medicos.length || !categorias.length) {
      return null;
    }

    const paciente = pacientes.find(p => p.id === agendamentoParaOS.paciente_id);
    const medico = medicos.find(m => m.id === agendamentoParaOS.medico_id);
    const categoriaPreco = categorias.find(c => c.id === agendamentoParaOS.categoria_preco_id);

    let procedimento = null;
    if (agendamentoParaOS.tipo_servico === 'Procedimento' && agendamentoParaOS.procedimento_id) {
      procedimento = procedimentos.find(p => p.id === agendamentoParaOS.procedimento_id);
    }

    let examesSelecionados = [];
    if (agendamentoParaOS.tipo_servico === 'Exame' && agendamentoParaOS.exames_ids) {
      examesSelecionados = exames.filter(e => agendamentoParaOS.exames_ids.includes(e.id));
    }

    return { paciente, medico, procedimento, exames: examesSelecionados, categoriaPreco };
  }, [agendamentoParaOS, pacientes, medicos, procedimentos, exames, categorias]);

  const detalhesData = useMemo(() => {
    if (!osSelecionada || !pacientes.length || !medicos.length || !agendamentos.length) {
      return null;
    }

    const paciente = pacientes.find(p => p.id === osSelecionada.paciente_id);
    const medico = medicos.find(m => m.id === osSelecionada.medico_id);
    const agendamento = agendamentos.find(a => a.id === osSelecionada.agendamento_id);
    const categoria = categorias.find(c => c.id === osSelecionada.categoria_preco_id);

    return { paciente, medico, agendamento, categoria };
  }, [osSelecionada, pacientes, medicos, agendamentos, categorias]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-8 h-8 text-blue-600" />
              Ordem de Serviço
            </h1>
            <p className="text-gray-600 mt-1">
              Gerencie e visualize as Ordens de Serviço da clínica.
            </p>
          </div>
        </div>

        {mostrarForm && osFormData && (
          <FormularioOS
            agendamento={agendamentoParaOS}
            paciente={osFormData.paciente}
            medico={osFormData.medico}
            procedimento={osFormData.procedimento}
            exames={osFormData.exames}
            categorias={categorias}
            onSalvar={handleSalvarOS}
            onCancelar={handleCancelarForm}
          />
        )}

        {!mostrarForm && (
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Ordens de Serviço</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-gray-500" />
                <Input
                  placeholder="Buscar por paciente ou médico..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
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
                  {loading ? (
                    Array(5).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : ordensFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        Nenhuma ordem de serviço encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ordensFiltradas.map((os) => {
                      const dataExecucao = os.data_execucao ? new Date(os.data_execucao + 'T00:00:00') : null;
                      return (
                        <TableRow key={os.id}>
                          <TableCell>{dataExecucao && !isNaN(dataExecucao.getTime()) ? format(dataExecucao, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                          <TableCell>{getNome(os.paciente_id, 'paciente')}</TableCell>
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
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {osSelecionada && detalhesData && (
          <DetalhesOS
            os={osSelecionada}
            pacienteNome={detalhesData.paciente?.nome || 'N/A'}
            medicoNome={detalhesData.medico?.nome || 'N/A'}
            categoriaNome={detalhesData.categoria?.nome || ''}
            open={true}
            onClose={handleFecharDetalhes}
          />
        )}
      </div>
    </div>
  );
}