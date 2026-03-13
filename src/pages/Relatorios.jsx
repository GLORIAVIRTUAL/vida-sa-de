import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Loader2, FileText, Printer, Download, Filter, TrendingUp, DollarSign, 
  Users, CreditCard, Building2, BarChart3, PieChart as PieChartIcon,
  Calendar, RefreshCw, AlertCircle, CheckCircle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import { OrdemServico, Medico, CategoriaPreco, Paciente, Agendamento, Lancamento } from '@/entities/all';
import { filtrarLancamentosPorPeriodo, somarLancamentos } from '../components/financeiro/financeiroUtils';

const CORES_GRAFICO = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// Mapeamento de IDs de categoria antigos para novos nomes
const MAPEAMENTO_CATEGORIA_LEGADO = {
  '68cdd084c8857d27e40c6967': 'Particular',
  '68cdd084c8857d27e40c6968': 'Cartão Mais Vida', 
  '68cdd084c8857d27e40c6969': 'Prefeitura de Tramandaí',
  '68cdd084c8857d27e40c696a': 'Prefeitura de Imbé',
  '68cdd084c8857d27e40c696b': 'Prefeitura de Pinhal',
  '68cdd084c8857d27e40c696c': 'FUMAM',
  '68cdd084c8857d27e40c696d': 'SMEC',
  '68cdd084c8857d27e40c696e': 'Óticas Parceiras'
};

// Mapeamento de médicos deletados/duplicados para o ID correto atual
const MAPEAMENTO_MEDICOS_LEGADO = {
  '6984d88ac5cead4f4fabe1f5': '6967d7f6de081dae6837a4b3', // Dr. Antuan Neder antigo -> novo
};

