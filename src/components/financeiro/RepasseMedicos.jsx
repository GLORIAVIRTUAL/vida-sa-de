import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, DollarSign, CheckCircle, Clock, Receipt } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrdemServico, Lancamento } from "@/entities/all";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function RepasseMedicos({ ordensServico, medicos, pacientes, onRepasseRealizado }) {
  const [filtroData, setFiltroData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [medicoSelecionado, setMedicoSelecionado] = useState(null);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [processando, setProcessando] = useState(false);

  // Agrupar OS por médico para o dia selecionado
  const repassesPorMedico = useMemo(() => {
    const ordensDoDia = ordensServico.filter(os =>
      os.data_execucao === filtroData &&
      os.status_pagamento === "Pago" &&
      os.status_pagamento !== "Cancelado" &&
      os.valor_repasse_medico > 0 &&
      !os.repasse_realizado
    );

    const grupos = {};

    ordensDoDia.forEach(os => {
      if (!os.medico_id) return;

      // SEPARAÇÃO RAMÃO/LIDIANE: usar gerado_por para separar repasses de odonto
      const medico = medicos.find(m => m.id === os.medico_id);
      
      // Se é odonto (Ramão ou Lidiane) E tem gerado_por, usar gerado_por como chave
      // Senão, usar medico_id normal
      let chaveGrupo = os.medico_id;
      if (medico && medico.especialidade === 'Odontologia' && os.gerado_por) {
        chaveGrupo = `${os.medico_id}_${os.gerado_por}`;
      }

      if (!grupos[chaveGrupo]) {
        grupos[chaveGrupo] = {
          medico,
          gerado_por: os.gerado_por || null,
          ordens: [],
          total_bruto: 0,
          total_imposto: 0,
          total_repasse: 0,
          total_clinica: 0,
          quantidade: 0
        };
      }

      grupos[chaveGrupo].ordens.push(os);
      grupos[chaveGrupo].total_bruto += os.valor_final || 0;
      grupos[chaveGrupo].total_imposto += os.valor_imposto || 0;
      grupos[chaveGrupo].total_repasse += os.valor_repasse_medico || 0;
      grupos[chaveGrupo].total_clinica += os.valor_clinica || 0;
      grupos[chaveGrupo].quantidade += 1;
    });

    return Object.values(grupos);
  }, [ordensServico, medicos, filtroData]);

  const handleAbrirPagamento = (grupoMedico) => {
    setMedicoSelecionado(grupoMedico);
    setObservacoes(`Repasse referente a ${grupoMedico.quantidade} atendimento(s) do dia ${format(new Date(filtroData + 'T00:00:00'), "dd/MM/yyyy")}`);
    setModalPagamento(true);
  };

  const handleRealizarPagamento = async () => {
    if (!medicoSelecionado) return;

    setProcessando(true);
    try {
      // 1. Criar lançamento de saída para o repasse
      await Lancamento.create({
        tipo: "Saída",
        categoria: "Repasse Médico",
        descricao: `Repasse Dr(a). ${medicoSelecionado.medico.nome} - ${medicoSelecionado.quantidade} atendimento(s)`,
        valor: medicoSelecionado.total_repasse,
        data_lancamento: filtroData,
        forma_pagamento: "PIX",
        medico_id: medicoSelecionado.medico.id,
        status: "Realizado",
        observacoes: observacoes
      });

      console.log("✅ Lançamento de repasse registrado com sucesso!");

      // 2. Marcar todas as OS como tendo repasse realizado
      const dataRepasseAtual = new Date().toISOString();

      for (const os of medicoSelecionado.ordens) {
        await OrdemServico.update(os.id, {
          repasse_realizado: true,
          data_repasse: dataRepasseAtual
        });
        console.log(`✅ OS ${os.id} marcada como repasse realizado`);
      }

      console.log("✅ Todas as OS foram atualizadas!");

      // 3. Fechar modal primeiro
      setModalPagamento(false);

      // 4. Gerar comprovante (APÓS fechar o modal)
      // Adicionar um pequeno atraso para garantir que o modal de diálogo tenha sido fechado visualmente,
      // o que pode ajudar a evitar bloqueadores de pop-up em alguns navegadores.
      setTimeout(() => {
        gerarComprovante(medicoSelecionado);
      }, 300);

      // 5. Limpar estado
      setMedicoSelecionado(null);
      setObservacoes("");

      // 6. Recarregar dados
      if (onRepasseRealizado) {
        await onRepasseRealizado();
      }

      alert("✅ Repasse realizado com sucesso!");

    } catch (error) {
      console.error("❌ Erro ao realizar repasse:", error);
      alert("Erro ao realizar repasse. Tente novamente.");
    } finally {
      setProcessando(false);
    }
  };

  const gerarComprovante = (grupoMedico) => {
    try {
      const dataAtual = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const dataRepasse = format(new Date(filtroData + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Comprovante de Repasse Médico</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              color: #333;
            }
            .header {
              display: flex;
              align-items: center;
              border-bottom: 3px solid #10b981;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo { width: 80px; height: 80px; margin-right: 20px; }
            .clinic-name { font-size: 24px; font-weight: bold; color: #10b981; }
            .comprovante-title {
              font-size: 28px;
              font-weight: bold;
              text-align: center;
              margin: 30px 0;
              color: #1f2937;
            }
            .info-box {
              background: #f3f4f6;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 20px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .info-row:last-child { border-bottom: none; }
            .info-label { font-weight: bold; color: #6b7280; }
            .info-value { color: #1f2937; }
            .valor-destaque {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 20px;
              border-radius: 12px;
              text-align: center;
              margin: 30px 0;
            }
            .valor-destaque .label { font-size: 14px; opacity: 0.9; }
            .valor-destaque .valor { font-size: 36px; font-weight: bold; margin-top: 10px; }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            th {
              background: #f3f4f6;
              padding: 12px;
              text-align: left;
              font-weight: 600;
              border-bottom: 2px solid #e5e7eb;
            }
            td {
              padding: 10px 12px;
              border-bottom: 1px solid #e5e7eb;
            }
            .assinatura {
              margin-top: 60px;
              text-align: center;
            }
            .assinatura-linha {
              border-top: 2px solid #333;
              width: 300px;
              margin: 0 auto;
              padding-top: 10px;
            }
            .footer {
              margin-top: 50px;
              padding-top: 20px;
              border-top: 2px solid #e5e7eb;
              text-align: center;
              font-size: 12px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo" class="logo">
            <div>
              <div class="clinic-name">CENTRO VIDA SAÚDE</div>
              <div style="font-size: 14px; color: #6b7280;">Comprovante de Repasse Médico</div>
            </div>
          </div>

          <div class="comprovante-title">💰 COMPROVANTE DE REPASSE</div>

          <div class="info-box">
            <div class="info-row">
              <span class="info-label">Data do Repasse:</span>
              <span class="info-value">${dataRepasse}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Emitido em:</span>
              <span class="info-value">${dataAtual}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Médico(a):</span>
              <span class="info-value">Dr(a). ${grupoMedico.medico.nome}</span>
            </div>
            <div class="info-row">
              <span class="info-label">CRM:</span>
              <span class="info-value">${grupoMedico.medico.crm}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Especialidade:</span>
              <span class="info-value">${grupoMedico.medico.especialidade}</span>
            </div>
          </div>

          <div class="valor-destaque">
            <div class="label">VALOR TOTAL DO REPASSE</div>
            <div class="valor">R$ ${grupoMedico.total_repasse.toFixed(2)}</div>
            <div style="font-size: 12px; margin-top: 10px; opacity: 0.9;">
              (Valor líquido)
            </div>
          </div>

          <h3>Detalhamento dos Atendimentos</h3>
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Serviço</th>
                <th>Valor Total</th>
                <th>Repasse</th>
              </tr>
            </thead>
            <tbody>
              ${grupoMedico.ordens.map(os => {
                const paciente = pacientes.find(p => p.id === os.paciente_id);
                const nomePaciente = paciente?.nome || os.paciente_nome || 'N/A';
                return `
                  <tr>
                    <td>${nomePaciente}</td>
                    <td>${os.tipo_servico}</td>
                    <td>R$ ${os.valor_final.toFixed(2)}</td>
                    <td><strong>R$ ${os.valor_repasse_medico.toFixed(2)}</strong></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="info-box">
            <div class="info-row">
              <span class="info-label">Total de Atendimentos:</span>
              <span class="info-value">${grupoMedico.quantidade}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Valor Bruto Total:</span>
              <span class="info-value">R$ ${grupoMedico.total_bruto.toFixed(2)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Valor Repasse (líquido):</span>
              <span class="info-value"><strong>R$ ${grupoMedico.total_repasse.toFixed(2)}</strong></span>
            </div>
            <div class="info-row">
              <span class="info-label">Valor Clínica:</span>
              <span class="info-value">R$ ${grupoMedico.total_clinica.toFixed(2)}</span>
            </div>
          </div>

          <div class="assinatura">
            <div class="assinatura-linha">
              Assinatura do Responsável Financeiro
            </div>
          </div>

          <div class="footer">
            <strong>Centro Vida Saúde</strong><br>
            Documento gerado automaticamente pelo sistema | gloriavirtual.com
          </div>
        </body>
        </html>
      `;

      // SOLUÇÃO: Verificar se o popup foi bloqueado
      const printWindow = window.open('', '_blank', 'width=800,height=600');

      if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
        // Popup foi bloqueado
        console.error("❌ Popup bloqueado pelo navegador");
        alert("⚠️ Por favor, permita popups para este site para imprimir o comprovante.\n\nVocê pode imprimir posteriormente pela lista de repasses.");
        return;
      }

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Aguardar carregar e então imprimir
      printWindow.onload = function() {
        printWindow.print();
      };

    } catch (error) {
      console.error("❌ Erro ao gerar comprovante:", error);
      alert("Erro ao gerar comprovante. O repasse foi realizado com sucesso.");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Receipt className="w-6 h-6 text-green-600" />
              Realizar Repasses Médicos
            </span>
          </CardTitle>
          <p className="text-sm text-gray-600">
            Registre os pagamentos aos médicos e gere comprovantes
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Data dos Atendimentos</Label>
            <input
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="w-full p-2 border rounded-md"
            />
          </div>

          {repassesPorMedico.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhum repasse pendente para esta data</p>
              <p className="text-sm mt-2">Repasses aparecem aqui após as OS serem pagas e ainda não tiverem repasse realizado.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {repassesPorMedico.map((grupo) => (
                <Card key={grupo.medico.id} className="border-2 border-gray-200 hover:border-green-300 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900">
                          Dr(a). {grupo.medico.nome}
                          {grupo.gerado_por && (
                            <span className="text-sm font-normal text-blue-600 ml-2">
                              (OS geradas por {grupo.gerado_por})
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-600">{grupo.medico.especialidade} - CRM: {grupo.medico.crm}</p>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                          <div className="bg-blue-50 p-3 rounded">
                            <p className="text-xs text-blue-600 font-semibold">ATENDIMENTOS</p>
                            <p className="text-2xl font-bold text-blue-900">{grupo.quantidade}</p>
                          </div>
                          <div className="bg-gray-50 p-3 rounded">
                            <p className="text-xs text-gray-600 font-semibold">VALOR BRUTO</p>
                            <p className="text-lg font-bold text-gray-900">R$ {grupo.total_bruto.toFixed(2)}</p>
                          </div>
                          {grupo.total_imposto > 0 && (
                            <div className="bg-red-50 p-3 rounded">
                              <p className="text-xs text-red-600 font-semibold">IMPOSTOS (10%)</p>
                              <p className="text-lg font-bold text-red-900">- R$ {grupo.total_imposto.toFixed(2)}</p>
                            </div>
                          )}
                          <div className="bg-green-50 p-3 rounded">
                            <p className="text-xs text-green-600 font-semibold">REPASSE</p>
                            <p className="text-2xl font-bold text-green-900">R$ {grupo.total_repasse.toFixed(2)}</p>
                          </div>
                          <div className="bg-purple-50 p-3 rounded">
                            <p className="text-xs text-purple-600 font-semibold">CLÍNICA</p>
                            <p className="text-lg font-bold text-purple-900">R$ {grupo.total_clinica.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="ml-4">
                        <Button
                          onClick={() => handleAbrirPagamento(grupo)}
                          className="bg-green-600 hover:bg-green-700 gap-2"
                        >
                          <DollarSign className="w-4 h-4" />
                          Realizar Repasse
                        </Button>
                      </div>
                    </div>

                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                        Ver detalhes dos {grupo.quantidade} atendimento(s)
                      </summary>
                      <Table className="mt-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Paciente</TableHead>
                            <TableHead>Serviço</TableHead>
                            <TableHead>Valor Total</TableHead>
                            <TableHead>Repasse</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grupo.ordens.map(os => {
                            const paciente = pacientes.find(p => p.id === os.paciente_id);
                            const nomePaciente = paciente?.nome || os.paciente_nome || 'N/A';
                            return (
                              <TableRow key={os.id}>
                                <TableCell>{nomePaciente}</TableCell>
                                <TableCell>{os.tipo_servico}</TableCell>
                                <TableCell>R$ {os.valor_final.toFixed(2)}</TableCell>
                                <TableCell className="font-bold text-green-600">
                                  R$ {os.valor_repasse_medico.toFixed(2)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </details>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Confirmação de Pagamento */}
      <Dialog open={modalPagamento} onOpenChange={setModalPagamento}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Repasse Médico</DialogTitle>
          </DialogHeader>

          {medicoSelecionado && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Médico(a)</p>
                <p className="font-bold text-lg">Dr(a). {medicoSelecionado.medico.nome}</p>
              </div>

              <div className="bg-green-50 p-4 rounded border-2 border-green-200">
                <p className="text-sm text-green-600 font-semibold">Valor do Repasse</p>
                <p className="font-bold text-3xl text-green-900">
                  R$ {medicoSelecionado.total_repasse.toFixed(2)}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  {medicoSelecionado.quantidade} atendimento(s) • Valor líquido
                </p>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Observações sobre o repasse..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalPagamento(false)} disabled={processando}>
              Cancelar
            </Button>
            <Button
              onClick={handleRealizarPagamento}
              disabled={processando}
              className="bg-green-600 hover:bg-green-700"
            >
              {processando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirmar Pagamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}