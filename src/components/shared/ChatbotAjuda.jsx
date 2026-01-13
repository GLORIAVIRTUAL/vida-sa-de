import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, X, Send, Loader2, Bot, User as UserIcon, Sparkles, CheckCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from 'react-markdown';

const especialidades = [
  "Cardiologia", "Clínico Geral", "Dermatologia", "Endocrinologia",
  "Gastroenterologia", "Geriatria", "Ginecologia", "Neurologia",
  "Nutricionista", "Oftalmologia", "Ortopedia", "Otorrinolaringologia",
  "Pediatria", "Psicologia", "Psiquiatria", "Urologia"
];

export default function ChatbotAjuda() {
  const [isOpen, setIsOpen] = useState(false);
  const [etapa, setEtapa] = useState('form'); // form ou chat
  const [dadosContato, setDadosContato] = useState({
    nome: '',
    telefone: '',
    motivo: '',
    especialidade: ''
  });
  const [salvandoContato, setSalvandoContato] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const formatarTelefone = (valor) => {
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    if (numeros.length <= 11) return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`;
  };

  const iniciarChat = async () => {
    if (!dadosContato.nome || !dadosContato.telefone || !dadosContato.motivo) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    setSalvandoContato(true);
    
    try {
      // Salvar contato na entidade Contato
      const telefoneFormatado = dadosContato.telefone.replace(/\D/g, '');
      
      // Verificar se já existe
      const contatosExistentes = await base44.entities.Contato.filter({ telefone: telefoneFormatado });
      
      let motivoCompleto = dadosContato.motivo;
      if (dadosContato.motivo === 'consulta' && dadosContato.especialidade) {
        motivoCompleto = `Consulta - ${dadosContato.especialidade}`;
      }

      if (contatosExistentes.length === 0) {
        await base44.entities.Contato.create({
          nome: dadosContato.nome,
          telefone: telefoneFormatado,
          origem: 'Site',
          status: 'Novo',
          interesses: [motivoCompleto],
          observacoes: `Motivo: ${motivoCompleto}`,
          ultima_interacao: new Date().toISOString()
        });
      } else {
        // Atualizar contato existente
        await base44.entities.Contato.update(contatosExistentes[0].id, {
          nome: dadosContato.nome,
          interesses: [...(contatosExistentes[0].interesses || []), motivoCompleto],
          ultima_interacao: new Date().toISOString()
        });
      }

      // Iniciar chat com mensagem de boas-vindas personalizada
      setMessages([{
        role: 'bot',
        content: `👋 Olá **${dadosContato.nome}**! Sou a assistente virtual do **Centro Vida Saúde**.\n\nVi que você tem interesse em: **${motivoCompleto}**\n\nComo posso ajudá-lo hoje?`,
        timestamp: new Date()
      }]);
      
      setEtapa('chat');
    } catch (error) {
      console.error('Erro ao salvar contato:', error);
      // Mesmo com erro, permite continuar
      setMessages([{
        role: 'bot',
        content: `👋 Olá **${dadosContato.nome}**! Sou a assistente virtual do **Centro Vida Saúde**. Como posso ajudá-lo?`,
        timestamp: new Date()
      }]);
      setEtapa('chat');
    } finally {
      setSalvandoContato(false);
    }
  };

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
      const contextoSistema = `Você é um assistente virtual do Centro Vida Saúde para PACIENTES e VISITANTES do site.

DADOS DO CLIENTE:
- Nome: ${dadosContato.nome}
- Telefone: ${dadosContato.telefone}
- Motivo do contato: ${dadosContato.motivo}${dadosContato.especialidade ? ` (${dadosContato.especialidade})` : ''}

VOCÊ DEVE:
1. Sempre usar o nome do cliente (${dadosContato.nome}) de forma natural na conversa
2. Ajudar com informações sobre agendamento de consultas
3. Informar sobre especialidades, exames e procedimentos
4. Orientar sobre localização e horários de funcionamento
5. Ser educado, prestativo e profissional

INFORMAÇÕES DA CLÍNICA:
- Endereço: Av. Isabel, 29 – Sobreloja, Santa Cruz, Rio de Janeiro – RJ
- Funcionamento: Segunda a Sexta das 7h às 18h, Sábado das 7h às 12h
- Telefone/WhatsApp: (21) XXXX-XXXX

ESPECIALIDADES DISPONÍVEIS:
Cardiologia, Clínico Geral, Dermatologia, Endocrinologia, Gastroenterologia, Geriatria, Ginecologia, Neurologia, Nutricionista, Oftalmologia, Ortopedia, Otorrinolaringologia, Pediatria, Psicologia, Psiquiatria, Urologia

EXAMES:
- Laboratoriais: sangue, urina, fezes, etc.
- De Imagem: raio-x, ultrassom, eletrocardiograma

REGRAS:
- Use **negrito** para destacar informações importantes
- Seja conciso e objetivo
- Se não souber algo específico, sugira ligar ou ir presencialmente
- SEMPRE personalize usando o nome do cliente`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `${contextoSistema}

MENSAGEM DO CLIENTE (${dadosContato.nome}): ${inputValue}

Responda de forma personalizada, usando o nome do cliente quando apropriado.`,
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
        content: `😔 Desculpe ${dadosContato.nome}, ocorreu um erro. Por favor, tente novamente ou entre em contato pelo WhatsApp.`,
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
      if (etapa === 'form') {
        iniciarChat();
      } else {
        handleSendMessage();
      }
    }
  };

  const resetChat = () => {
    setEtapa('form');
    setDadosContato({ nome: '', telefone: '', motivo: '', especialidade: '' });
    setMessages([]);
  };

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
            {etapa === 'form' ? (
              /* Formulário de Contato */
              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="text-center mb-4">
                  <h3 className="font-semibold text-gray-800">Olá! 👋</h3>
                  <p className="text-sm text-gray-600">Para iniciar, preencha seus dados:</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="nome" className="text-sm">Nome completo *</Label>
                    <Input
                      id="nome"
                      placeholder="Seu nome"
                      value={dadosContato.nome}
                      onChange={(e) => setDadosContato({...dadosContato, nome: e.target.value})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="telefone" className="text-sm">Telefone/WhatsApp *</Label>
                    <Input
                      id="telefone"
                      placeholder="(00) 00000-0000"
                      value={dadosContato.telefone}
                      onChange={(e) => setDadosContato({...dadosContato, telefone: formatarTelefone(e.target.value)})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="motivo" className="text-sm">Motivo do contato *</Label>
                    <Select 
                      value={dadosContato.motivo} 
                      onValueChange={(value) => setDadosContato({...dadosContato, motivo: value, especialidade: ''})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consulta">Consulta médica</SelectItem>
                        <SelectItem value="exame_lab">Exames laboratoriais</SelectItem>
                        <SelectItem value="exame_imagem">Exames de imagem</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {dadosContato.motivo === 'consulta' && (
                    <div>
                      <Label htmlFor="especialidade" className="text-sm">Especialidade</Label>
                      <Select 
                        value={dadosContato.especialidade} 
                        onValueChange={(value) => setDadosContato({...dadosContato, especialidade: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a especialidade" />
                        </SelectTrigger>
                        <SelectContent>
                          {especialidades.map(esp => (
                            <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <Button 
                  onClick={iniciarChat} 
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  disabled={salvandoContato || !dadosContato.nome || !dadosContato.telefone || !dadosContato.motivo}
                >
                  {salvandoContato ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Iniciando...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Iniciar Conversa
                    </>
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  Seus dados serão usados apenas para melhor atendê-lo.
                </p>
              </div>
            ) : (
              /* Chat */
              <>
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

                {/* Info do usuário */}
                <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-600 flex items-center justify-between">
                  <span>👤 {dadosContato.nome}</span>
                  <button onClick={resetChat} className="text-blue-600 hover:underline">
                    Nova conversa
                  </button>
                </div>

                {/* Área de Input */}
                <div className="p-4 border-t bg-white">
                  <div className="flex gap-2">
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Digite sua mensagem..."
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
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}