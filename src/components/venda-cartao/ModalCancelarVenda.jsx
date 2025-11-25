import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function ModalCancelarVenda({ venda, open, onClose, onCancelado }) {
  const { toast } = useToast();
  const [senha, setSenha] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  const handleCancelar = async () => {
    if (!senha) {
      setErro('Digite a senha de cancelamento');
      return;
    }

    setProcessando(true);
    setErro('');

    try {
      console.log('🔐 Enviando requisição de cancelamento...');
      
      const response = await base44.functions.invoke('cancelarVendaCartao', {
        venda_id: venda.id,
        senha: senha
      });

      console.log('📥 Resposta:', response);

      if (response?.data?.success) {
        toast({
          title: "Venda Cancelada ✅",
          description: "A venda foi cancelada com sucesso",
          duration: 5000
        });

        setSenha('');
        onCancelado();
        onClose();
      } else {
        throw new Error(response?.data?.error || 'Erro ao cancelar venda');
      }

    } catch (error) {
      console.error('❌ Erro:', error);
      
      if (error.message?.includes('Senha incorreta')) {
        setErro('❌ Senha incorreta! Tente novamente.');
      } else if (error.message?.includes('já está cancelada')) {
        setErro('Esta venda já está cancelada.');
      } else {
        setErro(error.message || 'Erro ao processar cancelamento');
      }
      
      toast({
        title: "Erro ao cancelar",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setProcessando(false);
    }
  };

  const handleClose = () => {
    setSenha('');
    setErro('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Cancelar Venda
          </DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O cartão será marcado como cancelado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <strong>Atenção:</strong> Você está prestes a cancelar a venda <strong>{venda?.numero_venda}</strong> do titular <strong>{venda?.titular?.nome}</strong>
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="senha">Senha de Cancelamento *</Label>
            <Input
              id="senha"
              type="password"
              placeholder="Digite a senha"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setErro('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCancelar();
                }
              }}
              disabled={processando}
              className="mt-1"
            />
            {erro && (
              <p className="text-sm text-red-600 mt-2">{erro}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleClose}
            disabled={processando}
          >
            Voltar
          </Button>
          <Button 
            type="button"
            variant="destructive"
            onClick={handleCancelar}
            disabled={processando || !senha}
          >
            {processando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cancelando...
              </>
            ) : (
              'Confirmar Cancelamento'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}