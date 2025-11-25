import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Filter, Receipt, TrendingDown, Building2, DollarSign } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrdemServico, Medico, Paciente } from "@/entities/all";
import { safeApiCall } from "@/components/shared/apiThrottle";
import { Separator } from "@/components/ui/separator";

export default function Repasses() {
  const [ordens, setOrdens] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    medico: "todos",
    mes: format(new Date(), "yyyy-MM")
  });

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const [ordensData, medicosData, pacientesData] = await Promise.all([
        safeApiCall(() => OrdemServico.list("-data_execucao")),
        safeApiCall(() => Medico.list()),
        safeApiCall(() => Paciente.list())
      ]);

      setOrdens(ordensData || []);
      setMedicos(medicosData || []);
      setPacientes(pacientesData || []);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const ordensFiltradas = ordens.filter(os => {
    const mesOS = format(new Date(os.data_execucao), "yyyy-MM");
    const filtroMes = filtros.mes === "todos" || mesOS === filtros.mes;
    const filtroMedico = filtros.medico === "todos" || os.medico_id === filtros.medico;
    const temRepasse = os.valor_repasse_medico && os.valor_repasse_medico > 0;
    
    return filtroMes && filtroMedico && temRepasse && os.status_pagamento === "Pago";
  });

  // Agrupar por médico
  const repassesPorMedico = ordensFiltradas.reduce((acc, os) => {
    const medicoId = os.medico_id;
    if (!acc[medicoId]) {
      acc[medicoId] = {
        medico: medicos.find(m => m.id === medicoId),
        ordens: [],
        totais: {
          valor_total_os: 0,
          imposto_total: 0,
          repasse_total: 0,
          valor_clinica_total: 0,
          quantidade_atendimentos: 0
        }
      };
    }
    
    acc[medicoId].ordens.push(os);
    
    // Somar totais
    const imposto = os.valor_final * 0.10;
    acc[medicoId].totais.valor_total_os += os.valor_final;
    acc[medicoId].totais.imposto_total += imposto;
    acc[medicoId].totais.repasse_total += os.valor_repasse_medico || 0;
    acc[medicoId].totais.valor_clinica_total += os.valor_clinica || 0;
    acc[medicoId].totais.quantidade_atendimentos += 1;
    
    return acc;
  }, {});

  const baixarRelatorio = () => {
    const dataAtual = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const mesReferencia = filtros.mes !== "todos" 
      ? format(new Date(filtros.mes + "-01"), "MMMM 'de' yyyy", { locale: ptBR })
      : "Todos os meses";

    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Relatório de Repasses Médicos</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 40px; 
            color: #333; 
            line-height: 1.6;
          }
          .header { 
            display: flex; 
            align-items: center; 
            border-bottom: 3px solid #7c3aed; 
            padding-bottom: 20px; 
            margin-bottom: 30px; 
          }
          .logo { width: 80px; height: 80px; margin-right: 20px; }
          .clinic-info { flex: 1; }
          .clinic-name { font-size: 24px; font-weight: bold; color: #7c3aed; }
          .report-title { 
            font-size: 28px; 
            font-weight: bold; 
            margin: 30px 0 20px 0; 
            color: #1f2937;
          }
          .meta-info {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            font-size: 14px;
            color: #6b7280;
          }
          .medico-section {
            margin-bottom: 40px;
            page-break-inside: avoid;
          }
          .medico-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin-bottom: 0;
          }
          .medico-nome {
            font-size: 22px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .medico-especialidade {
            font-size: 14px;
            opacity: 0.9;
          }
          .totais-medico {
            background: #f9fafb;
            border: 2px solid #e5e7eb;
            border-top: none;
            padding: 20px;
            border-radius: 0 0 8px 8px;
            margin-bottom: 20px;
          }
          .totais-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }
          .total-item {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #ddd;
          }
          .total-item.valor { border-left-color: #3b82f6; }
          .total-item.imposto { border-left-color: #ef4444; }
          .total-item.repasse { border-left-color: #8b5cf6; }
          .total-item.clinica { border-left-color: #10b981; }
          .total-label {
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 5px;
            font-weight: 600;
          }
          .total-value {
            font-size: 24px;
            font-weight: bold;
            color: #1f2937;
          }
          .table-container {
            margin-top: 20px;
            overflow-x: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
          }
          th {
            background: #f3f4f6;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            color: #4b5563;
            border-bottom: 2px solid #e5e7eb;
          }
          td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
          }
          tr:hover {
            background: #f9fafb;
          }
          .text-right {
            text-align: right;
          }
          .text-center {
            text-align: center;
          }
          .resumo-geral {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 30px;
            border-radius: 12px;
            margin-top: 40px;
            page-break-inside: avoid;
          }
          .resumo-geral h2 {
            margin: 0 0 20px 0;
            font-size: 24px;
          }
          .resumo-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
          }
          .resumo-item {
            background: rgba(255, 255, 255, 0.2);
            padding: 15px;
            border-radius: 8px;
            text-align: center;
          }
          .resumo-label {
            font-size: 11px;
            opacity: 0.9;
            margin-bottom: 5px;
          }
          .resumo-value {
            font-size: 28px;
            font-weight: bold;
          }
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            font-size: 12px;
            color: #6b7280;
          }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo" class="logo no-print">
          <div class="clinic-info">
            <div class="clinic-name">CENTRO VIDA SAÚDE</div>
            <div style="font-size: 14px; color: #6b7280;">Relatório de Repasses Médicos</div>
          </div>
        </div>

        <div class="meta-info">
          📅 Gerado em: ${dataAtual}<br>
          📊 Período: ${mesReferencia}<br>
          👨‍⚕️ Médico: ${filtros.medico === "todos" ? "Todos os médicos" : medicos.find(m => m.id === filtros.medico)?.nome || "Não encontrado"}
        </div>

        <div class="report-title">Detalhamento por Médico</div>
    `;

    // Totais gerais
    let totalGeralOS = 0;
    let totalGeralImposto = 0;
    let totalGeralRepasses = 0;
    let totalGeralClinica = 0;
    let totalGeralAtendimentos = 0;

    // Gerar seção para cada médico
    Object.values(repassesPorMedico).forEach(({ medico, ordens, totais }) => {
      if (!medico) return;

      totalGeralOS += totais.valor_total_os;
      totalGeralImposto += totais.imposto_total;
      totalGeralRepasses += totais.repasse_total;
      totalGeralClinica += totais.valor_clinica_total;
      totalGeralAtendimentos += totais.quantidade_atendimentos;

      htmlContent += `
        <div class="medico-section">
          <div class="medico-header">
            <div class="medico-nome">Dr(a). ${medico.nome}</div>
            <div class="medico-especialidade">${medico.especialidade} - CRM: ${medico.crm}</div>
          </div>
          
          <div class="totais-medico">
            <div class="totais-grid">
              <div class="total-item valor">
                <div class="total-label">💵 VALOR TOTAL DAS OS</div>
                <div class="total-value">R$ ${totais.valor_total_os.toFixed(2)}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 5px;">
                  ${totais.quantidade_atendimentos} atendimento(s)
                </div>
              </div>
              
              <div class="total-item imposto">
                <div class="total-label">📋 IMPOSTO (10%)</div>
                <div class="total-value">R$ ${totais.imposto_total.toFixed(2)}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 5px;">
                  Descontado do valor total
                </div>
              </div>
              
              <div class="total-item repasse">
                <div class="total-label">👨‍⚕️ REPASSE MÉDICO</div>
                <div class="total-value">R$ ${totais.repasse_total.toFixed(2)}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 5px;">
                  Já descontado 10% imposto
                </div>
              </div>
              
              <div class="total-item clinica">
                <div class="total-label">🏢 VALOR CLÍNICA</div>
                <div class="total-value">R$ ${totais.valor_clinica_total.toFixed(2)}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 5px;">
                  Valor líquido da clínica
                </div>
              </div>
            </div>
          </div>

          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>OS</th>
                  <th>Paciente</th>
                  <th>Serviço</th>
                  <th class="text-right">Valor Total</th>
                  <th class="text-right">Imposto (10%)</th>
                  <th class="text-right">Repasse Médico</th>
                  <th class="text-right">Valor Clínica</th>
                </tr>
              </thead>
              <tbody>
      `;

      ordens.forEach(os => {
        const paciente = pacientes.find(p => p.id === os.paciente_id);
        const imposto = os.valor_final * 0.10;

        htmlContent += `
          <tr>
            <td>${format(new Date(os.data_execucao), "dd/MM/yyyy")}</td>
            <td>#${os.numero_os || os.id?.substring(0, 8)}</td>
            <td>${paciente?.nome || "N/A"}</td>
            <td>${os.tipo_servico}</td>
            <td class="text-right">R$ ${os.valor_final.toFixed(2)}</td>
            <td class="text-right" style="color: #ef4444;">R$ ${imposto.toFixed(2)}</td>
            <td class="text-right" style="color: #8b5cf6; font-weight: bold;">R$ ${(os.valor_repasse_medico || 0).toFixed(2)}</td>
            <td class="text-right" style="color: #10b981; font-weight: bold;">R$ ${(os.valor_clinica || 0).toFixed(2)}</td>
          </tr>
        `;
      });

      htmlContent += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    // Resumo Geral
    htmlContent += `
      <div class="resumo-geral">
        <h2>📊 RESUMO GERAL</h2>
        <div class="resumo-grid">
          <div class="resumo-item">
            <div class="resumo-label">TOTAL OS</div>
            <div class="resumo-value">R$ ${totalGeralOS.toFixed(2)}</div>
          </div>
          <div class="resumo-item">
            <div class="resumo-label">IMPOSTO</div>
            <div class="resumo-value">R$ ${totalGeralImposto.toFixed(2)}</div>
          </div>
          <div class="resumo-item">
            <div class="resumo-label">REPASSES</div>
            <div class="resumo-value">R$ ${totalGeralRepasses.toFixed(2)}</div>
          </div>
          <div class="resumo-item">
            <div class="resumo-label">CLÍNICA</div>
            <div class="resumo-value">R$ ${totalGeralClinica.toFixed(2)}</div>
          </div>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 13px; opacity: 0.9;">
          Total de ${totalGeralAtendimentos} atendimento(s) no período
        </div>
      </div>

      <div class="footer">
        <strong>Centro Vida Saúde</strong> - Sistema de Gestão Financeira<br>
        Relatório gerado automaticamente | gloriavirtual.com
      </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Receipt className="w-6 h-6 text-purple-600" />
              Relatório de Repasses Médicos
            </span>
            <Button onClick={baixarRelatorio} className="gap-2">
              <Download className="w-4 h-4" />
              Baixar Relatório Completo
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filtrar por Médico
              </label>
              <Select value={filtros.medico} onValueChange={(v) => setFiltros({...filtros, medico: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os médicos</SelectItem>
                  {medicos.map(m => (
                    <SelectItem key={m.id} value={m.id}>Dr(a). {m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filtrar por Mês
              </label>
              <Select value={filtros.mes} onValueChange={(v) => setFiltros({...filtros, mes: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os meses</SelectItem>
                  {Array.from({length: 12}, (_, i) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const value = format(date, "yyyy-MM");
                    const label = format(date, "MMMM 'de' yyyy", { locale: ptBR });
                    return <SelectItem key={value} value={value}>{label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {Object.keys(repassesPorMedico).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Receipt className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhum repasse encontrado para os filtros selecionados</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.values(repassesPorMedico).map(({ medico, ordens, totais }) => {
                if (!medico) return null;

                return (
                  <Card key={medico.id} className="overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
                      <h3 className="text-xl font-bold">Dr(a). {medico.nome}</h3>
                      <p className="text-sm opacity-90">{medico.especialidade} - CRM: {medico.crm}</p>
                    </div>

                    <CardContent className="p-6 space-y-6">
                      {/* Totais do Médico */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="w-5 h-5 text-blue-600" />
                            <span className="text-xs font-semibold text-blue-900">VALOR TOTAL OS</span>
                          </div>
                          <p className="text-2xl font-bold text-blue-600">
                            R$ {totais.valor_total_os.toFixed(2)}
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            {totais.quantidade_atendimentos} atendimento(s)
                          </p>
                        </div>

                        <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
                          <div className="flex items-center gap-2 mb-2">
                            <Receipt className="w-5 h-5 text-red-600" />
                            <span className="text-xs font-semibold text-red-900">IMPOSTO (10%)</span>
                          </div>
                          <p className="text-2xl font-bold text-red-600">
                            R$ {totais.imposto_total.toFixed(2)}
                          </p>
                          <p className="text-xs text-red-700 mt-1">
                            Descontado do total
                          </p>
                        </div>

                        <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="w-5 h-5 text-purple-600" />
                            <span className="text-xs font-semibold text-purple-900">REPASSE MÉDICO</span>
                          </div>
                          <p className="text-2xl font-bold text-purple-600">
                            R$ {totais.repasse_total.toFixed(2)}
                          </p>
                          <p className="text-xs text-purple-700 mt-1">
                            Já c/ desc. 10%
                          </p>
                        </div>

                        <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="w-5 h-5 text-green-600" />
                            <span className="text-xs font-semibold text-green-900">VALOR CLÍNICA</span>
                          </div>
                          <p className="text-2xl font-bold text-green-600">
                            R$ {totais.valor_clinica_total.toFixed(2)}
                          </p>
                          <p className="text-xs text-green-700 mt-1">
                            Valor líquido
                          </p>
                        </div>
                      </div>

                      <Separator />

                      {/* Tabela de OS */}
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>OS</TableHead>
                              <TableHead>Paciente</TableHead>
                              <TableHead>Serviço</TableHead>
                              <TableHead className="text-right">Valor Total</TableHead>
                              <TableHead className="text-right">Imposto (10%)</TableHead>
                              <TableHead className="text-right">Repasse Médico</TableHead>
                              <TableHead className="text-right">Valor Clínica</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ordens.map(os => {
                              const paciente = pacientes.find(p => p.id === os.paciente_id);
                              const imposto = os.valor_final * 0.10;

                              return (
                                <TableRow key={os.id}>
                                  <TableCell>
                                    {format(new Date(os.data_execucao), "dd/MM/yyyy")}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      #{os.numero_os || os.id?.substring(0, 8)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{paciente?.nome || "N/A"}</TableCell>
                                  <TableCell>
                                    <Badge>{os.tipo_servico}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    R$ {os.valor_final.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right text-red-600 font-semibold">
                                    R$ {imposto.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right text-purple-600 font-bold">
                                    R$ {(os.valor_repasse_medico || 0).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right text-green-600 font-bold">
                                    R$ {(os.valor_clinica || 0).toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}