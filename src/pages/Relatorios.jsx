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
  Calendar, RefreshCw
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import { OrdemServico, Medico, CategoriaPreco, Paciente } from '@/entities/all';

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

export default function Relatorios() {
  const [loading, setLoading] = useState(true);
  const [ordensServico, setOrdensServico] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  
  // Filtros - iniciar com dados dos últimos 2 anos para mostrar registros
  const [filtros, setFiltros] = useState({
    dataInicio: format(new Date(new Date().setFullYear(new Date().getFullYear() - 2)), 'yyyy-MM-dd'),
    dataFim: format(new Date(), 'yyyy-MM-dd'),
    medicoId: 'todos',
    categoriaNome: 'todos', // Mudado de categoriaId para categoriaNome
    formaPagamento: 'todos',
    statusPagamento: 'todos',
    ordenacao: 'data'
  });
  
  const printRef = useRef(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [osData, medicosData, categoriasData, pacientesData] = await Promise.all([
        OrdemServico.list('-data_execucao', 5000),
        Medico.list(),
        CategoriaPreco.list(),
        Paciente.list('nome', 5000)
      ]);
      
      setOrdensServico(osData || []);
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

  // Função auxiliar para verificar se OS pertence ao médico selecionado
  const osPertenceAoMedico = (os, medicoIdFiltro) => {
    // Primeiro verifica pelo ID direto
    if (os.medico_id === medicoIdFiltro) return true;
    
    // Se não bateu, buscar o médico pelo nome e verificar
    const medicoFiltro = medicos.find(m => m.id === medicoIdFiltro);
    if (!medicoFiltro) return false;
    
    // Tentar extrair nome do médico do campo itens
    if (os.itens) {
      try {
        const itensArray = typeof os.itens === 'string' ? JSON.parse(os.itens) : os.itens;
        if (itensArray && itensArray.length > 0) {
          const descricao = itensArray[0].descricao || '';
          // Verificar se a descrição contém o nome do médico
          const nomeMedicoLower = medicoFiltro.nome.toLowerCase();
          const descricaoLower = descricao.toLowerCase();
          
          // Verificar partes do nome
          const partesNome = nomeMedicoLower.split(' ').filter(p => p.length > 2);
          const matchNome = partesNome.some(parte => descricaoLower.includes(parte));
          if (matchNome) return true;
        }
      } catch (e) {
        // Ignorar erros de parse
      }
    }
    
    return false;
  };

  // Dados filtrados
  const dadosFiltrados = useMemo(() => {
    return ordensServico.filter(os => {
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
  }, [ordensServico, filtros, medicos]);

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

  // Função para obter nome do médico (ID ou fallback de itens)
  const obterNomeMedico = (os) => {
    const med = medicos.find(m => m.id === os.medico_id);
    if (med) return med.nome;
    
    // Fallback: tentar extrair do campo itens
    const nomeDeItens = extrairNomeMedicoDeItens(os);
    if (nomeDeItens) return nomeDeItens;
    
    return 'Não informado';
  };

  // Estatísticas
  const estatisticas = useMemo(() => {
    const totalVendido = dadosFiltrados.reduce((acc, os) => acc + (os.valor_final || 0), 0);
    const totalRepasse = dadosFiltrados.reduce((acc, os) => acc + (os.valor_repasse_medico || 0), 0);
    const totalClinica = dadosFiltrados.reduce((acc, os) => acc + (os.valor_clinica || 0), 0);
    const totalAtendimentos = dadosFiltrados.length;
    
    // Por forma de pagamento
    const porFormaPagamento = {};
    dadosFiltrados.forEach(os => {
      const forma = os.forma_pagamento || 'Não informado';
      if (!porFormaPagamento[forma]) {
        porFormaPagamento[forma] = { quantidade: 0, valor: 0 };
      }
      porFormaPagamento[forma].quantidade++;
      porFormaPagamento[forma].valor += (os.valor_final || 0);
    });
    
    // Por categoria (convênio/particular)
    const porCategoria = {};
    dadosFiltrados.forEach(os => {
      const nomeCategoria = obterNomeCategoria(os);
      if (!porCategoria[nomeCategoria]) {
        porCategoria[nomeCategoria] = { quantidade: 0, valor: 0, repasse: 0 };
      }
      porCategoria[nomeCategoria].quantidade++;
      porCategoria[nomeCategoria].valor += (os.valor_final || 0);
      porCategoria[nomeCategoria].repasse += (os.valor_repasse_medico || 0);
    });
    
    // Por médico
    const porMedico = {};
    dadosFiltrados.forEach(os => {
      const nomeMedico = obterNomeMedico(os);
      if (!porMedico[nomeMedico]) {
        porMedico[nomeMedico] = { quantidade: 0, valor: 0, repasse: 0, medicoId: os.medico_id };
      }
      porMedico[nomeMedico].quantidade++;
      porMedico[nomeMedico].valor += (os.valor_final || 0);
      porMedico[nomeMedico].repasse += (os.valor_repasse_medico || 0);
    });
    
    return {
      totalVendido,
      totalRepasse,
      totalClinica,
      totalAtendimentos,
      porFormaPagamento,
      porCategoria,
      porMedico
    };
  }, [dadosFiltrados, categorias, medicos]);

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
          
          <h3>Detalhamento (${dadosFiltrados.length} registros)</h3>
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
                  <td class="text-right">R$ ${(os.valor_clinica || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
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
              <p className="text-gray-600">Controle detalhado de vendas, repasses e receitas</p>
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
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm">Total Vendido</p>
                    <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalVendido)}</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-blue-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm">Receita Clínica</p>
                    <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalClinica)}</p>
                  </div>
                  <Building2 className="w-10 h-10 text-green-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm">Repasse Médicos</p>
                    <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalRepasse)}</p>
                  </div>
                  <Users className="w-10 h-10 text-purple-200" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm">Atendimentos</p>
                    <p className="text-2xl font-bold">{estatisticas.totalAtendimentos}</p>
                  </div>
                  <Calendar className="w-10 h-10 text-orange-200" />
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
                  <CardTitle>Detalhamento - {dadosFiltrados.length} registros</CardTitle>
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
                              <TableCell className="text-right text-green-600">{formatCurrency(os.valor_clinica)}</TableCell>
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
                  <CardTitle>Resumo por Profissional</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profissional</TableHead>
                        <TableHead className="text-center">Atendimentos</TableHead>
                        <TableHead className="text-right">Faturado</TableHead>
                        <TableHead className="text-right">Repasse</TableHead>
                        <TableHead className="text-right">% do Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(estatisticas.porMedico)
                        .sort((a, b) => b[1].valor - a[1].valor)
                        .map(([nome, dados]) => (
                          <TableRow key={nome}>
                            <TableCell className="font-medium">{nome}</TableCell>
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
                {Object.entries(estatisticas.porMedico)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([nomeMedico, dadosMedico]) => {
                    // Filtrar OS deste médico
                    const osMedico = dadosFiltrados.filter(os => {
                      return obterNomeMedico(os) === nomeMedico;
                    });
                    
                    // Agrupar por categoria
                    const porCategoriaLocal = {};
                    osMedico.forEach(os => {
                      const nomeCat = obterNomeCategoria(os);
                      if (!porCategoriaLocal[nomeCat]) {
                        porCategoriaLocal[nomeCat] = { quantidade: 0, valor: 0 };
                      }
                      porCategoriaLocal[nomeCat].quantidade++;
                      porCategoriaLocal[nomeCat].valor += (os.valor_final || 0);
                    });
                    
                    // Agrupar por forma de pagamento
                    const porPagamentoLocal = {};
                    osMedico.forEach(os => {
                      const forma = os.forma_pagamento || 'Não informado';
                      if (!porPagamentoLocal[forma]) {
                        porPagamentoLocal[forma] = { quantidade: 0, valor: 0 };
                      }
                      porPagamentoLocal[forma].quantidade++;
                      porPagamentoLocal[forma].valor += (os.valor_final || 0);
                    });
                    
                    return (
                      <Card key={nomeMedico}>
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
          </Tabs>
        </div>
      </div>
    </ProtectedRoute>
  );
}