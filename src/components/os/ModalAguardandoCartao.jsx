import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CreditCard, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { base44 } from "@/api/base44Client";
import confetti from "canvas-confetti";

export default function ModalAguardandoCartao({ open, onClose, valor, pacienteNome, formaPagamento, loading, erro, ordemServicoId, onPago }) {
  const [pago, setPago] = useState(false);
  const { toast } = useToast();
  const onPagoRef = useRef(onPago);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onPagoRef.current = onPago; }, [onPago]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Reseta estado ao reabrir
  useEffect(() => {
    if (open) setPago(false);
  }, [open]);

  // Monitora a OS em tempo real: confirma quando o webhook da EvoluServices marcar como Pago
  useEffect(() => {
    if (!open || loading || erro || !ordemServicoId) {
      return;
    }

    let parou = false;

    const confirmar = () => {
      if (parou) return;
      parou = true;
      setPago(true);
      const fim = Date.now() + 1500;
      const frame = () => {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#2563eb', '#3b82f6', '#93c5fd'] });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#2563eb', '#3b82f6', '#93c5fd'] });
        if (Date.now() < fim) requestAnimationFrame(frame);
      };
      frame();
      toast({
        title: "Pagamento confirmado!",
        description: "O pagamento no cartão foi aprovado na maquininha.",
        className: "bg-green-50 border-green-200",
      });
      if (onPagoRef.current) onPagoRef.current();
      setTimeout(() => { if (onCloseRef.current) onCloseRef.current(); }, 2500);
    };

    const unsubscribe = base44.entities.OrdemServico.subscribe((event) => {
      if (event.id === ordemServicoId && event.data?.status_pagamento === 'Pago') {
        confirmar();
      }
    });

    return () => {
      parou = true;
      if (unsubscribe) unsubscribe();
    };
  }, [open, loading, erro, ordemServicoId, toast]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            Pagamento via {formaPagamento || 'Cartão'}
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
            <div className="text-center bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">Valor a receber</p>
              <p className="text-3xl font-bold text-blue-800">
                R$ {Number(valor).toFixed(2).replace('.', ',')}
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-3" />
              <p className="text-gray-600">Enviando para a maquininha...</p>
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
              <p className="text-2xl font-bold text-green-800">Pagamento aprovado! 🎉</p>
              <p className="text-gray-600 mt-2">O cartão foi processado e a OS foi marcada como paga.</p>
              {valor && (
                <p className="text-lg font-semibold text-green-700 mt-3">
                  R$ {Number(valor).toFixed(2).replace('.', ',')}
                </p>
              )}
            </div>
          )}

          {!loading && !erro && !pago && ordemServicoId && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-blue-200 rounded-full blur-xl opacity-50 animate-pulse" />
                <div className="relative bg-blue-100 rounded-full p-5">
                  <CreditCard className="w-14 h-14 text-blue-600" />
                </div>
              </div>
              <p className="text-lg font-semibold text-gray-800">Aguardando o cliente passar o cartão</p>
              <p className="text-gray-600 mt-2 text-sm">
                Peça para o cliente inserir/aproximar o cartão na maquininha. A confirmação aparece aqui automaticamente.
              </p>
              <div className="flex items-center justify-center gap-2 mt-4 text-sm text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Aguardando confirmação do pagamento...
              </div>
            </div>
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