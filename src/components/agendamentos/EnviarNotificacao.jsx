import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Send, AlertCircle, Clock } from "lucide-react";
import { format, setHours, setMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScheduledNotification } from "@/entities/ScheduledNotification";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast"; // Adicionado import para useToast

const modelosMensagens = {
  lembrete_consulta: {
    nome: 'Lembrete de Consulta',
    template: 'Olá [PACIENTE], aqui é a Glória do Centro Vida Saúde! 🏥\n\nPassando para lembrar da sua consulta:\n\n👨‍⚕️ Profissional: [MEDICO]\n📋 Procedimento: [PROCEDIMENTO]\n📆 Data: [DATA]\n🕐 Horário: [HORARIO]\n\n✅ Para CONFIRMAR sua presença, clique aqui:\n[LINK_CONFIRMACAO]\n\nPor favor, chegue com 10 minutos de antecedência. Aguardamos você! 😊'
  },
  confirmacao_agendamento: {
    nome: 'Confirmação de Agendamento',
    template: 'Olá [PACIENTE], aqui é a Glória do Centro Vida Saúde! 🏥\n\n✅ Seu agendamento está confirmado!\n\n👨‍⚕️ Profissional: [MEDICO]\n📋 Procedimento: [PROCEDIMENTO]\n📆 Data: [DATA]\n🕐 Horário: [HORARIO]\n\nLembre-se de chegar com 10 minutos de antecedência.\n\nAguardamos você! 😊'
  },
  aviso_cancelamento: {
    nome: 'Aviso de Cancelamento',
    template: 'Olá [PACIENTE], aqui é a Glória do Centro Vida Saúde. 🏥\n\n❌ Informamos que seu agendamento foi cancelado:\n\n👨‍⚕️ Profissional: [MEDICO]\n📋 Procedimento: [PROCEDIMENTO]\n📆 Data: [DATA]\n🕐 Horário: [HORARIO]\n\nPara reagendar, entre em contato conosco pelo WhatsApp 51 98550-5991 ou clique aqui: https://wa.me/5551985505991\n\nAgradecemos a compreensão! 🙏'
  }
};

