import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { FileText, Printer, Calendar, DollarSign, Building2, Download, User, Activity, Check, ChevronsUpDown } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Faturas({ ordensServico, pacientes, medicos, procedimentos, exames, categorias }) {
  const [mesSelecionado, setMesSelecionado] = useState(format(new Date(), "yyyy-MM"));
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("todas");
  const [filtroProfissional, setFiltroProfissional] = useState("todos");
  const [filtroServico, setFiltroServico] = useState("todos");
  const [openServico, setOpenServico] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Categorias que geram faturas (órgãos públicos)
  const categoriasPublicas = [
    "Prefeitura de Imbé",
    "Prefeitura de Pinhal",
    "Prefeitura de Tramandaí",
    "SMEC",
    "FUMAM"
  ];

  // Filtrar categorias públicas disponíveis
  const categoriasDisponiveis = useMemo(() => {
    return categorias.filter(cat =>
      categoriasPublicas.some(pub => cat.nome.toUpperCase().includes(pub.toUpperCase()))
    );
  }, [categorias]);

  // Extrair opções únicas para os filtros
  const opcoesFiltro = useMemo(() => {
    const profs = new Map();
    const servs = new Set();

    // Mostrar todos os médicos cadastrados
    medicos.forEach(m => profs.set(m.id, m.nome));

    // Mostrar todos os procedimentos e exames cadastrados + consultas genéricas baseadas nas especialidades
    procedimentos.forEach(p => servs.add(p.nome));
    exames.forEach(e => servs.add(e.nome));
    
    // Adicionar também os serviços que já existem no histórico para garantir que nada fique de fora
    ordensServico.forEach(os => {
      if (os.tipo_servico === "Consulta") {
        const medico = medicos.find(m => m.id === os.medico_id);
        if (medico && medico.especialidade) {
          servs.add(`Consulta - ${medico.especialidade}`);
        } else {
          servs.add("Consulta");
        }
      }
    });

    return {
      profissionais: Array.from(profs.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      servicos: Array.from(servs).sort()
    };
  }, [medicos, procedimentos, exames, ordensServico]);

  // Gerar faturas por categoria e mês
  const faturas = useMemo(() => {
    const inicioMes = mesSelecionado + '-01';
    const fimMes = format(endOfMonth(new Date(inicioMes + 'T00:00:00')), 'yyyy-MM-dd');

    console.log('🔍 FATURAS - Iniciando busca:', {
      mes: mesSelecionado,
      periodo: `${inicioMes} até ${fimMes}`,
      total_os: ordensServico.length,
      total_categorias: categorias.length
    });

    if (debugMode) {
      console.log('\n📊 === DEBUG MODE ATIVADO ===');
      console.log('Todas as OS:', ordensServico.map(os => ({
        id: os.id?.substring(0, 8), // Safely access substring if id exists
        data: os.data_execucao,
        status: os.status_pagamento,
        categoria_id: os.categoria_preco_id,
        paciente: pacientes.find(p => p.id === os.paciente_id)?.nome
      })));
    }

    // Filtrar OS do mês que são de categorias públicas e estão pagas
    const ordensFiltradas = ordensServico.filter(os => {
      const debugInfo = {
        os_id: os.id?.substring(0, 8), // Safely access substring if id exists
        data: os.data_execucao,
        status: os.status_pagamento,
        categoria_id: os.categoria_preco_id
      };

      // Verificar data de execução
      if (!os.data_execucao) {
        if (debugMode) console.log('❌ OS sem data_execucao:', debugInfo);
        return false;
      }

      // Verificar status - excluir apenas canceladas (convênios podem estar pendentes)
      if (os.status_pagamento === "Cancelado") {
        if (debugMode) console.log('❌ OS cancelada:', debugInfo);
        return false;
      }

      // Verificar se está no período
      if (os.data_execucao < inicioMes || os.data_execucao > fimMes) {
        if (debugMode) console.log('❌ OS fora do período:', debugInfo);
        return false;
      }

      // Buscar categoria
      const categoria = categorias.find(c => c.id === os.categoria_preco_id);
      if (!categoria) {
        if (debugMode) console.log('❌ OS sem categoria válida:', debugInfo);
        return false;
      }

      debugInfo.categoria_nome = categoria.nome;

      // Verificar se é categoria pública
      const isPublica = categoriasPublicas.some(pub =>
        categoria.nome.toUpperCase().includes(pub.toUpperCase())
      );

      if (isPublica) {
        if (debugMode) console.log('✅ OS incluída na fatura:', debugInfo);
      } else {
        if (debugMode) console.log('⚠️ OS não é categoria pública:', debugInfo);
      }

      return isPublica;
    });

    if (debugMode) console.log(`📊 Total de OS filtradas: ${ordensFiltradas.length}`);

    // Agrupar por categoria
    const faturasPorCategoria = {};

    ordensFiltradas.forEach(os => {
      const categoria = categorias.find(c => c.id === os.categoria_preco_id);
      if (!categoria) return;

      if (!faturasPorCategoria[categoria.id]) {
        faturasPorCategoria[categoria.id] = {
          categoria_id: categoria.id,
          categoria_nome: categoria.nome,
          mes_referencia: mesSelecionado,
          itens: [],
          valor_total: 0,
          quantidade_atendimentos: 0
        };
      }

      const paciente = pacientes.find(p => p.id === os.paciente_id);
      const medico = medicos.find(m => m.id === os.medico_id);
      const nomePaciente = paciente?.nome || os.paciente_nome || "Paciente não encontrado";

      // Determinar nome do serviço
      let nomeServico = os.tipo_servico;
      if (os.tipo_servico === "Procedimento" && os.procedimento_id) {
        const proc = procedimentos.find(p => p.id === os.procedimento_id);
        nomeServico = proc?.nome || os.tipo_servico;
      } else if (os.tipo_servico === "Exame" && os.exames_ids?.length > 0) {
        const examesNomes = os.exames_ids.map(exId => {
          const ex = exames.find(e => e.id === exId);
          return ex?.nome || "Exame";
        });
        nomeServico = examesNomes.join(", ");
      } else if (os.tipo_servico === "Consulta" && medico) {
        nomeServico = `Consulta - ${medico.especialidade}`;
      }

      // Aplicar filtros adicionais
      if (filtroProfissional !== "todos" && os.medico_id !== filtroProfissional) return;
      if (filtroServico !== "todos" && nomeServico !== filtroServico) return;

      faturasPorCategoria[categoria.id].itens.push({
        data: os.data_execucao,
        paciente_nome: nomePaciente,
        medico_nome: medico?.nome || "N/A",
        servico: nomeServico,
        valor: os.valor_final || 0,
        os_id: os.id
      });

      faturasPorCategoria[categoria.id].valor_total += os.valor_final || 0;
      faturasPorCategoria[categoria.id].quantidade_atendimentos += 1;
    });

    const result = Object.values(faturasPorCategoria).filter(f => f.quantidade_atendimentos > 0);
    if (debugMode) console.log(`💰 Faturas geradas: ${result.length}`, result);

    return result;
  }, [ordensServico, mesSelecionado, categorias, pacientes, medicos, procedimentos, exames, debugMode, filtroProfissional, filtroServico]);

  // Filtrar faturas pela categoria selecionada
  const faturasFiltradas = useMemo(() => {
    if (categoriaSelecionada === "todas") return faturas;
    return faturas.filter(f => f.categoria_id === categoriaSelecionada);
  }, [faturas, categoriaSelecionada]);

  const imprimirFatura = (fatura) => {
    const dataAtual = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const mesReferencia = format(new Date(fatura.mes_referencia + '-01T00:00:00'), "MMMM 'de' yyyy", { locale: ptBR });

    // Ordenar itens por data
    const itensOrdenados = [...fatura.itens].sort((a, b) => a.data.localeCompare(b.data));

    const itensHtml = itensOrdenados.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${format(new Date(item.data + 'T00:00:00'), "dd/MM/yyyy")}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.paciente_nome}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.servico}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.medico_nome}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">R$ ${item.valor.toFixed(2).replace('.', ',')}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Fatura - ${fatura.categoria_nome} - ${mesReferencia}</title>
        <style>
          @media print {
            @page { margin: 1cm; }
            body { margin: 0; }
          }
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
            line-height: 1.6;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #059669;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo-section {
            display: flex;
            align-items: center;
            gap: 15px;
          }
          .logo {
            width: 80px;
            height: 80px;
            object-fit: contain;
          }
          .clinic-info {
            flex: 1;
          }
          .clinic-name {
            font-size: 24px;
            font-weight: bold;
            color: #059669;
            margin: 0;
          }
          .clinic-details {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
          }
          .fatura-type {
            text-align: right;
          }
          .fatura-type-label {
            font-size: 32px;
            font-weight: bold;
            color: #059669;
            margin: 0;
          }
          .fatura-date {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
          }
          .section {
            margin: 25px 0;
            padding: 15px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background-color: #f9fafb;
          }
          .section-title {
            font-size: 16px;
            font-weight: bold;
            color: #059669;
            margin: 0 0 15px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #059669;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: 600;
            color: #4b5563;
          }
          .info-value {
            color: #1f2937;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .items-table th {
            background-color: #059669;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
          }
          .items-table td {
            padding: 10px;
            border-bottom: 1px solid #e5e7eb;
          }
          .items-table tr:nth-child(even) {
            background-color: #f9fafb;
          }
          .totals-section {
            margin: 30px 0;
            padding: 20px;
            background: linear-gradient(135deg, #059669 0%, #047857 100%);
            border-radius: 8px;
            color: white;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            font-size: 16px;
          }
          .total-final {
            font-size: 28px;
            font-weight: bold;
            border-top: 2px solid rgba(255,255,255,0.3);
            padding-top: 15px;
            margin-top: 10px;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            font-size: 11px;
            color: #6b7280;
          }
          .observacoes {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .observacoes-title {
            font-weight: bold;
            color: #92400e;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-section">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo" class="logo" />
            <div class="clinic-info">
              <h1 class="clinic-name">CENTRO VIDA SAÚDE</h1>
              <div class="clinic-details">
                Endereço da Clínica • Telefone: (XX) XXXX-XXXX<br/>
                CNPJ: XX.XXX.XXX/XXXX-XX
              </div>
            </div>
          </div>
          <div class="fatura-type">
            <p class="fatura-type-label">FATURA</p>
            <p class="fatura-date">Emitida em: ${dataAtual}</p>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">Informações da Fatura</h3>
          <div class="info-row">
            <span class="info-label">Destinatário:</span>
            <span class="info-value"><strong>${fatura.categoria_nome}</strong></span>
          </div>
          <div class="info-row">
            <span class="info-label">Período de Referência:</span>
            <span class="info-value">${mesReferencia}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Quantidade de Atendimentos:</span>
            <span class="info-value">${fatura.quantidade_atendimentos}</span>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">Detalhamento dos Atendimentos</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Paciente</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th style="text-align: right;">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${itensHtml}
            </tbody>
          </table>
        </div>

        <div class="totals-section">
          <div class="total-row">
            <span>Quantidade de Atendimentos:</span>
            <span>${fatura.quantidade_atendimentos}</span>
          </div>
          <div class="total-row total-final">
            <span>VALOR TOTAL A PAGAR:</span>
            <span>R$ ${fatura.valor_total.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        <div class="observacoes">
          <div class="observacoes-title">Informações de Pagamento</div>
          <p>Favor realizar o pagamento até o dia 10 do mês seguinte.</p>
          <p><strong>Banco:</strong> [Nome do Banco] | <strong>Agência:</strong> XXXX | <strong>Conta:</strong> XXXXX-X</p>
          <p><strong>PIX (CNPJ):</strong> XX.XXX.XXX/XXXX-XX</p>
        </div>

        <div class="footer">
          <p><strong>CENTRO VIDA SAÚDE</strong></p>
          <p>Sistema desenvolvido por Glória Virtual - Soluções com Inteligência Artificial</p>
          <p>gloriavirtual.com | CNPJ: 51.424.200/0001-02</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const exportarFaturaCSV = (fatura) => {
    const mesReferencia = format(new Date(fatura.mes_referencia + '-01T00:00:00'), "MMMM-yyyy", { locale: ptBR });
    const itensOrdenados = [...fatura.itens].sort((a, b) => a.data.localeCompare(b.data));

    let csv = "Data,Paciente,Serviço,Profissional,Valor\n";
    itensOrdenados.forEach(item => {
      csv += `${format(new Date(item.data + 'T00:00:00'), "dd/MM/yyyy")},"${item.paciente_nome}","${item.servico}","${item.medico_nome}",${item.valor.toFixed(2)}\n`;
    });
    csv += `\nTOTAL,,,R$,${fatura.valor_total.toFixed(2)}`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Fatura_${fatura.categoria_nome.replace(/\s+/g, '_')}_${mesReferencia}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              Faturas de Órgãos Públicos
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDebugMode(!debugMode)}
            >
              {debugMode ? "🐛 Debug ON" : "Debug OFF"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {debugMode && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
              <strong>🐛 Debug Info:</strong>
              <pre className="mt-2 text-xs overflow-auto">
                Total OS: {ordensServico.length}
                {'\n'}OS Pagas: {ordensServico.filter(os => os.status_pagamento === "Pago").length}
                {'\n'}Com Categoria: {ordensServico.filter(os => os.categoria_preco_id).length}
                {'\n'}Faturas Geradas: {faturas.length}
              </pre>
              <div className="mt-2">
                <strong>Verifique o console (F12) para mais detalhes</strong>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const value = format(date, 'yyyy-MM');
                    const label = format(date, "MMMM 'de' yyyy", { locale: ptBR });
                    return (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-500" />
              <Select value={categoriaSelecionada} onValueChange={setCategoriaSelecionada}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Categorias</SelectItem>
                  {categoriasDisponiveis.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <Select value={filtroProfissional} onValueChange={setFiltroProfissional}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Todos os profissionais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Profissionais</SelectItem>
                  {opcoesFiltro.profissionais.map(prof => (
                    <SelectItem key={prof.id} value={prof.id}>
                      {prof.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" />
              <Select value={filtroServico} onValueChange={setFiltroServico}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Todos os serviços" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Serviços</SelectItem>
                  {opcoesFiltro.servicos.map(serv => (
                    <SelectItem key={serv} value={serv}>
                      {serv}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {faturasFiltradas.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Nenhuma fatura encontrada</p>
              <p className="text-sm">Não há atendimentos faturáveis para o período selecionado.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {faturasFiltradas.map((fatura) => (
                <Card key={fatura.categoria_id} className="border-2 border-green-200">
                  <CardHeader className="bg-green-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl text-green-800 mb-2">
                          {fatura.categoria_nome}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>📅 {format(new Date(fatura.mes_referencia + '-01T00:00:00'), "MMMM 'de' yyyy", { locale: ptBR })}</span>
                          <span>👥 {fatura.quantidade_atendimentos} atendimento(s)</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className="bg-green-600 text-white text-lg px-4 py-2">
                          <DollarSign className="w-4 h-4 mr-1" />
                          R$ {fatura.valor_total.toFixed(2).replace('.', ',')}
                        </Badge>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportarFaturaCSV(fatura)}
                            className="gap-2"
                          >
                            <Download className="w-4 h-4" />
                            Exportar CSV
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => imprimirFatura(fatura)}
                            className="bg-green-600 hover:bg-green-700 gap-2"
                          >
                            <Printer className="w-4 h-4" />
                            Imprimir Fatura
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Paciente</TableHead>
                            <TableHead>Serviço</TableHead>
                            <TableHead>Profissional</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fatura.itens
                            .sort((a, b) => a.data.localeCompare(b.data))
                            .map((item, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">
                                  {format(new Date(item.data + 'T00:00:00'), "dd/MM/yyyy")}
                                </TableCell>
                                <TableCell>{item.paciente_nome}</TableCell>
                                <TableCell>{item.servico}</TableCell>
                                <TableCell>{item.medico_nome}</TableCell>
                                <TableCell className="text-right font-medium">
                                  R$ {item.valor.toFixed(2).replace('.', ',')}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}