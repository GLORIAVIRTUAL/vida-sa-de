import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Printer, Calendar, Lock, Eye, Trash2, DollarSign } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lancamento } from "@/entities/all";
import { excluirLancamentosDeOSCanceladas, obterJurosOS, obterValorLancamentoSemJuros } from "./financeiroUtils";

import FormularioLancamento from "./FormularioLancamento";
import SenhaRetroativaDialog, { isDiaFechado, podeAlterarDiaFechado } from "./SenhaRetroativaDialog";

const tipoColors = {
  "Entrada": "bg-green-100 text-green-800 border-green-200",
  "Saída": "bg-red-100 text-red-800 border-red-200"
};

export default function FluxoCaixa({ lancamentos, ordensServico, pacientes, onUpdate }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [valoresDesbloqueados, setValoresDesbloqueados] = useState(false);
  const [mostrarDialogSenha, setMostrarDialogSenha] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  const [lancamentoParaExcluir, setLancamentoParaExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  
  // Estado do usuário atual
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  
  // Estado para controle de autorização retroativa
  const [mostrarSenhaRetroativa, setMostrarSenhaRetroativa] = useState(false);
  const [acaoRetroativa, setAcaoRetroativa] = useState(null); // 'criar' | 'excluir'
  const [lancamentoExcluirPendente, setLancamentoExcluirPendente] = useState(null);
  const [tipoLancamentoRetroativo, setTipoLancamentoRetroativo] = useState(null);
  const [autorizado, setAutorizado] = useState(false); // Se já autorizou na sessão atual
  
  useEffect(() => {
    base44.auth.me().then(u => setCurrentUserEmail(u?.email || '')).catch(() => {});
  }, []);
  
  // Senha para desbloquear valores (pode ser alterada aqui)
  const SENHA_VALORES = '1234';

  // Função auxiliar para enriquecer a descrição e limpar dados corrompidos
  const getDescricaoCompleta = (lancamento) => {
    let desc = lancamento.descricao || "";
    
    // Limpeza inicial de strings corrompidas (Legacy Fix)
    desc = desc.replace("N/A (undefined)", "N/A");
    desc = desc.replace("(undefined)", "");

    // Se tem ID de OS e as listas foram passadas
    if (lancamento.ordem_servico_id && ordensServico && pacientes) {
      const os = ordensServico.find(o => o.id === lancamento.ordem_servico_id);
      
      if (os) {
        const partesExtras = [];
        
        // Tentar achar o nome do paciente (na lista ou na própria OS)
        const paciente = pacientes.find(p => p.id === os.paciente_id);
        const nomePaciente = paciente ? paciente.nome : os.paciente_nome;
        
        if (nomePaciente) {
            // Se a descrição tem "N/A", substitui pelo nome correto
            if (desc.includes("N/A")) {
                desc = desc.replace("N/A", nomePaciente);
            } 
            // Se não tem o nome, adiciona no final
            else if (!desc.toLowerCase().includes(nomePaciente.toLowerCase())) {
               partesExtras.push(`Paciente: ${nomePaciente}`);
            }
        }
        
        if (partesExtras.length > 0) {
          desc += ` (${partesExtras.join(' - ')})`;
        }
      }
    }
    return desc;
  };

  const [tipoLancamento, setTipoLancamento] = useState("Entrada");
  
  // Filtros de data - padrão: mês atual
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [formaPagamentoFiltro, setFormaPagamentoFiltro] = useState("todas");
  const [tipoFiltro, setTipoFiltro] = useState("todos");

  const abrirForm = (tipo) => {
    setTipoLancamentoRetroativo(tipo);
    setMostrarForm(true);
  };

  const verificarSenha = () => {
    if (senhaDigitada === SENHA_VALORES) {
      setValoresDesbloqueados(true);
      setMostrarDialogSenha(false);
      setSenhaDigitada('');
      setErroSenha('');
    } else {
      setErroSenha('Senha incorreta. Tente novamente.');
      setSenhaDigitada('');
    }
  };

  // Tenta excluir, mas verifica se o dia está fechado
  const tentarExcluir = (lancamento) => {
    if (isDiaFechado(lancamento.data_lancamento)) {
      // Dia fechado - verificar se é o email autorizado
      if (!podeAlterarDiaFechado(currentUserEmail)) {
        // Usuário não autorizado - bloquear
        alert('⛔ Apenas o responsável financeiro (cristianogoldani@yahoo.com.br) pode excluir lançamentos de dias anteriores.');
        return;
      }
      // É o email autorizado, pedir senha
      if (!autorizado) {
        setLancamentoExcluirPendente(lancamento);
        setAcaoRetroativa('excluir');
        setMostrarSenhaRetroativa(true);
        return;
      }
    }
    // Dia atual ou já autorizado - abrir confirmação normal
    setLancamentoParaExcluir(lancamento);
  };

  const handleExcluirLancamento = async () => {
    if (!lancamentoParaExcluir) return;
    setExcluindo(true);
    try {
      await Lancamento.delete(lancamentoParaExcluir.id);
      setLancamentoParaExcluir(null);
      onUpdate();
    } catch (error) {
      console.error("Erro ao excluir lançamento:", error);
    } finally {
      setExcluindo(false);
    }
  };

  const formatarValor = (valor) => {
    if (!valoresDesbloqueados) {
      return '******';
    }
    return `R$ ${valor.toFixed(2)}`;
  };

  // Filtrar lançamentos pelo período e forma de pagamento
  // Data de criação do app (após duplicação) - ignora lançamentos importados
  const dataInicioApp = new Date('2026-01-20T13:40:00');
  
  const lancamentosFiltrados = useMemo(() => {
    const filtrados = lancamentos.filter(l => {
      if (!l.data_lancamento) return false;
      // Ignora lançamentos criados antes da duplicação do app
      if (l.created_date && new Date(l.created_date) < dataInicioApp) return false;
      const dentroData = l.data_lancamento >= dataInicio && l.data_lancamento <= dataFim;
      const formaMatch = formaPagamentoFiltro === "todas" || l.forma_pagamento === formaPagamentoFiltro;
      const tipoMatch = tipoFiltro === "todos" || l.tipo === tipoFiltro;
      return dentroData && formaMatch && tipoMatch;
    });
    // Excluir lançamentos cancelados e vinculados a OS canceladas; entradas de OS ficam sem juros.
    return excluirLancamentosDeOSCanceladas(filtrados, ordensServico)
      .map(lancamento => ({
        ...lancamento,
        valor: obterValorLancamentoSemJuros(lancamento, ordensServico)
      }));
  }, [lancamentos, ordensServico, dataInicio, dataFim, formaPagamentoFiltro, tipoFiltro]);

  const totalJurosInformativo = useMemo(() => {
    const osIds = new Set(lancamentosFiltrados
      .filter(lancamento => lancamento.tipo === 'Entrada' && lancamento.ordem_servico_id)
      .map(lancamento => lancamento.ordem_servico_id));
    return ordensServico
      .filter(os => osIds.has(os.id))
      .reduce((total, os) => total + obterJurosOS(os), 0);
  }, [lancamentosFiltrados, ordensServico]);

  const { totalEntradas, totalSaidas, saldo } = useMemo(() => {
    const entradas = lancamentosFiltrados.filter(l => l.tipo === "Entrada").reduce((sum, l) => sum + l.valor, 0);
    const saidas = lancamentosFiltrados.filter(l => l.tipo === "Saída").reduce((sum, l) => sum + l.valor, 0);
    return {
      totalEntradas: entradas,
      totalSaidas: saidas,
      saldo: entradas - saidas
    };
  }, [lancamentosFiltrados]);

  const handleImprimir = () => {
    const dataInicioFormatada = format(new Date(dataInicio + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR });
    const dataFimFormatada = format(new Date(dataFim + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR });

    // Calcular totais por forma de pagamento
    const totaisPorFormaPagamento = lancamentosFiltrados.reduce((acc, l) => {
      const forma = l.forma_pagamento || 'Não especificado';
      if (!acc[forma]) {
        acc[forma] = { entradas: 0, saidas: 0, total: 0 };
      }
      if (l.tipo === 'Entrada') {
        acc[forma].entradas += l.valor;
        acc[forma].total += l.valor;
      } else {
        acc[forma].saidas += l.valor;
        acc[forma].total -= l.valor;
      }
      return acc;
    }, {});

    const conteudo = `
      <html>
      <head>
        <title>Fluxo de Caixa - ${dataInicioFormatada} a ${dataFimFormatada}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 900px; margin: 0 auto; }
          h1 { text-align: center; color: #1e40af; margin-bottom: 5px; }
          h2 { text-align: center; color: #64748b; font-size: 16px; font-weight: normal; margin-bottom: 30px; }
          .summary { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .summary-card { flex: 1; margin: 0 10px; padding: 15px; border-radius: 8px; text-align: center; }
          .entradas { background: #dcfce7; color: #166534; }
          .saidas { background: #fee2e2; color: #991b1b; }
          .saldo { background: ${saldo >= 0 ? '#d1fae5' : '#fee2e2'}; color: ${saldo >= 0 ? '#065f46' : '#991b1b'}; }
          .summary-card p { margin: 5px 0; }
          .summary-card .valor { font-size: 24px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px 8px; text-align: left; font-size: 12px; }
          th { background-color: #3b82f6; color: white; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .entrada { color: #166534; }
          .saida { color: #991b1b; }
          .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 11px; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <h1>🏥 GLÓRIA CLINICA</h1>
        <h2>Fluxo de Caixa: ${dataInicioFormatada} a ${dataFimFormatada}</h2>
        
        <div class="summary">
          <div class="summary-card entradas">
            <p>Total Entradas</p>
            <p class="valor">R$ ${totalEntradas.toFixed(2)}</p>
          </div>
          <div class="summary-card" style="background:#f3e8ff;color:#6b21a8;">
            <p>Juros/Taxas (informativo)</p>
            <p class="valor">R$ ${totalJurosInformativo.toFixed(2)}</p>
          </div>
          <div class="summary-card saidas">
            <p>Total Saídas</p>
            <p class="valor">R$ ${totalSaidas.toFixed(2)}</p>
          </div>
          <div class="summary-card saldo">
            <p>Saldo</p>
            <p class="valor">R$ ${saldo.toFixed(2)}</p>
          </div>
        </div>

        <div style="margin: 30px 0; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <h3 style="margin: 0 0 15px 0; color: #1e40af; font-size: 18px;">💰 Totais por Forma de Pagamento</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 10px; background: #3b82f6; color: white; border: 1px solid #ddd;">Forma de Pagamento</th>
                <th style="text-align: right; padding: 10px; background: #3b82f6; color: white; border: 1px solid #ddd;">Entradas</th>
                <th style="text-align: right; padding: 10px; background: #3b82f6; color: white; border: 1px solid #ddd;">Saídas</th>
                <th style="text-align: right; padding: 10px; background: #3b82f6; color: white; border: 1px solid #ddd;">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(totaisPorFormaPagamento).map(([forma, valores], idx) => `
                <tr style="${idx % 2 === 0 ? 'background: white;' : 'background: #f8fafc;'}">
                  <td style="padding: 10px; border: 1px solid #ddd; font-weight: 600;">${forma}</td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: #166534;">R$ ${valores.entradas.toFixed(2)}</td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: #991b1b;">R$ ${valores.saidas.toFixed(2)}</td>
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: ${valores.total >= 0 ? '#166534' : '#991b1b'};">R$ ${valores.total.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Tipo</th>
              <th>Forma Pagamento</th>
              <th style="text-align: right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${lancamentosFiltrados.length === 0 ? `
              <tr><td colspan="6" style="text-align: center; padding: 40px;">Nenhuma movimentação no período.</td></tr>
            ` : lancamentosFiltrados.map(l => `
              <tr>
                <td>${format(new Date(l.data_lancamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}</td>
                <td>${getDescricaoCompleta(l)}</td>
                <td>${l.categoria}</td>
                <td class="${l.tipo === 'Entrada' ? 'entrada' : 'saida'}">${l.tipo}</td>
                <td>${l.forma_pagamento || '-'}</td>
                <td style="text-align: right;" class="${l.tipo === 'Entrada' ? 'entrada' : 'saida'}">
                  ${l.tipo === 'Entrada' ? '+' : '-'}R$ ${l.valor.toFixed(2)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Impresso em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
          <p><strong>GLÓRIA CLINICA</strong> - Sistema de Gestão Clínica</p>
        </div>
      </body>
      </html>
    `;

    const janela = window.open('', '_blank');
    if (janela) {
      janela.document.write(conteudo);
      janela.document.close();
      janela.focus();
      setTimeout(() => janela.print(), 250);
    }
  };


  return (
    <div className="space-y-6">
      {/* Botão para desbloquear valores */}
      {!valoresDesbloqueados && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-900">Valores Protegidos</p>
                  <p className="text-sm text-amber-700">Os valores financeiros estão ocultos por segurança</p>
                </div>
              </div>
              <Button 
                onClick={() => setMostrarDialogSenha(true)}
                className="bg-amber-600 hover:bg-amber-700"
              >
                <Eye className="w-4 h-4 mr-2" />
                Desbloquear Valores
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros de Período e Forma de Pagamento */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <span className="font-medium text-gray-700">Filtros:</span>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="dataInicio" className="text-sm text-gray-600">De:</Label>
              <Input
                id="dataInicio"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="dataFim" className="text-sm text-gray-600">Até:</Label>
              <Input
                id="dataFim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="tipoFiltro" className="text-sm text-gray-600">Tipo:</Label>
              <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                <SelectTrigger id="tipoFiltro" className="w-44">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Entrada">Apenas Entradas</SelectItem>
                  <SelectItem value="Saída">Apenas Despesas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="formaPagamento" className="text-sm text-gray-600">Forma:</Label>
              <Select value={formaPagamentoFiltro} onValueChange={setFormaPagamentoFiltro}>
                <SelectTrigger id="formaPagamento" className="w-48">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as formas</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                  <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                  <SelectItem value="Múltiplas Formas">Múltiplas Formas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={handleImprimir}
              className="gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumo do Caixa */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Total Entradas</p>
                <p className="text-2xl font-bold text-green-700">
                  {formatarValor(totalEntradas)}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-violet-50 border-violet-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-violet-600">Juros/Taxas (informativo)</p>
                <p className="text-2xl font-bold text-violet-700">
                  {formatarValor(totalJurosInformativo)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-violet-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Total Saídas</p>
                <p className="text-2xl font-bold text-red-700">
                  {formatarValor(totalSaidas)}
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className={`${saldo >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Saldo Total
                </p>
                <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatarValor(saldo)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Lançamentos */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <CardTitle>Movimentações Financeiras</CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => abrirForm("Saída")}
                variant="outline"
                className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                <TrendingDown className="w-4 h-4 mr-2" />
                Nova Despesa
              </Button>
              <Button
                onClick={() => abrirForm("Entrada")}
                className="bg-green-600 hover:bg-green-700"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Nova Receita
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {lancamentosFiltrados.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
                <p>Nenhuma movimentação financeira no período selecionado.</p>
                <p className="text-sm mt-2">Altere as datas ou adicione uma nova receita ou despesa.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Forma Pagamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {lancamentosFiltrados.map((lancamento) => (
                    <TableRow key={lancamento.id}>
                      <TableCell>
                        {/* CORRIGIDO: Adicionado 'T00:00:00' para forçar o fuso horário local */}
                        {format(new Date(lancamento.data_lancamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{getDescricaoCompleta(lancamento)}</TableCell>
                      <TableCell>{lancamento.categoria}</TableCell>
                      <TableCell>
                        <Badge className={`${tipoColors[lancamento.tipo]} border`}>
                          {lancamento.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {lancamento.forma_pagamento || '-'}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${
                        lancamento.tipo === "Entrada" ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {valoresDesbloqueados ? (
                          <>{lancamento.tipo === "Entrada" ? '+' : '-'}R$ {lancamento.valor.toFixed(2)}</>
                        ) : (
                          '******'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => tentarExcluir(lancamento)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {mostrarForm && (
        <FormularioLancamento
          tipoInicial={tipoLancamentoRetroativo || tipoLancamento}
          onSalvar={async (dados) => {
            // Verificar se está tentando lançar em dia fechado
            if (isDiaFechado(dados.data_lancamento)) {
              if (!podeAlterarDiaFechado(currentUserEmail)) {
                alert('⛔ Apenas o responsável financeiro (cristianogoldani@yahoo.com.br) pode lançar em dias anteriores.');
                return;
              }
              if (!autorizado) {
                setAcaoRetroativa('criar');
                setMostrarSenhaRetroativa(true);
                return;
              }
            }
            try {
              await Lancamento.create(dados);
              setMostrarForm(false);
              setTipoLancamentoRetroativo(null);
              onUpdate();
            } catch (error) {
              console.error("Erro ao salvar lançamento:", error);
            }
          }}
          onCancelar={() => { setMostrarForm(false); setTipoLancamentoRetroativo(null); }}
        />
      )}

      {/* Dialog de senha retroativa */}
      <SenhaRetroativaDialog
        open={mostrarSenhaRetroativa}
        onClose={() => {
          setMostrarSenhaRetroativa(false);
          setAcaoRetroativa(null);
          setLancamentoExcluirPendente(null);
        }}
        acao={acaoRetroativa}
        onAutorizado={() => {
          setAutorizado(true);
          setMostrarSenhaRetroativa(false);
          if (acaoRetroativa === 'excluir' && lancamentoExcluirPendente) {
            setLancamentoParaExcluir(lancamentoExcluirPendente);
            setLancamentoExcluirPendente(null);
          }
          setAcaoRetroativa(null);
        }}
      />

      {/* Dialog para confirmar exclusão */}
      <Dialog open={!!lancamentoParaExcluir} onOpenChange={() => setLancamentoParaExcluir(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Excluir Lançamento
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          
          {lancamentoParaExcluir && (
            <div className="py-4 space-y-2 bg-gray-50 rounded-lg p-4">
              <p><strong>Descrição:</strong> {getDescricaoCompleta(lancamentoParaExcluir)}</p>
              <p><strong>Valor:</strong> R$ {lancamentoParaExcluir.valor?.toFixed(2)}</p>
              <p><strong>Tipo:</strong> {lancamentoParaExcluir.tipo}</p>
              <p><strong>Data:</strong> {format(new Date(lancamentoParaExcluir.data_lancamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLancamentoParaExcluir(null)}
              disabled={excluindo}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleExcluirLancamento}
              disabled={excluindo}
            >
              {excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para senha */}
      <Dialog open={mostrarDialogSenha} onOpenChange={setMostrarDialogSenha}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />
              Desbloquear Valores Financeiros
            </DialogTitle>
            <DialogDescription>
              Digite a senha para visualizar os valores financeiros do sistema.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                placeholder="Digite a senha"
                value={senhaDigitada}
                onChange={(e) => {
                  setSenhaDigitada(e.target.value);
                  setErroSenha('');
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    verificarSenha();
                  }
                }}
                autoFocus
              />
              {erroSenha && (
                <p className="text-sm text-red-600 mt-2">{erroSenha}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMostrarDialogSenha(false);
                setSenhaDigitada('');
                setErroSenha('');
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={verificarSenha}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Eye className="w-4 h-4 mr-2" />
              Desbloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}