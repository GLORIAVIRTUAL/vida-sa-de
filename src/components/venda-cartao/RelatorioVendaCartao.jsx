import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, CreditCard, DollarSign, Users, TrendingUp } from 'lucide-react';
import { VendaCartao } from '@/entities/all';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatDateSafe = (dateString) => {
  if (!dateString) return "N/A";
  try {
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-');
      return format(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)), 'dd/MM/yyyy');
    }
    return format(new Date(dateString), 'dd/MM/yyyy');
  } catch { return "N/A"; }
};

const formatCurrency = (v) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export default function RelatorioVendaCartao({ open, onClose }) {
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [filtros, setFiltros] = useState({
    dataInicio: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    dataFim: format(new Date(), 'yyyy-MM-dd'),
    status: 'todos',
    plano: 'todos',
    pagamento: 'todos'
  });

  useEffect(() => {
    if (open) carregarDados();
  }, [open]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const data = await VendaCartao.list('-data_venda', 5000);
      setVendas(data || []);
    } catch (e) {
      console.error('Erro:', e);
    } finally {
      setLoading(false);
    }
  };

  const vendasFiltradas = useMemo(() => {
    return vendas.filter(v => {
      if (filtros.dataInicio && v.data_venda < filtros.dataInicio) return false;
      if (filtros.dataFim && v.data_venda > filtros.dataFim) return false;
      if (filtros.status !== 'todos' && v.status !== filtros.status) return false;
      if (filtros.plano !== 'todos' && v.tipo_plano !== filtros.plano) return false;
      if (filtros.pagamento !== 'todos' && v.forma_pagamento !== filtros.pagamento) return false;
      return true;
    });
  }, [vendas, filtros]);

  const estatisticas = useMemo(() => {
    const total = vendasFiltradas.reduce((s, v) => s + (v.valor_total || 0), 0);
    const ativos = vendasFiltradas.filter(v => v.status === 'Ativo').length;
    const vencidos = vendasFiltradas.filter(v => v.status === 'Vencido').length;
    const cancelados = vendasFiltradas.filter(v => v.status === 'Cancelado').length;
    const totalDependentes = vendasFiltradas.reduce((s, v) => s + (v.dependentes?.length || 0), 0);
    const totalCartoes = vendasFiltradas.reduce((s, v) => s + (v.quantidade_cartoes || 0), 0);

    const porPlano = {};
    const porPagamento = {};
    const porMes = {};

    vendasFiltradas.forEach(v => {
      const plano = v.tipo_plano || 'Não informado';
      porPlano[plano] = porPlano[plano] || { qtd: 0, valor: 0 };
      porPlano[plano].qtd++;
      porPlano[plano].valor += v.valor_total || 0;

      const pag = v.forma_pagamento || 'Não informado';
      porPagamento[pag] = porPagamento[pag] || { qtd: 0, valor: 0 };
      porPagamento[pag].qtd++;
      porPagamento[pag].valor += v.valor_total || 0;

      if (v.data_venda) {
        const mes = v.data_venda.substring(0, 7);
        porMes[mes] = porMes[mes] || { qtd: 0, valor: 0 };
        porMes[mes].qtd++;
        porMes[mes].valor += v.valor_total || 0;
      }
    });

    return { total, ativos, vencidos, cancelados, totalDependentes, totalCartoes, porPlano, porPagamento, porMes };
  }, [vendasFiltradas]);

  const handlePrint = () => {
    const pw = window.open('', '_blank');
    pw.document.write(`<html><head><title>Relatório Cartão Mais Vida</title>
      <style>
        body{font-family:Arial,sans-serif;margin:20px;font-size:12px;color:#333}
        h1{color:#0d9488;font-size:20px;margin-bottom:5px}
        h2{font-size:14px;color:#666;margin-top:0}
        h3{font-size:13px;border-bottom:2px solid #0d9488;padding-bottom:5px;margin-top:25px;color:#0d9488}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border:1px solid #ddd;padding:6px;text-align:left;font-size:11px}
        th{background:#f0fdfa;font-weight:bold;color:#0d9488}
        .header{text-align:center;margin-bottom:25px}
        .stats{display:flex;gap:12px;margin:20px 0;flex-wrap:wrap}
        .stat{border:1px solid #ddd;padding:12px;border-radius:6px;min-width:100px;text-align:center}
        .stat strong{font-size:10px;color:#666;display:block}
        .stat .val{font-size:18px;font-weight:bold;color:#0d9488}
        .text-right{text-align:right}
        .total{font-weight:bold;background:#f0fdfa}
        .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold}
        .badge-ativo{background:#dcfce7;color:#166534}
        .badge-vencido{background:#fee2e2;color:#991b1b}
        .badge-cancelado{background:#f3f4f6;color:#374151}
      </style></head><body>
      <div class="header">
        <h1>CENTRO VIDA SAÚDE - CARTÃO MAIS VIDA</h1>
        <h2>Relatório de Vendas</h2>
        <p>Período: ${formatDateSafe(filtros.dataInicio)} a ${formatDateSafe(filtros.dataFim)}</p>
        <p style="font-size:10px;color:#999">Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
      </div>

      <div class="stats">
        <div class="stat"><strong>Total Vendas</strong><span class="val">${vendasFiltradas.length}</span></div>
        <div class="stat"><strong>Faturamento</strong><span class="val">${formatCurrency(estatisticas.total)}</span></div>
        <div class="stat"><strong>Ativos</strong><span class="val" style="color:#16a34a">${estatisticas.ativos}</span></div>
        <div class="stat"><strong>Vencidos</strong><span class="val" style="color:#dc2626">${estatisticas.vencidos}</span></div>
        <div class="stat"><strong>Cancelados</strong><span class="val" style="color:#6b7280">${estatisticas.cancelados}</span></div>
        <div class="stat"><strong>Dependentes</strong><span class="val">${estatisticas.totalDependentes}</span></div>
        <div class="stat"><strong>Cartões Emitidos</strong><span class="val">${estatisticas.totalCartoes}</span></div>
      </div>

      <h3>Resumo por Plano</h3>
      <table>
        <tr><th>Plano</th><th class="text-right">Qtd</th><th class="text-right">Valor Total</th></tr>
        ${Object.entries(estatisticas.porPlano).sort((a,b)=>b[1].valor-a[1].valor).map(([p,d])=>
          `<tr><td>${p}</td><td class="text-right">${d.qtd}</td><td class="text-right">${formatCurrency(d.valor)}</td></tr>`
        ).join('')}
        <tr class="total"><td>TOTAL</td><td class="text-right">${vendasFiltradas.length}</td><td class="text-right">${formatCurrency(estatisticas.total)}</td></tr>
      </table>

      <h3>Resumo por Forma de Pagamento</h3>
      <table>
        <tr><th>Pagamento</th><th class="text-right">Qtd</th><th class="text-right">Valor Total</th></tr>
        ${Object.entries(estatisticas.porPagamento).sort((a,b)=>b[1].valor-a[1].valor).map(([p,d])=>
          `<tr><td>${p}</td><td class="text-right">${d.qtd}</td><td class="text-right">${formatCurrency(d.valor)}</td></tr>`
        ).join('')}
      </table>

      <h3>Resumo Mensal</h3>
      <table>
        <tr><th>Mês</th><th class="text-right">Vendas</th><th class="text-right">Valor</th></tr>
        ${Object.entries(estatisticas.porMes).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,d])=>{
          const [y,mo]=m.split('-');
          const meses=['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
          return `<tr><td>${meses[parseInt(mo)]}/${y}</td><td class="text-right">${d.qtd}</td><td class="text-right">${formatCurrency(d.valor)}</td></tr>`;
        }).join('')}
      </table>

      <h3>Detalhamento (${vendasFiltradas.length} vendas)</h3>
      <table>
        <tr><th>#</th><th>Data</th><th>Titular</th><th>CPF</th><th>Plano</th><th>Dep.</th><th>Pgto</th><th>Status</th><th class="text-right">Valor</th></tr>
        ${vendasFiltradas.map(v=>`<tr>
          <td>${v.numero_venda||'-'}</td>
          <td>${formatDateSafe(v.data_venda)}</td>
          <td>${v.titular?.nome||'-'}</td>
          <td>${v.titular?.cpf||'-'}</td>
          <td>${v.tipo_plano||'-'}</td>
          <td>${v.dependentes?.length||0}</td>
          <td>${v.forma_pagamento||'-'}</td>
          <td><span class="badge badge-${v.status?.toLowerCase()}">${v.status||'-'}</span></td>
          <td class="text-right">${formatCurrency(v.valor_total)}</td>
        </tr>`).join('')}
        <tr class="total"><td colspan="8">TOTAL</td><td class="text-right">${formatCurrency(estatisticas.total)}</td></tr>
      </table>
    </body></html>`);
    pw.document.close();
    pw.print();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-teal-600" />
            Relatório de Vendas - Cartão Mais Vida
          </DialogTitle>
          <DialogDescription>Relatório completo das vendas do Cartão Mais Vida</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Filtros */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Data Início</Label>
              <Input type="date" value={filtros.dataInicio} onChange={e => setFiltros({...filtros, dataInicio: e.target.value})} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Data Fim</Label>
              <Input type="date" value={filtros.dataFim} onChange={e => setFiltros({...filtros, dataFim: e.target.value})} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filtros.status} onValueChange={v => setFiltros({...filtros, status: v})}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Vencido">Vencido</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Plano</Label>
              <Select value={filtros.plano} onValueChange={v => setFiltros({...filtros, plano: v})}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Individual à Vista">Individual à Vista</SelectItem>
                  <SelectItem value="Individual Parcelado">Individual Parcelado</SelectItem>
                  <SelectItem value="Familiar à Vista">Familiar à Vista</SelectItem>
                  <SelectItem value="Familiar Parcelado">Familiar Parcelado</SelectItem>
                  <SelectItem value="Grupo à Vista">Grupo à Vista</SelectItem>
                  <SelectItem value="Grupo Parcelado">Grupo Parcelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Pagamento</Label>
              <Select value={filtros.pagamento} onValueChange={v => setFiltros({...filtros, pagamento: v})}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
          ) : (
            <>
              {/* Cards resumo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-teal-50 border-teal-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-teal-600">Total Vendas</p>
                    <p className="text-xl font-bold text-teal-800">{vendasFiltradas.length}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-green-600">Faturamento</p>
                    <p className="text-xl font-bold text-green-800">{formatCurrency(estatisticas.total)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-blue-600">Ativos</p>
                    <p className="text-xl font-bold text-blue-800">{estatisticas.ativos}</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-orange-600">Dependentes</p>
                    <p className="text-xl font-bold text-orange-800">{estatisticas.totalDependentes}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabela resumida */}
              <div className="max-h-[350px] overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Titular</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Dep.</TableHead>
                      <TableHead>Pgto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendasFiltradas.slice(0, 200).map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="text-xs">{v.numero_venda || '-'}</TableCell>
                        <TableCell className="text-xs">{formatDateSafe(v.data_venda)}</TableCell>
                        <TableCell className="text-xs font-medium">{v.titular?.nome || '-'}</TableCell>
                        <TableCell className="text-xs">{v.tipo_plano || '-'}</TableCell>
                        <TableCell className="text-xs text-center">{v.dependentes?.length || 0}</TableCell>
                        <TableCell className="text-xs">{v.forma_pagamento || '-'}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${
                            v.status === 'Ativo' ? 'bg-green-100 text-green-800' :
                            v.status === 'Vencido' ? 'bg-red-100 text-red-800' :
                            v.status === 'Cancelado' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>{v.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">{formatCurrency(v.valor_total)}</TableCell>
                      </TableRow>
                    ))}
                    {vendasFiltradas.length > 200 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-gray-500 text-xs">Mostrando 200 de {vendasFiltradas.length}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center pt-2 border-t">
                <p className="text-sm text-gray-500">{vendasFiltradas.length} vendas no período</p>
                <p className="text-lg font-bold text-teal-700">Total: {formatCurrency(estatisticas.total)}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={handlePrint} className="bg-teal-600 hover:bg-teal-700 gap-2" disabled={loading}>
            <Printer className="w-4 h-4" />
            Imprimir Relatório
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}