import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Send, ArrowRightLeft } from 'lucide-react';

export default function TransferirConversaModal({ open, onClose, contato, currentUser, onTransferido }) {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [destinoId, setDestinoId] = useState('');
  const [transferindo, setTransferindo] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestinoId('');
    const carregarUsuarios = async () => {
      setCarregando(true);
      try {
        const lista = await base44.entities.User.list();
        // Excluir o usuário atual da lista de destinos
        setUsuarios((lista || []).filter(u => u.id !== currentUser?.id));
      } catch (error) {
        console.error('Erro ao carregar usuários:', error);
      } finally {
        setCarregando(false);
      }
    };
    carregarUsuarios();
  }, [open, currentUser?.id]);

  const handleTransferir = async () => {
    if (!destinoId || !contato) return;
    const destino = usuarios.find(u => u.id === destinoId);
    if (!destino) return;

    setTransferindo(true);
    try {
      const nomeDestino = destino.display_name || destino.full_name || destino.email;
      const nomeOrigem = currentUser?.display_name || currentUser?.full_name || 'Recepção';

      // Registra a transferência no histórico para contexto do novo atendente
      const historicoAtual = contato.historico_mensagens || [];
      const msgTransferencia = {
        role: 'assistant',
        content: `[🔄 Conversa transferida de ${nomeOrigem} para ${nomeDestino}]`,
        timestamp: new Date().toISOString(),
        humano: true
      };

      await base44.entities.Contato.update(contato.id, {
        atendimento_humano: true,
        atendente_atual: nomeDestino,
        atendente_id: destino.id,
        conversa_finalizada: false,
        historico_mensagens: [...historicoAtual, msgTransferencia]
      });

      onTransferido && onTransferido(nomeDestino);
      onClose();
    } catch (error) {
      console.error('Erro ao transferir conversa:', error);
      alert('Erro ao transferir conversa: ' + (error?.message || 'Erro desconhecido'));
    } finally {
      setTransferindo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
            Transferir Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-600">
            O usuário selecionado verá todo o histórico até o momento e continuará o atendimento de{' '}
            <strong>{contato?.nome || 'Cliente'}</strong>.
          </p>

          <div className="space-y-2">
            <Label>Transferir para</Label>
            {carregando ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando usuários...
              </div>
            ) : (
              <Select value={destinoId} onValueChange={setDestinoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o usuário" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name || u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={transferindo}>
            Cancelar
          </Button>
          <Button
            onClick={handleTransferir}
            disabled={!destinoId || transferindo}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {transferindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}