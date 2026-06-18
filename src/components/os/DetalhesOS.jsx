import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { User as UserEntity } from "@/entities/all";
import ModalQrCodePix from "./ModalQrCodePix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrdemServico } from "@/entities/OrdemServico";
import { useToast } from "@/components/ui/use-toast";
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
  Printer,
  Edit,
  Save,
  X,
  Loader2,
  RefreshCcw,
  QrCode
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";

const statusPagamentoColors = {
  "Pendente": "bg-yellow-100 text-yellow-800",
  "Pago": "bg-green-100 text-green-800",
  "Cancelado": "bg-red-100 text-red-800"
};

const normalizeString = (str) => {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
};

export default function DetalhesOS({ os, pacienteNome, medicoNome, categoriaNome, open, onClose, onUpdate }) {
  const { toast } = useToast();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [verificandoStatus, setVerificandoStatus] = useState(false);
  const [statusPagamento, setStatusPagamento] = useState(os?.status_pagamento || 'Pendente');
  const [formaPagamento, setFormaPagamento] = useState(os?.forma_pagamento || 'Dinheiro');
  const [valorFinal, setValorFinal] = useState(os?.valor_final || 0);
  const [pagamento1, setPagamento1] = useState({ forma: os?.pagamentos_detalhados?.[0]?.forma || '', valor: os?.pagamentos_detalhados?.[0]?.valor || '' });
  const [pagamento2, setPagamento2] = useState({ forma: os?.pagamentos_detalhados?.[1]?.forma || '', valor: os?.pagamentos_detalhados?.[1]?.valor || '' });

  // PIX Sicredi - liberado para todos os usuários
  const [modalPixAberto, setModalPixAberto] = useState(false);
  const [gerandoPix, setGerandoPix] = useState(false);
  const [qrCodePix, setQrCodePix] = useState('');
  const [erroPix, setErroPix] = useState('');
  const [confirmandoPix, setConfirmandoPix] = useState(false);
  // Confirmação de pagamento Pix nesta sessão (true se o webhook/consulta confirmou)
  const [pixConfirmadoSessao, setPixConfirmadoSessao] = useState(false);

  // Geração de PIX liberada para todos
  const podeGerarPix = true;
  // Todos: só podem salvar "Pago" em OS Pix se houver confirmação do pagamento Pix
  const usuarioRestritoPix = true;

  const handleConfirmarPix = async () => {
    setConfirmandoPix(true);
    try {
      const res = await base44.functions.invoke('confirmarPagamentoPixOS', {
        ordem_servico_id: os.id,
      });
      if (res.data?.success && res.data?.is_paid) {
        setPixConfirmadoSessao(true);
        setStatusPagamento('Pago');
        toast({ title: "Pagamento confirmado!", description: res.data.message, className: "bg-green-50 border-green-200" });
        if (onUpdate) onUpdate();
      } else if (res.data?.success) {
        toast({ title: "Ainda não pago", description: res.data.message || `Status atual: ${res.data.status}`, variant: "destructive" });
      } else {
        toast({ title: "Erro", description: res.data?.details || res.data?.error || "Não foi possível verificar.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro", description: err.message || "Falha ao confirmar pagamento Pix.", variant: "destructive" });
    } finally {
      setConfirmandoPix(false);
    }
  };

  const handleGerarPix = async () => {
    setModalPixAberto(true);
    setGerandoPix(true);
    setQrCodePix('');
    setErroPix('');
    try {
      const res = await base44.functions.invoke('gerarQrCodePix', {
        ordem_servico_id: os.id,
        valor: Number(os.valor_final || 0).toFixed(2),
        descricao: `OS ${os.numero_os || os.id?.substring(0, 6)} - ${pacienteNome || ''}`.trim(),
      });
      if (res.data?.success && res.data?.qr_code) {
        setQrCodePix(res.data.qr_code);
        if (res.data.transaction_id) {
          await OrdemServico.update(os.id, { transaction_id: res.data.transaction_id });
        }
      } else {
        setErroPix(res.data?.details || res.data?.error || 'Não foi possível gerar o Pix.');
      }
    } catch (err) {
      setErroPix(err.message || 'Erro ao gerar Pix.');
    } finally {
      setGerandoPix(false);
    }
  };

  if (!os) return null;

  const handleSalvar = async () => {
    // Regra: usuário restrito só pode salvar "Pago" em OS Pix com confirmação de pagamento
    const ehOsPix = formaPagamento === 'PIX' || !!os.transaction_id;
    if (
      usuarioRestritoPix &&
      statusPagamento === 'Pago' &&
      os.status_pagamento !== 'Pago' &&
      ehOsPix &&
      !pixConfirmadoSessao
    ) {
      toast({
        title: "Confirmação necessária",
        description: "Você só pode marcar como Pago após confirmar o pagamento Pix. Use o botão 'Confirmar Pagamento Pix'.",
        variant: "destructive"
      });
      return;
    }

    setSalvando(true);
    try {
      let pagamentosDetalhados = [];
      if (formaPagamento === 'Múltiplas Formas') {
        if (pagamento1.forma && pagamento1.valor) {
          pagamentosDetalhados.push({ forma: pagamento1.forma, valor: parseFloat(pagamento1.valor) || 0 });
        }
        if (pagamento2.forma && pagamento2.valor) {
          pagamentosDetalhados.push({ forma: pagamento2.forma, valor: parseFloat(pagamento2.valor) || 0 });
        }
      }

      await OrdemServico.update(os.id, {
        status_pagamento: statusPagamento,
        forma_pagamento: formaPagamento,
        pagamentos_detalhados: pagamentosDetalhados,
        valor_final: parseFloat(valorFinal) || 0,
        data_pagamento: statusPagamento === 'Pago' ? new Date().toISOString() : null
      });

      toast({
        title: "Sucesso!",
        description: "Ordem de Serviço atualizada."
      });

      setEditando(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Erro ao atualizar OS:", error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar: " + error.message,
        variant: "destructive"
      });
    } finally {
      setSalvando(false);
    }
  };

  const handleCancelarEdicao = () => {
    setStatusPagamento(os.status_pagamento);
    setFormaPagamento(os.forma_pagamento);
    setValorFinal(os.valor_final || 0);
    setPagamento1({ forma: os?.pagamentos_detalhados?.[0]?.forma || '', valor: os?.pagamentos_detalhados?.[0]?.valor || '' });
    setPagamento2({ forma: os?.pagamentos_detalhados?.[1]?.forma || '', valor: os?.pagamentos_detalhados?.[1]?.valor || '' });
    setEditando(false);
  };

  const handleVerificarStatus = async () => {
    if (!os.transaction_id) {
        toast({ title: "Sem transação", description: "Esta OS não tem ID de transação vinculado.", variant: "destructive" });
        return;
    }
    setVerificandoStatus(true);
    try {
        const res = await base44.functions.invoke('checkStatusOrdemServico', { os_id: os.id });
        if (res.data?.success) {
             const msg = res.data.updated 
                ? `Status atualizado para: ${res.data.status}` 
                : `Status verificado: ${res.data.status} (Sem alterações)`;
             
             toast({ title: "Verificação Concluída", description: msg });
             if (res.data.updated && onUpdate) onUpdate();
             
             // Atualiza localmente se não houver reload completo
             if (res.data.status) setStatusPagamento(res.data.status);
        } else {
             toast({ title: "Erro na verificação", description: res.data?.error || "Erro desconhecido", variant: "destructive" });
        }
    } catch (err) {
        console.error(err);
        toast({ title: "Erro", description: "Falha ao verificar status.", variant: "destructive" });
    } finally {
        setVerificandoStatus(false);
    }
  };

  // Verificar se a categoria é isenta de imposto (Particular ou Cartão Mais Vida)
  const categoriaNormalizada = normalizeString(categoriaNome);
  const isParticular = categoriaNormalizada === 'PARTICULAR';
  const isCartaoMaisVida = categoriaNormalizada.includes('CARTAO') && categoriaNormalizada.includes('MAIS') && categoriaNormalizada.includes('VIDA');
  const isentoImposto = isParticular || isCartaoMaisVida;

  // Calcular imposto (10%) apenas para categorias não isentas
  const valorImposto = isentoImposto ? 0 : os.valor_final * 0.10;
  const valorAposImposto = os.valor_final - valorImposto;

  const rawDataExecucao = os.data_execucao ? new Date(os.data_execucao + 'T00:00:00') : null;
  const dataExecucao = rawDataExecucao && !isNaN(rawDataExecucao.getTime()) ? rawDataExecucao : null;

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

  const handleImprimirRecibo = () => {
    const dataAtual = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
    const numeroRecibo = os.numero_os || os.id?.substring(0, 6).toUpperCase();
    const valorFormatado = os.valor_final?.toFixed(2).replace('.', ',') || '0,00';
    const valorExtenso = valorPorExtenso(os.valor_final || 0);
    
    // Descrição do serviço
    let descricaoServico = `${dataExecucao ? format(dataExecucao, "dd/MM/yyyy", { locale: ptBR }) : dataAtual} - ${os.tipo_servico}`;
    if (os.itens && os.itens.length > 0) {
      descricaoServico += ` - R$ ${valorFormatado}`;
    } else {
      descricaoServico += ` - R$ ${valorFormatado}`;
    }

    // Info de pagamento
    let infoPagamento = os.forma_pagamento || 'Dinheiro';
    if (os.parcelas && os.parcelas > 1) {
      infoPagamento += ` - ${os.parcelas}x de R$ ${(os.valor_final / os.parcelas).toFixed(2).replace('.', ',')}`;
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
                  <span class="canhoto-value">${dataExecucao ? format(dataExecucao, "dd/MM/yyyy", { locale: ptBR }) : dataAtual}</span>
                </div>
                <div class="canhoto-row">
                  <span class="canhoto-label">Valor:</span>
                  <span class="canhoto-value">${valorFormatado}</span>
                </div>
              </div>
              
              <div class="canhoto-nome">
                <strong>Nome:</strong><br/>
                ${pacienteNome}
              </div>
              
              <div class="canhoto-referente">
                <strong>Referente:</strong><br/>
                ${descricaoServico}
              </div>

              <div class="canhoto-pagamento" style="margin-top: 10px; font-size: 10px;">
                <strong>Pagamento:</strong><br/>
                ${infoPagamento}
              </div>
              ${os.gerado_por ? `
              <div class="canhoto-gerado" style="margin-top: 10px; font-size: 9px;">
                <strong>Gerado por:</strong><br/>
                ${os.gerado_por}
              </div>
              ` : ''}
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
                <span class="recibo-valor">${pacienteNome}</span>
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
                <div><strong>Forma de Pagamento:</strong> ${infoPagamento}</div>
                <div style="margin-top: 5px;"><strong>Valor:</strong> R$ ${valorFormatado}</div>
                ${os.gerado_por ? `<div style="margin-top: 5px;"><strong>Gerado por:</strong> ${os.gerado_por}</div>` : ''}
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Detalhes da Ordem de Serviço
            </DialogTitle>
            <div className="flex items-center gap-2">
              {podeGerarPix && os.status_pagamento !== 'Pago' && (
                <Button
                  size="sm"
                  onClick={handleGerarPix}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <QrCode className="w-4 h-4" />
                  Gerar Pix
                </Button>
              )}
              {os.transaction_id && os.status_pagamento !== 'Pago' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleConfirmarPix}
                  disabled={confirmandoPix}
                  className="gap-2"
                >
                  {confirmandoPix ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  Confirmar Pagamento Pix
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleImprimirRecibo}
                className="gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir Recibo
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Botão de editar */}
          <div className="flex justify-end">
            {!editando ? (
              <Button variant="outline" size="sm" onClick={() => setEditando(true)} className="gap-2">
                <Edit className="w-4 h-4" />
                Editar OS
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCancelarEdicao} disabled={salvando}>
                  <X className="w-4 h-4 mr-1" />
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSalvar} disabled={salvando} className="bg-green-600 hover:bg-green-700">
                  {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Salvar
                </Button>
              </div>
            )}
          </div>

          {/* Status e Data */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {editando ? (
                <div>
                  <Select
                    value={statusPagamento}
                    onValueChange={setStatusPagamento}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      {/* PIX só pode ser marcado como Pago pelo webhook do Sicredi */}
                      {!(formaPagamento === 'PIX' && os.status_pagamento !== 'Pago') && (
                        <SelectItem value="Pago">Pago</SelectItem>
                      )}
                      <SelectItem value="Cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  {formaPagamento === 'PIX' && os.status_pagamento !== 'Pago' && (
                    <p className="text-xs text-gray-500 mt-1 max-w-[200px]">
                      Pagamento confirmado automaticamente pelo Sicredi. Você ainda pode cancelar a OS.
                    </p>
                  )}
                </div>
              ) : (
                <Badge className={`${statusPagamentoColors[os.status_pagamento]} text-sm px-4 py-1`}>
                  {os.status_pagamento}
                </Badge>
              )}
              
              {!editando && os.transaction_id && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6" 
                  onClick={handleVerificarStatus}
                  disabled={verificandoStatus}
                  title="Verificar status na maquininha"
                >
                  <RefreshCcw className={`w-4 h-4 ${verificandoStatus ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
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
          {Array.isArray(os.itens) && os.itens.length > 0 && (
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
              {editando ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valorFinal}
                    onChange={(e) => setValorFinal(e.target.value)}
                    className="w-32 text-right font-bold"
                  />
                </div>
              ) : (
                <span className="text-2xl font-bold text-blue-600">
                  R$ {os.valor_final?.toFixed(2)}
                </span>
              )}
            </div>

            <Separator className="my-4" />

            {/* IMPOSTO (10%) - apenas para categorias não isentas */}
            {!isentoImposto && (
              <>
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
              </>
            )}
            
            {isentoImposto && (
              <div className="flex justify-between items-center bg-green-50 p-3 rounded border-l-4 border-green-400">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-900">Imposto:</span>
                </div>
                <span className="text-lg font-bold text-green-600">
                  Isento (Particular/Cartão Mais Vida)
                </span>
              </div>
            )}

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
            {editando ? (
              <Select value={formaPagamento} onValueChange={(v) => {
                setFormaPagamento(v);
                if (v !== 'Múltiplas Formas') {
                  setPagamento1({ forma: '', valor: '' });
                  setPagamento2({ forma: '', valor: '' });
                }
              }}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                  <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="Convênio">Convênio</SelectItem>
                  <SelectItem value="Múltiplas Formas">Múltiplas Formas</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className="text-lg">{os.forma_pagamento}</span>
            )}
          </div>

          {/* Box Múltiplas Formas - Modo Edição */}
          {editando && formaPagamento === 'Múltiplas Formas' && (
            <div className="p-4 border-2 border-purple-200 bg-purple-50 rounded-lg space-y-4">
              <h4 className="font-medium text-purple-900">Detalhar Formas de Pagamento</h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Forma 1</label>
                  <Select value={pagamento1.forma} onValueChange={(v) => setPagamento1(prev => ({ ...prev, forma: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                      <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Transferência">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Valor (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={pagamento1.valor}
                    onChange={(e) => setPagamento1(prev => ({ ...prev, valor: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Forma 2</label>
                  <Select value={pagamento2.forma} onValueChange={(v) => setPagamento2(prev => ({ ...prev, forma: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                      <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Transferência">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Valor (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={pagamento2.valor}
                    onChange={(e) => setPagamento2(prev => ({ ...prev, valor: e.target.value }))}
                  />
                </div>
              </div>

              {(pagamento1.valor || pagamento2.valor) && (
                <div className="pt-2 border-t border-purple-300">
                  <div className="flex justify-between text-sm">
                    <span className="text-purple-800">Total informado:</span>
                    <span className="font-bold text-purple-900">
                      R$ {((parseFloat(pagamento1.valor) || 0) + (parseFloat(pagamento2.valor) || 0)).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Detalhamento de Múltiplas Formas - Modo Visualização */}
          {!editando && os.forma_pagamento === 'Múltiplas Formas' && os.pagamentos_detalhados && os.pagamentos_detalhados.length > 0 && (
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <h4 className="font-semibold text-purple-900 mb-3">Detalhamento do Pagamento</h4>
              <div className="space-y-2">
                {os.pagamentos_detalhados.map((pag, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-purple-100">
                    <span className="text-purple-800">{pag.forma}</span>
                    <span className="font-bold text-purple-900">R$ {pag.valor?.toFixed(2).replace('.', ',')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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

      <ModalQrCodePix
        open={modalPixAberto}
        onClose={() => setModalPixAberto(false)}
        qrCode={qrCodePix}
        valor={os.valor_final}
        pacienteNome={pacienteNome}
        loading={gerandoPix}
        erro={erroPix}
        ordemServicoId={os.id}
        onPago={() => {
          setStatusPagamento('Pago');
          setPixConfirmadoSessao(true);
          if (onUpdate) onUpdate();
        }}
      />
    </Dialog>
  );
}