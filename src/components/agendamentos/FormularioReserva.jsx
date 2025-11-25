import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Save, Clock } from "lucide-react";
import { Agendamento } from "@/entities/all";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/components/ui/use-toast";

export default function FormularioReserva({ onSave, onClose, medicos }) {
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState({
    data_agendamento: format(new Date(), 'yyyy-MM-dd'),
    horario: '',
    tipo_servico: 'Consulta',
    medico_id: '',
    observacoes: ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.data_agendamento || !formData.horario) {
      toast({
        title: "Erro",
        description: "Preencha data e horário",
        variant: "destructive"
      });
      return;
    }

    setSalvando(true);
    try {
      const reserva = {
        data_agendamento: formData.data_agendamento,
        horario: formData.horario,
        tipo_servico: formData.tipo_servico,
        is_reserva: true,
        status: 'Agendado',
        valor_total: 0
      };

      // Adicionar médico se selecionado
      if (formData.medico_id) {
        reserva.medico_id = formData.medico_id;
      }

      // Adicionar observações se preenchidas
      if (formData.observacoes) {
        reserva.observacoes = formData.observacoes;
      }

      await Agendamento.create(reserva);

      toast({
        title: "Reserva criada!",
        description: "Horário reservado com sucesso. Complete os dados depois editando a reserva."
      });

      await onSave();
      onClose();
    } catch (error) {
      console.error("Erro ao criar reserva:", error);
      toast({
        title: "Erro ao reservar",
        description: error.message || "Não foi possível criar a reserva",
        variant: "destructive"
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" />
            Reserva de Horário
          </DialogTitle>
          <DialogDescription>
            Reserve um horário rapidamente. Você pode completar os dados do paciente depois editando a reserva.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" id="form-reserva">
          <div>
            <Label htmlFor="data_agendamento">Data *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.data_agendamento ? 
                    format(new Date(formData.data_agendamento + 'T00:00:00'), "PPP", { locale: ptBR }) : 
                    <span>Selecione uma data</span>
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={new Date(formData.data_agendamento + 'T00:00:00')}
                  onSelect={(date) => {
                    if (date) {
                      handleChange('data_agendamento', format(date, 'yyyy-MM-dd'));
                    }
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0) - 86400000)}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="horario">Horário *</Label>
              <Input
                id="horario"
                type="time"
                value={formData.horario}
                onChange={(e) => handleChange('horario', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="tipo_servico">Tipo de Serviço *</Label>
              <Select
                value={formData.tipo_servico}
                onValueChange={(value) => handleChange('tipo_servico', value)}
              >
                <SelectTrigger id="tipo_servico">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Consulta">Consulta</SelectItem>
                  <SelectItem value="Retorno">Retorno</SelectItem>
                  <SelectItem value="Procedimento">Procedimento</SelectItem>
                  <SelectItem value="Exame">Exame</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && (
            <div>
              <Label htmlFor="medico_id">Médico (opcional)</Label>
              <Select
                value={formData.medico_id}
                onValueChange={(value) => handleChange('medico_id', value)}
              >
                <SelectTrigger id="medico_id">
                  <SelectValue placeholder="Selecione um médico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Nenhum médico</SelectItem>
                  {medicos.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      Dr(a). {m.nome} - {m.especialidade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="observacoes">Observações (opcional)</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Ex: Reserva para grupo especial, aguardando confirmação..."
              rows={3}
            />
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p className="text-sm text-orange-800">
              <strong>💡 Dica:</strong> Esta é uma reserva rápida de horário. Depois você pode:
            </p>
            <ul className="text-sm text-orange-700 mt-2 ml-4 list-disc">
              <li>Editar a reserva para adicionar o paciente</li>
              <li>Definir o procedimento ou exames específicos</li>
              <li>Completar todos os dados do agendamento</li>
            </ul>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-reserva"
            disabled={salvando}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Reservando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Reservar Horário
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}