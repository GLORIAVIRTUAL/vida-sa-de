
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ReciboVenda({ venda, onClose }) {
  const handleImprimir = () => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Recibo - Cartão Mais Vida</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 40px;
            color: #333;
          }
          .header { 
            text-align: center;
            border-bottom: 3px solid #0d9488; 
            padding-bottom: 20px; 
            margin-bottom: 30px;
          }
          .logo { 
            width: 150px;
            margin-bottom: 10px;
          }
          .clinic-name { 
            font-size: 24px; 
            font-weight: bold; 
            color: #0d9488; 
            margin-bottom: 5px;
          }
          .recibo-numero {
            font-size: 18px;
            font-weight: bold;
            color: #0d9488;
            margin: 20px 0;
          }
          .section { 
            margin-bottom: 25px; 
            page-break-inside: avoid;
          }
          .section-title { 
            font-size: 16px; 
            font-weight: bold; 
            color: #0d9488; 
            border-bottom: 2px solid #e5e7eb; 
            padding-bottom: 6px; 
            margin-bottom: 12px;
          }
          .info-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 10px; 
          }
          .info-item { 
            padding: 8px; 
            background-color: #f9fafb; 
            border-radius: 4px;
          }
          .info-label { 
            font-weight: bold; 
            color: #4b5563; 
            font-size: 11px; 
            text-transform: uppercase; 
            margin-bottom: 3px;
          }
          .info-value { 
            font-size: 14px; 
            color: #111827;
          }
          .valor-total {
            background: #d1fae5;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            margin: 20px 0;
            border: 2px solid #10b981;
          }
          .valor-total-label {
            font-size: 14px;
            color: #059669;
            margin-bottom: 5px;
          }
          .valor-total-value {
            font-size: 32px;
            font-weight: bold;
            color: #047857;
          }
          .dependentes-list {
            background: #f0f9ff;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #3b82f6;
          }
          .dependente-item {
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          .dependente-item:last-child {
            border-bottom: none;
          }
          .footer { 
            margin-top: 40px; 
            text-align: center; 
            color: #64748b; 
            font-size: 12px; 
            border-top: 1px solid #e5e7eb; 
            padding-top: 20px;
          }
          .assinatura {
            margin-top: 60px;
            text-align: center;
          }
          .linha-assinatura {
            border-top: 2px solid #333;
            width: 300px;
            margin: 0 auto 10px;
          }
          .validade-box {
            background: #fef3c7;
            border: 2px solid #fbbf24;
            padding: 12px;
            border-radius: 6px;
            text-align: center;
            margin-top: 20px;
          }
          @media print {
            body { margin: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/9a845de7d_Untitleddesign30.png" 
            alt="Cartão Mais Vida" 
            class="logo"
          />
          <div class="clinic-name">CENTRO VIDA SAÚDE</div>
          <div>Sistema de Gestão Clínica</div>
          <div>CNPJ: 51.424.200/0001-02</div>
        </div>

        <div class="recibo-numero">
          📄 RECIBO DE COMPRA - ${venda.numero_venda || 'N/A'}
        </div>

        <p style="text-align: center; margin-bottom: 30px;">
          Emitido em ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
        </p>

        <!-- Dados do Titular -->
        <div class="section">
          <div class="section-title">👤 Dados do Titular</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Nome Completo</div>
              <div class="info-value">${venda.titular.nome}</div>
            </div>
            <div class="info-item">
              <div class="info-label">CPF</div>
              <div class="info-value">${venda.titular.cpf}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Data de Nascimento</div>
              <div class="info-value">${venda.titular.data_nascimento ? format(new Date(venda.titular.data_nascimento), 'dd/MM/yyyy') : 'Não informado'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Telefone</div>
              <div class="info-value">${venda.titular.telefone || 'Não informado'}</div>
            </div>
          </div>
          
          ${venda.titular.endereco && venda.titular.endereco.logradouro ? `
            <div style="margin-top: 15px;">
              <div class="info-label">Endereço Completo</div>
              <div class="info-value">
                ${venda.titular.endereco.logradouro}, ${venda.titular.endereco.numero || 'S/N'}
                ${venda.titular.endereco.complemento ? ` - ${venda.titular.endereco.complemento}` : ''}
                <br>${venda.titular.endereco.bairro} - ${venda.titular.endereco.cidade}/${venda.titular.endereco.estado}
                <br>CEP: ${venda.titular.endereco.cep || 'Não informado'}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Dependentes -->
        ${venda.dependentes && venda.dependentes.length > 0 ? `
          <div class="section">
            <div class="section-title">👨‍👩‍👧‍👦 Dependentes (${venda.dependentes.length})</div>
            <div class="dependentes-list">
              ${venda.dependentes.map((dep, index) => `
                <div class="dependente-item">
                  <strong>${index + 1}. ${dep.nome}</strong><br>
                  CPF: ${dep.cpf}<br>
                  Nascimento: ${dep.data_nascimento ? format(new Date(dep.data_nascimento), 'dd/MM/yyyy') : 'Não informado'}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Detalhes do Plano -->
        <div class="section">
          <div class="section-title">📋 Detalhes do Plano Contratado</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Plano</div>
              <div class="info-value">${venda.tipo_plano}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Beneficiários</div>
              <div class="info-value">${1 + (venda.dependentes?.length || 0)} pessoa(s)</div>
            </div>
            <div class="info-item">
              <div class="info-label">Cartões Emitidos</div>
              <div class="info-value">${venda.quantidade_cartoes || 1} cartão(ões)</div>
            </div>
            <div class="info-item">
              <div class="info-label">Data da Compra</div>
              <div class="info-value">${format(new Date(venda.data_venda), 'dd/MM/yyyy')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Forma de Pagamento</div>
              <div class="info-value">${venda.forma_pagamento}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Validade</div>
              <div class="info-value">${format(new Date(venda.validade_cartao), 'dd/MM/yyyy')}</div>
            </div>
          </div>

          ${venda.numero_parcelas > 1 ? `
            <div class="info-grid" style="margin-top: 10px;">
              <div class="info-item">
                <div class="info-label">Número de Parcelas</div>
                <div class="info-value">${venda.numero_parcelas}x</div>
              </div>
              <div class="info-item">
                <div class="info-label">Valor da Parcela</div>
                <div class="info-value">R$ ${venda.valor_parcela.toFixed(2)}</div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Detalhamento de Valores -->
        <div class="section">
          <div class="section-title">💰 Detalhamento de Valores</div>
          <div style="background: #f9fafb; padding: 15px; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>Valor do Plano:</span>
              <strong>R$ ${(venda.valor_plano || 0).toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #2563eb;">
              <span>${venda.quantidade_cartoes || 1} Cartão(ões) Físico(s) (R$ 5,00 cada):</span>
              <strong>R$ ${(venda.valor_cartoes || 0).toFixed(2)}</strong>
            </div>
            <div style="border-top: 2px solid #059669; padding-top: 8px; display: flex; justify-content: space-between; font-size: 18px; color: #047857;">
              <span><strong>VALOR TOTAL:</strong></span>
              <strong>R$ ${venda.valor_total.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        ${venda.observacoes ? `
          <div class="section">
            <div class="section-title">📝 Observações</div>
            <p style="background: #f9fafb; padding: 12px; border-radius: 6px; line-height: 1.6;">
              ${venda.observacoes}
            </p>
          </div>
        ` : ''}

        <!-- Assinatura -->
        <div class="assinatura">
          <div class="linha-assinatura"></div>
          <strong>Assinatura do Cliente</strong>
        </div>

        <div class="footer">
          <strong>Centro Vida Saúde - Cartão Mais Vida</strong><br>
          Obrigado por escolher nossos serviços!<br>
          Em caso de dúvidas, entre em contato conosco.
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="flex items-center gap-2">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/9a845de7d_Untitleddesign30.png"
                alt="Cartão Mais Vida"
                className="h-10"
              />
              Recibo de Compra
            </DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleImprimir} className="bg-teal-600 hover:bg-teal-700">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 p-6 bg-white rounded-lg border">
          {/* Header */}
          <div className="text-center border-b pb-4">
            <p className="text-xl font-bold text-teal-700">RECIBO DE COMPRA</p>
            <p className="text-gray-600">{venda.numero_venda || 'N/A'}</p>
            <p className="text-sm text-gray-500 mt-2">
              Emitido em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
            </p>
          </div>

          {/* Titular */}
          <div>
            <h3 className="font-bold text-lg mb-3">👤 Titular</h3>
            <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">Nome</p>
                <p className="font-medium">{venda.titular.nome}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">CPF</p>
                <p className="font-medium">{venda.titular.cpf}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Data Nascimento</p>
                <p className="font-medium">
                  {venda.titular.data_nascimento ? format(new Date(venda.titular.data_nascimento), 'dd/MM/yyyy') : 'Não informado'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Telefone</p>
                <p className="font-medium">{venda.titular.telefone || 'Não informado'}</p>
              </div>
            </div>
          </div>

          {/* Dependentes */}
          {venda.dependentes && venda.dependentes.length > 0 && (
            <div>
              <h3 className="font-bold text-lg mb-3">👨‍👩‍👧‍👦 Dependentes ({venda.dependentes.length})</h3>
              <div className="space-y-2">
                {venda.dependentes.map((dep, index) => (
                  <div key={index} className="bg-blue-50 p-3 rounded-lg">
                    <p className="font-medium">{index + 1}. {dep.nome}</p>
                    <p className="text-sm text-gray-600">CPF: {dep.cpf}</p>
                    <p className="text-sm text-gray-600">
                      Nascimento: {dep.data_nascimento ? format(new Date(dep.data_nascimento), 'dd/MM/yyyy') : 'Não informado'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plano */}
          <div>
            <h3 className="font-bold text-lg mb-3">📋 Plano Contratado</h3>
            <div className="bg-teal-50 p-4 rounded-lg border-2 border-teal-200">
              <p className="text-xl font-bold text-teal-700 mb-2">{venda.tipo_plano}</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Beneficiários</p>
                  <p className="font-medium">{1 + (venda.dependentes?.length || 0)} pessoa(s)</p>
                </div>
                <div>
                  <p className="text-gray-500">Cartões Emitidos</p>
                  <p className="font-medium">{venda.quantidade_cartoes || 1} cartão(ões)</p>
                </div>
                <div>
                  <p className="text-gray-500">Validade</p>
                  <p className="font-medium">{format(new Date(venda.validade_cartao), 'dd/MM/yyyy')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Valores Detalhados */}
          <div>
            <h3 className="font-bold text-lg mb-3">💰 Detalhamento de Valores</h3>
            <div className="bg-gray-50 p-4 rounded-lg border">
              <div className="flex justify-between mb-2">
                <span>Valor do Plano:</span>
                <span className="font-semibold">R$ ${(venda.valor_plano || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between mb-2 text-blue-600">
                <span>{venda.quantidade_cartoes || 1} Cartão(ões) Físico(s) (R$ 5,00 cada):</span>
                <span className="font-semibold">R$ ${(venda.valor_cartoes || 0).toFixed(2)}</span>
              </div>
              <div className="border-t-2 border-green-600 pt-2 mt-2 flex justify-between text-lg">
                <span className="font-bold text-green-700">VALOR TOTAL:</span>
                <span className="font-bold text-green-700">R$ {venda.valor_total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div>
            <h3 className="font-bold text-lg mb-3">💳 Pagamento</h3>
            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Forma de Pagamento:</span>
                <span className="font-medium">{venda.forma_pagamento}</span>
              </div>
              {venda.numero_parcelas > 1 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600">Parcelamento:</span>
                  <span className="font-medium">{venda.numero_parcelas}x de R$ {venda.valor_parcela.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {venda.observacoes && (
            <div>
              <h3 className="font-bold text-lg mb-3">📝 Observações</h3>
              <p className="bg-gray-50 p-4 rounded-lg text-sm">{venda.observacoes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
