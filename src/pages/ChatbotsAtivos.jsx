import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Loader2, Send, RefreshCw, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';

export default function ChatbotsAtivos() {
  const [contatos, setContatos] = useState([]);
  const [contatoSelecionado, setContatoSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [inputMsg, setInputMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Buscar todos os contatos com histórico
  const buscarContatos = async () => {
    try {
      console.log('🔍 Buscando contatos...');
      const lista = await base44.entities.Contato.list('-updated_date', 50);
      
      // Filtrar apenas contatos que têm histórico de mensagens
      const comHistorico = lista.filter(c => 
        (c.historico_mensagens && c.historico_mensagens.length > 0) ||
        c.ultima_mensagem
      );
      
      console.log('✅ Total contatos com histórico:', comHistorico.length);
      setContatos(comHistorico);
      
      // Auto-selecionar primeiro se nenhum selecionado
      if (comHistorico.length > 0 && !contatoSelecionado) {
        setContatoSelecionado(comHistorico[0]);
      }
      
    } catch (error) {
      console.error('❌ Erro:', error);
    } finally {
      setCarregando(false);
    }
  };

  // Carregar inicial
  useEffect(() => {
    buscarContatos();
  }, []);

  // Atualizar lista a cada 10s
  useEffect(() => {
    const interval = setInterval(() => {
      buscarContatos();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Atualizar contato selecionado quando a lista atualiza
  useEffect(() => {
    if (contatoSelecionado && contatos.length > 0) {
      const atualizado = contatos.find(c => c.id === contatoSelecionado.id);
      if (atualizado) {
        setContatoSelecionado(atualizado);
      }
    }
  }, [contatos]);

  // Enviar mensagem via função backend
  const enviarMensagem = async () => {
    if (!inputMsg.trim() || !contatoSelecionado) return;

    setEnviando(true);
    const texto = inputMsg;
    setInputMsg('');

    try {
      // Chamar função que processa e envia WhatsApp
      const response = await base44.functions.invoke('processarMensagemAgente', {
        phoneNumber: contatoSelecionado.telefone,
        messageText: texto,
        senderName: 'Operador',
        pacienteId: contatoSelecionado.paciente_id
      });
      
      console.log('✅ Resposta:', response.data);
      
      // Atualizar lista
      await buscarContatos();
      
    } catch (error) {
      console.error('❌ Erro:', error);
      alert('Erro: ' + error.message);
      setInputMsg(texto);
    } finally {
      setEnviando(false);
    }
  };

  // Montar mensagens a partir do contato
  const getMensagens = (contato) => {
    if (!contato) return [];
    
    // Se tem histórico estruturado
    if (contato.historico_mensagens && contato.historico_mensagens.length > 0) {
      return contato.historico_mensagens;
    }
    
    // Fallback: montar a partir de ultima_mensagem/ultima_resposta
    const msgs = [];
    if (contato.ultima_mensagem) {
      msgs.push({ role: 'user', content: contato.ultima_mensagem });
    }
    if (contato.ultima_resposta) {
      msgs.push({ role: 'assistant', content: contato.ultima_resposta });
    }
    return msgs;
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

  const mensagens = getMensagens(contatoSelecionado);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <MessageCircle className="w-8 h-8 text-green-600" />
              Chatbot WhatsApp
            </h1>
            <p className="text-gray-600 mt-1">
              {contatos.length} conversa(s) ativa(s)
            </p>
          </div>
          <Button onClick={buscarContatos} variant="outline">
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
                {contatos.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <p className="text-sm">Nenhuma conversa</p>
                    <p className="text-xs mt-1">Envie uma mensagem pelo WhatsApp</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {contatos.map((contato) => (
                      <button
                        key={contato.id}
                        onClick={() => setContatoSelecionado(contato)}
                        className={`w-full text-left p-3 hover:bg-gray-50 transition ${
                          contatoSelecionado?.id === contato.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <p className="font-medium text-sm truncate">
                            {contato.nome || 'Cliente'}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-1">
                          {contato.telefone}
                        </p>
                        {contato.ultima_mensagem && (
                          <p className="text-xs text-gray-400 truncate mt-1">
                            {contato.ultima_mensagem.substring(0, 30)}...
                          </p>
                        )}
                        <Badge className="mt-1 text-xs" variant="default">
                          {contato.status || 'Novo'}
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
              {contatoSelecionado ? (
                <>
                  <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-green-50">
                    <CardTitle className="flex items-center justify-between">
                      <div>
                        <p className="text-lg">{contatoSelecionado.nome || 'Cliente'}</p>
                        <p className="text-xs text-gray-500 font-normal">
                          {contatoSelecionado.telefone}
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
                                ? 'bg-green-600 text-white'
                                : 'bg-white text-gray-900 border'
                            }`}
                          >
                            <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>p]:m-0">
                              {msg.content}
                            </ReactMarkdown>
                            {msg.timestamp && (
                              <p className="text-xs opacity-60 mt-1">
                                {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
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
                        className="bg-green-600 hover:bg-green-700"
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