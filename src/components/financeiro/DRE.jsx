import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Calculator, Percent } from "lucide-react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DRE({ lancamentos, loading }) {
  const [mesAno, setMesAno] = useState(format(new Date(), "yyyy-MM"));

  const processarDRE = () => {
    const [ano, mes] = mesAno.split('-');
    // Formato YYYY-MM para comparação de strings (mais confiável que Date)
    const mesAnoFiltro = `${ano}-${mes.padStart(2, '0')}`;

    const lancamentosPeriodo = lancamentos.filter(l => {
      if (!l.data_lancamento) return false;
      // Comparar apenas pelo ano-mês da data_lancamento (formato YYYY-MM-DD)
      const dataLancAnoMes = l.data_lancamento.substring(0, 7);
      return dataLancAnoMes === mesAnoFiltro;
    });

    // Receitas
    const receitaConsultas = lancamentosPeriodo
      .filter(l => l.tipo === "Entrada" && l.categoria === "Receita Consultas")
      .reduce((sum, l) => sum + l.valor, 0);

    const receitaProcedimentos = lancamentosPeriodo
      .filter(l => l.tipo === "Entrada" && l.categoria === "Receita Procedimentos")
      .reduce((sum, l) => sum + l.valor, 0);

    const receitaExames = lancamentosPeriodo
      .filter(l => l.tipo === "Entrada" && l.categoria === "Receita Exames")
      .reduce((sum, l) => sum + l.valor, 0);

    const receitaBruta = receitaConsultas + receitaProcedimentos + receitaExames;

    // Despesas Operacionais
    const repasseMedico = lancamentosPeriodo
      .filter(l => l.tipo === "Saída" && l.categoria === "Repasse Médico")
      .reduce((sum, l) => sum + l.valor, 0);

    const repasseLab = lancamentosPeriodo
      .filter(l => l.tipo === "Saída" && l.categoria === "Repasse Laboratório")
      .reduce((sum, l) => sum + l.valor, 0);

    const aluguel = lancamentosPeriodo
      .filter(l => l.tipo === "Saída" && l.categoria === "Aluguel")
      .reduce((sum, l) => sum + l.valor, 0);

    const utilidades = lancamentosPeriodo
      .filter(l => l.tipo === "Saída" && l.categoria === "Água/Luz")
      .reduce((sum, l) => sum + l.valor, 0);

    const materialMedico = lancamentosPeriodo
      .filter(l => l.tipo === "Saída" && l.categoria === "Material Médico")
      .reduce((sum, l) => sum + l.valor, 0);

    const salarios = lancamentosPeriodo
      .filter(l => l.tipo === "Saída" && l.categoria === "Salários")
      .reduce((sum, l) => sum + l.valor, 0);

    const marketing = lancamentosPeriodo
      .filter(l => l.tipo === "Saída" && l.categoria === "Marketing")
      .reduce((sum, l) => sum + l.valor, 0);

    const outros = lancamentosPeriodo
      .filter(l => l.tipo === "Saída" && l.categoria === "Outros")
      .reduce((sum, l) => sum + l.valor, 0);

    const totalDespesas = repasseMedico + repasseLab + aluguel + utilidades + materialMedico + salarios + marketing + outros;

    const lucroLiquido = receitaBruta - totalDespesas;
    const margemLiquida = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;

    return {
      periodo: format(new Date(parseInt(ano), parseInt(mes) - 1), "MMMM 'de' yyyy", { locale: ptBR }),
      receitas: {
        consultas: receitaConsultas,
        procedimentos: receitaProcedimentos,
        exames: receitaExames,
        total: receitaBruta
      },
      despesas: {
        repasseMedico,
        repasseLab,
        aluguel,
        utilidades,
        materialMedico,
        salarios,
        marketing,
        outros,
        total: totalDespesas
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
              <span className="text-sm">Salários</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.salarios.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg">
              <span className="text-sm">Marketing</span>
              <span className="font-semibold text-red-600">R$ {dre.despesas.marketing.toFixed(2)}</span>
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