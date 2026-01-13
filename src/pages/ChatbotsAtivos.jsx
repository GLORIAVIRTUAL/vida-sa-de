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
      
      console.log('✅ Conversas encontradas:', lista.length);
      
      // Buscar detalhes de cada uma
      const detalhadas = [];
      for (const conv of lista) {
        try {
          const detalhes = await base44.agents.getConversation(conv.id);
          detalhadas.push(detalhes);
          console.log(`📊 Conversa ${conv.id}: ${detalhes.messages?.length || 0} mensagens`);
        } catch (err) {
          console.error('Erro ao buscar conversa:', conv.id, err);
        }
      }
      
      setConversas(detalhadas);
      
      // Selecionar primeira se houver
      if (detalhadas.length > 0 && !conversaSelecionada) {
        setConversaSelecionada(detalhadas[0].id);
        setMensagens(detalhadas[0].messages || []);
      }
      
    } catch (error) {
      console.error('❌ Erro ao buscar conversas:', error);
    } finally {
      setCarregando(false);
    }
  };

  // Carregar na montagem
  useEffect(() => {
    buscarConversas();
    const interval = setInterval(buscarConversas, 5000);
    return () => clearInterval(interval);
  }, []);

  // Atualizar mensagens quando selecionar conversa
  useEffect(() => {
    if (conversaSelecionada) {
      const conv = conversas.find(c => c.id === conversaSelecionada);
      if (conv) {
        setMensagens(conv.messages || []);
        console.log('📨 Mensagens carregadas:', conv.messages?.length || 0);
      }
    }
  }, [conversaSelecionada, conversas]);

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

      // Recarregar conversa
      await buscarConversas();
    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Erro: ' + error.message);
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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
              <CardHeader>
                <CardTitle className="text-sm">Conversas</CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-[600px] overflow-y-auto">
                {conversas.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <p className="text-sm">Nenhuma conversa</p>
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
                        <Badge className="mt-1 text-xs">
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
                  <CardHeader className="border-b bg-blue-50">
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

                  <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                    {mensagens.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        <p>Sem mensagens</p>
                      </div>
                    ) : (
                      mensagens.map((msg, i) => (
                        <div
                          key={i}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-md p-3 rounded-lg ${
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-900'
                            }`}
                          >
                            <ReactMarkdown className="text-sm">
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>

                  <div className="border-t p-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Digite uma mensagem..."
                        value={inputMsg}
                        onChange={(e) => setInputMsg(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && enviarMensagem()}
                        disabled={enviando}
                      />
                      <Button
                        onClick={enviarMensagem}
                        disabled={enviando || !inputMsg.trim()}
                        className="bg-blue-600"
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
                    <MessageCircle className="w-12 h-12 mx-auto mb-3" />
                    <p>Selecione uma conversa</p>
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