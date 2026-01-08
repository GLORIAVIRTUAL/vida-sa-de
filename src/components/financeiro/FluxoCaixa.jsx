import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Printer, Calendar } from "lucide-react";
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

import FormularioLancamento from "./FormularioLancamento";

const tipoColors = {
  "Entrada": "bg-green-100 text-green-800 border-green-200",
  "Saída": "bg-red-100 text-red-800 border-red-200"
};

export default function FluxoCaixa({ lancamentos, ordensServico, pacientes, onUpdate }) {
  const [mostrarForm, setMostrarForm] = useState(false);

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

  const abrirForm = (tipo) => {
    setTipoLancamento(tipo);
    setMostrarForm(true);
  };

  // Filtrar lançamentos pelo período e forma de pagamento
  const lancamentosFiltrados = useMemo(() => {
    return lancamentos.filter(l => {
      if (!l.data_lancamento) return false;
      const dentroData = l.data_lancamento >= dataInicio && l.data_lancamento <= dataFim;
      const formaMatch = formaPagamentoFiltro === "todas" || l.forma_pagamento === formaPagamentoFiltro;
      return dentroData && formaMatch;
    });
  }, [lancamentos, dataInicio, dataFim, formaPagamentoFiltro]);

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
        <h1>🏥 Centro Vida Saúde</h1>
        <h2>Fluxo de Caixa: ${dataInicioFormatada} a ${dataFimFormatada}</h2>
        
        <div class="summary">
          <div class="summary-card entradas">
            <p>Total Entradas</p>
            <p class="valor">R$ ${totalEntradas.toFixed(2)}</p>
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
          <p><strong>Centro Vida Saúde</strong> - Sistema de Gestão Clínica</p>
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
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Total Entradas</p>
                <p className="text-2xl font-bold text-green-700">
                  R$ {totalEntradas.toFixed(2)}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Total Saídas</p>
                <p className="text-2xl font-bold text-red-700">
                  R$ {totalSaidas.toFixed(2)}
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
                  R$ {saldo.toFixed(2)}
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
                        {lancamento.tipo === "Entrada" ? '+' : '-'}R$ {lancamento.valor.toFixed(2)}
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
          tipoInicial={tipoLancamento}
          onSalvar={async (dados) => {
            try {
              await Lancamento.create(dados);
              setMostrarForm(false);
              onUpdate();
            } catch (error) {
              console.error("Erro ao salvar lançamento:", error);
            }
          }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}
    </div>
  );
}