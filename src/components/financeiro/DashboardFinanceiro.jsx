import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, FileText, Calculator, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { filtrarLancamentosPorPeriodo, somarLancamentos } from "./financeiroUtils";

export default function DashboardFinanceiro({ lancamentos = [], ordensServico = [], loading }) {
  const hoje = new Date();
  const inicioMesAtual = startOfMonth(hoje);
  const fimMesAtual = endOfMonth(hoje);
  const inicioMesAnterior = startOfMonth(subMonths(hoje, 1));
  const fimMesAnterior = endOfMonth(subMonths(hoje, 1));

  const calcularEstatisticas = () => {
    const lancamentosMesAtual = filtrarLancamentosPorPeriodo(lancamentos, {
      dataInicio: format(inicioMesAtual, 'yyyy-MM-dd'),
      dataFim: format(fimMesAtual, 'yyyy-MM-dd')
    });

    const lancamentosMesAnterior = filtrarLancamentosPorPeriodo(lancamentos, {
      dataInicio: format(inicioMesAnterior, 'yyyy-MM-dd'),
      dataFim: format(fimMesAnterior, 'yyyy-MM-dd')
    });

    const resumoMesAtual = somarLancamentos(lancamentosMesAtual);
    const resumoMesAnterior = somarLancamentos(lancamentosMesAnterior);

    const receitaMesAtual = parseFloat(resumoMesAtual.entradas.toFixed(2));
    const despesaMesAtual = parseFloat(resumoMesAtual.saidas.toFixed(2));

    // Calcular imposto das OS do mês atual e anterior
    const mesAtualStr = format(inicioMesAtual, 'yyyy-MM');
    const mesAnteriorStr = format(inicioMesAnterior, 'yyyy-MM');
    const impostoMesAtual = ordensServico
      .filter(os => os.data_execucao?.substring(0, 7) === mesAtualStr && os.status_pagamento !== 'Cancelado')
      .reduce((acc, os) => acc + (os.valor_imposto || 0), 0);
    const impostoMesAnterior = ordensServico
      .filter(os => os.data_execucao?.substring(0, 7) === mesAnteriorStr && os.status_pagamento !== 'Cancelado')
      .reduce((acc, os) => acc + (os.valor_imposto || 0), 0);

    const lucroMesAtual = parseFloat((resumoMesAtual.saldo - impostoMesAtual).toFixed(2));

    const receitaMesAnterior = parseFloat(resumoMesAnterior.entradas.toFixed(2));
    const despesaMesAnterior = parseFloat(resumoMesAnterior.saidas.toFixed(2));
    const lucroMesAnterior = parseFloat((resumoMesAnterior.saldo - impostoMesAnterior).toFixed(2));

    return {
      receitaMesAtual,
      despesaMesAtual,
      impostoMesAtual: parseFloat(impostoMesAtual.toFixed(2)),
      lucroMesAtual,
      totalOS: ordensServico.length,
      crescimentoReceita: receitaMesAnterior ? parseFloat(((receitaMesAtual - receitaMesAnterior) / receitaMesAnterior * 100).toFixed(1)) : 0,
      crescimentoLucro: lucroMesAnterior ? parseFloat(((lucroMesAtual - lucroMesAnterior) / Math.abs(lucroMesAnterior) * 100).toFixed(1)) : 0
    };
  };

  const stats = calcularEstatisticas();

  const cards = [
    {
      title: "Receita Mensal",
      value: `R$ ${stats.receitaMesAtual.toFixed(2)}`,
      icon: TrendingUp,
      bgColor: "bg-green-500",
      textColor: "text-green-600",
      trend: `${stats.crescimentoReceita > 0 ? '+' : ''}${stats.crescimentoReceita.toFixed(1)}%`
    },
    {
      title: "Despesas Mensais",
      value: `R$ ${stats.despesaMesAtual.toFixed(2)}`,
      icon: TrendingDown,
      bgColor: "bg-red-500",
      textColor: "text-red-600"
    },
    {
      title: "Impostos OS (10%)",
      value: `R$ ${stats.impostoMesAtual.toFixed(2)}`,
      icon: DollarSign,
      bgColor: "bg-amber-500",
      textColor: "text-amber-600"
    },
    {
      title: "Lucro Líquido",
      value: `R$ ${stats.lucroMesAtual.toFixed(2)}`,
      icon: Calculator,
      bgColor: stats.lucroMesAtual >= 0 ? "bg-emerald-500" : "bg-red-500",
      textColor: stats.lucroMesAtual >= 0 ? "text-emerald-600" : "text-red-600",
      trend: `${stats.crescimentoLucro > 0 ? '+' : ''}${stats.crescimentoLucro.toFixed(1)}%`
    },
    {
      title: "Ordens de Serviço",
      value: stats.totalOS,
      icon: FileText,
      bgColor: "bg-blue-500",
      textColor: "text-blue-600"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card, index) => (
          <Card key={index} className="relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-20 h-20 transform translate-x-6 -translate-y-6 ${card.bgColor} rounded-full opacity-10`} />
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{card.title}</p>
                  {loading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <CardTitle className="text-2xl font-bold">
                      {card.value}
                    </CardTitle>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${card.bgColor} bg-opacity-20`}>
                  <card.icon className={`w-4 h-4 ${card.textColor}`} />
                </div>
              </div>
              {card.trend && (
                <div className="mt-2">
                  <span className={`text-xs font-medium ${
                    parseFloat(card.trend) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {card.trend} vs mês anterior
                  </span>
                </div>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Resumo do Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="font-medium text-green-800">Total de Entradas</span>
                <span className="font-bold text-green-600">
                  R$ {stats.receitaMesAtual.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="font-medium text-red-800">Total de Saídas</span>
                <span className="font-bold text-red-600">
                  R$ {stats.despesaMesAtual.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-amber-50 rounded-lg">
                <span className="font-medium text-amber-800">Impostos OS (10% Convênios)</span>
                <span className="font-bold text-amber-600">
                  R$ {stats.impostoMesAtual.toFixed(2)}
                </span>
              </div>
              <div className={`flex justify-between items-center p-3 rounded-lg ${
                stats.lucroMesAtual >= 0 ? 'bg-emerald-50' : 'bg-red-50'
              }`}>
                <span className={`font-medium ${
                  stats.lucroMesAtual >= 0 ? 'text-emerald-800' : 'text-red-800'
                }`}>
                  Resultado Líquido
                </span>
                <span className={`font-bold text-xl ${
                  stats.lucroMesAtual >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  R$ {stats.lucroMesAtual.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimas Movimentações</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div>
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {lancamentos.slice(0, 10).map((lancamento) => (
                  <div key={lancamento.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium text-sm">{lancamento.descricao}</p>
                      <p className="text-xs text-gray-500">
                        {/* CORRIGIDO: Adicionado 'T00:00:00' para forçar o fuso horário local na exibição */}
                        {format(new Date(lancamento.data_lancamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })} • {lancamento.categoria}
                      </p>
                    </div>
                    <span className={`font-semibold text-sm ${
                      lancamento.tipo === "Entrada" ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {lancamento.tipo === "Entrada" ? '+' : '-'}R$ {lancamento.valor.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}