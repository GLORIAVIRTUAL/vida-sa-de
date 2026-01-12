import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Phone, 
  Calendar, 
  MessageCircle,
  CheckCircle,
  XCircle,
  Clock,
  User
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const estagios = [
  { id: 'novo', nome: 'Novo Contato', cor: 'bg-blue-500', icon: MessageCircle },
  { id: 'atendimento', nome: 'Em Atendimento', cor: 'bg-yellow-500', icon: Clock },
  { id: 'agendado', nome: 'Agendamento Confirmado', cor: 'bg-green-500', icon: Calendar },
  { id: 'concluido', nome: 'Concluído', cor: 'bg-gray-500', icon: CheckCircle },
  { id: 'perdido', nome: 'Perdido', cor: 'bg-red-500', icon: XCircle }
];

export default function ChatbotPipeline() {
  const [conversas, setConversas] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarConversas();
  }, []);

  const carregarConversas = async () => {
    try {
      setLoading(true);
      const lista = await base44.agents.listConversations({
        agent_name: 'chatbot_agendamentos'
      });
      
      const conversasArray = Array.isArray(lista) ? lista : [];
      setConversas(conversasArray);
      
      // Organizar conversas por estágio
      const pipelineOrganizado = {
        novo: [],
        atendimento: [],
        agendado: [],
        concluido: [],
        perdido: []
      };

      conversasArray.forEach(conversa => {
        const estagio = conversa.metadata?.pipeline_stage || 'novo';
        if (pipelineOrganizado[estagio]) {
          pipelineOrganizado[estagio].push(conversa);
        }
      });

      setPipeline(pipelineOrganizado);
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
    } finally {
      setLoading(false);
    }
  };

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Atualizar estado local
    const novoPipeline = { ...pipeline };
    const conversaMovida = novoPipeline[source.droppableId][source.index];
    
    // Remover do estágio antigo
    novoPipeline[source.droppableId].splice(source.index, 1);
    
    // Adicionar ao novo estágio
    novoPipeline[destination.droppableId].splice(destination.index, 0, conversaMovida);
    
    setPipeline(novoPipeline);

    // Atualizar no servidor
    try {
      await base44.agents.updateConversation(draggableId, {
        metadata: {
          ...conversaMovida.metadata,
          pipeline_stage: destination.droppableId
        }
      });
    } catch (error) {
      console.error('Erro ao atualizar estágio:', error);
      // Reverter em caso de erro
      carregarConversas();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pipeline de Atendimento</h1>
            <p className="text-gray-600 mt-2">
              Gerencie o funil de conversas do chatbot
            </p>
          </div>
          <Button onClick={carregarConversas} variant="outline">
            Atualizar
          </Button>
        </div>

        {/* Estatísticas Rápidas */}
        <div className="grid grid-cols-5 gap-4">
          {estagios.map((estagio) => {
            const Icon = estagio.icon;
            const count = pipeline[estagio.id]?.length || 0;
            return (
              <Card key={estagio.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{estagio.nome}</p>
                      <p className="text-2xl font-bold mt-1">{count}</p>
                    </div>
                    <div className={`${estagio.cor} p-3 rounded-lg`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Pipeline Board */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-5 gap-4">
            {estagios.map((estagio) => {
              const Icon = estagio.icon;
              return (
                <div key={estagio.id} className="flex flex-col">
                  {/* Header da Coluna */}
                  <div className={`${estagio.cor} text-white p-3 rounded-t-lg`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <span className="font-semibold text-sm">{estagio.nome}</span>
                      </div>
                      <Badge variant="secondary" className="bg-white/20 text-white">
                        {pipeline[estagio.id]?.length || 0}
                      </Badge>
                    </div>
                  </div>

                  {/* Cards das Conversas */}
                  <Droppable droppableId={estagio.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 bg-gray-100 p-2 rounded-b-lg min-h-[600px] space-y-2 ${
                          snapshot.isDraggingOver ? 'bg-blue-50' : ''
                        }`}
                      >
                        {pipeline[estagio.id]?.map((conversa, index) => (
                          <Draggable
                            key={conversa.id}
                            draggableId={conversa.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`cursor-move hover:shadow-md transition ${
                                  snapshot.isDragging ? 'shadow-lg rotate-2' : ''
                                }`}
                              >
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                      <User className="w-4 h-4 text-gray-400" />
                                      <p className="font-medium text-sm truncate">
                                        {conversa.metadata?.senderName || 'Cliente'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 text-xs text-gray-500">
                                    <Phone className="w-3 h-3" />
                                    <span className="truncate">
                                      {conversa.metadata?.phone || 'Sem telefone'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between pt-2 border-t">
                                    <Badge variant="outline" className="text-xs">
                                      {conversa.messages?.length || 0} msgs
                                    </Badge>
                                    <span className="text-xs text-gray-400">
                                      {conversa.created_date && 
                                        format(new Date(conversa.created_date), 'dd/MM', { locale: ptBR })
                                      }
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}

                        {pipeline[estagio.id]?.length === 0 && (
                          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                            Nenhuma conversa
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}