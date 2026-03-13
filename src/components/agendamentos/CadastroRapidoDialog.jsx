import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, User, AlertCircle } from "lucide-react";

export default function CadastroRapidoDialog({ open, onClose, novoPacienteRapido, setNovoPacienteRapido, salvandoPacienteRapido, onSave, categorias }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Cadastro Rápido de Paciente
          </DialogTitle>
          <DialogDescription>
            Cadastre apenas o essencial agora. Complete os dados depois na página de Pacientes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="novo_nome">Nome Completo *</Label>
            <Input id="novo_nome" value={novoPacienteRapido.nome} onChange={(e) => setNovoPacienteRapido(prev => ({ ...prev, nome: e.target.value }))} placeholder="Ex: João da Silva" disabled={salvandoPacienteRapido} />
          </div>
          <div>
            <Label htmlFor="novo_cpf">CPF *</Label>
            <Input id="novo_cpf" value={novoPacienteRapido.cpf} onChange={(e) => setNovoPacienteRapido(prev => ({ ...prev, cpf: e.target.value }))} placeholder="Ex: 123.456.789-00" disabled={salvandoPacienteRapido} />
          </div>
          <div>
            <Label htmlFor="novo_telefone">Telefone *</Label>
            <Input id="novo_telefone" value={novoPacienteRapido.telefone} onChange={(e) => setNovoPacienteRapido(prev => ({ ...prev, telefone: e.target.value }))} placeholder="Ex: (51) 99999-9999" disabled={salvandoPacienteRapido} />
          </div>
          <div>
            <Label htmlFor="novo_convenio">Convênio *</Label>
            <Select value={novoPacienteRapido.convenio} onValueChange={(value) => setNovoPacienteRapido(prev => ({ ...prev, convenio: value }))} disabled={salvandoPacienteRapido}>
              <SelectTrigger id="novo_convenio"><SelectValue placeholder="Selecione o convênio" /></SelectTrigger>
              <SelectContent>{categorias.map(categoria => <SelectItem key={categoria.id} value={categoria.nome}>{categoria.nome}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">💡 O convênio define automaticamente a categoria de preço nos agendamentos</p>
          </div>
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-800 text-sm">Após salvar, complete o cadastro com endereço e outras informações na página <strong>Pacientes</strong>.</AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline" disabled={salvandoPacienteRapido}>Cancelar</Button></DialogClose>
          <Button type="button" onClick={onSave} disabled={salvandoPacienteRapido || !novoPacienteRapido.nome || !novoPacienteRapido.cpf || !novoPacienteRapido.telefone}>
            {salvandoPacienteRapido ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : <><Save className="w-4 h-4 mr-2" />Salvar e Selecionar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}