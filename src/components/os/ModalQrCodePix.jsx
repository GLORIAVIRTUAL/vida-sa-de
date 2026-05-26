import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check, Loader2, AlertCircle, QrCode } from "lucide-react";
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ModalQrCodePix({ open, onClose, qrCode, valor, pacienteNome, loading, erro }) {
  const [copiado, setCopiado] = useState(false);
  const { toast } = useToast();

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

          {qrCode && !loading && !erro && (
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