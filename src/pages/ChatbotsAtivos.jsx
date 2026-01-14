import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageCircle, Loader2, Send, RefreshCw, User, Phone, Calendar,
  TrendingUp, Clock, CheckCircle, XCircle, Activity, Users, Settings, Bot,
  Image, Paperclip, Mic, Smile
} from 'lucide-react';
import ChatToolbar from '../components/gloria/ChatToolbar';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import ContatosTab from '../components/gloria/ContatosTab';
import { UserPlus } from 'lucide-react';
import CadastroRapidoPaciente from '../components/pacientes/CadastroRapidoPaciente';

// Função para renderizar conteúdo de mensagem (texto, imagem, documento, áudio)
function renderMensagemContent(content, isUser) {
  if (!content) return null;
  
  // Detectar URLs de mídia no conteúdo
  const urlMatch = content.match(/(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|mp3|ogg|wav|webm|m4a))/i);
  
  // Detectar padrões de mídia enviada
  const isImage = /\[.*📷.*\]|📷 Imagem|\.(?:jpg|jpeg|png|gif|webp)/i.test(content);
  const isDocument = /\[.*📎.*\]|📄 Documento|Arquivo:|\.(?:pdf|doc|docx)/i.test(content);
  const isAudio = /\[.*🎤.*\]|🎤 Áudio|Áudio enviado/i.test(content);
  
  // Se encontrou URL de mídia
  if (urlMatch) {
    const url = urlMatch[1];
    const ext = urlMatch[2].toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return (
        <div className="space-y-2">
          <img src={url} alt="Imagem" className="max-w-full rounded-lg max-h-64 object-contain" />
          {content.replace(url, '').trim() && (
            <p className="text-sm">{content.replace(url, '').trim()}</p>
          )}
        </div>
      );
    }
    
    if (ext === 'pdf' || ext === 'doc' || ext === 'docx') {
      return (
        <div className="space-y-2">
          <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer"
            className={`flex items-center gap-2 p-2 rounded ${isUser ? 'bg-gray-100 hover:bg-gray-200' : 'bg-blue-500 hover:bg-blue-400'}`}
          >
            <span>📄</span>
            <span className="text-sm underline">Abrir documento</span>
          </a>
        </div>
      );
    }
    
    if (['mp3', 'ogg', 'wav', 'webm', 'm4a'].includes(ext)) {
      return (
        <div className="space-y-2">
          <audio controls className="max-w-full">
            <source src={url} type={`audio/${ext === 'm4a' ? 'mp4' : ext}`} />
          </audio>
        </div>
      );
    }
  }
  
  // Se é indicação de mídia mas sem URL visível, mostrar como está
  if (isImage || isDocument || isAudio) {
    // Tentar extrair URL do histórico formatado [👤 Nome]: conteúdo
    const cleanContent = content.replace(/\[👤[^\]]*\]:\s*/, '');
    return <p className="text-sm">{cleanContent}</p>;
  }
  
  // Texto normal - usar ReactMarkdown
  return null; // Retorna null para usar ReactMarkdown padrão
}

