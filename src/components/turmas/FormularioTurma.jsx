import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Calendar, Users } from "lucide-react";

export default function FormularioTurma({ turma, medicos, onClose, onSave }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [qtdAlunos, setQtdAlunos] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    modalidade: 'Hidroginástica',
    medico_id: '',
    horario_inicio: '',
    horario_fim: '',
    dias_semana: [],
    capacidade_maxima: 10,
    status: 'Ativa'
  });

  useEffect(() => {
    if (turma) {
      setFormData({
        ...turma,
        dias_semana: turma.dias_semana || []
      });
      // Carregar contagem de alunos
      base44.entities.AlunoTurma.filter({ turma_id: turma.id }).then(vinculos => {
        const ativos = vinculos.filter(v => !v.status || v.status === 'Ativo');
        setQtdAlunos(ativos.length);
      }).catch(() => setQtdAlunos(0));
    }
  }, [turma]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleDiaSemana = (dia) => {
    setFormData(prev => {
      const dias = prev.dias_semana.includes(dia)
        ? prev.dias_semana.filter(d => d !== dia)
        : [...prev.dias_semana, dia].sort();
      return { ...prev, dias_semana: dias };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nome || !formData.medico_id || !formData.horario_inicio || formData.dias_semana.length === 0) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome, professor, horário e selecione pelo menos um dia.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      if (turma && turma.id) {
        await base44.entities.Turma.update(turma.id, formData);
        toast({ title: "Turma atualizada!" });
      } else {
        await base44.entities.Turma.create(formData);
        toast({ title: "Turma criada com sucesso!" });
      }
      onSave();
    } catch (error) {
      console.error(error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a turma.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const diasLabel = [
    { id: 0, label: 'Dom' },
    { id: 1, label: 'Seg' },
    { id: 2, label: 'Ter' },
    { id: 3, label: 'Qua' },
    { id: 4, label: 'Qui' },
    { id: 5, label: 'Sex' },
    { id: 6, label: 'Sáb' }
  ];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{turma ? 'Editar Turma' : 'Nova Turma'}</DialogTitle>
          <DialogDescription>Defina os detalhes da turma e horários.</DialogDescription>
          {turma && qtdAlunos !== null && (
            <div className="mt-2 flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-50 px-3 py-1.5 rounded-md w-fit">
              <Users className="w-4 h-4" />
              {qtdAlunos} aluno{qtdAlunos !== 1 ? 's' : ''} matriculado{qtdAlunos !== 1 ? 's' : ''}
            </div>
          )}
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Turma</Label>
              <Input 
                value={formData.nome} 
                onChange={e => handleChange('nome', e.target.value)} 
                placeholder="Ex: Hidro Manhã" 
              />
            </div>
            <div className="space-y-2">
              <Label>Modalidade</Label>
              <Select 
                value={formData.modalidade} 
                onValueChange={v => handleChange('modalidade', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hidroginástica">Hidroginástica</SelectItem>
                  <SelectItem value="Pilates">Pilates</SelectItem>
                  <SelectItem value="Natação">Natação</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Professor Responsável</Label>
            <Select 
              value={formData.medico_id} 
              onValueChange={v => handleChange('medico_id', v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecione o professor..." /></SelectTrigger>
              <SelectContent>
                {medicos.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome} - {m.especialidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Horário Início</Label>
              <Input 
                type="time" 
                value={formData.horario_inicio} 
                onChange={e => handleChange('horario_inicio', e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Horário Fim</Label>
              <Input 
                type="time" 
                value={formData.horario_fim} 
                onChange={e => handleChange('horario_fim', e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Capacidade</Label>
              <Input 
                type="number" 
                value={formData.capacidade_maxima} 
                onChange={e => handleChange('capacidade_maxima', e.target.value)} 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dias da Semana</Label>
            <div className="flex flex-wrap gap-2">
              {diasLabel.map(dia => (
                <div 
                  key={dia.id}
                  onClick={() => toggleDiaSemana(dia.id)}
                  className={`
                    cursor-pointer px-3 py-2 rounded-md border text-sm font-medium transition-colors
                    ${formData.dias_semana.includes(dia.id) 
                      ? 'bg-blue-100 border-blue-500 text-blue-700' 
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}
                  `}
                >
                  {dia.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar Turma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}