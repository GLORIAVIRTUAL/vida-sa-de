import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check, Loader2, AlertCircle, QrCode, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { base44 } from "@/api/base44Client";
import confetti from "canvas-confetti";

export default function ModalQrCodePix({ open, onClose, qrCode, valor, pacienteNome, loading, erro, ordemServicoId, onPago }) {
  const [copiado, setCopiado] = useState(false);
  const [pago, setPago] = useState(false);
  const { toast } = useToast();
  const intervalRef = useRef(null);
  // Refs para callbacks, evitando recriar o intervalo a cada render do componente pai
  const onPagoRef = useRef(onPago);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onPagoRef.current = onPago; }, [onPago]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Confirmação INSTANTÂNEA via subscription em tempo real + polling rápido de segurança
  useEffect(() => {
    if (!open || !qrCode || loading || erro || !ordemServicoId) {
      return;
    }

    let parou = false;

    const confirmar = () => {
      if (parou) return;
      parou = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPago(true);
      // Explosão de confetes 🎉
      const fim = Date.now() + 1500;
      const frame = () => {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#16a34a', '#22c55e', '#86efac'] });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#16a34a', '#22c55e', '#86efac'] });
        if (Date.now() < fim) requestAnimationFrame(frame);
      };
      frame();
      toast({
        title: "Pagamento confirmado!",
        description: "O pagamento Pix foi recebido com sucesso.",
        className: "bg-green-50 border-green-200",
      });
      if (onPagoRef.current) onPagoRef.current();
      setTimeout(() => { if (onCloseRef.current) onCloseRef.current(); }, 2500);
    };

    // 1) Tempo real: reage no instante em que o webhook do Sicredi marca a OS como Pago
    const unsubscribe = base44.entities.OrdemServico.subscribe((event) => {
      if (event.id === ordemServicoId && event.data?.status_pagamento === 'Pago') {
        confirmar();
      }
    });

    // 2) Segurança: consulta o Sicredi a cada 3s caso o webhook não chegue
    const verificar = async () => {
      if (parou) return;
      try {
        const res = await base44.functions.invoke('confirmarPagamentoPixOS', {
          ordem_servico_id: ordemServicoId,
        });
        if (res.data?.success && res.data?.is_paid) {
          confirmar();
        }
      } catch (err) {
        // silencioso - continua tentando
      }
    };

    verificar();
    intervalRef.current = setInterval(verificar, 3000);
    return () => {
      parou = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (unsubscribe) unsubscribe();
    };
  }, [open, qrCode, loading, erro, ordemServicoId, toast]);

  // Reseta estado de "pago" ao reabrir o modal
  useEffect(() => {
    if (open) setPago(false);
  }, [open]);

  const handleCopiar = async () => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopiado(true);
      toast({
        title: "Copiado!",
        description: "Código Pix copiado para a área de transferência.",
        duration: 2000,
      });
      setTimeout(() => setCopiado(false), 3000);
    } catch (err) {
      toast({
        title: "Erro ao copiar",
        description: "Selecione o código manualmente.",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-green-600" />
            Pagamento via PIX
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {pacienteNome && (
            <div className="text-center">
              <p className="text-sm text-gray-500">Paciente</p>
              <p className="font-semibold text-gray-800">{pacienteNome}</p>
            </div>
          )}

          {valor && (
            <div className="text-center bg-green-50 p-3 rounded-lg border border-green-200">
              <p className="text-sm text-green-700">Valor a receber</p>
              <p className="text-3xl font-bold text-green-800">
                R$ {Number(valor).toFixed(2).replace('.', ',')}
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-3" />
              <p className="text-gray-600">Gerando QR Code Pix...</p>
            </div>
          )}

          {erro && !loading && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          {pago && (
            <div className="flex flex-col items-center justify-center py-10 text-center animate-in fade-in zoom-in duration-500">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-green-200 rounded-full blur-xl opacity-60 animate-pulse" />
                <div className="relative bg-green-100 rounded-full p-5">
                  <CheckCircle2 className="w-16 h-16 text-green-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-green-800">Pagamento realizado com sucesso! 🎉</p>
              <p className="text-gray-600 mt-2">O Pix foi recebido e a OS foi marcada como paga.</p>
              {valor && (
                <p className="text-lg font-semibold text-green-700 mt-3">
                  R$ {Number(valor).toFixed(2).replace('.', ',')}
                </p>
              )}
            </div>
          )}

          {qrCode && !loading && !erro && !pago && (
            <>
              <Card>
                <CardContent className="p-4 flex justify-center bg-white">
                  <QRCodeSVG value={qrCode} size={240} level="M" includeMargin={true} />
                </CardContent>
              </Card>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Código Pix Copia e Cola:
                </p>
                <div className="relative">
                  <textarea
                    readOnly
                    value={qrCode}
                    className="w-full h-24 p-3 text-xs font-mono border rounded-lg bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onClick={(e) => e.target.select()}
                  />
                </div>
                <Button
                  onClick={handleCopiar}
                  className="w-full mt-2 bg-green-600 hover:bg-green-700"
                  size="lg"
                >
                  {copiado ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar Código Pix
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Envie este código no chat para o cliente realizar o pagamento.
                </p>
                {ordemServicoId && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-sm text-blue-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Aguardando confirmação do pagamento...
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}