import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';

export default function ChatInterface({ conversationId, pacienteName, pacientePhone }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [enviando, setEnviando] = useState(false);
  const messagesEndRef = useRef(null);

  // Carregar conversa diretamente do SDK
  useEffect(() => {
    if (!conversationId) return;

    const carregarConversa = async () => {
      try {
        const conversation = await base44.agents.getConversation(conversationId);
        
        console.log('✅ Conversa carregada:', conversationId);
        console.log('📨 Mensagens:', conversation?.messages?.length || 0);
        
        if (conversation?.messages && Array.isArray(conversation.messages)) {
          setMessages(conversation.messages);
        } else {
          console.log('⚠️ Conversa sem mensagens');
          setMessages([]);
        }
      } catch (error) {
        console.error('❌ Erro ao carregar conversa:', error);
        setMessages([]);
      }
    };

    carregarConversa();

    // Polling a cada 3 segundos
    const pollInterval = setInterval(carregarConversa, 3000);

    return () => clearInterval(pollInterval);
  }, [conversationId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const enviarMensagem = async () => {
    if (!inputValue.trim() || !conversationId) return;

    setEnviando(true);
    const textoEnviado = inputValue;
    setInputValue('');

    try {
      // Buscar conversa completa
      const conversation = await base44.agents.getConversation(conversationId);
      
      // Adicionar mensagem
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: textoEnviado
      });

      // Recarregar imediatamente
      const conversaAtualizada = await base44.agents.getConversation(conversationId);
      if (conversaAtualizada?.messages) {
        setMessages(conversaAtualizada.messages);
      }

    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Erro ao enviar mensagem: ' + error.message);
      setInputValue(textoEnviado);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b bg-blue-50">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          {pacienteName}
          <span className="text-xs font-normal text-gray-500 ml-auto">{pacientePhone}</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Nenhuma mensagem ainda</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs p-3 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}>
                <ReactMarkdown className="text-sm">
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      <div className="border-t p-4 space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Digite uma mensagem..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && enviarMensagem()}
            disabled={enviando}
          />
          <Button
            onClick={enviarMensagem}
            disabled={enviando || !inputValue.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {enviando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}