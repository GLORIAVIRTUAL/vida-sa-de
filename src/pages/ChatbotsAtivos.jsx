import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Loader2, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ChatInterface from '../components/chatbot/ChatInterface';

export default function ChatbotsAtivos() {
  const [conversas, setConversas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);

  useEffect(() => {
    const carregarConversas = async () => {
      try {
        setCarregando(true);
        // Usar função backend para listar conversas
        const response = await base44.functions.invoke('listarConversasChatbot');
        const lista = response.data?.conversas || [];
        
        console.log('Conversas carregadas:', lista);
        
        setConversas(Array.isArray(lista) ? lista : []);
        
        // Selecionar primeira conversa automaticamente
        if (Array.isArray(lista) && lista.length > 0) {
          setConversaSelecionada(lista[0].id);
        }
      } catch (error) {
        console.error('Erro ao carregar conversas:', error);
      } finally {
        setCarregando(false);
      }
    };

    carregarConversas();
    
    // Atualizar conversas a cada 3 segundos
    const interval = setInterval(carregarConversas, 3000);
    return () => clearInterval(interval);
  }, []);

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const conversaSelecionadaDados = conversas.find(c => c.id === conversaSelecionada);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-8 h-8 text-green-600" />
            Chatbot Agendamentos
          </h1>
          <p className="text-gray-600 mt-2">Gerenciar conversas ativas do assistente de IA</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de Conversas */}
          <div>
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="border-b">
                <CardTitle className="text-lg">Conversas Ativas</CardTitle>
                <CardDescription>{conversas.length} conversa(s)</CardDescription>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto p-0">
                {conversas.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <p>Nenhuma conversa ainda</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {conversas.map((conversa) => (
                      <button
                        key={conversa.id}
                        onClick={() => setConversaSelecionada(conversa.id)}
                        className={`w-full text-left p-3 hover:bg-gray-50 transition border-l-2 ${
                          conversaSelecionada === conversa.id
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-transparent'
                        }`}
                      >
                        <p className="font-medium truncate">
                          {conversa.metadata?.senderName || conversa.metadata?.name || `Chat ${conversa.id.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {conversa.metadata?.phone || 'Sem telefone'}
                        </p>
                        <Badge className="mt-1 text-xs">
                          {conversa.messages?.length || 0} msg
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-2">
            {conversaSelecionadaDados ? (
              <ChatInterface
                key={conversaSelecionada}
                conversationId={conversaSelecionada}
                pacienteName={conversaSelecionadaDados.metadata?.senderName || conversaSelecionadaDados.metadata?.name || 'Cliente'}
                pacientePhone={conversaSelecionadaDados.metadata?.phone || 'N/A'}
              />
            ) : (
              <Card className="h-[600px] flex items-center justify-center">
                <div className="text-center">
                  <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Selecione uma conversa para começar</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}