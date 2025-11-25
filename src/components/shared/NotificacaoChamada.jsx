import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Megaphone } from "lucide-react";

export default function NotificacaoChamada({ aberta, onFechar, dados }) {
  if (!dados) {
    return null;
  }

  const handleOpenChange = (open) => {
    if (!open) {
      onFechar();
    }
  };

  return (
    <AlertDialog open={aberta} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-blue-600" />
            Paciente Chamado
          </AlertDialogTitle>
          <AlertDialogDescription className="text-lg text-gray-800 pt-4">
            <div className="space-y-2">
                <p><strong className="font-semibold">Paciente:</strong> {dados.nomePaciente}</p>
                <p><strong className="font-semibold">Médico:</strong> Dr(a). {dados.nomeMedico}</p>
                <p><strong className="font-semibold">Especialidade:</strong> {dados.especialidade}</p>
                {dados.prioridade && dados.prioridade !== 'Normal' && (
                  <p className="font-bold text-yellow-600">Atendimento Prioritário!</p>
                )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onFechar}>Fechar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}