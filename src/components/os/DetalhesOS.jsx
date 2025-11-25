
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  FileText, 
  User, 
  Stethoscope, 
  Calendar, 
  DollarSign, 
  CreditCard,
  Receipt,
  TrendingDown,
  Building2,
  Printer
} from "lucide-react";

const statusPagamentoColors = {
  "Pendente": "bg-yellow-100 text-yellow-800",
  "Pago": "bg-green-100 text-green-800",
  "Cancelado": "bg-red-100 text-red-800"
};

export default function DetalhesOS({ os, pacienteNome, medicoNome, open, onClose }) {
  if (!os) return null;

  // Calcular imposto (10%)
  const valorImposto = os.valor_final * 0.10;
  const valorAposImposto = os.valor_final - valorImposto;

  const dataExecucao = os.data_execucao ? new Date(os.data_execucao + 'T00:00:00') : null;

  const handleImprimir = () => {
    const dataAtual = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ordem de Serviço - ${os.numero_os || os.id}</title>
        <style>
          @media print {
            @page { margin: 1cm; }
            body { margin: 0; }
            .no-print { display: none; }
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
            border-bottom: 3px solid #3b82f6;
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
            color: #3b82f6;
            margin: 0;
          }
          .clinic-details {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
          }
          .os-number {
            text-align: right;
          }
          .os-number-label {
            font-size: 12px;
            color: #666;
            margin: 0;
          }
          .os-number-value {
            font-size: 28px;
            font-weight: bold;
            color: #3b82f6;
            margin: 5px 0;
          }
          .os-title { 
            font-size: 22px; 
            font-weight: bold; 
            text-align: center;
            margin: 30px 0 20px 0;
            color: #1f2937;
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
            color: #3b82f6;
            margin: 0 0 15px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #3b82f6;
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
            flex: 0 0 40%;
          }
          .info-value {
            color: #1f2937;
            flex: 1;
            text-align: right;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }
          .status-pago {
            background-color: #d1fae5;
            color: #065f46;
          }
          .status-pendente {
            background-color: #fef3c7;
            color: #92400e;
          }
          .status-cancelado {
            background-color: #fee2e2;
            color: #991b1b;
          }
          .totals-section {
            margin: 30px 0;
            padding: 20px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
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
            font-size: 24px;
            font-weight: bold;
            border-top: 2px solid rgba(255,255,255,0.3);
            padding-top: 15px;
            margin-top: 10px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          .items-table th {
            background-color: #3b82f6;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
          }
          .items-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e5e7eb;
          }
          .items-table tr:nth-child(even) {
            background-color: #f9fafb;
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
            background-color: #fffbeb;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .observacoes-title {
            font-weight: bold;
            color: #92400e;
            margin-bottom: 8px;
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
          <div class="os-number">
            <p class="os-number-label">Ordem de Serviço</p>
            <p class="os-number-value">#${os.numero_os || os.id?.substring(0, 8)}</p>
            <p class="os-number-label">${dataAtual}</p>
          </div>
        </div>

        <h2 class="os-title">ORDEM DE SERVIÇO</h2>

        <div class="section">
          <h3 class="section-title">Informações do Paciente</h3>
          <div class="info-row">
            <span class="info-label">Nome:</span>
            <span class="info-value">${pacienteNome}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Data de Execução:</span>
            <span class="info-value">${dataExecucao ? format(dataExecucao, "dd/MM/yyyy", { locale: ptBR }) : 'N/A'}</span>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">Informações do Atendimento</h3>
          <div class="info-row">
            <span class="info-label">Profissional:</span>
            <span class="info-value">${medicoNome}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Tipo de Serviço:</span>
            <span class="info-value">${os.tipo_servico}</span>
          </div>
        </div>

        ${os.itens && os.itens.length > 0 ? `
        <div class="section">
          <h3 class="section-title">Itens do Serviço</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th style="text-align: center;">Qtd</th>
                <th style="text-align: right;">Valor Unit.</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${os.itens.map(item => `
                <tr>
                  <td>${item.descricao}</td>
                  <td style="text-align: center;">${item.quantidade}</td>
                  <td style="text-align: right;">R$ ${item.valor_unitario?.toFixed(2) || '0.00'}</td>
                  <td style="text-align: right;">R$ ${item.valor_total?.toFixed(2) || '0.00'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div class="totals-section">
          <div class="total-row">
            <span>Valor Total:</span>
            <span>R$ ${os.valor_total?.toFixed(2) || '0.00'}</span>
          </div>
          ${os.desconto && os.desconto > 0 ? `
          <div class="total-row">
            <span>Desconto:</span>
            <span>- R$ ${os.desconto.toFixed(2)}</span>
          </div>
          ` : ''}
          ${os.juros && os.juros > 0 ? `
          <div class="total-row">
            <span>Juros:</span>
            <span>+ R$ ${os.juros.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="total-row total-final">
            <span>VALOR FINAL:</span>
            <span>R$ ${os.valor_final?.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">Informações de Pagamento</h3>
          <div class="info-row">
            <span class="info-label">Forma de Pagamento:</span>
            <span class="info-value">${os.forma_pagamento}</span>
          </div>
          ${os.parcelas && os.parcelas > 1 ? `
          <div class="info-row">
            <span class="info-label">Parcelas:</span>
            <span class="info-value">${os.parcelas}x de R$ ${(os.valor_final / os.parcelas).toFixed(2)}</span>
          </div>
          ` : ''}
          ${os.bandeira_cartao ? `
          <div class="info-row">
            <span class="info-label">Bandeira do Cartão:</span>
            <span class="info-value">${os.bandeira_cartao}</span>
          </div>
          ` : ''}
          <div class="info-row">
            <span class="info-label">Status do Pagamento:</span>
            <span class="info-value">
              <span class="status-badge status-${os.status_pagamento.toLowerCase()}">${os.status_pagamento}</span>
            </span>
          </div>
        </div>

        ${os.observacoes ? `
        <div class="observacoes">
          <div class="observacoes-title">Observações:</div>
          <div>${os.observacoes}</div>
        </div>
        ` : ''}

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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Detalhes da Ordem de Serviço
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImprimir}
              className="gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir OS
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status e Data */}
          <div className="flex items-center justify-between">
            <Badge className={`${statusPagamentoColors[os.status_pagamento]} text-sm px-4 py-1`}>
              {os.status_pagamento}
            </Badge>
            <div className="text-sm text-gray-600">
              <Calendar className="w-4 h-4 inline mr-1" />
              {dataExecucao && !isNaN(dataExecucao.getTime()) 
                ? format(dataExecucao, "dd/MM/yyyy", { locale: ptBR })
                : 'Data inválida'
              }
            </div>
          </div>

          <Separator />

          {/* Informações do Paciente e Médico */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-blue-900">Paciente</h4>
              </div>
              <p className="text-lg">{pacienteNome}</p>
            </div>

            {medicoNome && medicoNome !== 'N/A' && (
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Stethoscope className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-green-900">Médico</h4>
                </div>
                <p className="text-lg">{medicoNome}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Tipo de Serviço */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Tipo de Serviço</h4>
            <Badge variant="outline" className="text-base px-3 py-1">
              {os.tipo_servico}
            </Badge>
          </div>

          {/* Itens da OS (se houver) */}
          {os.itens && os.itens.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold text-gray-700 mb-3">Itens do Serviço</h4>
                <div className="space-y-2">
                  {os.itens.map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                      <div>
                        <p className="font-medium">{item.descricao}</p>
                        <p className="text-sm text-gray-600">
                          Quantidade: {item.quantidade} × R$ {item.valor_unitario?.toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold text-lg">
                        R$ {item.valor_total?.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Valores Financeiros */}
          <div className="bg-gray-50 p-6 rounded-lg space-y-3">
            <h4 className="font-semibold text-gray-900 text-lg mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Resumo Financeiro
            </h4>

            {/* Valor Total Original */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Valor Total:</span>
              <span className="text-lg font-medium">R$ {os.valor_total?.toFixed(2)}</span>
            </div>

            {/* Desconto */}
            {os.desconto > 0 && (
              <div className="flex justify-between items-center text-green-600">
                <span>Desconto:</span>
                <span className="font-medium">- R$ {os.desconto?.toFixed(2)}</span>
              </div>
            )}

            {/* Juros */}
            {os.juros > 0 && (
              <div className="flex justify-between items-center text-orange-600">
                <span>Juros ({os.parcelas}x):</span>
                <span className="font-medium">+ R$ {os.juros?.toFixed(2)}</span>
              </div>
            )}

            <Separator />

            {/* Valor Final */}
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-900">Valor Final:</span>
              <span className="text-2xl font-bold text-blue-600">
                R$ {os.valor_final?.toFixed(2)}
              </span>
            </div>

            <Separator className="my-4" />

            {/* IMPOSTO (10%) */}
            <div className="flex justify-between items-center bg-red-50 p-3 rounded border-l-4 border-red-400">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-red-600" />
                <span className="font-medium text-red-900">Imposto (10%):</span>
              </div>
              <span className="text-lg font-bold text-red-600">
                - R$ {valorImposto.toFixed(2)}
              </span>
            </div>

            {/* Valor após imposto */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Valor após Imposto:</span>
              <span className="text-lg font-medium">R$ {valorAposImposto.toFixed(2)}</span>
            </div>

            <Separator className="my-4" />

            {/* REPASSE MÉDICO */}
            {os.valor_repasse_medico && os.valor_repasse_medico > 0 && (
              <div className="flex justify-between items-center bg-purple-50 p-3 rounded border-l-4 border-purple-400">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-purple-600" />
                  <span className="font-medium text-purple-900">Repasse Médico:</span>
                </div>
                <span className="text-lg font-bold text-purple-600">
                  - R$ {os.valor_repasse_medico.toFixed(2)}
                </span>
              </div>
            )}

            {/* REPASSE LABORATÓRIO */}
            {os.valor_repasse_laboratorio && os.valor_repasse_laboratorio > 0 && (
              <div className="flex justify-between items-center bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">Repasse Laboratório:</span>
                </div>
                <span className="text-lg font-bold text-blue-600">
                  - R$ {os.valor_repasse_laboratorio.toFixed(2)}
                </span>
              </div>
            )}

            <Separator className="my-4" />

            {/* VALOR CLÍNICA */}
            {os.valor_clinica !== undefined && os.valor_clinica !== null && (
              <div className="flex justify-between items-center bg-green-50 p-4 rounded-lg border-2 border-green-400">
                <div className="flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-green-600" />
                  <span className="font-bold text-green-900 text-lg">Valor Clínica:</span>
                </div>
                <span className="text-2xl font-bold text-green-600">
                  R$ {os.valor_clinica.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <Separator />

          {/* Forma de Pagamento */}
          <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">Forma de Pagamento:</span>
            </div>
            <span className="text-lg">{os.forma_pagamento}</span>
          </div>

          {os.parcelas > 1 && (
            <div className="text-sm text-gray-600 bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
              <strong>Parcelamento:</strong> {os.parcelas}x no cartão de crédito
              {os.bandeira_cartao && ` (${os.bandeira_cartao})`}
            </div>
          )}

          {/* Observações */}
          {os.observacoes && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Observações</h4>
                <p className="text-gray-600 bg-gray-50 p-3 rounded">{os.observacoes}</p>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <DialogClose asChild>
            <Button variant="outline">Fechar</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
