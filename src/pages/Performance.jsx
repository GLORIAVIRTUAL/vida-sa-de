import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Loader2, Printer, Filter, TrendingUp, DollarSign, 
  Users, Calendar, RefreshCw, Award, Bot, FileDown
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import { OrdemServico, Agendamento, User } from '@/entities/all';

const CORES_GRAFICO = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function Performance() {
  const [loading, setLoading] = useState(true);
  const [ordensServico, setOrdensServico] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  
  // Filtros - iniciar com mês atual
  const hoje = new Date();
  const [filtros, setFiltros] = useState({
    mes: format(hoje, 'yyyy-MM'),
    usuarioId: 'todos'
  });

  // Data mínima para exibir dados
  const DATA_MINIMA = '2026-01-21';
  
  // Usuários a serem ocultados do relatório
  const USUARIOS_OCULTOS = ['Sistema (API)', 'Thiago'];

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [osData, agendamentosData, usuariosData] = await Promise.all([
        OrdemServico.list('-data_execucao', 5000),
        Agendamento.list('-created_date', 5000),
        User.list()
      ]);
      
      setOrdensServico(osData || []);
      setAgendamentos(agendamentosData || []);
      setUsuarios(usuariosData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Obter lista de meses disponíveis
  const mesesDisponiveis = useMemo(() => {
    const meses = new Set();
    ordensServico.forEach(os => {
      if (os.data_execucao) {
        meses.add(os.data_execucao.substring(0, 7));
      }
    });
    agendamentos.forEach(ag => {
      if (ag.data_agendamento) {
        meses.add(ag.data_agendamento.substring(0, 7));
      }
    });
    return Array.from(meses).sort().reverse();
  }, [ordensServico, agendamentos]);

  // Dados filtrados por mês
  const dadosFiltrados = useMemo(() => {
    const mesInicio = filtros.mes + '-01';
    const mesAno = filtros.mes.split('-');
    const ultimoDia = new Date(parseInt(mesAno[0]), parseInt(mesAno[1]), 0).getDate();
    const mesFim = filtros.mes + '-' + ultimoDia;

    // Filtrar OS do mês (e a partir da data mínima)
    const osFiltradas = ordensServico.filter(os => {
      if (!os.data_execucao) return false;
      if (os.data_execucao < DATA_MINIMA) return false;
      return os.data_execucao >= mesInicio && os.data_execucao <= mesFim;
    });

    // Filtrar Agendamentos do mês (e a partir da data mínima)
    const agFiltrados = agendamentos.filter(ag => {
      if (!ag.data_agendamento) return false;
      if (ag.data_agendamento < DATA_MINIMA) return false;
      return ag.data_agendamento >= mesInicio && ag.data_agendamento <= mesFim;
    });

    return { osFiltradas, agFiltrados };
  }, [ordensServico, agendamentos, filtros.mes]);

  // Função auxiliar para normalizar nome do usuário
  const normalizarUsuario = (identificador) => {
    if (!identificador) return { nome: 'Não identificado', tipoOrigem: 'usuario' };
    
    // Se foi agendado pelo chatbot (Glória)
    if (identificador === 'Glória' || identificador === 'Gloria') {
      return { nome: 'Glória (IA)', tipoOrigem: 'chatbot' };
    }
    
    // Usuário de serviço do sistema (API/webhook)
    if (identificador.includes('service+') && identificador.includes('@no-reply.base44.com')) {
      return { nome: 'Sistema (API)', tipoOrigem: 'sistema' };
    }
    
    // Tentar encontrar o nome do usuário pelo email
    const usuario = usuarios.find(u => u.email === identificador || u.id === identificador);
    if (usuario) {
      return { nome: usuario.display_name || usuario.full_name || usuario.email, tipoOrigem: 'usuario' };
    }
    
    return { nome: identificador, tipoOrigem: 'usuario' };
  };

  // Calcular estatísticas por usuário
  const estatisticasPorUsuario = useMemo(() => {
    const { osFiltradas, agFiltrados } = dadosFiltrados;
    const porUsuario = {};

    // Processar agendamentos para contar quem agendou
    agFiltrados.forEach(ag => {
      // Identificar quem agendou
      let agendadoPor = ag.agendado_por || ag.created_by || 'Não identificado';
      let tipoOrigem = ag.agendado_por_tipo || 'usuario';
      
      // Se foi agendado pelo chatbot (Glória)
      if (tipoOrigem === 'chatbot' || agendadoPor === 'Glória' || agendadoPor === 'Gloria') {
        agendadoPor = 'Glória (IA)';
        tipoOrigem = 'chatbot';
      } else if (agendadoPor.includes('service+') && agendadoPor.includes('@no-reply.base44.com')) {
        // Usuário de serviço do sistema (API/webhook)
        agendadoPor = 'Sistema (API)';
        tipoOrigem = 'sistema';
      } else {
        // Tentar encontrar o nome do usuário pelo email
        const usuario = usuarios.find(u => u.email === agendadoPor || u.id === agendadoPor);
        if (usuario) {
          agendadoPor = usuario.display_name || usuario.full_name || usuario.email;
        }
      }

      if (!porUsuario[agendadoPor]) {
        porUsuario[agendadoPor] = {
          nome: agendadoPor,
          tipoOrigem,
          totalAgendamentos: 0,
          totalConsultas: 0,
          totalProcedimentos: 0,
          totalExames: 0,
          totalRetornos: 0,
          valorVendido: 0
        };
      }

      porUsuario[agendadoPor].totalAgendamentos++;

      // Contar por tipo de serviço
      const tipo = ag.tipo_servico;
      if (tipo === 'Consulta') porUsuario[agendadoPor].totalConsultas++;
      else if (tipo === 'Procedimento') porUsuario[agendadoPor].totalProcedimentos++;
      else if (tipo === 'Exame') porUsuario[agendadoPor].totalExames++;
      else if (tipo === 'Retorno') porUsuario[agendadoPor].totalRetornos++;
    });

    // Associar valor das OS por quem GEROU a OS (campo gerado_por)
    osFiltradas.forEach(os => {
      const geradoPor = os.gerado_por || os.created_by || 'Não identificado';
      const { nome, tipoOrigem } = normalizarUsuario(geradoPor);
      
      if (!porUsuario[nome]) {
        porUsuario[nome] = {
          nome,
          tipoOrigem,
          totalAgendamentos: 0,
          totalConsultas: 0,
          totalProcedimentos: 0,
          totalExames: 0,
          totalRetornos: 0,
          valorVendido: 0
        };
      }
      
      porUsuario[nome].valorVendido += (os.valor_final || 0);
    });

    // Converter para array, filtrar usuários ocultos e ordenar por valor vendido (prioridade) e depois por agendamentos
    return Object.values(porUsuario)
      .filter(u => !USUARIOS_OCULTOS.includes(u.nome))
      .sort((a, b) => {
        // Primeiro critério: valor vendido (maior primeiro)
        if (b.valorVendido !== a.valorVendido) {
          return b.valorVendido - a.valorVendido;
        }
        // Segundo critério: total de agendamentos (maior primeiro)
        return b.totalAgendamentos - a.totalAgendamentos;
      });
  }, [dadosFiltrados, usuarios]);

  // Estatísticas gerais
  const estatisticasGerais = useMemo(() => {
    const totalAgendamentos = estatisticasPorUsuario.reduce((acc, u) => acc + u.totalAgendamentos, 0);
    const totalVendido = estatisticasPorUsuario.reduce((acc, u) => acc + u.valorVendido, 0);
    const agendamentosGloria = estatisticasPorUsuario.find(u => u.nome === 'Glória (IA)')?.totalAgendamentos || 0;
    const valorGloria = estatisticasPorUsuario.find(u => u.nome === 'Glória (IA)')?.valorVendido || 0;

    return {
      totalAgendamentos,
      totalVendido,
      agendamentosGloria,
      valorGloria,
      percentualGloria: totalAgendamentos > 0 ? ((agendamentosGloria / totalAgendamentos) * 100).toFixed(1) : 0
    };
  }, [estatisticasPorUsuario]);

  // Função para formatar nome do usuário para exibição nos gráficos
  const formatarNomeGrafico = (nome) => {
    if (!nome) return '';
    // Se for email, pegar apenas a parte antes do @
    if (nome.includes('@')) {
      return nome.split('@')[0];
    }
    // Se for nome composto, pegar os 2 primeiros nomes
    const partes = nome.split(' ');
    if (partes.length > 2) {
      return partes.slice(0, 2).join(' ');
    }
    return nome;
  };

  // Dados para gráfico de barras - ordenar por agendamentos
  const dadosGraficoAgendamentos = useMemo(() => {
    return estatisticasPorUsuario
      .filter(u => u.totalAgendamentos > 0)
      .sort((a, b) => b.totalAgendamentos - a.totalAgendamentos)
      .slice(0, 8)
      .map(u => ({
        name: formatarNomeGrafico(u.nome),
        nomeCompleto: u.nome,
        agendamentos: u.totalAgendamentos,
        consultas: u.totalConsultas,
        procedimentos: u.totalProcedimentos
      }));
  }, [estatisticasPorUsuario]);

  // Dados para gráfico de barras - valor vendido
  const dadosGraficoValor = useMemo(() => {
    return estatisticasPorUsuario
      .filter(u => u.valorVendido > 0)
      .sort((a, b) => b.valorVendido - a.valorVendido)
      .slice(0, 8)
      .map(u => ({
        name: formatarNomeGrafico(u.nome),
        nomeCompleto: u.nome,
        valor: u.valorVendido
      }));
  }, [estatisticasPorUsuario]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const mesFormatado = format(parseISO(filtros.mes + '-01'), 'MMMM yyyy', { locale: ptBR });
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Relatório de Performance - ${mesFormatado}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            h1 { color: #1e40af; font-size: 18px; margin-bottom: 5px; }
            h2 { font-size: 14px; margin-top: 0; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f3f4f6; font-size: 11px; }
            td { font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; }
            .stats { display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap; }
            .stat-card { border: 1px solid #ddd; padding: 10px; border-radius: 5px; min-width: 120px; }
            .stat-card strong { font-size: 10px; color: #666; }
            .stat-card .valor { font-size: 14px; font-weight: bold; color: #1e40af; }
            .total { font-weight: bold; background-color: #f0f9ff; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .gloria { background-color: #fef3c7; }
            @media print { body { margin: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>GLÓRIA CLÍNICA</h1>
            <h2>Relatório de Performance de Vendas</h2>
            <p>Período: ${mesFormatado.charAt(0).toUpperCase() + mesFormatado.slice(1)}</p>
            <p style="font-size: 10px; color: #666;">Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>
          
          <div class="stats">
            <div class="stat-card">
              <strong>Total Agendamentos</strong><br/>
              <span class="valor">${estatisticasGerais.totalAgendamentos}</span>
            </div>
            <div class="stat-card">
              <strong>Valor Total Vendido</strong><br/>
              <span class="valor">R$ ${estatisticasGerais.totalVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="stat-card" style="background: #fef3c7;">
              <strong>Agendamentos Glória (IA)</strong><br/>
              <span class="valor">${estatisticasGerais.agendamentosGloria} (${estatisticasGerais.percentualGloria}%)</span>
            </div>
            <div class="stat-card" style="background: #fef3c7;">
              <strong>Valor Vendido Glória (IA)</strong><br/>
              <span class="valor">R$ ${estatisticasGerais.valorGloria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          
          <h3>Performance por Usuário</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Usuário</th>
                <th class="text-center">Agendamentos</th>
                <th class="text-center">Consultas</th>
                <th class="text-center">Procedimentos</th>
                <th class="text-center">Exames</th>
                <th class="text-center">Retornos</th>
                <th class="text-right">Valor Vendido</th>
                <th class="text-right">% do Total</th>
              </tr>
            </thead>
            <tbody>
              ${estatisticasPorUsuario.map((u, idx) => `
                <tr class="${u.nome === 'Glória (IA)' ? 'gloria' : ''}">
                  <td class="text-center">${idx + 1}</td>
                  <td><strong>${u.nome}</strong> ${u.tipoOrigem === 'chatbot' ? '🤖' : ''}</td>
                  <td class="text-center">${u.totalAgendamentos}</td>
                  <td class="text-center">${u.totalConsultas}</td>
                  <td class="text-center">${u.totalProcedimentos}</td>
                  <td class="text-center">${u.totalExames}</td>
                  <td class="text-center">${u.totalRetornos}</td>
                  <td class="text-right">R$ ${u.valorVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right">${estatisticasGerais.totalVendido > 0 ? ((u.valorVendido / estatisticasGerais.totalVendido) * 100).toFixed(1) : 0}%</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="total">
                <td colspan="2"><strong>TOTAL</strong></td>
                <td class="text-center"><strong>${estatisticasGerais.totalAgendamentos}</strong></td>
                <td class="text-center"><strong>${estatisticasPorUsuario.reduce((acc, u) => acc + u.totalConsultas, 0)}</strong></td>
                <td class="text-center"><strong>${estatisticasPorUsuario.reduce((acc, u) => acc + u.totalProcedimentos, 0)}</strong></td>
                <td class="text-center"><strong>${estatisticasPorUsuario.reduce((acc, u) => acc + u.totalExames, 0)}</strong></td>
                <td class="text-center"><strong>${estatisticasPorUsuario.reduce((acc, u) => acc + u.totalRetornos, 0)}</strong></td>
                <td class="text-right"><strong>R$ ${estatisticasGerais.totalVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                <td class="text-right"><strong>100%</strong></td>
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

  // Função para gerar relatório individual do usuário
  const gerarRelatorioUsuario = (usuario) => {
    const { osFiltradas, agFiltrados } = dadosFiltrados;
    const mesFormatado = format(parseISO(filtros.mes + '-01'), 'MMMM yyyy', { locale: ptBR });
    
    // Filtrar agendamentos deste usuário
    const agendamentosUsuario = agFiltrados.filter(ag => {
      let agendadoPor = ag.agendado_por || ag.created_by || '';
      
      if (usuario.tipoOrigem === 'chatbot' && (ag.agendado_por_tipo === 'chatbot' || agendadoPor === 'Glória' || agendadoPor === 'Gloria')) {
        return true;
      }
      
      if (usuario.tipoOrigem === 'sistema' && agendadoPor.includes('service+')) {
        return true;
      }
      
      // Verificar por nome ou email
      const usuarioEncontrado = usuarios.find(u => u.email === agendadoPor || u.id === agendadoPor);
      const nomeNormalizado = usuarioEncontrado ? (usuarioEncontrado.display_name || usuarioEncontrado.full_name || usuarioEncontrado.email) : agendadoPor;
      
      return nomeNormalizado === usuario.nome;
    });
    
    // Filtrar OS deste usuário
    const osUsuario = osFiltradas.filter(os => {
      const geradoPor = os.gerado_por || os.created_by || '';
      const { nome } = normalizarUsuario(geradoPor);
      return nome === usuario.nome;
    });
    
    // Calcular totais por forma de pagamento
    const totalPorFormaPagamento = {};
    
    osUsuario.forEach(os => {
      const forma = os.forma_pagamento || 'Não informado';
      if (!totalPorFormaPagamento[forma]) {
        totalPorFormaPagamento[forma] = 0;
      }
      totalPorFormaPagamento[forma] += os.valor_final || 0;
    });
    
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Relatório - ${usuario.nome} - ${mesFormatado}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 11px; }
            h1 { color: #1e40af; font-size: 18px; margin-bottom: 5px; }
            h2 { font-size: 14px; margin-top: 20px; color: #333; border-bottom: 2px solid #1e40af; padding-bottom: 5px; }
            h3 { font-size: 12px; margin-top: 15px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f3f4f6; font-size: 10px; }
            td { font-size: 10px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #1e40af; padding-bottom: 15px; }
            .resumo { display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; }
            .resumo-card { border: 1px solid #ddd; padding: 10px; border-radius: 5px; min-width: 100px; background: #f9fafb; }
            .resumo-card strong { font-size: 9px; color: #666; display: block; margin-bottom: 3px; }
            .resumo-card .valor { font-size: 14px; font-weight: bold; color: #1e40af; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row { font-weight: bold; background-color: #e0f2fe; }
            .forma-pagamento { margin: 15px 0; }
            .forma-pagamento-item { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #eee; }
            .forma-pagamento-item:nth-child(odd) { background: #f9fafb; }
            .forma-valor { font-weight: bold; color: #059669; }
            @media print { 
              body { margin: 10px; } 
              .page-break { page-break-before: always; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>CENTRO VIDA SAÚDE</h1>
            <p style="font-size: 14px; margin: 5px 0;"><strong>Relatório Individual de Performance</strong></p>
            <p style="font-size: 12px; color: #1e40af;"><strong>${usuario.nome}</strong> ${usuario.tipoOrigem === 'chatbot' ? '🤖 (IA)' : ''}</p>
            <p style="font-size: 11px;">Período: ${mesFormatado.charAt(0).toUpperCase() + mesFormatado.slice(1)}</p>
            <p style="font-size: 10px; color: #666;">Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>
          
          <h2>📊 Resumo</h2>
          <div class="resumo">
            <div class="resumo-card">
              <strong>Total Agendamentos</strong>
              <span class="valor">${usuario.totalAgendamentos}</span>
            </div>
            <div class="resumo-card">
              <strong>Consultas</strong>
              <span class="valor">${usuario.totalConsultas}</span>
            </div>
            <div class="resumo-card">
              <strong>Procedimentos</strong>
              <span class="valor">${usuario.totalProcedimentos}</span>
            </div>
            <div class="resumo-card">
              <strong>Exames</strong>
              <span class="valor">${usuario.totalExames}</span>
            </div>
            <div class="resumo-card">
              <strong>Retornos</strong>
              <span class="valor">${usuario.totalRetornos}</span>
            </div>
            <div class="resumo-card" style="background: #dcfce7;">
              <strong>Valor Total Vendido</strong>
              <span class="valor" style="color: #059669;">${formatCurrency(usuario.valorVendido)}</span>
            </div>
          </div>
          
          <h2>💰 Vendas por Forma de Pagamento</h2>
          <div class="forma-pagamento">
            ${Object.entries(totalPorFormaPagamento)
              .filter(([_, valor]) => valor > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([forma, valor]) => `
                <div class="forma-pagamento-item">
                  <span>${forma}</span>
                  <span class="forma-valor">${formatCurrency(valor)}</span>
                </div>
              `).join('') || '<p style="color: #999; text-align: center;">Nenhuma venda registrada</p>'}
            ${osUsuario.length > 0 ? `
              <div class="forma-pagamento-item" style="background: #e0f2fe; font-weight: bold;">
                <span>TOTAL</span>
                <span class="forma-valor">${formatCurrency(usuario.valorVendido)}</span>
              </div>
            ` : ''}
          </div>
          
          <h2>📅 Agendamentos Realizados (${agendamentosUsuario.length})</h2>
          ${agendamentosUsuario.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Paciente</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th class="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${agendamentosUsuario
                  .sort((a, b) => a.data_agendamento.localeCompare(b.data_agendamento) || (a.horario || '').localeCompare(b.horario || ''))
                  .map(ag => `
                    <tr>
                      <td>${ag.data_agendamento ? format(parseISO(ag.data_agendamento), 'dd/MM/yyyy') : '-'}</td>
                      <td>${ag.horario || '-'}</td>
                      <td>${ag.paciente_nome || 'Não informado'}</td>
                      <td>${ag.tipo_servico || '-'}</td>
                      <td>${ag.status || '-'}</td>
                      <td class="text-right">${formatCurrency(ag.valor_final || ag.valor_total || 0)}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          ` : '<p style="color: #999; text-align: center;">Nenhum agendamento no período</p>'}
          
          <h2>🧾 Ordens de Serviço / Vendas (${osUsuario.length})</h2>
          ${osUsuario.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Nº OS</th>
                  <th>Paciente</th>
                  <th>Tipo</th>
                  <th>Forma Pagamento</th>
                  <th>Status</th>
                  <th class="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${osUsuario
                  .sort((a, b) => (a.data_execucao || '').localeCompare(b.data_execucao || ''))
                  .map(os => `
                    <tr>
                      <td>${os.data_execucao ? format(parseISO(os.data_execucao), 'dd/MM/yyyy') : '-'}</td>
                      <td>${os.numero_os || os.id?.substring(0, 8) || '-'}</td>
                      <td>${os.paciente_nome || 'Não informado'}</td>
                      <td>${os.tipo_servico || '-'}</td>
                      <td>${os.forma_pagamento || 'Não informado'}</td>
                      <td>${os.status_pagamento || '-'}</td>
                      <td class="text-right">${formatCurrency(os.valor_final || 0)}</td>
                    </tr>
                  `).join('')}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="6"><strong>TOTAL</strong></td>
                  <td class="text-right"><strong>${formatCurrency(usuario.valorVendido)}</strong></td>
                </tr>
              </tfoot>
            </table>
          ` : '<p style="color: #999; text-align: center;">Nenhuma OS no período</p>'}
          
          <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
            Relatório gerado automaticamente pelo Sistema Centro Vida Saúde
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] flex-col gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-lg text-gray-600">Carregando dados de performance...</p>
      </div>
    );
  }

  return (
    <ProtectedRoute requiredRole="admin" fallbackMessage="Apenas administradores podem acessar relatórios de performance.">
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Award className="w-8 h-8 text-yellow-500" />
                Performance de Vendas
              </h1>
              <p className="text-gray-600">
                Acompanhe o desempenho de vendas por usuário e da Glória (IA)
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Mês de Referência</Label>
                  <Select value={filtros.mes} onValueChange={(v) => setFiltros({ ...filtros, mes: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o mês" />
                    </SelectTrigger>
                    <SelectContent>
                      {mesesDisponiveis.map(mes => (
                        <SelectItem key={mes} value={mes}>
                          {format(parseISO(mes + '-01'), 'MMMM yyyy', { locale: ptBR }).charAt(0).toUpperCase() + 
                           format(parseISO(mes + '-01'), 'MMMM yyyy', { locale: ptBR }).slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>



          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Gráfico de Barras - Agendamentos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Agendamentos por Usuário
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dadosGraficoAgendamentos.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={dadosGraficoAgendamentos} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        width={120} 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                      />
                      <Tooltip 
                        formatter={(value, name) => [value, name === 'agendamentos' ? 'Total' : name === 'consultas' ? 'Consultas' : 'Procedimentos']}
                        labelFormatter={(label) => {
                          const item = dadosGraficoAgendamentos.find(d => d.name === label);
                          return item?.nomeCompleto || label;
                        }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                      />
                      <Legend />
                      <Bar dataKey="agendamentos" name="Total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="consultas" name="Consultas" fill="#10b981" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="procedimentos" name="Procedimentos" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-gray-400">
                    Sem dados para exibir
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gráfico de Barras - Valor Vendido */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  Valor Vendido por Usuário
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dadosGraficoValor.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={dadosGraficoValor} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis 
                        type="number" 
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                      />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        width={120} 
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                      />
                      <Tooltip 
                        formatter={(value) => [formatCurrency(value), 'Valor Vendido']}
                        labelFormatter={(label) => {
                          const item = dadosGraficoValor.find(d => d.name === label);
                          return item?.nomeCompleto || label;
                        }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                      />
                      <Bar 
                        dataKey="valor" 
                        name="Valor Vendido" 
                        fill="#10b981" 
                        radius={[0, 4, 4, 0]}
                        label={{ 
                          position: 'right', 
                          formatter: (value) => formatCurrency(value),
                          fontSize: 11,
                          fill: '#374151'
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-gray-400">
                    Sem dados para exibir
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabela Detalhada */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-yellow-500" />
                Ranking de Performance - {format(parseISO(filtros.mes + '-01'), 'MMMM yyyy', { locale: ptBR }).charAt(0).toUpperCase() + format(parseISO(filtros.mes + '-01'), 'MMMM yyyy', { locale: ptBR }).slice(1)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead className="text-center">Agendamentos</TableHead>
                    <TableHead className="text-center">Consultas</TableHead>
                    <TableHead className="text-center">Procedimentos</TableHead>
                    <TableHead className="text-center">Exames</TableHead>
                    <TableHead className="text-center">Retornos</TableHead>
                    <TableHead className="text-right">Valor Vendido</TableHead>
                    <TableHead className="text-right">% do Total</TableHead>
                    <TableHead className="text-center w-20">Relatório</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estatisticasPorUsuario.map((usuario, idx) => (
                    <TableRow key={usuario.nome} className={usuario.nome === 'Glória (IA)' ? 'bg-amber-50' : ''}>
                      <TableCell className="text-center font-bold">
                        {idx === 0 && <span className="text-yellow-500">🥇</span>}
                        {idx === 1 && <span className="text-gray-400">🥈</span>}
                        {idx === 2 && <span className="text-amber-600">🥉</span>}
                        {idx > 2 && (idx + 1)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {usuario.tipoOrigem === 'chatbot' && <Bot className="w-4 h-4 text-amber-500" />}
                          {usuario.nome}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{usuario.totalAgendamentos}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{usuario.totalConsultas}</TableCell>
                      <TableCell className="text-center">{usuario.totalProcedimentos}</TableCell>
                      <TableCell className="text-center">{usuario.totalExames}</TableCell>
                      <TableCell className="text-center">{usuario.totalRetornos}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(usuario.valorVendido)}
                      </TableCell>
                      <TableCell className="text-right">
                        {estatisticasGerais.totalVendido > 0 
                          ? ((usuario.valorVendido / estatisticasGerais.totalVendido) * 100).toFixed(1) + '%'
                          : '0%'
                        }
                      </TableCell>
                      <TableCell className="text-center">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => gerarRelatorioUsuario(usuario)}
                          title={`Baixar relatório de ${usuario.nome}`}
                        >
                          <FileDown className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {estatisticasPorUsuario.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Nenhum agendamento encontrado no período selecionado.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}