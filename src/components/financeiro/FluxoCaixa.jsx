import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function FluxoCaixa({ lancamentos, onUpdate }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [tipoLancamento, setTipoLancamento] = useState("Entrada"); // New state to control form's initial type

  const abrirForm = (tipo) => {
    setTipoLancamento(tipo);
    setMostrarForm(true);
  };

  const { totalEntradas, totalSaidas, saldo } = useMemo(() => {
    const entradas = lancamentos.filter(l => l.tipo === "Entrada").reduce((sum, l) => sum + l.valor, 0);
    const saidas = lancamentos.filter(l => l.tipo === "Saída").reduce((sum, l) => sum + l.valor, 0);
    return {
      totalEntradas: entradas,
      totalSaidas: saidas,
      saldo: entradas - saidas
    };
  }, [lancamentos]);


  return (
    <div className="space-y-6">
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
          {lancamentos.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
                <p>Nenhuma movimentação financeira registrada.</p>
                <p className="text-sm mt-2">Use os botões acima para adicionar uma nova receita ou despesa.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {lancamentos.map((lancamento) => (
                    <TableRow key={lancamento.id}>
                      <TableCell>
                        {/* CORRIGIDO: Adicionado 'T00:00:00' para forçar o fuso horário local */}
                        {format(new Date(lancamento.data_lancamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{lancamento.descricao}</TableCell>
                      <TableCell>{lancamento.categoria}</TableCell>
                      <TableCell>
                        <Badge className={`${tipoColors[lancamento.tipo]} border`}>
                          {lancamento.tipo}
                        </Badge>
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