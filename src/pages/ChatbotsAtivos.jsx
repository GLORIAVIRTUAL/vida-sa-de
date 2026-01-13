import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Loader2, Send, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';

export default function ChatbotsAtivos() {
  const [conversas, setConversas] = useState([]);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [inputMsg, setInputMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Buscar todas as conversas
  const buscarConversas = async () => {
    try {
      console.log('🔍 Buscando conversas...');
      const result = await base44.agents.listConversations({ agent_name: 'chatbot_agendamentos' });
      const lista = result?.conversations || [];
      
      console.log('✅ Total conversas:', lista.length);
      
      // Buscar detalhes de cada uma COM LOGS
      const detalhadas = [];
      for (const conv of lista) {
        try {
          const detalhes = await base44.agents.getConversation(conv.id);
          detalhadas.push(detalhes);
          console.log(`📊 ID: ${conv.id.substring(0, 8)}... | Msgs: ${detalhes.messages?.length || 0}`);
        } catch (err) {
          console.error('Erro ao buscar conversa:', conv.id, err.message);
        }
      }
      
      setConversas(detalhadas);
      
      // Auto-selecionar primeira
      if (detalhadas.length > 0 && !conversaSelecionada) {
        const primeira = detalhadas[0];
        setConversaSelecionada(primeira.id);
        setMensagens(primeira.messages || []);
        console.log('✅ Selecionada:', primeira.id.substring(0, 8));
      }
      
    } catch (error) {
      console.error('❌ Erro:', error);
    } finally {
      setCarregando(false);
    }
  };

  // Carregar inicial
  useEffect(() => {
    buscarConversas();
  }, []);

  // Inscrição em tempo real
  useEffect(() => {
    if (conversaSelecionada) {
      console.log('📡 Inscrevendo em:', conversaSelecionada.substring(0, 8));
      
      const unsubscribe = base44.agents.subscribeToConversation(conversaSelecionada, (data) => {
        console.log('🔔 Update recebido:', data.messages?.length || 0, 'mensagens');
        setMensagens(data.messages || []);
      });
      
      return () => {
        console.log('🔌 Desinscrevendo');
        unsubscribe();
      };
    }
  }, [conversaSelecionada]);

  // Atualizar lista a cada 10s
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 Auto-refresh');
      buscarConversas();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Enviar mensagem
  const enviarMensagem = async () => {
    if (!inputMsg.trim() || !conversaSelecionada) return;

    setEnviando(true);
    const texto = inputMsg;
    setInputMsg('');

    try {
      const conv = conversas.find(c => c.id === conversaSelecionada);
      await base44.agents.addMessage(conv, {
        role: 'user',
        content: texto
      });
      console.log('✅ Mensagem enviada');
    } catch (error) {
      console.error('❌ Erro:', error);
      alert('Erro: ' + error.message);
      setInputMsg(texto);
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Carregando conversas...</p>
        </div>
      </div>
    );
  }

  const conversaAtual = conversas.find(c => c.id === conversaSelecionada);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <MessageCircle className="w-8 h-8 text-green-600" />
              Chatbot Agendamentos
            </h1>
            <p className="text-gray-600 mt-1">
              {conversas.length} conversa(s) ativa(s)
            </p>
          </div>
          <Button onClick={buscarConversas} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Lista lateral */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Conversas</CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-[600px] overflow-y-auto">
                {conversas.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <p className="text-sm">Nenhuma conversa</p>
                    <p className="text-xs mt-1">Envie uma mensagem pelo WhatsApp</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {conversas.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setConversaSelecionada(conv.id);
                          setMensagens(conv.messages || []);
                        }}
                        className={`w-full text-left p-3 hover:bg-gray-50 transition ${
                          conversaSelecionada === conv.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''
                        }`}
                      >
                        <p className="font-medium text-sm truncate">
                          {conv.metadata?.senderName || conv.metadata?.name || 'Cliente'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {conv.metadata?.phone || 'Sem telefone'}
                        </p>
                        <Badge className="mt-1 text-xs" variant={
                          (conv.messages?.length || 0) > 0 ? 'default' : 'secondary'
                        }>
                          {conv.messages?.length || 0} msgs
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chat */}
          <div className="lg:col-span-3">
            <Card className="h-[600px] flex flex-col">
              {conversaAtual ? (
                <>
                  <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-green-50">
                    <CardTitle className="flex items-center justify-between">
                      <div>
                        <p className="text-lg">{conversaAtual.metadata?.senderName || 'Cliente'}</p>
                        <p className="text-xs text-gray-500 font-normal">
                          {conversaAtual.metadata?.phone}
                        </p>
                      </div>
                      <Badge>{mensagens.length} mensagens</Badge>
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                    {mensagens.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center text-gray-400">
                          <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Sem mensagens ainda</p>
                          <p className="text-xs">Aguardando resposta do agente...</p>
                        </div>
                      </div>
                    ) : (
                      mensagens.map((msg, i) => (
                        <div
                          key={i}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-md p-3 rounded-lg shadow-sm ${
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-900 border'
                            }`}
                          >
                            <ReactMarkdown className="text-sm prose prose-sm max-w-none">
                              {msg.content}
                            </ReactMarkdown>
                            {msg.role === 'assistant' && msg.tool_calls && (
                              <div className="text-xs opacity-70 mt-2">
                                🔧 {msg.tool_calls.length} ação(ões)
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>

                  <div className="border-t p-4 bg-white">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Digite uma mensagem..."
                        value={inputMsg}
                        onChange={(e) => setInputMsg(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !enviando && enviarMensagem()}
                        disabled={enviando}
                        className="flex-1"
                      />
                      <Button
                        onClick={enviarMensagem}
                        disabled={enviando || !inputMsg.trim()}
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
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-400">
                    <MessageCircle className="w-16 h-16 mx-auto mb-3 opacity-30" />
                    <p className="text-lg font-medium">Selecione uma conversa</p>
                    <p className="text-sm">Escolha uma conversa da lista ao lado</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}