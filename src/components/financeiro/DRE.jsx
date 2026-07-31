import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Calculator, Percent } from "lucide-react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { agruparLancamentosPorCategoria, filtrarLancamentosPorPeriodo, somarLancamentos, excluirLancamentosDeOSCanceladas } from "./financeiroUtils";

export default function DRE({ lancamentos, ordensServico = [], loading }) {
  const [mesAno, setMesAno] = useState(format(new Date(), "yyyy-MM"));

  const processarDRE = () => {
    const [ano, mes] = mesAno.split('-');
    const mesAnoFiltro = `${ano}-${mes.padStart(2, '0')}`;

    const lancamentosPeriodoRaw = filtrarLancamentosPorPeriodo(lancamentos, {
      mesAno: mesAnoFiltro
    });

    // Considerar somente lançamentos efetivados; pendentes não entram na DRE.
    const lancamentosPeriodo = excluirLancamentosDeOSCanceladas(lancamentosPeriodoRaw, ordensServico)
      .filter(lancamento => lancamento.status !== 'Pendente');

    const resumo = somarLancamentos(lancamentosPeriodo);
    const entradasPorCategoria = agruparLancamentosPorCategoria(lancamentosPeriodo, 'Entrada');
    const saidasPorCategoria = agruparLancamentosPorCategoria(lancamentosPeriodo, 'Saída');

    // === RECEITAS POR TIPO DE SERVIÇO: calculadas direto das OSs (fonte da verdade) ===
    // Isso garante que OSs sem lançamento financeiro vinculado também sejam contabilizadas
    const osAtivasPeriodo = ordensServico.filter(os => {
      if (!os.data_execucao) return false;
      const osYM = os.data_execucao.substring(0, 7);
      return osYM === mesAnoFiltro && os.status_pagamento === 'Pago';
    });

    const receitaConsultas = osAtivasPeriodo
      .filter(os => os.tipo_servico === 'Consulta')
      .reduce((acc, os) => acc + (os.valor_final || 0), 0);
    const receitaProcedimentos = osAtivasPeriodo
      .filter(os => os.tipo_servico === 'Procedimento')
      .reduce((acc, os) => acc + (os.valor_final || 0), 0);
    const receitaExames = osAtivasPeriodo
      .filter(os => os.tipo_servico === 'Exame')
      .reduce((acc, os) => acc + (os.valor_final || 0), 0);

    // Outras Receitas: lançamentos de Entrada SEM vínculo com OS (ex.: vendas de cartão, taxas, etc.)
    const outrasReceitas = lancamentosPeriodo
      .filter(l => l.tipo === 'Entrada' && !l.ordem_servico_id)
      .reduce((acc, l) => acc + (l.valor || 0), 0);

    // Repasse Médico líquido: Saídas - Entradas (estornos de OS canceladas)
    const repasseMedico = (saidasPorCategoria['Repasse Médico'] || 0) - (entradasPorCategoria['Repasse Médico'] || 0);
    const repasseLab = (saidasPorCategoria['Repasse Laboratório'] || 0) - (entradasPorCategoria['Repasse Laboratório'] || 0);
    const aluguel = saidasPorCategoria['Aluguel'] || 0;
    const utilidades = saidasPorCategoria['Água/Luz'] || 0;
    const materialMedico = saidasPorCategoria['Material Médico'] || 0;
    const equipamentos = saidasPorCategoria['Equipamentos'] || 0;
    const salarios = saidasPorCategoria['Salários'] || 0;
    const marketing = saidasPorCategoria['Marketing'] || 0;
    const impostos = saidasPorCategoria['Impostos'] || 0;
    const outros = Object.entries(saidasPorCategoria)
      .filter(([categoria]) => !['Repasse Médico', 'Repasse Laboratório', 'Aluguel', 'Água/Luz', 'Material Médico', 'Equipamentos', 'Salários', 'Marketing', 'Impostos'].includes(categoria))
      .reduce((total, [, valor]) => total + valor, 0);

    // Calcular imposto das OS do período (10% convênios)
    const osPeriodo = ordensServico.filter(os => {
      if (!os.data_execucao) return false;
      const osYM = os.data_execucao.substring(0, 7);
      return osYM === mesAnoFiltro && os.status_pagamento === 'Pago';
    });
    const impostoOS = osPeriodo.reduce((acc, os) => acc + (os.valor_imposto || 0), 0);

    const receitaBruta = receitaConsultas + receitaProcedimentos + receitaExames + outrasReceitas;
    const totalDespesas = resumo.saidas;
    const lucroLiquido = receitaBruta - totalDespesas - impostoOS;
    const margemLiquida = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;

    return {
      periodo: format(new Date(parseInt(ano), parseInt(mes) - 1), "MMMM 'de' yyyy", { locale: ptBR }),
      receitas: {
        consultas: receitaConsultas,
        procedimentos: receitaProcedimentos,
        exames: receitaExames,
        outras: outrasReceitas,
        total: receitaBruta
      },
      despesas: {
        repasseMedico,
        repasseLab,
        aluguel,
        utilidades,
        materialMedico,
        equipamentos,
        salarios,
        marketing,
        impostos,
        impostoOS,
        outros,
        total: totalDespesas + impostoOS
      },
      resultado: {
        lucroLiquido,
        margemLiquida
      }
    };
  };

  const dre = processarDRE();

  const gerarOpcoesSelect = () => {
    const opcoes = [];
    const hoje = new Date();
    for (let i = 11; i >= 0; i--) {
      const data = subMonths(hoje, i);
      const valor = format(data, "yyyy-MM");
      const label = format(data, "MMMM 'de' yyyy", { locale: ptBR });
      opcoes.push({ valor, label });
    }
    return opcoes;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho com seletor de período */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>DRE - Demonstração do Resultado do Exercício</CardTitle>
            <Select value={mesAno} onValueChange={setMesAno}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gerarOpcoesSelect().map(opcao => (
                  <SelectItem key={opcao.valor} value={opcao.valor}>
                    {opcao.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-gray-600 text-sm">
            Período: {dre.periodo}
          </p>
        </CardHeader>
      </Card>

      {/* Resumo Executivo */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Receita Bruta</p>
                <p className="text-2xl font-bold text-green-700">
                  R$ {dre.receitas.total.toFixed(2)}
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
                <p className="text-sm font-medium text-red-600">Total Despesas</p>
                <p className="text-2xl font-bold text-red-700">
                  R$ {dre.despesas.total.toFixed(2)}
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className={`${dre.resultado.lucroLiquido >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${dre.resultado.lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Lucro Líquido
                </p>
                <p className={`text-2xl font-bold ${dre.resultado.lucroLiquido >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  R$ {dre.resultado.lucroLiquido.toFixed(2)}
                </p>
                <p className={`text-xs ${dre.resultado.lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {dre.resultado.margemLiquida.toFixed(1)}% de margem
                </p>
              </div>
              <Calculator className={`w-8 h-8 ${dre.resultado.lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DRE Detalhado */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">Receitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="font-medium">Consultas</span>
              <span className="font-bold text-green-600">R$ {dre.receitas.consultas.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="font-medium">Procedimentos</span>
              <span className="font-bold text-green-600">R$ {dre.receitas.procedimentos.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="font-medium">Exames</span>
              <span className="font-bold text-green-600">R$ {dre.receitas.exames.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="font-medium">Outras Entradas</span>
              <span className="font-bold text-green-600">R$ {dre.receitas.outras.toFixed(2)}</span>
            </div>
            <div className="border-t-2 border-green-200 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-green-800">RECEITA BRUTA</span>
                <span className="text-xl font-bold text-green-600">R$ {dre.receitas.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Despesas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Repasse Médicos</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.repasseMedico.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Repasse Laboratórios</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.repasseLab.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Aluguel</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.aluguel.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Água/Luz</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.utilidades.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Material Médico</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.materialMedico.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Equipamentos</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.equipamentos.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Salários</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.salarios.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Marketing</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.marketing.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Impostos (Lançamentos)</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.impostos.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-amber-50 rounded-lg border border-amber-200">
              <span className="text-sm font-medium">Impostos OS (10% Convênios)</span>
              <span className="font-semibold text-amber-600">R$ {dre.despesas.impostoOS.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Outros</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.outros.toFixed(2)}</span>
            </div>
            <div className="border-t-2 border-red-200 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-red-800">TOTAL DESPESAS</span>
                <span className="text-xl font-bold text-red-600">R$ {dre.despesas.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}