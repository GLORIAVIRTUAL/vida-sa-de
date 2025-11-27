import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ReciboVenda({ venda, onClose }) {
  // Função para converter número em valor por extenso
  const valorPorExtenso = (valor) => {
    const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const especiais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    if (valor === 0) return 'zero reais';
    if (valor === 100) return 'cem reais';

    const partes = valor.toFixed(2).split('.');
    const inteiro = parseInt(partes[0]);
    const centavos = parseInt(partes[1]);

    let extenso = '';

    if (inteiro > 0) {
      if (inteiro >= 1000) {
        const milhares = Math.floor(inteiro / 1000);
        if (milhares === 1) {
          extenso += 'mil';
        } else {
          extenso += unidades[milhares] + ' mil';
        }
        const resto = inteiro % 1000;
        if (resto > 0) extenso += ' ';
      }

      const resto = inteiro % 1000;
      if (resto >= 100) {
        if (resto === 100) {
          extenso += 'cem';
        } else {
          extenso += centenas[Math.floor(resto / 100)];
          if (resto % 100 > 0) extenso += ' e ';
        }
      }

      const dezena = resto % 100;
      if (dezena >= 10 && dezena <= 19) {
        extenso += especiais[dezena - 10];
      } else if (dezena >= 20) {
        extenso += dezenas[Math.floor(dezena / 10)];
        if (dezena % 10 > 0) extenso += ' e ' + unidades[dezena % 10];
      } else if (dezena > 0) {
        extenso += unidades[dezena];
      }

      extenso += inteiro === 1 ? ' real' : ' reais';
    }

    if (centavos > 0) {
      if (inteiro > 0) extenso += ' e ';
      if (centavos >= 10 && centavos <= 19) {
        extenso += especiais[centavos - 10];
      } else if (centavos >= 20) {
        extenso += dezenas[Math.floor(centavos / 10)];
        if (centavos % 10 > 0) extenso += ' e ' + unidades[centavos % 10];
      } else {
        extenso += unidades[centavos];
      }
      extenso += centavos === 1 ? ' centavo' : ' centavos';
    }

    return extenso.charAt(0).toUpperCase() + extenso.slice(1);
  };

  const handleImprimir = () => {
    const dataAtual = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
    const dataVenda = venda.data_venda ? format(new Date(venda.data_venda), "dd/MM/yyyy", { locale: ptBR }) : dataAtual;
    const numeroRecibo = venda.numero_venda || 'N/A';
    const valorFormatado = venda.valor_total?.toFixed(2).replace('.', ',') || '0,00';
    const valorExtenso = valorPorExtenso(venda.valor_total || 0);
    
    // Descrição do serviço
    const descricaoServico = `${dataVenda} - Cartão Mais Vida (${venda.tipo_plano}) - R$ ${valorFormatado}`;

    // Info de pagamento
    let infoPagamento = venda.forma_pagamento || 'Dinheiro';
    if (venda.numero_parcelas && venda.numero_parcelas > 1) {
      infoPagamento += `: R$ ${valorFormatado}`;
      infoPagamento += `<br/>- Parcelamentos: ${venda.numero_parcelas}x`;
    } else {
      infoPagamento += `: R$ ${valorFormatado}`;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Recibo ${numeroRecibo}</title>
        <style>
          @media print {
            @page { 
              size: A4; 
              margin: 10mm; 
            }
            body { 
              margin: 0; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          * {
            box-sizing: border-box;
          }
          body { 
            font-family: Arial, sans-serif; 
            margin: 0;
            padding: 10px;
            color: #333;
            font-size: 11px;
          }
          .container {
            display: flex;
            gap: 15px;
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
          }
          /* Canhoto - lado esquerdo */
          .canhoto {
            width: 30%;
            border: 2px solid #333;
            padding: 15px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 280px;
          }
          .canhoto-header {
            margin-bottom: 15px;
          }
          .canhoto-row {
            display: flex;
            margin-bottom: 8px;
          }
          .canhoto-label {
            font-weight: bold;
            width: 60px;
          }
          .canhoto-value {
            flex: 1;
          }
          .canhoto-nome {
            margin: 15px 0;
            font-size: 10px;
          }
          .canhoto-referente {
            margin: 15px 0;
            font-size: 10px;
            border-top: 1px solid #ccc;
            padding-top: 10px;
          }
          .canhoto-recibo-num {
            margin-top: auto;
            font-weight: bold;
          }

          /* Recibo principal - lado direito */
          .recibo {
            width: 70%;
            border: 2px solid #333;
            padding: 15px;
            min-height: 280px;
            display: flex;
            flex-direction: column;
          }
          .recibo-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #ddd;
          }
          .logo-section {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .logo {
            width: 50px;
            height: 50px;
            object-fit: contain;
          }
          .clinic-name {
            font-size: 12px;
            font-weight: bold;
            color: #0d9488;
          }
          .recibo-numero {
            text-align: right;
            font-size: 16px;
            font-weight: bold;
          }
          .recibo-body {
            flex: 1;
          }
          .recibo-linha {
            display: flex;
            margin-bottom: 12px;
            align-items: baseline;
          }
          .recibo-label {
            font-weight: bold;
            min-width: 100px;
          }
          .recibo-valor {
            flex: 1;
            border-bottom: 1px solid #333;
            padding-bottom: 2px;
            margin-left: 5px;
          }
          .recibo-referente {
            margin: 15px 0;
          }
          .recibo-recebido {
            background: #f5f5f5;
            padding: 10px;
            border: 1px solid #ddd;
            margin: 15px 0;
          }
          .recibo-recebido-title {
            font-weight: bold;
            margin-bottom: 5px;
          }
          .recibo-footer {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: auto;
            padding-top: 15px;
            border-top: 1px solid #ddd;
          }
          .recibo-endereco {
            font-size: 10px;
            color: #666;
          }
          .recibo-assinatura {
            text-align: center;
          }
          .recibo-assinatura-linha {
            border-top: 1px solid #333;
            width: 180px;
            margin-bottom: 5px;
          }
          .recibo-assinatura-texto {
            font-size: 10px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- CANHOTO -->
          <div class="canhoto">
            <div>
              <div class="canhoto-header">
                <div class="canhoto-row">
                  <span class="canhoto-label">Data:</span>
                  <span class="canhoto-value">${dataVenda}</span>
                </div>
                <div class="canhoto-row">
                  <span class="canhoto-label">Valor:</span>
                  <span class="canhoto-value">${valorFormatado}</span>
                </div>
              </div>
              
              <div class="canhoto-nome">
                <strong>Nome:</strong><br/>
                ${venda.titular.nome}
                ${venda.titular.cpf ? `/ CPF: ${venda.titular.cpf}` : ''}
              </div>
              
              <div class="canhoto-referente">
                <strong>Referente:</strong><br/>
                ${descricaoServico}
              </div>
            </div>
            
            <div class="canhoto-recibo-num">
              Recibo: ${numeroRecibo}
            </div>
          </div>

          <!-- RECIBO PRINCIPAL -->
          <div class="recibo">
            <div class="recibo-header">
              <div class="logo-section">
                <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo" class="logo" />
                <div class="clinic-name">Centro<br/>Vida Saúde</div>
              </div>
              <div class="recibo-numero">
                Recibo ${numeroRecibo} - R$ ${valorFormatado}
              </div>
            </div>

            <div class="recibo-body">
              <div class="recibo-linha">
                <span class="recibo-label">Recebemos de</span>
                <span class="recibo-valor">${venda.titular.nome}${venda.titular.cpf ? ` / CPF: ${venda.titular.cpf}` : ''}</span>
              </div>
              
              <div class="recibo-linha">
                <span class="recibo-label">a importância de</span>
                <span class="recibo-valor">(${valorExtenso})</span>
              </div>

              <div class="recibo-referente">
                <strong>Referente a</strong><br/>
                ${descricaoServico}
              </div>

              <div class="recibo-recebido">
                <div class="recibo-recebido-title">Recebido:</div>
                <div>${infoPagamento}</div>
              </div>
            </div>

            <div class="recibo-footer">
              <div class="recibo-endereco">
                Centro Vida Saúde<br/>
                Av. Tristão Monteiro, Zona nova, Tramandaí
              </div>
              <div class="recibo-assinatura">
                <div>Tramandaí, ${dataAtual}</div>
                <div class="recibo-assinatura-linha"></div>
                <div class="recibo-assinatura-texto">Local / Data / Assinatura</div>
              </div>
            </div>
          </div>
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