export default function EnviarNotificacao({ 
  agendamento, 
  paciente, 
  medico, 
  aberto, 
  onFechar 
}) {
  const { toast } = useToast(); // Inicializado useToast
  const [tipoCanal, setTipoCanal] = useState('whatsapp');
  const [modeloSelecionado, setModeloSelecionado] = useState('lembrete_consulta');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState(null);
  const [erro, setErro] = useState('');

  // Estados para agendamento
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [scheduledTime, setScheduledTime] = useState(format(new Date(), 'HH:mm'));

  // Este useEffect agora é o único responsável por gerar e atualizar a mensagem
  useEffect(() => {
    if (aberto) {
      const template = modelosMensagens[modeloSelecionado].template;
      
      // Valores padrão caso os dados não estejam disponíveis
      const nomePaciente = paciente?.nome ? paciente.nome.split(' ')[0] : '';
      const nomeMedico = medico?.nome ? (medico.nome.startsWith('Dr') ? medico.nome : `Dr(a). ${medico.nome}`) : '[Nome do Médico]';
      const dataFormatada = agendamento?.data_agendamento 
        ? format(new Date(agendamento.data_agendamento + 'T00:00:00'), "dd 'de' MMMM", { locale: ptBR })
        : '[Data]';
      const horario = agendamento?.horario || '[Horário]';
      const linkConfirmacao = agendamento?.id 
        ? `https://clinica-plus-7629e61a.base44.app/ConfirmarPresenca?codigo=${agendamento.id}`
        : '[Link de Confirmação]';
      
      // Determinar o procedimento/serviço
      let procedimentoTexto = 'Consulta';
      if (agendamento?.tipo_servico === 'Procedimento' && agendamento.procedimento_id) {
        procedimentoTexto = 'Procedimento';
      } else if (agendamento?.tipo_servico === 'Exame') {
        procedimentoTexto = 'Exame';
      } else if (agendamento?.tipo_servico === 'Retorno') {
        procedimentoTexto = 'Retorno';
      } else if (agendamento?.tipo_servico) {
        procedimentoTexto = agendamento.tipo_servico;
      }

      const mensagemPersonalizada = template
        .replace('[PACIENTE]', nomePaciente)
        .replace('[MEDICO]', nomeMedico)
        .replace('[DATA]', dataFormatada)
        .replace('[HORARIO]', horario)
        .replace('[PROCEDIMENTO]', procedimentoTexto)
        .replace('[ESPECIALIDADE]', medico?.especialidade || '')
        .replace('[CODIGO]', agendamento?.id || '')
        .replace('[LINK_CONFIRMACAO]', linkConfirmacao);

      setMensagem(mensagemPersonalizada);
    }
  }, [aberto, agendamento, paciente, medico, modeloSelecionado]);
  
  // Este useEffect reseta o estado do formulário apenas quando ele é aberto
  useEffect(() => {
    if (aberto) {
      setErro('');
      setResultadoEnvio(null);
      setIsScheduling(false);
      setScheduledDate(format(new Date(), 'yyyy-MM-dd'));
      setScheduledTime(format(new Date(), 'HH:mm'));
      setModeloSelecionado('lembrete_consulta'); // Garante que o modelo padrão seja selecionado
    }
  }, [aberto]);

  const handleClose = useCallback(() => {
    // O reset de estado agora é gerenciado pelo useEffect [aberto]
    onFechar();
  }, [onFechar]);

  const handleAction = async () => {
    if (!mensagem.trim()) {
      alert('Digite uma mensagem antes de enviar.');
      return;
    }

    if (!paciente.telefone) {
      alert('Paciente não possui telefone cadastrado.');
      return;
    }

    if (isScheduling && (!scheduledDate || !scheduledTime)) {
        alert('Por favor, selecione a data e a hora para agendar a notificação.');
        return;
    }

    setEnviando(true);
    setErro('');
    setResultadoEnvio(null);

    try {
      if (isScheduling) {
        // Lógica de agendamento
        const [hours, minutes] = scheduledTime.split(':').map(Number);
        const sendAtDateTime = setMinutes(setHours(new Date(scheduledDate), hours), minutes);

        if (sendAtDateTime < new Date()) {
            throw new Error('A data e hora agendadas devem ser no futuro.');
        }

        await ScheduledNotification.create({
          agendamento_id: agendamento.id,
          paciente_id: paciente.id,
          tipo_canal: tipoCanal,
          telefone_destino: paciente.telefone.replace(/\D/g, ''), // Enviar apenas números
          mensagem: mensagem.trim(),
          send_at: sendAtDateTime.toISOString(),
          status: 'pending'
        });

        setResultadoEnvio({
          sucesso: true,
          mensagem: 'Notificação agendada com sucesso!',
          detalhes: `Será enviada em: ${format(sendAtDateTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
        });

      } else {
        // Lógica de envio imediato
        const { sendNotification } = await import("@/functions/sendNotification");
        
        const resultado = await sendNotification({
          telefone: paciente.telefone,
          mensagem: mensagem.trim(),
          tipo: tipoCanal,
          agendamento_id: agendamento.id,
          paciente_nome: paciente.nome
        });

        if (resultado.data?.sucesso) {
          setResultadoEnvio({
            sucesso: true,
            mensagem: `${tipoCanal === 'whatsapp' ? 'WhatsApp' : 'SMS'} enviado com sucesso!`,
            detalhes: `Enviado para: ${resultado.data.telefone}`
          });
        } else {
          // Trata erros vindos da função backend que não são exceções http
          throw new Error(resultado.data?.error || 'Erro desconhecido ao enviar notificação.');
        }
      }
    } catch (error) {
      console.error('Erro ao processar notificação:', error);
      
      let mensagemErroFinal = 'Ocorreu um erro inesperado.';
      let detalhesErro = '';

      // Verifica se o erro veio da resposta da requisição (ex: erro 500)
      if (error.response?.data) {
        const errorData = error.response.data;
        mensagemErroFinal = errorData.error || mensagemErroFinal;
        detalhesErro = errorData.detalhes || '';
      } else if (error.message) {
        // Erro genérico do Javascript ou da lógica de tratamento
        mensagemErroFinal = error.message;
      }

      setErro(mensagemErroFinal);
      setResultadoEnvio({
        sucesso: false,
        mensagem: mensagemErroFinal,
        detalhes: detalhesErro
      });
      
    } finally {
      setEnviando(false);
    }
  };

  const isFormValid = () => {
    if (!mensagem.trim() || !paciente?.telefone) return false;
    if (isScheduling) {
      return scheduledDate && scheduledTime;
    }
    return true;
  };

  return (
    <Dialog open={aberto} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Notificar Paciente</DialogTitle>
          <DialogDescription>
            Envie lembretes e confirmações para <strong>{paciente?.nome}</strong>
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Canal</Label>
              <Select value={tipoCanal} onValueChange={setTipoCanal} disabled={enviando}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="col-span-2">
              <Label>Modelo de Mensagem</Label>
              <Select value={modeloSelecionado} onValueChange={setModeloSelecionado} disabled={enviando}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modelosMensagens).map(([key, { nome }]) => (
                    <SelectItem key={key} value={key}>{nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              className="min-h-[120px]"
              placeholder="A mensagem será gerada aqui..."
              disabled={enviando}
            />
          </div>

          {/* Seção de Agendamento */}
          <div className="p-4 border rounded-lg space-y-4 bg-gray-50">
            <div className="flex items-center space-x-2">
              <Switch
                id="scheduling-switch"
                checked={isScheduling}
                onCheckedChange={setIsScheduling}
                disabled={enviando}
              />
              <Label htmlFor="scheduling-switch">Agendar envio para mais tarde</Label>
            </div>
            {isScheduling && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="scheduled-date">Data do Envio</Label>
                  <Input 
                    type="date" 
                    id="scheduled-date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    disabled={enviando}
                  />
                </div>
                <div>
                  <Label htmlFor="scheduled-time">Hora do Envio</Label>
                  <Input 
                    type="time" 
                    id="scheduled-time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    disabled={enviando}
                  />
                </div>
              </div>
            )}
          </div>

          {resultadoEnvio && (
            <Alert className={`border-${resultadoEnvio.sucesso ? 'green' : 'yellow'}-200 bg-${resultadoEnvio.sucesso ? 'green' : 'yellow'}-50`}>
              <AlertCircle className={`h-4 w-4 text-${resultadoEnvio.sucesso ? 'green' : 'yellow'}-600`} />
              <AlertTitle className={`text-${resultadoEnvio.sucesso ? 'green' : 'yellow'}-800`}>{resultadoEnvio.mensagem}</AlertTitle>
              <AlertDescription className={`text-${resultadoEnvio.sucesso ? 'green' : 'yellow'}-700`}>
                {resultadoEnvio.detalhes}
              </AlertDescription>
            </Alert>
          )}
          
          {erro && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800">Erro ao Enviar</AlertTitle>
              <AlertDescription className="text-red-700 whitespace-pre-wrap">
                {erro}
              </AlertDescription>
            </Alert>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={enviando}>
            Fechar
          </Button>
          <Button onClick={handleAction} disabled={enviando || !isFormValid()}>
            {enviando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : isScheduling ? (
              <>
                <Clock className="w-4 h-4 mr-2" />
                Agendar Notificação
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar Agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}