// ========== COMPONENTE: CHAT ==========
function ChatTab() {
  const [contatos, setContatos] = useState([]);
  const [contatoSelecionado, setContatoSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [inputMsg, setInputMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [modoHumano, setModoHumano] = useState(false);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  
  const chatContainerRef = useRef(null);
  
  // Scroll para última mensagem (apenas dentro do container do chat)
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [contatoSelecionado?.historico_mensagens]);

  const buscarContatos = async () => {
    try {
      const lista = await base44.entities.Contato.list('-updated_date', 50);
      const comHistorico = lista.filter(c => 
        (c.historico_mensagens && c.historico_mensagens.length > 0) || c.ultima_mensagem
      );
      // Ordenar: ativos primeiro (não finalizados), finalizados por último
      const ordenados = [...comHistorico].sort((a, b) => {
        const aFinalizado = a.conversa_finalizada === true;
        const bFinalizado = b.conversa_finalizada === true;
        if (aFinalizado && !bFinalizado) return 1;
        if (!aFinalizado && bFinalizado) return -1;
        return 0;
      });
      setContatos(ordenados);
      if (ordenados.length > 0 && !contatoSelecionado) {
        setContatoSelecionado(ordenados[0]);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { buscarContatos(); }, []);
  useEffect(() => {
    const interval = setInterval(buscarContatos, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (contatoSelecionado && contatos.length > 0) {
      const atualizado = contatos.find(c => c.id === contatoSelecionado.id);
      if (atualizado && atualizado.id === contatoSelecionado.id) {
        // Apenas atualizar o contato atual, não trocar
        setContatoSelecionado(atualizado);
        setModoHumano(atualizado.atendimento_humano || false);
      }
    }
  }, [contatos, contatoSelecionado?.id]);

  useEffect(() => {
    if (contatoSelecionado) {
      setModoHumano(contatoSelecionado.atendimento_humano || false);
    }
  }, [contatoSelecionado?.id]);

  const enviarMensagem = async (textoCustom, skipRefresh = false) => {
    const texto = textoCustom || inputMsg;
    if (!texto.trim() || !contatoSelecionado) return;
    setEnviando(true);
    if (!textoCustom) setInputMsg('');
    try {
      if (modoHumano) {
        // Modo humano: enviar direto pelo WhatsApp sem passar pela IA
        await base44.functions.invoke('enviarMensagemHumano', {
          phoneNumber: contatoSelecionado.telefone,
          messageText: texto,
          contatoId: contatoSelecionado.id
        });
      } else {
        await base44.functions.invoke('processarMensagemAgente', {
          phoneNumber: contatoSelecionado.telefone,
          messageText: texto,
          senderName: 'Operador',
          pacienteId: contatoSelecionado.paciente_id
        });
      }
      if (!skipRefresh) await buscarContatos();
    } catch (error) {
      alert('Erro: ' + error.message);
      if (!textoCustom) setInputMsg(texto);
    } finally {
      setEnviando(false);
    }
  };

  const finalizarConversa = async () => {
    if (!contatoSelecionado) return;
    try {
      await base44.entities.Contato.update(contatoSelecionado.id, {
        status: 'Cliente',
        conversa_finalizada: true,
        atendimento_humano: false
      });
      // Atualizar o contato selecionado localmente para refletir a mudança imediata
      setContatoSelecionado({...contatoSelecionado, conversa_finalizada: true, status: 'Cliente', atendimento_humano: false});
      await buscarContatos();
    } catch (error) {
      console.error('Erro ao finalizar:', error);
      alert('Erro ao finalizar: ' + error.message);
    }
  };

  const toggleAtendimentoHumano = async () => {
    if (!contatoSelecionado) return;
    const novoModo = !modoHumano;
    try {
      await base44.entities.Contato.update(contatoSelecionado.id, {
        atendimento_humano: novoModo
      });
      setModoHumano(novoModo);
    } catch (error) {
      alert('Erro: ' + error.message);
    }
  };

  const getMensagens = (contato) => {
    if (!contato) return [];
    if (contato.historico_mensagens?.length > 0) return contato.historico_mensagens;
    const msgs = [];
    if (contato.ultima_mensagem) msgs.push({ role: 'user', content: contato.ultima_mensagem });
    if (contato.ultima_resposta) msgs.push({ role: 'assistant', content: contato.ultima_resposta });
    return msgs;
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const mensagens = getMensagens(contatoSelecionado);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              Conversas
              <Button onClick={buscarContatos} variant="ghost" size="sm">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[500px] overflow-y-auto">
            {contatos.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Nenhuma conversa</div>
            ) : (
              <div className="divide-y">
                {contatos.map((contato) => (
                  <button
                    key={contato.id}
                    onClick={() => setContatoSelecionado(contato)}
                    className={`w-full text-left p-3 hover:bg-gray-50 transition ${
                      contatoSelecionado?.id === contato.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''
                    } ${contato.conversa_finalizada ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate flex-1">{contato.nome || 'Cliente'}</p>
                      {contato.conversa_finalizada && (
                        <Badge className="bg-gray-200 text-gray-600 text-[10px] px-1 py-0">Concluído</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{contato.telefone}</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-3">
        <Card className="h-[500px] flex flex-col">
          {contatoSelecionado ? (
            <>
              <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-sky-50 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{contatoSelecionado.nome || 'Cliente'}</p>
                    <p className="text-xs text-gray-500">{contatoSelecionado.telefone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant={modoHumano ? "default" : "outline"} 
                      size="sm"
                      onClick={toggleAtendimentoHumano}
                      className={modoHumano ? "bg-green-500 hover:bg-green-600" : ""}
                    >
                      <User className="w-3 h-3 mr-1" />
                      {modoHumano ? "Humano Ativo" : "Assumir"}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setModalCadastroAberto(true)}
                      className="text-green-600 hover:bg-green-50"
                    >
                      <UserPlus className="w-3 h-3 mr-1" />
                      Cadastrar
                    </Button>
                    <Button variant="outline" size="sm" onClick={finalizarConversa} className="text-red-600 hover:bg-red-50">
                      <XCircle className="w-3 h-3 mr-1" />
                      Finalizar
                    </Button>
                  </div>
                </div>
                {modoHumano && (
                  <div className="mt-2 p-2 bg-green-100 rounded-lg text-xs text-green-800 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span><strong>Atendimento humano ativo</strong> - A IA está pausada. Clique em "Assumir" novamente para reativar a Glória.</span>
                  </div>
                )}
              </CardHeader>
              <CardContent ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 flex flex-col">
                {mensagens.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <MessageCircle className="w-12 h-12 opacity-30" />
                  </div>
                ) : (
                  <>
                    {mensagens.map((msg, i) => {
                      const isHumano = msg.humano || msg.content?.includes('[👤');
                      const customRender = renderMensagemContent(msg.content, msg.role === 'user');
                      
                      return (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-md rounded-lg shadow-sm ${
                            msg.role === 'user' 
                              ? 'bg-white text-gray-900 border' 
                              : isHumano 
                                ? 'bg-green-100 text-green-900' 
                                : 'bg-blue-600 text-white'
                          }`}>
                            <div className="p-3">
                              {customRender ? customRender : (
                                <p className="text-sm whitespace-pre-wrap">{msg.content || ''}</p>
                              )}
                            </div>
                            {msg.timestamp && (
                              <div className={`px-3 pb-2 text-[10px] ${
                                msg.role === 'user' 
                                  ? 'text-gray-400' 
                                  : isHumano 
                                    ? 'text-green-600' 
                                    : 'text-blue-200'
                              }`}>
                                {format(new Date(msg.timestamp), 'HH:mm', { locale: ptBR })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </CardContent>
              <div className="border-t p-3 bg-white space-y-2">
                {modoHumano && (
                  <ChatToolbar
                    onSendMessage={enviarMensagem}
                    inputValue={inputMsg}
                    onInputChange={setInputMsg}
                    disabled={enviando}
                    phoneNumber={contatoSelecionado.telefone}
                    contatoId={contatoSelecionado.id}
                  />
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite uma mensagem..."
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !enviando && enviarMensagem()}
                    disabled={enviando}
                  />
                  <Button onClick={() => enviarMensagem()} disabled={enviando || !inputMsg.trim()} className="bg-blue-600 hover:bg-blue-700">
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 mx-auto mb-2 opacity-30" />
                <p>Selecione uma conversa</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <CadastroRapidoPaciente
        open={modalCadastroAberto}
        onClose={() => setModalCadastroAberto(false)}
        nomeInicial={contatoSelecionado?.nome}
        telefoneInicial={contatoSelecionado?.telefone}
      />
    </div>
  );
}

// ========== COMPONENTE: PIPELINE ==========
const estagios = [
  { id: 'novo', nome: 'Novo', cor: 'bg-blue-500', icon: MessageCircle },
  { id: 'atendimento', nome: 'Em Atendimento', cor: 'bg-yellow-500', icon: Clock },
  { id: 'agendado', nome: 'Agendado', cor: 'bg-green-500', icon: Calendar },
  { id: 'cancelou', nome: 'Cancelou Consulta', cor: 'bg-orange-500', icon: XCircle },
  { id: 'concluido', nome: 'Concluído', cor: 'bg-gray-500', icon: CheckCircle },
  { id: 'perdido', nome: 'Perdido', cor: 'bg-red-500', icon: XCircle }
];

function PipelineTab() {
  const [contatos, setContatos] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [loading, setLoading] = useState(true);

  const carregarContatos = async () => {
    try {
      setLoading(true);
      const lista = await base44.entities.Contato.list('-updated_date', 100);
      const comHistorico = lista.filter(c => c.historico_mensagens?.length > 0 || c.ultima_mensagem);
      setContatos(comHistorico);

      const pipelineOrganizado = { novo: [], atendimento: [], agendado: [], cancelou: [], concluido: [], perdido: [] };
      comHistorico.forEach(contato => {
        const estagio = contato.status === 'Novo' ? 'novo' :
                       contato.status === 'Lead' ? 'atendimento' :
                       contato.status === 'Qualificado' ? 'agendado' :
                       contato.status === 'Cancelou' ? 'cancelou' :
                       contato.status === 'Cliente' ? 'concluido' :
                       contato.status === 'Inativo' ? 'perdido' : 'novo';
        pipelineOrganizado[estagio].push(contato);
      });
      setPipeline(pipelineOrganizado);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregarContatos(); }, []);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;

    const novoPipeline = { ...pipeline };
    const contatoMovido = novoPipeline[source.droppableId][source.index];
    novoPipeline[source.droppableId].splice(source.index, 1);
    novoPipeline[destination.droppableId].splice(destination.index, 0, contatoMovido);
    setPipeline(novoPipeline);

    const statusMap = { novo: 'Novo', atendimento: 'Lead', agendado: 'Qualificado', cancelou: 'Cancelou', concluido: 'Cliente', perdido: 'Inativo' };
    try {
      await base44.entities.Contato.update(draggableId, { status: statusMap[destination.droppableId] });
    } catch (error) {
      console.error('Erro:', error);
      carregarContatos();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 gap-2">
        {estagios.map((estagio) => {
          const Icon = estagio.icon;
          return (
            <Card key={estagio.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">{estagio.nome}</p>
                  <p className="text-xl font-bold">{pipeline[estagio.id]?.length || 0}</p>
                </div>
                <div className={`${estagio.cor} p-2 rounded-lg`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-6 gap-2">
          {estagios.map((estagio) => {
            const Icon = estagio.icon;
            return (
              <div key={estagio.id} className="flex flex-col">
                <div className={`${estagio.cor} text-white p-2 rounded-t-lg flex items-center gap-1`}>
                  <Icon className="w-3 h-3" />
                  <span className="text-xs font-semibold">{estagio.nome}</span>
                </div>
                <Droppable droppableId={estagio.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 bg-gray-100 p-2 rounded-b-lg min-h-[400px] space-y-2 ${snapshot.isDraggingOver ? 'bg-purple-50' : ''}`}
                    >
                      {pipeline[estagio.id]?.map((contato, index) => (
                        <Draggable key={contato.id} draggableId={contato.id} index={index}>
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`cursor-move hover:shadow-md transition ${snapshot.isDragging ? 'shadow-lg rotate-1' : ''}`}
                            >
                              <CardContent className="p-2">
                                <p className="font-medium text-xs truncate">{contato.nome || 'Cliente'}</p>
                                <p className="text-xs text-gray-500 truncate">{contato.telefone}</p>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {pipeline[estagio.id]?.length === 0 && (
                        <div className="text-center text-gray-400 text-xs py-8">Vazio</div>
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
  );
}

// ========== COMPONENTE: DASHBOARD ==========
function DashboardTab() {
  const [contatos, setContatos] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregarDados = async () => {
      try {
        const contatosList = await base44.entities.Contato.list('-updated_date', 100);
        const comHistorico = contatosList.filter(c => c.historico_mensagens?.length > 0 || c.ultima_mensagem);
        setContatos(comHistorico);

        const hoje = new Date();
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - 7);
        const agendamentosList = await base44.entities.Agendamento.filter({
          data_agendamento: { $gte: format(inicioSemana, 'yyyy-MM-dd') }
        });
        setAgendamentos(agendamentosList || []);
      } catch (error) {
        console.error('Erro:', error);
      } finally {
        setLoading(false);
      }
    };
    carregarDados();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>;
  }

  const totalConversas = contatos.length;
  const conversasAtivas = contatos.filter(c => c.historico_mensagens?.length > 0).length;
  const totalMensagens = contatos.reduce((acc, c) => acc + (c.historico_mensagens?.length || 0), 0);
  const agendamentosViaChatbot = agendamentos.filter(a => a.agendado_por_tipo === 'chatbot' || a.agendado_por === 'Glória').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total de Conversas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConversas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Conversas Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversasAtivas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total de Mensagens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMensagens}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Agendamentos Glória</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{agendamentosViaChatbot}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Últimas Conversas</CardTitle>
          </CardHeader>
          <CardContent>
            {contatos.slice(0, 5).map((contato) => (
              <div key={contato.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{contato.nome || 'Cliente'}</p>
                  <p className="text-xs text-gray-500">{contato.telefone}</p>
                </div>
                <Badge variant="outline">{contato.historico_mensagens?.length || 0} msgs</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Agendamentos pela Glória</CardTitle>
          </CardHeader>
          <CardContent>
            {agendamentos.filter(a => a.agendado_por_tipo === 'chatbot').slice(0, 5).map((ag) => (
              <div key={ag.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{ag.paciente_nome}</p>
                  <p className="text-xs text-gray-500">{format(new Date(ag.data_agendamento), 'dd/MM')} às {ag.horario}</p>
                </div>
                <Badge className="bg-purple-100 text-purple-700">🤖 Glória</Badge>
              </div>
            ))}
            {agendamentos.filter(a => a.agendado_por_tipo === 'chatbot').length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Nenhum agendamento ainda</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ========== PÁGINA PRINCIPAL ==========
export default function ChatbotsAtivos() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/696256b5ef59ea2bed1bd7ea/bed877093_Untitleddesign14.png" 
              alt="Glória" 
              className="h-12"
            />
          </div>
          <Link to={createPageUrl('ConfiguracaoChatbot')}>
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Conversas
            </TabsTrigger>
            <TabsTrigger value="contatos" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Contatos
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-4">
            <ChatTab />
          </TabsContent>

          <TabsContent value="contatos" className="mt-4">
            <ContatosTab />
          </TabsContent>

          <TabsContent value="pipeline" className="mt-4">
            <PipelineTab />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}