export default function Relatorios() {
  const [loading, setLoading] = useState(true);
  const [ordensServico, setOrdensServico] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [agendamentosMap, setAgendamentosMap] = useState({});
  
  // Filtros - restaurar do localStorage ou iniciar com padrão
  const [filtros, setFiltros] = useState(() => {
    try {
      const salvos = localStorage.getItem('relatorios_filtros');
      if (salvos) {
        return JSON.parse(salvos);
      }
    } catch (e) {}
    return {
      dataInicio: format(new Date(new Date().setFullYear(new Date().getFullYear() - 2)), 'yyyy-MM-dd'),
      dataFim: format(new Date(), 'yyyy-MM-dd'),
      medicoId: 'todos',
      categoriaNome: 'todos',
      formaPagamento: 'todos',
      statusPagamento: 'todos',
      ordenacao: 'data'
    };
  });

  // Salvar filtros no localStorage sempre que mudarem
  useEffect(() => {
    try {
      localStorage.setItem('relatorios_filtros', JSON.stringify(filtros));
    } catch (e) {}
  }, [filtros]);
  
  const printRef = useRef(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Carregar agendamentos paginando para garantir que todos sejam buscados
      const carregarTodosAgendamentos = async () => {
        let todos = [];
        let skip = 0;
        const batchSize = 500;
        while (true) {
          const batch = await Agendamento.list('-data_agendamento', batchSize, skip);
          if (!batch || batch.length === 0) break;
          todos = [...todos, ...batch];
          if (batch.length < batchSize) break;
          skip += batchSize;
        }
        return todos;
      };
      
      const [osData, lancamentosData, medicosData, categoriasData, pacientesData, agendamentosData] = await Promise.all([
        OrdemServico.list('-data_execucao', 5000),
        Lancamento.list('-data_lancamento', 5000),
        Medico.list(),
        CategoriaPreco.list(),
        Paciente.list('nome', 5000),
        carregarTodosAgendamentos()
      ]);
      
      console.log('Dados carregados:', { os: osData?.length, agendamentos: agendamentosData?.length, medicos: medicosData?.length });
      
      // Criar mapa de agendamentos por ID para cruzamento rápido
      const agMap = {};
      (agendamentosData || []).forEach(ag => { agMap[ag.id] = ag; });
      setAgendamentos(agendamentosData || []);
      setAgendamentosMap(agMap);
      
      // Desmembrar OS com Múltiplas Formas
      const osDesmembradas = [];
      (osData || []).forEach(os => {
        if (os.forma_pagamento === 'Múltiplas Formas' && os.pagamentos_detalhados && os.pagamentos_detalhados.length > 0) {
          const totalDetalhado = os.pagamentos_detalhados.reduce((sum, p) => sum + (p.valor || 0), 0);
          
          os.pagamentos_detalhados.forEach((pg, index) => {
            const proporcao = totalDetalhado > 0 ? (pg.valor || 0) / totalDetalhado : 0;
            
            osDesmembradas.push({
              ...os,
              id: `${os.id}_split_${index}`,
              original_id: os.id,
              forma_pagamento: pg.forma || 'Não informado',
              valor_final: pg.valor || 0,
              valor_total: (os.valor_total || 0) * proporcao,
              valor_repasse_medico: (os.valor_repasse_medico || 0) * proporcao,
              valor_clinica: (os.valor_clinica || 0) * proporcao,
              is_desmembrada: true,
              forma_pagamento_original: 'Múltiplas Formas'
            });
          });
        } else {
          osDesmembradas.push(os);
        }
      });

      setOrdensServico(osDesmembradas);
      setLancamentos(lancamentosData || []);
      setMedicos(medicosData || []);
      setCategorias(categoriasData || []);
      setPacientes(pacientesData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Função para obter nome da categoria (definida antes de ser usada em dadosFiltrados)
  const obterNomeCategoria = (os) => {
    // Primeiro tenta encontrar na lista de categorias atual
    const cat = categorias.find(c => c.id === os.categoria_preco_id);
    if (cat) return cat.nome;
    
    // Fallback: usar mapeamento de IDs legados
    if (MAPEAMENTO_CATEGORIA_LEGADO[os.categoria_preco_id]) {
      return MAPEAMENTO_CATEGORIA_LEGADO[os.categoria_preco_id];
    }
    
    // Fallback: usar forma_pagamento como indicador
    if (os.forma_pagamento === 'Convênio') return 'Convênio (não identificado)';
    
    return 'Não informado';
  };

  // Função para extrair nome do médico do campo itens (fallback)
  const extrairNomeMedicoDeItens = (os) => {
    if (!os.itens) return null;
    try {
      const itensArray = typeof os.itens === 'string' ? JSON.parse(os.itens) : os.itens;
      if (itensArray && itensArray.length > 0) {
        const descricao = itensArray[0].descricao || '';
        // Formato: "Consulta Psicologia - Dr(a). Joeci de Oliveira"
        const match = descricao.match(/Dr\(a\)\.\s*(.+)$/) || descricao.match(/Dr\.\s*(.+)$/) || descricao.match(/Dra\.\s*(.+)$/);
        if (match) return match[1].trim();
        // Outro formato possível: "Consulta Especialidade - Nome do Médico"
        const parts = descricao.split(' - ');
        if (parts.length > 1) return parts[parts.length - 1].trim();
      }
    } catch (e) {
      console.warn('Erro ao extrair médico de itens:', e);
    }
    return null;
  };

  // Função para detectar médico real a partir das observações do agendamento vinculado
  // Resolve o caso de agendas unificadas (ex: Odontologia com Ramão e Lidiane)
  const obterMedicoRealDaOS = (os) => {
    if (!os.agendamento_id) return null;
    const agendamento = agendamentosMap[os.agendamento_id];
    if (!agendamento) return null;
    
    const obsTexto = agendamento.observacoes || '';
    
    if (obsTexto) {
      // Procurar padrão "Dentista: Dra. Nome" ou "Dentista: Dr. Nome" nas observações
      const matchDentista = obsTexto.match(/Dentista:\s*(Dr[a]?\.\s*.+?)(?:\n|$)/i);
      if (matchDentista) {
        const nomeDentista = matchDentista[1].trim();
        // Tentar encontrar o médico correspondente na lista de médicos
        const medEncontrado = medicos.find(m => {
          const nNorm = m.nome.toLowerCase().replace(/^dr[a]?\.\s*/i, '').trim();
          const dNorm = nomeDentista.toLowerCase().replace(/^dr[a]?\.\s*/i, '').trim();
          return nNorm === dNorm || nNorm.includes(dNorm) || dNorm.includes(nNorm);
        });
        if (medEncontrado) return medEncontrado;
        
        // Fallback: buscar apenas pelo sobrenome principal (ex: "Goldani" ou "Souza")
        const palavrasDentista = nomeDentista.toLowerCase().replace(/^dr[a]?\.\s*/i, '').trim().split(/\s+/);
        if (palavrasDentista.length > 0) {
          const sobrenomeDentista = palavrasDentista[palavrasDentista.length - 1];
          const medPorSobrenome = medicos.find(m => {
            return m.nome.toLowerCase().includes(sobrenomeDentista) && sobrenomeDentista.length > 3;
          });
          if (medPorSobrenome) return medPorSobrenome;
        }
      }
    }
    
    // Fallback: verificar se o agendamento.medico_id aponta para um médico diferente do OS
    // Isto cobre o caso de agendamentos antigos onde o medico_id no agendamento era da Lidiane
    // mas a OS foi criada com o medico_id do Ramão
    if (agendamento.medico_id && agendamento.medico_id !== os.medico_id) {
      const medDoAgendamento = medicos.find(m => m.id === agendamento.medico_id);
      if (medDoAgendamento) return medDoAgendamento;
    }

    // Fallback: verificar se o agendamento tem itens_servico com medico_id
    if (agendamento.itens_servico && agendamento.itens_servico.length > 0) {
      const itemComMedico = agendamento.itens_servico.find(i => i.medico_id && i.medico_id !== os.medico_id);
      if (itemComMedico) {
        const medDoItem = medicos.find(m => m.id === itemComMedico.medico_id);
        if (medDoItem) return medDoItem;
      }
    }
    
    return null;
  };

  // Função para obter nome do médico (ID ou fallback de itens)
  const obterNomeMedico = (os) => {
    // Primeiro verificar se existe médico real diferente nas observações do agendamento
    const medicoReal = obterMedicoRealDaOS(os);
    if (medicoReal) return medicoReal.nome;
    
    let medicoIdBase = os.medico_id;
    if (MAPEAMENTO_MEDICOS_LEGADO[medicoIdBase]) {
      medicoIdBase = MAPEAMENTO_MEDICOS_LEGADO[medicoIdBase];
    }
    
    const med = medicos.find(m => m.id === medicoIdBase);
    if (med) return med.nome;
    
    // Fallback: tentar extrair do campo itens
    const nomeDeItens = extrairNomeMedicoDeItens(os);
    if (nomeDeItens) return nomeDeItens;
    
    return 'Não informado';
  };

  const obterValorClinicaCalculado = (os) => {
    return (os.valor_final || 0) - (os.valor_repasse_medico || 0) - (os.valor_repasse_laboratorio || 0);
  };

  // Obter o ID real do médico da OS (considerando agendas unificadas)
  const obterMedicoIdReal = (os) => {
    let medicoIdBase = os.medico_id;
    if (MAPEAMENTO_MEDICOS_LEGADO[medicoIdBase]) {
      medicoIdBase = MAPEAMENTO_MEDICOS_LEGADO[medicoIdBase];
    }
    
    const medicoReal = obterMedicoRealDaOS(os);
    if (medicoReal) {
      if (medicoReal.id !== medicoIdBase) {
        console.log(`[Relatórios] OS ${os.id} (${os.paciente_nome}): medico_id original=${medicoIdBase}, real=${medicoReal.id} (${medicoReal.nome}), agendamento=${os.agendamento_id}`);
      }
      return medicoReal.id;
    }
    return medicoIdBase || 'sem_medico';
  };

  // Função auxiliar para verificar se OS pertence ao médico selecionado
  const osPertenceAoMedico = (os, medicoIdFiltro) => {
    // Verificar médico real (considerando observações do agendamento)
    const medicoIdReal = obterMedicoIdReal(os);
    if (medicoIdReal === medicoIdFiltro) return true;
    
    // Se o médico real é diferente do medico_id original, e o filtro é o original, NÃO incluir
    // Ex: OS com medico_id=Ramão mas observações dizem "Dentista: Lidiane" → não pertence ao Ramão
    if (medicoIdReal !== (os.medico_id || 'sem_medico') && os.medico_id === medicoIdFiltro) return false;
    
    // Primeiro verifica pelo ID direto
    if (os.medico_id === medicoIdFiltro) return true;
    
    // Se não bateu pelo ID, buscar o médico pelo nome e comparar com o nome na OS
    const medicoFiltro = medicos.find(m => m.id === medicoIdFiltro);
    if (!medicoFiltro) return false;
    
    // Obter o nome do médico que aparece na OS (usando a mesma função usada nas estatísticas)
    const nomeMedicoOS = obterNomeMedico(os);
    if (!nomeMedicoOS || nomeMedicoOS === 'Não informado') return false;
    
    // Normalizar nomes para comparação (remover prefixos Dr., Dra., etc)
    const normalizarNome = (nome) => nome.toLowerCase()
      .replace(/^dr\.\s*/gi, '')
      .replace(/^dra\.\s*/gi, '')
      .replace(/^dr\(a\)\.\s*/gi, '')
      .replace(/dr\.\s*/gi, '')
      .replace(/dra\.\s*/gi, '')
      .replace(/dr\(a\)\.\s*/gi, '')
      .trim();
    
    const nomeFiltroNorm = normalizarNome(medicoFiltro.nome);
    const nomeOSNorm = normalizarNome(nomeMedicoOS);
    
    // Comparação direta
    if (nomeOSNorm === nomeFiltroNorm) return true;
    if (nomeOSNorm.includes(nomeFiltroNorm) || nomeFiltroNorm.includes(nomeOSNorm)) return true;
    
    // Comparar palavras significativas do nome (ignorar preposições)
    const ignorar = ['de', 'da', 'do', 'dos', 'das'];
    const palavrasFiltro = nomeFiltroNorm.split(' ').filter(p => p.length > 2 && !ignorar.includes(p));
    const palavrasOS = nomeOSNorm.split(' ').filter(p => p.length > 2 && !ignorar.includes(p));
    
    // Exigir pelo menos 2 palavras significativas em comum (não apenas primeiro nome)
    const palavrasComuns = palavrasFiltro.filter(p => palavrasOS.includes(p));
    if (palavrasComuns.length >= 2) {
      return true;
    }
    
    return false;
  };

  // Dados filtrados
  const dadosFiltrados = useMemo(() => {
    return ordensServico.filter(os => {
      // Excluir canceladas (a menos que o filtro específico seja "Cancelado")
      if (os.status_pagamento === "Cancelado" && filtros.statusPagamento !== "Cancelado") return false;
      
      // Filtro de data
      if (filtros.dataInicio && os.data_execucao < filtros.dataInicio) return false;
      if (filtros.dataFim && os.data_execucao > filtros.dataFim) return false;
      
      // Filtro de médico (com fallback para nome)
      if (filtros.medicoId !== 'todos') {
        if (!osPertenceAoMedico(os, filtros.medicoId)) return false;
      }
      
      // Filtro de categoria (por nome, não por ID)
      if (filtros.categoriaNome !== 'todos') {
        const nomeCategoria = obterNomeCategoria(os);
        if (nomeCategoria !== filtros.categoriaNome) return false;
      }
      
      // Filtro de forma de pagamento
      if (filtros.formaPagamento !== 'todos' && os.forma_pagamento !== filtros.formaPagamento) return false;
      
      // Filtro de status
      if (filtros.statusPagamento !== 'todos' && os.status_pagamento !== filtros.statusPagamento) return false;
      
      return true;
    }).sort((a, b) => {
      if (filtros.ordenacao === 'nome') {
        return (a.paciente_nome || '').localeCompare(b.paciente_nome || '');
      } else if (filtros.ordenacao === 'data') {
        return (b.data_execucao || '').localeCompare(a.data_execucao || '');
      } else if (filtros.ordenacao === 'valor') {
        return (b.valor_final || 0) - (a.valor_final || 0);
      }
      return 0;
    });
  }, [ordensServico, filtros, medicos, agendamentosMap]);

  const lancamentosFinanceiros = useMemo(() => {
    const lancamentosBase = filtrarLancamentosPorPeriodo(lancamentos, {
      dataInicio: filtros.dataInicio,
      dataFim: filtros.dataFim,
      formaPagamento: filtros.formaPagamento
    });

    const temFiltrosExtras =
      filtros.medicoId !== 'todos' ||
      filtros.categoriaNome !== 'todos' ||
      filtros.statusPagamento !== 'todos';

    if (!temFiltrosExtras) {
      return lancamentosBase;
    }

    const ordensVisiveisIds = new Set(
      dadosFiltrados.flatMap((os) => [os.id, os.original_id].filter(Boolean))
    );

    const mapaStatusLancamento = {
      Pago: 'Realizado',
      Pendente: 'Pendente',
      Cancelado: 'Cancelado'
    };

    return lancamentosBase.filter((lancamento) => {
      if (lancamento.ordem_servico_id) {
        return ordensVisiveisIds.has(lancamento.ordem_servico_id);
      }

      if (filtros.medicoId !== 'todos') {
        return lancamento.medico_id === filtros.medicoId;
      }

      if (filtros.statusPagamento !== 'todos') {
        return (lancamento.status || 'Realizado') === mapaStatusLancamento[filtros.statusPagamento];
      }

      return filtros.categoriaNome === 'todos';
    });
  }, [lancamentos, dadosFiltrados, filtros.dataInicio, filtros.dataFim, filtros.formaPagamento, filtros.medicoId, filtros.categoriaNome, filtros.statusPagamento]);

  const estatisticasFinanceiras = useMemo(() => {
    const resumo = somarLancamentos(lancamentosFinanceiros);
    return {
      ...resumo,
      movimentacoes: lancamentosFinanceiros.length
    };
  }, [lancamentosFinanceiros]);

  // Calcular estatísticas
  const estatisticas = useMemo(() => {
    const totalVendido = dadosFiltrados.reduce((acc, os) => acc + (os.valor_final || 0), 0);
    const totalRepasse = dadosFiltrados.reduce((acc, os) => acc + (os.valor_repasse_medico || 0), 0);
    const totalClinica = dadosFiltrados.reduce((acc, os) => acc + obterValorClinicaCalculado(os), 0);
    const totalAtendimentos = new Set(dadosFiltrados.map(os => os.original_id || os.id)).size;
    
    // Por forma de pagamento
    const porFormaPagamento = {};
    dadosFiltrados.forEach(os => {
      const forma = os.forma_pagamento || 'Não informado';
      if (!porFormaPagamento[forma]) {
        porFormaPagamento[forma] = { ids: new Set(), valor: 0 };
      }
      porFormaPagamento[forma].ids.add(os.original_id || os.id);
      porFormaPagamento[forma].valor += (os.valor_final || 0);
    });
    Object.keys(porFormaPagamento).forEach(forma => {
      porFormaPagamento[forma].quantidade = porFormaPagamento[forma].ids.size;
      delete porFormaPagamento[forma].ids;
    });
    
    // Por categoria (convênio/particular)
    const porCategoria = {};
    dadosFiltrados.forEach(os => {
      const nomeCategoria = obterNomeCategoria(os);
      if (!porCategoria[nomeCategoria]) {
        porCategoria[nomeCategoria] = { ids: new Set(), valor: 0, repasse: 0 };
      }
      porCategoria[nomeCategoria].ids.add(os.original_id || os.id);
      porCategoria[nomeCategoria].valor += (os.valor_final || 0);
      porCategoria[nomeCategoria].repasse += (os.valor_repasse_medico || 0);
    });
    Object.keys(porCategoria).forEach(cat => {
      porCategoria[cat].quantidade = porCategoria[cat].ids.size;
      delete porCategoria[cat].ids;
    });
    
    // Por médico - separar por medico_id real (considerando agendas unificadas)
    const porMedicoId = {};
    dadosFiltrados.forEach(os => {
      const medicoId = obterMedicoIdReal(os);
      if (!porMedicoId[medicoId]) {
        const med = medicos.find(m => m.id === medicoId);
        const nomeMedico = med ? med.nome : obterNomeMedico(os);
        const especialidade = med ? (med.especialidade || '') : '';
        porMedicoId[medicoId] = { 
          ids: new Set(), valor: 0, repasse: 0, medicoId, 
          nome: nomeMedico, especialidade 
        };
      }
      porMedicoId[medicoId].ids.add(os.original_id || os.id);
      porMedicoId[medicoId].valor += (os.valor_final || 0);
      porMedicoId[medicoId].repasse += (os.valor_repasse_medico || 0);
    });
    Object.keys(porMedicoId).forEach(id => {
      porMedicoId[id].quantidade = porMedicoId[id].ids.size;
      delete porMedicoId[id].ids;
    });

    // Manter porMedico agrupado por nome para gráficos gerais (compatibilidade)
    const porMedico = {};
    dadosFiltrados.forEach(os => {
      const nomeMedico = obterNomeMedico(os);
      if (!porMedico[nomeMedico]) {
        porMedico[nomeMedico] = { ids: new Set(), valor: 0, repasse: 0, medicoId: os.medico_id };
      }
      porMedico[nomeMedico].ids.add(os.original_id || os.id);
      porMedico[nomeMedico].valor += (os.valor_final || 0);
      porMedico[nomeMedico].repasse += (os.valor_repasse_medico || 0);
    });
    Object.keys(porMedico).forEach(nome => {
      porMedico[nome].quantidade = porMedico[nome].ids.size;
      delete porMedico[nome].ids;
    });
    
    return {
      totalVendido,
      totalRepasse,
      totalClinica,
      totalAtendimentos,
      porFormaPagamento,
      porCategoria,
      porMedico,
      porMedicoId
    };
  }, [dadosFiltrados, categorias, medicos, agendamentosMap]);

  const agendamentosSemOS = useMemo(() => {
    const agendamentosComOSIds = new Set(
      ordensServico.map((os) => os.agendamento_id).filter(Boolean)
    );

    return agendamentos.filter((ag) => {
      if (!ag?.id || agendamentosComOSIds.has(ag.id)) return false;
      if (["Cancelado", "Finalizado", "Não Compareceu"].includes(ag.status)) return false;
      if (filtros.dataInicio && ag.data_agendamento < filtros.dataInicio) return false;
      if (filtros.dataFim && ag.data_agendamento > filtros.dataFim) return false;
      if (filtros.medicoId !== 'todos' && ag.medico_id !== filtros.medicoId) return false;
      if (filtros.categoriaNome !== 'todos' && obterNomeCategoria(ag) !== filtros.categoriaNome) return false;
      return true;
    }).sort((a, b) => {
      if (filtros.ordenacao === 'nome') {
        return (a.paciente_nome || '').localeCompare(b.paciente_nome || '');
      } else if (filtros.ordenacao === 'data') {
        return (b.data_agendamento || '').localeCompare(a.data_agendamento || '');
      } else if (filtros.ordenacao === 'valor') {
        return (b.valor_final || 0) - (a.valor_final || 0);
      }
      return 0;
    });
  }, [agendamentos, ordensServico, filtros, categorias]);

  // Dados para gráficos
  const dadosGraficoFormaPagamento = useMemo(() => {
    return Object.entries(estatisticas.porFormaPagamento).map(([forma, dados]) => ({
      name: forma,
      valor: dados.valor,
      quantidade: dados.quantidade
    }));
  }, [estatisticas]);

  const dadosGraficoCategoria = useMemo(() => {
    return Object.entries(estatisticas.porCategoria).map(([cat, dados]) => ({
      name: cat,
      valor: dados.valor,
      quantidade: dados.quantidade
    }));
  }, [estatisticas]);

  const dadosGraficoMedico = useMemo(() => {
    return Object.entries(estatisticas.porMedico)
      .map(([med, dados]) => ({
        name: med.replace('Dr. ', '').replace('Dra. ', '').split(' ').slice(0, 2).join(' '),
        valor: dados.valor,
        repasse: dados.repasse,
        quantidade: dados.quantidade
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [estatisticas]);

  const handlePrintRepasses = () => {
    const printWindow = window.open('', '_blank');
    
    const osEmAberto = dadosFiltrados.filter(os => !os.repasse_realizado && os.valor_repasse_medico > 0);
    const osRealizados = dadosFiltrados.filter(os => os.repasse_realizado);
    const totalEmAberto = osEmAberto.reduce((acc, os) => acc + (os.valor_repasse_medico || 0), 0);
    const totalRealizados = osRealizados.reduce((acc, os) => acc + (os.valor_repasse_medico || 0), 0);
    
    // Montar filtros aplicados
    const filtrosAplicados = [];
    if (filtros.medicoId !== 'todos') {
      const med = medicos.find(m => m.id === filtros.medicoId);
      if (med) filtrosAplicados.push(`Profissional: ${med.nome}`);
    }
    if (filtros.categoriaNome !== 'todos') {
      filtrosAplicados.push(`Categoria: ${filtros.categoriaNome}`);
    }
    if (filtros.formaPagamento !== 'todos') {
      filtrosAplicados.push(`Pagamento: ${filtros.formaPagamento}`);
    }
    if (filtros.statusPagamento !== 'todos') {
      filtrosAplicados.push(`Status: ${filtros.statusPagamento}`);
    }
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Relatório de Repasses - Glória Clínica</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            h1 { color: #1e40af; font-size: 18px; margin-bottom: 5px; }
            h2 { font-size: 14px; margin-top: 0; color: #666; }
            h3 { font-size: 13px; margin-top: 20px; border-bottom: 2px solid #ddd; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f3f4f6; font-size: 11px; font-weight: bold; }
            td { font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; }
            .filtros { background: #f9fafb; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 11px; }
            .stats { display: flex; gap: 15px; margin: 20px 0; }
            .stat-card { border: 1px solid #ddd; padding: 10px; border-radius: 5px; flex: 1; text-align: center; }
            .stat-card strong { font-size: 10px; color: #666; display: block; }
            .stat-card .valor { font-size: 16px; font-weight: bold; }
            .total { font-weight: bold; background-color: #f0f9ff; }
            .text-right { text-align: right; }
            .em-aberto { background-color: #fff7ed; }
            .realizados { background-color: #f0fdf4; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>GLÓRIA CLÍNICA</h1>
            <h2>Relatório de Repasses</h2>
            <p>Período: ${format(parseISO(filtros.dataInicio), 'dd/MM/yyyy')} a ${format(parseISO(filtros.dataFim), 'dd/MM/yyyy')}</p>
            <p style="font-size: 10px; color: #666;">Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>
          
          ${filtrosAplicados.length > 0 ? `
            <div class="filtros">
              <strong>Filtros aplicados:</strong> ${filtrosAplicados.join(' | ')}
            </div>
          ` : ''}
          
          <div class="stats">
            <div class="stat-card">
              <strong>Total de Repasses</strong>
              <span class="valor" style="color: #7c3aed;">R$ ${estatisticas.totalRepasse.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="stat-card">
              <strong>Em Aberto</strong>
              <span class="valor" style="color: #ea580c;">R$ ${totalEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="stat-card">
              <strong>Realizados</strong>
              <span class="valor" style="color: #16a34a;">R$ ${totalRealizados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          
          <h3>Repasses em Aberto (${new Set(osEmAberto.map(os => os.original_id || os.id)).size})</h3>
          <table class="em-aberto">
            <thead>
              <tr>
                <th>Data</th>
                <th>Paciente</th>
                <th>Médico</th>
                <th>Categoria</th>
                <th class="text-right">Valor Total</th>
                <th class="text-right">Repasse</th>
              </tr>
            </thead>
            <tbody>
              ${osEmAberto.map(os => `
                <tr>
                  <td>${os.data_execucao ? format(parseISO(os.data_execucao), 'dd/MM/yy') : '-'}</td>
                  <td>${os.paciente_nome || '-'}</td>
                  <td>${obterNomeMedico(os).split(' ').slice(0, 2).join(' ')}</td>
                  <td>${obterNomeCategoria(os)}</td>
                  <td class="text-right">R$ ${(os.valor_final || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right"><strong>R$ ${(os.valor_repasse_medico || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              `).join('')}
              <tr class="total">
                <td colspan="5" class="text-right"><strong>TOTAL EM ABERTO</strong></td>
                <td class="text-right"><strong>R$ ${totalEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tbody>
          </table>
          
          <h3>Repasses Realizados (${new Set(osRealizados.map(os => os.original_id || os.id)).size})</h3>
          <table class="realizados">
            <thead>
              <tr>
                <th>Data Exec.</th>
                <th>Data Repasse</th>
                <th>Paciente</th>
                <th>Médico</th>
                <th class="text-right">Repasse</th>
              </tr>
            </thead>
            <tbody>
              ${osRealizados.map(os => `
                <tr>
                  <td>${os.data_execucao ? format(parseISO(os.data_execucao), 'dd/MM/yy') : '-'}</td>
                  <td>${os.data_repasse ? format(parseISO(os.data_repasse), 'dd/MM/yy') : '-'}</td>
                  <td>${os.paciente_nome || '-'}</td>
                  <td>${obterNomeMedico(os).split(' ').slice(0, 2).join(' ')}</td>
                  <td class="text-right"><strong>R$ ${(os.valor_repasse_medico || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              `).join('')}
              <tr class="total">
                <td colspan="4" class="text-right"><strong>TOTAL REALIZADO</strong></td>
                <td class="text-right"><strong>R$ ${totalRealizados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    
    // Montar filtros aplicados para exibir no relatório
    const filtrosAplicados = [];
    if (filtros.medicoId !== 'todos') {
      const med = medicos.find(m => m.id === filtros.medicoId);
      if (med) filtrosAplicados.push(`Profissional: ${med.nome}`);
    }
    if (filtros.categoriaNome !== 'todos') {
      filtrosAplicados.push(`Categoria: ${filtros.categoriaNome}`);
    }
    if (filtros.formaPagamento !== 'todos') {
      filtrosAplicados.push(`Pagamento: ${filtros.formaPagamento}`);
    }
    if (filtros.statusPagamento !== 'todos') {
      filtrosAplicados.push(`Status: ${filtros.statusPagamento}`);
    }
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Relatório Financeiro - Glória Clínica</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            h1 { color: #1e40af; font-size: 18px; margin-bottom: 5px; }
            h2 { font-size: 14px; margin-top: 0; color: #666; }
            h3 { font-size: 13px; margin-top: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f3f4f6; font-size: 11px; }
            td { font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; }
            .filtros { background: #f9fafb; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 11px; }
            .stats { display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap; }
            .stat-card { border: 1px solid #ddd; padding: 10px; border-radius: 5px; min-width: 120px; }
            .stat-card strong { font-size: 10px; color: #666; }
            .stat-card .valor { font-size: 14px; font-weight: bold; color: #1e40af; }
            .total { font-weight: bold; background-color: #f0f9ff; }
            .text-right { text-align: right; }
            @media print { 
              .no-print { display: none; } 
              body { margin: 10px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>GLÓRIA CLÍNICA</h1>
            <h2>Relatório Financeiro</h2>
            <p>Período: ${format(parseISO(filtros.dataInicio), 'dd/MM/yyyy')} a ${format(parseISO(filtros.dataFim), 'dd/MM/yyyy')}</p>
            <p style="font-size: 10px; color: #666;">Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>
          
          ${filtrosAplicados.length > 0 ? `
            <div class="filtros">
              <strong>Filtros aplicados:</strong> ${filtrosAplicados.join(' | ')}
            </div>
          ` : ''}
          
          <div class="stats">
            <div class="stat-card">
              <strong>Total Vendido</strong><br/>
              <span class="valor">R$ ${estatisticas.totalVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="stat-card">
              <strong>Receita Clínica</strong><br/>
              <span class="valor" style="color: #16a34a;">R$ ${estatisticas.totalClinica.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="stat-card">
              <strong>Repasse Médicos</strong><br/>
              <span class="valor" style="color: #9333ea;">R$ ${estatisticas.totalRepasse.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="stat-card">
              <strong>Atendimentos</strong><br/>
              <span class="valor">${estatisticas.totalAtendimentos}</span>
            </div>
          </div>
          
          <h3>Detalhamento (${new Set(dadosFiltrados.map(os => os.original_id || os.id)).size} atendimentos / ${dadosFiltrados.length} registros)</h3>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Paciente</th>
                <th>Médico</th>
                <th>Categoria</th>
                <th>Pagamento</th>
                <th class="text-right">Valor</th>
                <th class="text-right">Repasse</th>
                <th class="text-right">Clínica</th>
              </tr>
            </thead>
            <tbody>
              ${dadosFiltrados.map(os => {
                const nomeMed = obterNomeMedico(os);
                const nomeCat = obterNomeCategoria(os);
                return `<tr>
                  <td>${os.data_execucao ? format(parseISO(os.data_execucao), 'dd/MM/yy') : '-'}</td>
                  <td>${os.paciente_nome || '-'}</td>
                  <td>${nomeMed.split(' ').slice(0, 2).join(' ')}</td>
                  <td>${nomeCat}</td>
                  <td>${os.forma_pagamento || '-'}</td>
                  <td class="text-right">R$ ${(os.valor_final || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right">R$ ${(os.valor_repasse_medico || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right">R$ ${obterValorClinicaCalculado(os).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="total">
                <td colspan="5"><strong>TOTAL</strong></td>
                <td class="text-right"><strong>R$ ${estatisticas.totalVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                <td class="text-right"><strong>R$ ${estatisticas.totalRepasse.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                <td class="text-right"><strong>R$ ${estatisticas.totalClinica.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
  };

  const formatCurrency = (value) => {
    return `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] flex-col gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-lg text-gray-600">Carregando dados...</p>
      </div>
    );
  }

  return (
    <ProtectedRoute requiredRole="admin" fallbackMessage="Apenas administradores podem acessar relatórios.">
      <div className="p-6 bg-gray-50 min-h-screen" ref={printRef}>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Relatórios Financeiros</h1>
              <p className="text-gray-600">
                Controle detalhado de vendas, repasses e receitas 
                <span className="ml-2 text-blue-600 font-medium">
                  ({new Set(ordensServico.map(os => os.original_id || os.id)).size} OS carregadas, {estatisticas.totalAtendimentos} no período)
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={carregarDados}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar
              </Button>
              <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Relatório
              </Button>
            </div>
          </div>

          {/* Filtros */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div>
                  <Label>Data Início</Label>
                  <Input
                    type="date"
                    value={filtros.dataInicio}
                    onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Data Fim</Label>
                  <Input
                    type="date"
                    value={filtros.dataFim}
                    onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Profissional</Label>
                  <Select value={filtros.medicoId} onValueChange={(v) => setFiltros({ ...filtros, medicoId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {medicos.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={filtros.categoriaNome} onValueChange={(v) => setFiltros({ ...filtros, categoriaNome: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {/* Categorias atuais */}
                      {categorias.map(c => (
                        <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                      ))}
                      {/* Categorias legadas (para dados antigos) */}
                      {Object.values(MAPEAMENTO_CATEGORIA_LEGADO)
                        .filter(nome => !categorias.some(c => c.nome === nome))
                        .map(nome => (
                          <SelectItem key={nome} value={nome}>{nome} (legado)</SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pagamento</Label>
                  <Select value={filtros.formaPagamento} onValueChange={(v) => setFiltros({ ...filtros, formaPagamento: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                      <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Transferência">Transferência</SelectItem>
                      <SelectItem value="Convênio">Convênio</SelectItem>
                      <SelectItem value="Múltiplas Formas">Múltiplas Formas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={filtros.statusPagamento} onValueChange={(v) => setFiltros({ ...filtros, statusPagamento: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="Pago">Pago</SelectItem>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      <SelectItem value="Cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ordenar por</Label>
                  <Select value={filtros.ordenacao} onValueChange={(v) => setFiltros({ ...filtros, ordenacao: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nome">Nome (A-Z)</SelectItem>
                      <SelectItem value="data">Data</SelectItem>
                      <SelectItem value="valor">Valor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-emerald-100 text-sm">{filtros.medicoId !== 'todos' ? 'Total Vendido' : 'Total Vendido'}</p>
                    <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalVendido)}</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-emerald-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-100 text-sm">Total Repasse</p>
                    <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalRepasse)}</p>
                  </div>
                  <AlertCircle className="w-10 h-10 text-red-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm">Receita Clínica</p>
                    <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalClinica)}</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-blue-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-slate-600 to-slate-700 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-100 text-sm">Atendimentos</p>
                    <p className="text-2xl font-bold">{estatisticas.totalAtendimentos}</p>
                  </div>
                  <FileText className="w-10 h-10 text-slate-200" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs com Gráficos e Tabelas */}
          <Tabs defaultValue="graficos" className="space-y-4">
            <TabsList>
              <TabsTrigger value="graficos" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Gráficos
              </TabsTrigger>
              <TabsTrigger value="detalhado" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Detalhado
              </TabsTrigger>
              <TabsTrigger value="por-medico" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Por Médico
              </TabsTrigger>
              <TabsTrigger value="por-categoria" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Por Categoria
              </TabsTrigger>
              <TabsTrigger value="relatorio-medico" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Relatório por Médico
              </TabsTrigger>
              <TabsTrigger value="repasses" className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Repasses
              </TabsTrigger>
              <TabsTrigger value="orcamentos" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Orçamentos em Aberto
              </TabsTrigger>
              </TabsList>

            {/* Tab Gráficos */}
            <TabsContent value="graficos">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico por Forma de Pagamento */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5" />
                      Por Forma de Pagamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={dadosGraficoFormaPagamento}
                          dataKey="valor"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {dadosGraficoFormaPagamento.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CORES_GRAFICO[index % CORES_GRAFICO.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Gráfico por Categoria */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Por Categoria/Convênio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={dadosGraficoCategoria}
                          dataKey="valor"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? '...' : ''} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {dadosGraficoCategoria.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CORES_GRAFICO[index % CORES_GRAFICO.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Gráfico por Médico */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Faturamento por Profissional (Top 10)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={dadosGraficoMedico} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" width={120} />
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                        <Legend />
                        <Bar dataKey="valor" name="Faturado" fill="#3b82f6" />
                        <Bar dataKey="repasse" name="Repasse" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab Detalhado */}
            <TabsContent value="detalhado">
              <Card>
                <CardHeader>
                  <CardTitle>Detalhamento - {estatisticas.totalAtendimentos} atendimentos ({dadosFiltrados.length} registros)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Médico</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Pagamento</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">Repasse</TableHead>
                          <TableHead className="text-right">Clínica</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dadosFiltrados.slice(0, 200).map((os) => {
                          const nomeMedico = obterNomeMedico(os);
                          const nomeCategoria = obterNomeCategoria(os);
                          return (
                            <TableRow key={os.id}>
                              <TableCell>{os.data_execucao ? format(parseISO(os.data_execucao), 'dd/MM/yy') : '-'}</TableCell>
                              <TableCell className="font-medium">{os.paciente_nome || '-'}</TableCell>
                              <TableCell>{nomeMedico.split(' ').slice(0, 2).join(' ')}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{nomeCategoria}</Badge>
                              </TableCell>
                              <TableCell>{os.forma_pagamento || '-'}</TableCell>
                              <TableCell>
                                <Badge className={os.status_pagamento === 'Pago' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                                  {os.status_pagamento || 'Pendente'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(os.valor_final)}</TableCell>
                              <TableCell className="text-right text-purple-600">{formatCurrency(os.valor_repasse_medico)}</TableCell>
                              <TableCell className="text-right text-green-600">{formatCurrency(obterValorClinicaCalculado(os))}</TableCell>
                            </TableRow>
                          );
                        })}
                        {dadosFiltrados.length > 200 && (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-gray-500">
                              Mostrando 200 de {dadosFiltrados.length} registros. Use os filtros para refinar.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Totais */}
                  <div className="mt-4 pt-4 border-t flex justify-end gap-8">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Total Vendido</p>
                      <p className="text-xl font-bold text-blue-600">{formatCurrency(estatisticas.totalVendido)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Total Repasse</p>
                      <p className="text-xl font-bold text-purple-600">{formatCurrency(estatisticas.totalRepasse)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Receita Clínica</p>
                      <p className="text-xl font-bold text-green-600">{formatCurrency(estatisticas.totalClinica)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Por Médico */}
            <TabsContent value="por-medico">
              <Card>
                <CardHeader>
                  <CardTitle>Resumo por Profissional (Separado por Especialidade)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Especialidade</TableHead>
                        <TableHead className="text-center">Atendimentos</TableHead>
                        <TableHead className="text-right">Faturado</TableHead>
                        <TableHead className="text-right">Repasse</TableHead>
                        <TableHead className="text-right">Clínica</TableHead>
                        <TableHead className="text-right">% do Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(estatisticas.porMedicoId)
                        .sort((a, b) => b[1].valor - a[1].valor)
                        .map(([id, dados]) => (
                          <TableRow key={id}>
                            <TableCell className="font-medium">{dados.nome}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{dados.especialidade || '-'}</Badge>
                            </TableCell>
                            <TableCell className="text-center">{dados.quantidade}</TableCell>
                            <TableCell className="text-right">{formatCurrency(dados.valor)}</TableCell>
                            <TableCell className="text-right text-purple-600">{formatCurrency(dados.repasse)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatCurrency(dados.valor - dados.repasse)}</TableCell>
                            <TableCell className="text-right">
                              {estatisticas.totalVendido > 0 
                                ? ((dados.valor / estatisticas.totalVendido) * 100).toFixed(1) + '%'
                                : '0%'
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Por Categoria */}
            <TabsContent value="por-categoria">
              <Card>
                <CardHeader>
                  <CardTitle>Resumo por Categoria/Convênio</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-center">Atendimentos</TableHead>
                        <TableHead className="text-right">Faturado</TableHead>
                        <TableHead className="text-right">Repasse</TableHead>
                        <TableHead className="text-right">% do Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(estatisticas.porCategoria)
                        .sort((a, b) => b[1].valor - a[1].valor)
                        .map(([nome, dados]) => (
                          <TableRow key={nome}>
                            <TableCell className="font-medium">
                              <Badge variant="outline">{nome}</Badge>
                            </TableCell>
                            <TableCell className="text-center">{dados.quantidade}</TableCell>
                            <TableCell className="text-right">{formatCurrency(dados.valor)}</TableCell>
                            <TableCell className="text-right text-purple-600">{formatCurrency(dados.repasse)}</TableCell>
                            <TableCell className="text-right">
                              {estatisticas.totalVendido > 0 
                                ? ((dados.valor / estatisticas.totalVendido) * 100).toFixed(1) + '%'
                                : '0%'
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Relatório Detalhado por Médico */}
            <TabsContent value="relatorio-medico">
              <div className="space-y-6">
                {Object.entries(estatisticas.porMedicoId)
                  .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
                  .map(([medicoId, dadosMedico]) => {
                    const nomeMedico = dadosMedico.especialidade 
                      ? `${dadosMedico.nome} (${dadosMedico.especialidade})`
                      : dadosMedico.nome;
                    // Filtrar OS deste médico pelo ID real (considerando agendas unificadas)
                    const osMedico = dadosFiltrados.filter(os => {
                      return obterMedicoIdReal(os) === medicoId;
                    });
                    
                    // Agrupar por categoria
                    const porCategoriaLocal = {};
                    osMedico.forEach(os => {
                      const nomeCat = obterNomeCategoria(os);
                      if (!porCategoriaLocal[nomeCat]) {
                        porCategoriaLocal[nomeCat] = { ids: new Set(), valor: 0 };
                      }
                      porCategoriaLocal[nomeCat].ids.add(os.original_id || os.id);
                      porCategoriaLocal[nomeCat].valor += (os.valor_final || 0);
                    });
                    Object.keys(porCategoriaLocal).forEach(cat => {
                      porCategoriaLocal[cat].quantidade = porCategoriaLocal[cat].ids.size;
                      delete porCategoriaLocal[cat].ids;
                    });
                    
                    // Agrupar por forma de pagamento
                    const porPagamentoLocal = {};
                    osMedico.forEach(os => {
                      const forma = os.forma_pagamento || 'Não informado';
                      if (!porPagamentoLocal[forma]) {
                        porPagamentoLocal[forma] = { ids: new Set(), valor: 0 };
                      }
                      porPagamentoLocal[forma].ids.add(os.original_id || os.id);
                      porPagamentoLocal[forma].valor += (os.valor_final || 0);
                    });
                    Object.keys(porPagamentoLocal).forEach(forma => {
                      porPagamentoLocal[forma].quantidade = porPagamentoLocal[forma].ids.size;
                      delete porPagamentoLocal[forma].ids;
                    });
                    
                    return (
                      <Card key={medicoId}>
                        <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
                          <div className="flex justify-between items-center">
                            <CardTitle className="flex items-center gap-2">
                              <Users className="w-5 h-5" />
                              {nomeMedico}
                            </CardTitle>
                            <div className="flex gap-4 text-sm">
                              <div className="text-right">
                                <span className="text-gray-500">Atendimentos:</span>
                                <span className="ml-2 font-bold">{dadosMedico.quantidade}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-gray-500">Faturado:</span>
                                <span className="ml-2 font-bold text-blue-600">{formatCurrency(dadosMedico.valor)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-gray-500">Repasse:</span>
                                <span className="ml-2 font-bold text-purple-600">{formatCurrency(dadosMedico.repasse)}</span>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Por Categoria */}
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                <Building2 className="w-4 h-4" />
                                Por Categoria/Convênio
                              </h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Categoria</TableHead>
                                    <TableHead className="text-center">Qtd</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {Object.entries(porCategoriaLocal)
                                    .sort((a, b) => b[1].valor - a[1].valor)
                                    .map(([cat, d]) => (
                                      <TableRow key={cat}>
                                        <TableCell>
                                          <Badge variant="outline">{cat}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center">{d.quantidade}</TableCell>
                                        <TableCell className="text-right font-medium">{formatCurrency(d.valor)}</TableCell>
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                            </div>
                            
                            {/* Por Forma de Pagamento */}
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                <CreditCard className="w-4 h-4" />
                                Por Forma de Pagamento
                              </h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Pagamento</TableHead>
                                    <TableHead className="text-center">Qtd</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {Object.entries(porPagamentoLocal)
                                    .sort((a, b) => b[1].valor - a[1].valor)
                                    .map(([pag, d]) => (
                                      <TableRow key={pag}>
                                        <TableCell>{pag}</TableCell>
                                        <TableCell className="text-center">{d.quantidade}</TableCell>
                                        <TableCell className="text-right font-medium">{formatCurrency(d.valor)}</TableCell>
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                          
                          {/* Lista de atendimentos */}
                          <div className="mt-4 pt-4 border-t">
                            <h4 className="font-semibold text-gray-700 mb-2">Atendimentos Detalhados</h4>
                            <div className="max-h-[300px] overflow-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Paciente</TableHead>
                                    <TableHead>Categoria</TableHead>
                                    <TableHead>Pagamento</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead className="text-right">Repasse</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {osMedico.slice(0, 50).map(os => {
                                    const nomeCat = obterNomeCategoria(os);
                                    return (
                                      <TableRow key={os.id}>
                                        <TableCell>{os.data_execucao ? format(parseISO(os.data_execucao), 'dd/MM/yy') : '-'}</TableCell>
                                        <TableCell className="font-medium">{os.paciente_nome || '-'}</TableCell>
                                        <TableCell><Badge variant="outline" className="text-xs">{nomeCat}</Badge></TableCell>
                                        <TableCell>{os.forma_pagamento || '-'}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(os.valor_final)}</TableCell>
                                        <TableCell className="text-right text-purple-600">{formatCurrency(os.valor_repasse_medico)}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                              {osMedico.length > 50 && (
                                <p className="text-center text-gray-500 text-sm mt-2">
                                  Mostrando 50 de {osMedico.length} atendimentos
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </TabsContent>

            {/* Tab Repasses */}
            <TabsContent value="repasses">
              <div className="space-y-4">
                {/* Botão Imprimir Repasses */}
                <div className="flex justify-end">
                  <Button onClick={handlePrintRepasses} className="bg-purple-600 hover:bg-purple-700">
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir Repasses
                  </Button>
                </div>
                
                {/* Resumo de Repasses */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                    <CardContent className="p-6">
                      <p className="text-purple-100 text-sm">Total de Repasses</p>
                      <p className="text-3xl font-bold">{formatCurrency(estatisticas.totalRepasse)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white">
                    <CardContent className="p-6">
                      <p className="text-orange-100 text-sm">Em Aberto</p>
                      <p className="text-3xl font-bold">
                        {formatCurrency(
                          dadosFiltrados
                            .filter(os => !os.repasse_realizado && os.valor_repasse_medico > 0)
                            .reduce((acc, os) => acc + (os.valor_repasse_medico || 0), 0)
                        )}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                    <CardContent className="p-6">
                      <p className="text-green-100 text-sm">Realizados</p>
                      <p className="text-3xl font-bold">
                        {formatCurrency(
                          dadosFiltrados
                            .filter(os => os.repasse_realizado)
                            .reduce((acc, os) => acc + (os.valor_repasse_medico || 0), 0)
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabela de Repasses por Médico */}
                <Card>
                  <CardHeader>
                    <CardTitle>Repasses por Profissional (Separado por Especialidade)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Profissional</TableHead>
                          <TableHead>Especialidade</TableHead>
                          <TableHead className="text-center">Atendimentos</TableHead>
                          <TableHead className="text-right">Total Faturado</TableHead>
                          <TableHead className="text-right">Repasse Total</TableHead>
                          <TableHead className="text-right">Em Aberto</TableHead>
                          <TableHead className="text-right">Realizados</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(estatisticas.porMedicoId)
                          .sort((a, b) => b[1].repasse - a[1].repasse)
                          .map(([medicoId, dados]) => {
                            const osMedico = dadosFiltrados.filter(os => obterMedicoIdReal(os) === medicoId);
                            const emAberto = osMedico
                              .filter(os => !os.repasse_realizado)
                              .reduce((acc, os) => acc + (os.valor_repasse_medico || 0), 0);
                            const realizados = osMedico
                              .filter(os => os.repasse_realizado)
                              .reduce((acc, os) => acc + (os.valor_repasse_medico || 0), 0);
                            
                            return (
                              <TableRow key={medicoId}>
                                <TableCell className="font-medium">{dados.nome}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{dados.especialidade || '-'}</Badge></TableCell>
                                <TableCell className="text-center">{dados.quantidade}</TableCell>
                                <TableCell className="text-right">{formatCurrency(dados.valor)}</TableCell>
                                <TableCell className="text-right font-bold text-purple-600">{formatCurrency(dados.repasse)}</TableCell>
                                <TableCell className="text-right text-orange-600">{formatCurrency(emAberto)}</TableCell>
                                <TableCell className="text-right text-green-600">{formatCurrency(realizados)}</TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Lista Detalhada de Repasses Em Aberto */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-orange-500" />
                      Repasses em Aberto - {new Set(dadosFiltrados.filter(os => !os.repasse_realizado && os.valor_repasse_medico > 0).map(os => os.original_id || os.id)).size} pendentes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[400px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Paciente</TableHead>
                            <TableHead>Médico</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                            <TableHead className="text-right">Repasse</TableHead>
                            <TableHead>Status Pag.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dadosFiltrados
                            .filter(os => !os.repasse_realizado && os.valor_repasse_medico > 0)
                            .sort((a, b) => (b.data_execucao || '').localeCompare(a.data_execucao || ''))
                            .slice(0, 100)
                            .map(os => (
                              <TableRow key={os.id}>
                                <TableCell>{os.data_execucao ? format(parseISO(os.data_execucao), 'dd/MM/yy') : '-'}</TableCell>
                                <TableCell className="font-medium">{os.paciente_nome || '-'}</TableCell>
                                <TableCell>{obterNomeMedico(os).split(' ').slice(0, 2).join(' ')}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{obterNomeCategoria(os)}</Badge></TableCell>
                                <TableCell className="text-right">{formatCurrency(os.valor_final)}</TableCell>
                                <TableCell className="text-right font-bold text-orange-600">{formatCurrency(os.valor_repasse_medico)}</TableCell>
                                <TableCell>
                                  <Badge className={os.status_pagamento === 'Pago' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                                    {os.status_pagamento || 'Pendente'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Lista de Repasses Realizados */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      Repasses Realizados - {new Set(dadosFiltrados.filter(os => os.repasse_realizado).map(os => os.original_id || os.id)).size} pagos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[400px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data Exec.</TableHead>
                            <TableHead>Data Repasse</TableHead>
                            <TableHead>Paciente</TableHead>
                            <TableHead>Médico</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                            <TableHead className="text-right">Repasse</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dadosFiltrados
                            .filter(os => os.repasse_realizado)
                            .sort((a, b) => (b.data_repasse || b.data_execucao || '').localeCompare(a.data_repasse || a.data_execucao || ''))
                            .slice(0, 100)
                            .map(os => (
                              <TableRow key={os.id}>
                                <TableCell>{os.data_execucao ? format(parseISO(os.data_execucao), 'dd/MM/yy') : '-'}</TableCell>
                                <TableCell className="text-green-600 font-medium">
                                  {os.data_repasse ? format(parseISO(os.data_repasse), 'dd/MM/yy') : '-'}
                                </TableCell>
                                <TableCell className="font-medium">{os.paciente_nome || '-'}</TableCell>
                                <TableCell>{obterNomeMedico(os).split(' ').slice(0, 2).join(' ')}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{obterNomeCategoria(os)}</Badge></TableCell>
                                <TableCell className="text-right">{formatCurrency(os.valor_final)}</TableCell>
                                <TableCell className="text-right font-bold text-green-600">{formatCurrency(os.valor_repasse_medico)}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="orcamentos">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-gradient-to-br from-slate-700 to-slate-800 text-white">
                    <CardContent className="p-6">
                      <p className="text-slate-100 text-sm">Total de Orçamentos</p>
                      <p className="text-3xl font-bold">{lancamentosPagos.length + lancamentosEmAberto.length}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                    <CardContent className="p-6">
                      <p className="text-green-100 text-sm">Com Ordem de Serviço</p>
                      <p className="text-3xl font-bold">{formatCurrency(lancamentosPagos.reduce((acc, lancamento) => acc + (lancamento.valor || 0), 0))}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white">
                    <CardContent className="p-6">
                      <p className="text-orange-100 text-sm">Em Aberto / Sem OS</p>
                      <p className="text-3xl font-bold">{formatCurrency(lancamentosEmAberto.reduce((acc, lancamento) => acc + (lancamento.valor || 0), 0))}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      Lançamentos com Ordem de Serviço ({lancamentosPagos.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[350px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Pagamento</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lancamentosPagos.map((lancamento) => (
                            <TableRow key={lancamento.id}>
                              <TableCell>{lancamento.data_lancamento ? format(parseISO(lancamento.data_lancamento), 'dd/MM/yy') : '-'}</TableCell>
                              <TableCell className="font-medium">{lancamento.descricao || '-'}</TableCell>
                              <TableCell>{lancamento.categoria || '-'}</TableCell>
                              <TableCell>{lancamento.forma_pagamento || '-'}</TableCell>
                              <TableCell><Badge className="bg-green-100 text-green-800">{lancamento.status || 'Realizado'}</Badge></TableCell>
                              <TableCell className="text-right">{formatCurrency(lancamento.valor)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-orange-500" />
                      Lançamentos em Aberto / Sem Ordem de Serviço ({lancamentosEmAberto.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[350px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Pagamento</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lancamentosEmAberto.map((lancamento) => (
                            <TableRow key={lancamento.id}>
                              <TableCell>{lancamento.data_lancamento ? format(parseISO(lancamento.data_lancamento), 'dd/MM/yy') : '-'}</TableCell>
                              <TableCell className="font-medium">{lancamento.descricao || '-'}</TableCell>
                              <TableCell>{lancamento.categoria || '-'}</TableCell>
                              <TableCell>{lancamento.forma_pagamento || '-'}</TableCell>
                              <TableCell><Badge className="bg-yellow-100 text-yellow-800">{lancamento.status || 'Pendente'}</Badge></TableCell>
                              <TableCell className="text-right">{formatCurrency(lancamento.valor)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </ProtectedRoute>
  );
}