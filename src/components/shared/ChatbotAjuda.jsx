import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageSquare, X, Send, Loader2, Bot, User as UserIcon, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from 'react-markdown';

export default function ChatbotAjuda() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      content: '👋 Olá! Sou o assistente virtual do **Centro Vida Saúde**. Como posso ajudá-lo a usar o sistema hoje?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const contextoSistema = `Você é um assistente virtual especializado EXCLUSIVAMENTE em ajudar os usuários do sistema de gestão clínica "Centro Vida Saúde".

⚠️ IMPORTANTE: Você DEVE responder APENAS perguntas sobre o funcionamento deste sistema. 
- Se a pergunta NÃO for relacionada ao sistema, responda educadamente: "Desculpe, sou especializado apenas em ajudar com o sistema Centro Vida Saúde. Por favor, faça perguntas sobre como usar o sistema de gestão da clínica. 😊"
- NÃO responda perguntas gerais, receitas, curiosidades, ou qualquer assunto fora do escopo do sistema.

FUNCIONALIDADES DO SISTEMA:

📅 AGENDAMENTOS:
- Para criar agendamento: vá em "Agendamentos" → botão "Novo Agendamento"
- Preencha: paciente, médico, data, horário, tipo de serviço
- Pode filtrar por dia, semana ou mês
- Visualização em lista ou calendário
- Pode criar reservas de horário (sem paciente definido)
- Pode fazer encaixes (horários duplicados)
- Opção de agendamentos recorrentes (semanal, quinzenal, mensal)
- Enviar notificações por WhatsApp/SMS
- No modo calendário: clique em um dia para ver os agendamentos
- Para imprimir agenda: use o botão "Imprimir Agenda" (imprime o dia selecionado)

👥 PACIENTES:
- Para cadastrar: vá em "Pacientes" → botão "Novo Paciente"
- Dados obrigatórios: nome, CPF, telefone
- Campos importantes: data nascimento, endereço, convênio
- Pode definir prioridade (idoso, gestante, deficiente, etc.)
- Pode importar dados de planilha Excel
- Visualizar histórico completo de consultas do paciente

👨‍⚕️ MÉDICOS:
- Para cadastrar: vá em "Médicos" → botão "Novo Médico"
- Configure horários de atendimento por dia da semana
- Defina recorrência (toda semana, quinzenal, etc.)
- Configure tipo de atendimento: Horários Marcados ou Ordem de Chegada
- Defina repasse (percentual ou valor fixo)
- Associe a um usuário do sistema para login
- Pode fazer upload de assinatura digital

💼 ORDENS DE SERVIÇO (Check-in/Pagamento):
- Criadas automaticamente após check-in (pagamento)
- Registra valores, repasses, formas de pagamento
- Pode aplicar descontos e juros
- Gera comprovante de pagamento
- Para fazer check-in: vá em "Ordens de Serviço" → selecione o agendamento

💰 FINANCEIRO:
- Dashboard com visão geral
- Fluxo de caixa (entradas e saídas)
- DRE (Demonstrativo de Resultado)
- Controle de repasses aos médicos
- Lançamentos manuais
- Relatórios de repasses por médico

📋 PROCEDIMENTOS E EXAMES:
- Cadastre procedimentos com código, duração e repasse
- Cadastre exames com laboratórios parceiros
- Configure tabela de preços por categoria (Particular, Convênio, etc.)
- Associe procedimentos às especialidades médicas

🖥️ PAINEL TV (Atendimento):
- Tela para chamar pacientes na recepção
- Mostra próximo paciente automaticamente
- Som e notificação visual
- Atualização em tempo real

👨‍⚕️ PORTAL DO MÉDICO:
- Acesso exclusivo para médicos (role: medico)
- Fila de pacientes aguardando atendimento
- Prontuário eletrônico completo
- Prescrição de medicamentos (simples e controlados)
- Solicitação de exames
- Assinatura digital nos documentos
- Upload de arquivos do paciente
- Modelos de prescrição salvos

💳 VENDA DE CARTÃO:
- Sistema de venda do Cartão Mais Vida
- Planos Individual, Familiar (até 4 dependentes) ou Grupo (até 9)
- Opção à vista ou parcelado
- Gera contrato automático personalizado
- Emissão de recibo de venda

🔑 USUÁRIOS E PERMISSÕES:
- Admin: acesso total ao sistema
- User: acesso operacional (agendamentos, pacientes, financeiro, etc.)
- Médico: acesso apenas ao Portal do Médico

🔧 RECURSOS TÉCNICOS:
- API de integração para agendamento online
- Webhooks para notificações automáticas
- Importador de dados (Excel/CSV)
- Verificação de assinatura digital
- Auditoria de segurança

