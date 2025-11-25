import React, { useState, useEffect } from 'react';
import { User } from '@/entities/User';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ProfileEditor({ user, open, onClose, onUpdate }) {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (user) {
      // Usa o nome de exibição se existir, senão, o nome completo como fallback.
      setDisplayName(user.display_name || user.full_name || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('O nome de exibição não pode estar vazio.');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await User.updateMyUserData({ display_name: displayName });
      setSuccess('Nome de exibição atualizado com sucesso!');
      
      setTimeout(() => {
        onUpdate(); // Recarrega os dados do usuário no layout
        onClose(); // Fecha o modal
      }, 1500);
      
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      setError(`Erro ao salvar: ${error.message}. Tente novamente.`);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Meu Perfil</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="border-green-500 text-green-700"><AlertDescription>{success}</AlertDescription></Alert>}
          
          <div>
            <Label htmlFor="fullName">Nome de Login (Fixo)</Label>
            <Input id="fullName" value={user.full_name} disabled className="bg-gray-100" />
            <p className="text-xs text-gray-500 mt-1">Este nome é vinculado à sua conta e não pode ser alterado aqui.</p>
          </div>
          <div>
            <Label htmlFor="displayName">Nome de Exibição</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como seu nome aparecerá no sistema"
            />
             <p className="text-xs text-gray-500 mt-1">Este nome será usado no topo da página e em outras áreas do sistema.</p>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} disabled className="bg-gray-100" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Alterações'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}