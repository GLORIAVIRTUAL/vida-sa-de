import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck } from "lucide-react";

const SENHA_RETROATIVA = '123123';
const EMAIL_AUTORIZADO = 'cristianogoldani@yahoo.com.br';

/**
 * Verifica se a operação em uma data passada requer autenticação especial.
 * Retorna true se a data do lançamento é anterior a hoje (dia já fechado).
 */
export function isDiaFechado(dataLancamento) {
  if (!dataLancamento) return false;
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return dataLancamento < hojeStr;
}

/**
 * Verifica se o usuário atual pode alterar dias fechados (passados).
 * Apenas o email autorizado pode, após digitar a senha.
 */
export function podeAlterarDiaFechado(userEmail) {
  if (!userEmail) return false;
  return String(userEmail).trim().toLowerCase() === EMAIL_AUTORIZADO.toLowerCase();
}

export default function SenhaRetroativaDialog({ open, onClose, onAutorizado, acao }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  const verificar = () => {
    if (senha === SENHA_RETROATIVA) {
      setSenha('');
      setErro('');
      onAutorizado();
    } else {
      setErro('Senha incorreta.');
      setSenha('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { setSenha(''); setErro(''); onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <ShieldCheck className="w-5 h-5" />
            Autorização Necessária
          </DialogTitle>
          <DialogDescription>
            {acao === 'excluir'
              ? 'Você está tentando excluir um lançamento de um dia já fechado. Digite a senha de autorização para continuar.'
              : 'Você está tentando lançar em um dia já fechado (anterior a hoje). Digite a senha de autorização para continuar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Após a meia-noite, apenas o responsável financeiro pode alterar dados de dias anteriores.
            </p>
          </div>
          <div>
            <Label htmlFor="senha-retroativa">Senha de Autorização</Label>
            <Input
              id="senha-retroativa"
              type="password"
              placeholder="Digite a senha"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setErro(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') verificar(); }}
              autoFocus
            />
            {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setSenha(''); setErro(''); onClose(); }}>
            Cancelar
          </Button>
          <Button onClick={verificar} className="bg-amber-600 hover:bg-amber-700">
            <ShieldCheck className="w-4 h-4 mr-2" />
            Autorizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}