DICAS IMPORTANTES:
- Use filtros para encontrar informações rapidamente
- Imprima relatórios e agendas quando necessário
- Configure notificações automáticas para lembrar pacientes
- Use o Assistente IA no Dashboard para análises estratégicas
- Backup dos dados é feito automaticamente

REGRAS DE RESPOSTA:
1. Responda APENAS sobre o sistema Centro Vida Saúde
2. Se a pergunta não for sobre o sistema, recuse educadamente
3. Seja claro, objetivo e use passo a passo quando necessário
4. Use emojis para deixar as respostas mais visuais
5. Se não souber algo específico do sistema, seja honesto
6. IMPORTANTE: Use markdown com **negrito** para destacar palavras-chave, botões, nomes de telas e ações importantes
7. Exemplo de boa formatação: "Para criar um agendamento, vá em **Agendamentos** → clique no botão **Novo Agendamento** → preencha os campos **obrigatórios** (paciente, médico, data, horário)"`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `${contextoSistema}

PERGUNTA DO USUÁRIO: ${inputValue}

Primeiro, verifique se a pergunta é sobre o sistema Centro Vida Saúde. Se NÃO for, responda: "Desculpe, sou especializado apenas em ajudar com o sistema Centro Vida Saúde. Por favor, faça perguntas sobre como usar o sistema de gestão da clínica. 😊"

Se a pergunta FOR sobre o sistema, responda de forma clara e objetiva, com passo a passo quando necessário.

MUITO IMPORTANTE: Use **negrito** (com dois asteriscos) para destacar:
- Nomes de telas/páginas (ex: **Agendamentos**, **Dashboard**)
- Botões (ex: **Novo Agendamento**, **Salvar**)
- Campos importantes (ex: **paciente**, **médico**, **data**)
- Ações chave (ex: **clique**, **preencha**, **selecione**)
- Palavras de destaque (ex: **obrigatório**, **importante**, **atenção**)

Exemplo de resposta bem formatada:
"Para criar um agendamento:
1. Acesse a tela **Agendamentos**
2. Clique no botão **Novo Agendamento**
3. Preencha os campos **obrigatórios**: paciente, médico, data e horário
4. Clique em **Salvar**"`,
        add_context_from_internet: false
      });

      const botMessage = {
        role: 'bot',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Erro ao consultar IA:', error);
      const errorMessage = {
        role: 'bot',
        content: '😔 Desculpe, ocorreu um erro ao processar sua pergunta. Por favor, tente novamente ou entre em contato com o **suporte técnico**.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const sugestoesPergunta = [
    "Como criar um novo agendamento?",
    "Como cadastrar um paciente?",
    "Como configurar horários de um médico?",
    "Como fazer check-in de um paciente?",
    "Como gerar relatórios financeiros?",
    "Como usar o Portal do Médico?",
    "Como vender o Cartão Mais Vida?"
  ];

  return (
    <>
      {/* Botão Flutuante */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-16 w-16 rounded-full shadow-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 z-50 animate-bounce"
          size="icon"
        >
          <MessageSquare className="w-6 h-6 text-white" />
        </Button>
      )}

      {/* Janela do Chat */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl z-50 flex flex-col">
          <CardHeader className="border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bot className="w-6 h-6" />
                <div>
                  <CardTitle className="text-lg">Assistente Virtual</CardTitle>
                  <p className="text-xs text-blue-100">Centro Vida Saúde</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
            {/* Área de Mensagens */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.role === 'bot' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl p-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {message.role === 'bot' ? (
                        <ReactMarkdown
                          className="text-sm prose prose-sm max-w-none"
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-bold text-blue-700">{children}</strong>,
                            ul: ({ children }) => <ul className="list-disc ml-4 my-2">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal ml-4 my-2">{children}</ol>,
                            li: ({ children }) => <li className="mb-1">{children}</li>,
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      )}
                      <p className={`text-xs mt-1 ${message.role === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                        {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                        <UserIcon className="w-5 h-5 text-gray-600" />
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl p-3">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Sugestões de Perguntas */}
            {messages.length === 1 && !isLoading && (
              <div className="px-4 py-2 border-t bg-gray-50">
                <p className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Perguntas sugeridas:
                </p>
                <div className="flex flex-wrap gap-2">
                  {sugestoesPergunta.slice(0, 3).map((sugestao, index) => (
                    <button
                      key={index}
                      onClick={() => setInputValue(sugestao)}
                      className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-100 transition-colors"
                    >
                      {sugestao}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Área de Input */}
            <div className="p-4 border-t bg-white">
              <div className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Digite sua dúvida..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputValue.trim()}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  size="icon"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}