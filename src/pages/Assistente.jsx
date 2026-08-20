import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Send, Loader2, Bot, Plus } from 'lucide-react';
import MessageBubble from '@/components/agente/MessageBubble';

const AGENT_NAME = 'assistente_clinica';

export default function Assistente() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef(null);

  const iniciar = async () => {
    const conv = await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: { name: 'Conversa com o Assistente' }
    });
    setConversation(conv);
    setMessages(conv.messages || []);
  };

  useEffect(() => { iniciar(); }, []);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim() || !conversation || enviando) return;
    const conteudo = texto;
    setTexto('');
    setEnviando(true);
    try {
      await base44.agents.addMessage(conversation, { role: 'user', content: conteudo });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto h-[calc(100vh-9rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">Assistente do Sistema</h1>
            <p className="text-sm text-gray-500">Pergunte sobre agendamentos, pacientes, OS e financeiro</p>
          </div>
        </div>
        <Button variant="outline" onClick={iniciar}>
          <Plus className="w-4 h-4 mr-2" />
          Nova conversa
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-10">
              Envie uma pergunta para começar. Ex: "Quantos agendamentos temos hoje?"
            </p>
          )}
          {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
          <div ref={fimRef} />
        </CardContent>
        <form onSubmit={enviar} className="p-3 border-t bg-white flex gap-2">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Digite sua pergunta..."
            disabled={!conversation}
          />
          <Button type="submit" disabled={!texto.trim() || enviando || !conversation}>
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </Card>
    </div>
  );
}