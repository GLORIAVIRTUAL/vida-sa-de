import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageCircle, Loader2, Send, RefreshCw, User, Phone, Calendar,
  TrendingUp, Clock, CheckCircle, XCircle, Activity, Users, Settings, Bot,
  Image, Paperclip, Mic, Smile, Zap, Volume2, VolumeX, CalendarPlus
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
function renderMensagemContent(content, isUser, msgData = {}) {
  if (!content) return null;
  
  // Se temos mediaUrl diretamente no objeto da mensagem, usar ela
  const mediaUrlFromData = msgData.mediaUrl;
  const mediaTypeFromData = msgData.mediaType;
  
  // Detectar URLs de mídia no conteúdo (incluindo URLs longas de storage com query params)
  // Também detecta URLs sem extensão visível mas com parâmetros de storage
  const urlMatch = content.match(/(https?:\/\/[^\s\]]+\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|mp3|ogg|wav|webm|m4a|opus)(\?[^\s\]]*)?)/i);
  
  // Também detectar URLs de storage que não têm extensão clara (incluindo base44, supabase)
  // Captura URLs que terminam com extensão dentro de query params ou paths
  const storageUrlMatch = content.match(/(https?:\/\/[^\s\n\]]+(?:supabase|storage|blob|base44|whatsapp)[^\s\n\]]*)/i);
  
  // Detectar qualquer URL http/https no conteúdo (última linha geralmente é a URL)
  const anyUrlMatch = content.match(/(https?:\/\/[^\s\n\]]+)/i);
  
  // Priorizar mediaUrl do objeto se existir
  const finalMediaUrl = mediaUrlFromData || (urlMatch ? urlMatch[1] : null) || (storageUrlMatch ? storageUrlMatch[1] : null) || (anyUrlMatch ? anyUrlMatch[1] : null);
  
  console.log('renderMensagemContent:', { content: content?.substring(0, 50), mediaUrlFromData, mediaTypeFromData, finalMediaUrl });
  
  // Detectar padrões de mídia enviada
  const isImage = /\[Imagem recebida\]|\[.*📷.*\]|📷 Imagem|Imagem enviada/i.test(content);
  const isDocument = /\[Documento recebido\]|\[.*📎.*\]|\[Documento:.*\]|📄 Documento|Arquivo:/i.test(content);
  const isAudio = /\[Áudio recebido\]|\[.*🎤.*\]|🎤 Áudio|Áudio enviado/i.test(content);
  const isSticker = /\[Sticker\/Figurinha recebida\]|\[Figurinha\]/i.test(content);
  
  // Detectar padrão [Documento: nome.pdf] com ou sem URL
  const documentoMatch = content.match(/\[Documento:\s*([^\]]+)\]/i);
  
  // Se temos mídia do objeto msgData, renderizar diretamente
  if (mediaUrlFromData && mediaTypeFromData) {
    if (mediaTypeFromData === 'image') {
      return (
        <div className="space-y-2">
          <img src={mediaUrlFromData} alt="Imagem" className="max-w-full rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90" onClick={() => window.open(mediaUrlFromData, '_blank')} />
          {content.replace(mediaUrlFromData, '').replace(/\[Imagem recebida\]/gi, '').trim() && (
            <p className="text-sm">{content.replace(mediaUrlFromData, '').replace(/\[Imagem recebida\]/gi, '').trim()}</p>
          )}
        </div>
      );
    }
    if (mediaTypeFromData === 'document') {
      return (
        <a 
          href={mediaUrlFromData} 
          target="_blank" 
          rel="noopener noreferrer"
          className={`flex items-center gap-2 p-3 rounded-lg border ${isUser ? 'bg-gray-50 hover:bg-gray-100 border-gray-200' : 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-400'}`}
        >
          <span className="text-2xl">📄</span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Documento</span>
            <span className="text-xs opacity-70">Clique para abrir</span>
          </div>
        </a>
      );
    }
    if (mediaTypeFromData === 'audio') {
      return (
        <div className="space-y-2">
          <audio controls className="max-w-full">
            <source src={mediaUrlFromData} />
          </audio>
        </div>
      );
    }
  }
  
  // Se encontrou URL de mídia com extensão
  if (urlMatch) {
    const url = urlMatch[1];
    const ext = urlMatch[2].toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return (
        <div className="space-y-2">
          <img src={url} alt="Imagem" className="max-w-full rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90" onClick={() => window.open(url, '_blank')} />
          {content.replace(urlMatch[0], '').trim() && (
            <p className="text-sm">{content.replace(urlMatch[0], '').trim()}</p>
          )}
        </div>
      );
    }
    
    if (ext === 'pdf' || ext === 'doc' || ext === 'docx') {
      const nomeArquivo = documentoMatch ? documentoMatch[1] : `Documento.${ext}`;
      return (
        <div className="space-y-2">
          <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer"
            className={`flex items-center gap-2 p-3 rounded-lg border ${isUser ? 'bg-gray-50 hover:bg-gray-100 border-gray-200' : 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-400'}`}
          >
            <span className="text-2xl">📄</span>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{nomeArquivo}</span>
              <span className="text-xs opacity-70">Clique para abrir</span>
            </div>
          </a>
        </div>
      );
    }
    
    if (['mp3', 'ogg', 'wav', 'webm', 'm4a', 'opus'].includes(ext)) {
      return (
        <div className="space-y-2">
          <audio controls className="max-w-full">
            <source src={url} type={`audio/${ext === 'm4a' ? 'mp4' : ext === 'opus' ? 'ogg' : ext}`} />
          </audio>
        </div>
      );
    }
  }
  
  // Se é indicação de imagem sem URL, mostrar placeholder clicável
  if (isImage && !urlMatch) {
    // Tentar extrair URL do storage ou qualquer URL no conteúdo
    const urlParaUsar = finalMediaUrl || storageUrlMatch?.[1] || anyUrlMatch?.[1];
    if (urlParaUsar) {
      return (
        <div className="space-y-2">
          <img src={urlParaUsar} alt="Imagem" className="max-w-full rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90" onClick={() => window.open(urlParaUsar, '_blank')} />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border bg-blue-50 border-blue-200">
        <span className="text-2xl">🖼️</span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Imagem recebida</span>
          <span className="text-xs text-gray-500">Arquivo de imagem</span>
        </div>
      </div>
    );
  }
  
  // Se é indicação de documento sem URL visível
  if ((isDocument || documentoMatch) && !urlMatch) {
    const nomeArquivo = documentoMatch ? documentoMatch[1] : 'Documento recebido';
    // Tentar extrair URL do storage ou qualquer URL
    const urlParaUsar = finalMediaUrl || storageUrlMatch?.[1] || anyUrlMatch?.[1];
    if (urlParaUsar) {
      return (
        <a 
          href={urlParaUsar} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-3 rounded-lg border bg-gray-50 hover:bg-gray-100 border-gray-200"
        >
          <span className="text-2xl">📄</span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{nomeArquivo}</span>
            <span className="text-xs text-blue-600">Clique para abrir</span>
          </div>
        </a>
      );
    }
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border bg-gray-50 border-gray-200">
        <span className="text-2xl">📄</span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{nomeArquivo}</span>
          <span className="text-xs text-gray-500">Documento recebido</span>
        </div>
      </div>
    );
  }
  
  // Se é indicação de áudio sem URL
  if (isAudio && !urlMatch) {
    const urlParaUsar = finalMediaUrl || storageUrlMatch?.[1] || anyUrlMatch?.[1];
    if (urlParaUsar) {
      return (
        <div className="space-y-2">
          <audio controls className="max-w-full">
            <source src={urlParaUsar} />
          </audio>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border bg-purple-50 border-purple-200">
        <span className="text-2xl">🎤</span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Áudio recebido</span>
          <span className="text-xs text-gray-500">Mensagem de voz</span>
        </div>
      </div>
    );
  }
  
  // Sticker/Figurinha
  if (isSticker) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border bg-yellow-50 border-yellow-200">
        <span className="text-2xl">😀</span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Figurinha recebida</span>
          <span className="text-xs text-gray-500">Sticker</span>
        </div>
      </div>
    );
  }
  
  // Texto normal - retorna null para usar o render padrão
  return null;
}

// ========== COMPONENTE: CHAT ==========
function ChatTab({ contatoInicial, onContatoSelecionado }) {
  const [contatos, setContatos] = useState([]);
  const [contatoSelecionado, setContatoSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [inputMsg, setInputMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [modoHumano, setModoHumano] = useState(false);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [modalTemplatesAberto, setModalTemplatesAberto] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateSelecionado, setTemplateSelecionado] = useState('');
  const [carregandoTemplates, setCarregandoTemplates] = useState(false);
  const [enviandoTemplate, setEnviandoTemplate] = useState(false);
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroData, setFiltroData] = useState('');
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  
  const chatContainerRef = useRef(null);
  const prevMensagensLengthRef = useRef(0);
  const userScrolledUpRef = useRef(false);
  
  // Scroll para última mensagem (apenas dentro do container do chat)
  const scrollToBottom = (force = false) => {
    if (chatContainerRef.current && (force || !userScrolledUpRef.current)) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };
  
  // Detectar se o usuário rolou manualmente para cima
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      // Se o usuário está a mais de 100px do fundo, ele rolou para cima
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      userScrolledUpRef.current = !isNearBottom;
    }
  };
  
  // Scroll apenas quando houver novas mensagens E usuário não rolou para cima
  useEffect(() => {
    const currentLength = contatoSelecionado?.historico_mensagens?.length || 0;
    const hadNewMessage = currentLength > prevMensagensLengthRef.current;
    prevMensagensLengthRef.current = currentLength;
    
    if (hadNewMessage) {
      scrollToBottom();
    }
  }, [contatoSelecionado?.historico_mensagens?.length]);
  
  // Resetar scroll quando mudar de contato
  useEffect(() => {
    userScrolledUpRef.current = false;
    prevMensagensLengthRef.current = contatoSelecionado?.historico_mensagens?.length || 0;
    scrollToBottom(true);
  }, [contatoSelecionado?.id]);

  const buscarContatos = async () => {
    try {
      // Buscar todos os contatos paginando
      let todosContatos = [];
      let skip = 0;
      const batchSize = 100;
      while (true) {
        const batch = await base44.entities.Contato.list('-ultima_interacao', batchSize, skip);
        if (!batch || batch.length === 0) break;
        todosContatos = [...todosContatos, ...batch];
        if (batch.length < batchSize) break;
        skip += batchSize;
      }
      const lista = todosContatos;
      const comHistorico = lista.filter(c => 
        (c.historico_mensagens && c.historico_mensagens.length > 0) || c.ultima_mensagem
      );
      const ordenados = [...comHistorico].sort((a, b) => {
        const aFinalizado = a.conversa_finalizada === true;
        const bFinalizado = b.conversa_finalizada === true;
        if (aFinalizado && !bFinalizado) return 1;
        if (!aFinalizado && bFinalizado) return -1;
        return 0;
      });
      setContatos(ordenados);
      // NUNCA seleciona automaticamente - apenas quando usuário clicar
      // Removida seleção automática para evitar trocar de conversa durante atendimento
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setCarregando(false);
    }
  };

  // Atualizar contato selecionado em tempo real
  const atualizarContatoSelecionado = async () => {
    if (!contatoSelecionado?.id) return;
    try {
      const contatoAtualizado = await base44.entities.Contato.get(contatoSelecionado.id);
      if (contatoAtualizado) {
        setContatoSelecionado(contatoAtualizado);
      }
    } catch (error) {
      console.error('Erro ao atualizar:', error);
    }
  };

  useEffect(() => { buscarContatos(); }, []);
  
  // Atualizar apenas contato selecionado a cada 2 segundos (rápido)
  useEffect(() => {
    const interval = setInterval(atualizarContatoSelecionado, 2000);
    return () => clearInterval(interval);
  }, [contatoSelecionado?.id]);
  
  // Atualizar lista geral a cada 15 segundos (menos frequente)
  useEffect(() => {
    const interval = setInterval(buscarContatos, 15000);
    return () => clearInterval(interval);
  }, []);

  // Selecionar contato inicial quando vier da aba de contatos (apenas uma vez)
  useEffect(() => {
    if (contatoInicial && !contatoSelecionado) {
      // Buscar o contato na lista pelo telefone ou usar o que veio direto
      const contatoExistente = contatos.find(c => c.telefone === contatoInicial.telefone);
      if (contatoExistente) {
        setContatoSelecionado(contatoExistente);
      } else {
        // Se não existe na lista de conversas, usar o contato passado para iniciar nova conversa
        setContatoSelecionado(contatoInicial);
      }
      onContatoSelecionado && onContatoSelecionado();
    }
  }, [contatoInicial]); // Removido 'contatos' das dependências

  // Removido: useEffect que atualizava contato ao mudar lista de contatos
  // Agora a atualização é feita apenas pelo atualizarContatoSelecionado (a cada 2s)
  // Isso evita trocar de conversa quando a lista é reordenada

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
      const mensagemEncerramento = "Esta conversa foi encerrada. Agradecemos o seu contato e ficamos à disposição para o que mais precisar. 😊";
      await base44.functions.invoke('enviarMensagemHumano', {
        phoneNumber: contatoSelecionado.telefone,
        messageText: mensagemEncerramento,
        contatoId: contatoSelecionado.id
      });

      await base44.entities.Contato.update(contatoSelecionado.id, {
        status: 'Cliente',
        conversa_finalizada: true,
        atendimento_humano: false,
        atendente_atual: null,
        atendente_id: null
      });

      setContatoSelecionado({...contatoSelecionado, conversa_finalizada: true, status: 'Cliente', atendimento_humano: false, atendente_atual: null});
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
        atendimento_humano: novoModo,
        // Limpar atendente se desativando modo humano
        ...(novoModo ? {} : { atendente_atual: null, atendente_id: null })
      });
      setModoHumano(novoModo);
      await buscarContatos();
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

  // Buscar templates aprovados da Meta
  const buscarTemplates = async () => {
    setCarregandoTemplates(true);
    try {
      const response = await base44.functions.invoke('enviarTemplateMeta', {
        action: 'listarTemplates'
      });
      setTemplates(response.data.templates || []);
      setModalTemplatesAberto(true);
    } catch (error) {
      console.error('Erro ao buscar templates:', error);
      alert('Erro ao buscar templates: ' + (error.response?.data?.error || error.message));
    } finally {
      setCarregandoTemplates(false);
    }
  };

  // Enviar convite via Z-API
  const enviarConvite = async () => {
    if (!contatoSelecionado) return;
    
    setEnviandoConvite(true);
    try {
      await base44.functions.invoke('enviarConviteZapi', {
        phoneNumber: contatoSelecionado.telefone,
        contatoId: contatoSelecionado.id
      });
      
      await buscarContatos();
      alert('Convite enviado com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar convite:', error);
      alert('Erro ao enviar convite: ' + (error.response?.data?.error || error.message));
    } finally {
      setEnviandoConvite(false);
    }
  };

  // Enviar template selecionado
  const enviarTemplate = async () => {
    if (!templateSelecionado || !contatoSelecionado) return;
    
    const template = templates.find(t => t.name === templateSelecionado);
    if (!template) return;

    setEnviandoTemplate(true);
    try {
      await base44.functions.invoke('enviarTemplateMeta', {
        action: 'enviarTemplate',
        phoneNumber: contatoSelecionado.telefone,
        templateName: template.name,
        templateLanguage: template.language
      });
      
      // Adicionar mensagem no histórico local
      const novaMsg = {
        role: 'assistant',
        content: `[📋 Template enviado: ${template.name}]`,
        timestamp: new Date().toISOString(),
        humano: true
      };
      
      const historicoAtual = contatoSelecionado.historico_mensagens || [];
      await base44.entities.Contato.update(contatoSelecionado.id, {
        historico_mensagens: [...historicoAtual, novaMsg],
        ultima_interacao: new Date().toISOString()
      });
      
      setModalTemplatesAberto(false);
      setTemplateSelecionado('');
      await buscarContatos();
      alert('Template enviado com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar template:', error);
      alert('Erro ao enviar template: ' + (error.response?.data?.error || error.message));
    } finally {
      setEnviandoTemplate(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const mensagens = getMensagens(contatoSelecionado);

  // Filtrar contatos
  const contatosFiltrados = contatos.filter(contato => {
    // Filtro por status
    if (filtroStatus === 'atendimento') {
      if (contato.conversa_finalizada) return false;
      const temResposta = contato.historico_mensagens?.some(m => m.role === 'assistant') || contato.ultima_resposta;
      if (!temResposta) return false;
      return true;
    }
    if (filtroStatus === 'sem_resposta') {
      if (contato.conversa_finalizada) return false;
      const temResposta = contato.historico_mensagens?.some(m => m.role === 'assistant') || contato.ultima_resposta;
      return !temResposta;
    }
    if (filtroStatus === 'finalizadas') {
      return contato.conversa_finalizada === true;
    }
    return true; // 'todos'
  }).filter(contato => {
    // Filtro por data
    if (!filtroData) return true;
    const dataInteracao = contato.ultima_interacao || contato.updated_date || contato.created_date;
    if (!dataInteracao) return false;
    return dataInteracao.substring(0, 10) === filtroData;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-1">
         <Card>
           <CardHeader className="pb-2 space-y-2">
             <CardTitle className="text-sm flex items-center justify-between">
               <span>Conversas ({contatosFiltrados.length})</span>
               <Button onClick={atualizarContatoSelecionado} variant="ghost" size="sm" title="Atualizar conversa atual">
                 <RefreshCw className="w-3 h-3" />
               </Button>
             </CardTitle>
             <div className="flex gap-1 flex-wrap">
               {[
                 { value: 'todos', label: 'Todos' },
                 { value: 'atendimento', label: 'Atendimento' },
                 { value: 'sem_resposta', label: 'S/ Resposta' },
                 { value: 'finalizadas', label: 'Finalizadas' },
               ].map(f => (
                 <button
                   key={f.value}
                   onClick={() => setFiltroStatus(f.value)}
                   className={`text-[10px] px-2 py-1 rounded-full border transition ${
                     filtroStatus === f.value
                       ? 'bg-blue-600 text-white border-blue-600'
                       : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                   }`}
                 >
                   {f.label}
                 </button>
               ))}
             </div>
             <Input
               type="date"
               value={filtroData}
               onChange={(e) => setFiltroData(e.target.value)}
               className="h-7 text-xs"
               placeholder="Filtrar por data"
             />
             {filtroData && (
               <button onClick={() => setFiltroData('')} className="text-[10px] text-blue-600 hover:underline">
                 Limpar data
               </button>
             )}
           </CardHeader>
           <CardContent className="p-0 max-h-[600px] overflow-y-auto">
             {contatosFiltrados.length === 0 ? (
               <div className="p-4 text-center text-gray-500 text-sm">Nenhuma conversa</div>
             ) : (
               <div className="divide-y">
                 {contatosFiltrados.map((contato) => {
                   const ultimaIntercao = contato.ultima_interacao 
                     ? format(new Date(contato.ultima_interacao), 'HH:mm', { locale: ptBR })
                     : '-';
                   const numMensagens = contato.historico_mensagens?.length || 0;

                   return (
                     <button
                       key={contato.id}
                       onClick={() => setContatoSelecionado(contato)}
                       className={`w-full text-left p-3 hover:bg-gray-50 transition border-l-4 ${
                         contatoSelecionado?.id === contato.id 
                           ? 'bg-blue-50 border-l-blue-600 border-blue-200' 
                           : 'border-l-transparent'
                       } ${contato.conversa_finalizada ? 'opacity-50' : ''}`}
                     >
                       <div className="flex items-center gap-2 mb-1">
                         <p className="font-semibold text-sm truncate flex-1">{contato.nome || 'Cliente'}</p>
                         <span className="text-[10px] text-gray-400">{ultimaIntercao}</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <p className="text-xs text-gray-500 truncate flex-1">{contato.telefone}</p>
                         {numMensagens > 0 && (
                           <Badge className="bg-blue-100 text-blue-700 text-[9px] px-1 py-0">{numMensagens}</Badge>
                         )}
                         {/* Ícones de status do atendimento */}
                         {contato.atendimento_humano && !contato.conversa_finalizada && contato.atendente_atual ? (
                           <Badge className="bg-green-100 text-green-700 text-[9px] px-1 py-0" title={`Atendido por ${contato.atendente_atual}`}>
                             👤 {contato.atendente_atual.split(' ')[0]}
                           </Badge>
                         ) : contato.atendimento_humano && !contato.conversa_finalizada && !contato.atendente_atual ? (
                           <Badge className="bg-green-100 text-green-700 text-[9px] px-1 py-0">👤</Badge>
                         ) : (() => {
                           // Verificar se tem resposta do assistente
                           const temResposta = contato.historico_mensagens?.some(m => m.role === 'assistant') || contato.ultima_resposta;
                           if (!temResposta && !contato.conversa_finalizada) {
                             // Sem resposta ainda - ícone vermelho
                             return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100" title="Aguardando resposta"><User className="w-3 h-3 text-red-600" /></span>;
                           }
                           // Modo IA ativo - ícone robô azul
                           return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100" title="Atendimento por IA"><Bot className="w-3 h-3 text-blue-600" /></span>;
                         })()}
                         {contato.conversa_finalizada && (
                           <Badge className="bg-gray-200 text-gray-600 text-[9px] px-1 py-0">✓</Badge>
                         )}
                       </div>
                     </button>
                   );
                 })}
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
                    <Link 
                      to={createPageUrl('Agendamentos')}
                      state={{
                        dadosIniciais: {
                          paciente_id: contatoSelecionado.paciente_id,
                          paciente_nome: contatoSelecionado.nome,
                          telefone: contatoSelecionado.telefone
                        }
                      }}
                    >
                      <Button 
                        variant="default"
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <CalendarPlus className="w-3 h-3 mr-1" />
                        Agendar
                      </Button>
                    </Link>
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
                    <span>
                      <strong>Atendimento humano ativo</strong>
                      {contatoSelecionado?.atendente_atual && (
                        <span className="ml-1">por <strong>{contatoSelecionado.atendente_atual}</strong></span>
                      )}
                      {' '}- A IA está pausada. Clique em "Assumir" novamente para reativar a Glória.
                    </span>
                  </div>
                )}
              </CardHeader>
              <CardContent ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 flex flex-col">
                {mensagens.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <MessageCircle className="w-12 h-12 opacity-30" />
                  </div>
                ) : (
                  <>
                    {mensagens.map((msg, i) => {
                      const isHumano = msg.humano || msg.content?.includes('[👤');
                      const customRender = renderMensagemContent(msg.content, msg.role === 'user', msg);
                      
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

      {/* Modal de Templates Meta */}
      <Dialog open={modalTemplatesAberto} onOpenChange={setModalTemplatesAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" />
              Enviar Template Meta
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600">
              Selecione um template aprovado pela Meta para iniciar a conversa fora da janela de 24 horas.
            </p>
            
            {templates.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                <p>Nenhum template aprovado encontrado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Select value={templateSelecionado} onValueChange={setTemplateSelecionado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.name} value={template.name}>
                        {template.name} ({template.language})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {templateSelecionado && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Preview do template:</p>
                    {(() => {
                      const template = templates.find(t => t.name === templateSelecionado);
                      const bodyComponent = template?.components?.find(c => c.type === 'BODY');
                      return (
                        <p className="text-sm">{bodyComponent?.text || 'Sem preview disponível'}</p>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalTemplatesAberto(false)} disabled={enviandoTemplate}>
              Cancelar
            </Button>
            <Button 
              onClick={enviarTemplate} 
              disabled={!templateSelecionado || enviandoTemplate}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {enviandoTemplate ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        // Buscar todos os contatos (paginado para pegar todos)
        let todosContatos = [];
        let skip = 0;
        const batchSize = 100;
        while (true) {
          const batch = await base44.entities.Contato.list('-updated_date', batchSize, skip);
          if (!batch || batch.length === 0) break;
          todosContatos = [...todosContatos, ...batch];
          if (batch.length < batchSize) break;
          skip += batchSize;
        }
        const comHistorico = todosContatos.filter(c => c.historico_mensagens?.length > 0 || c.ultima_mensagem);
        setContatos(comHistorico);

        // Buscar agendamentos da última semana
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
  const [activeTab, setActiveTab] = useState('chat');
  const [contatoParaConversa, setContatoParaConversa] = useState(null);
  const [somAtivo, setSomAtivo] = useState(() => {
    const saved = localStorage.getItem('chatSomAtivo');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Salvar preferência de som no localStorage
  useEffect(() => {
    localStorage.setItem('chatSomAtivo', JSON.stringify(somAtivo));
  }, [somAtivo]);

  const handleIniciarConversa = (contato) => {
    setContatoParaConversa(contato);
    setActiveTab('chat');
  };

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSomAtivo(!somAtivo)}
              className={somAtivo ? 'bg-green-100 hover:bg-green-200 border-green-300' : 'bg-gray-100 hover:bg-gray-200'}
              title={somAtivo ? 'Som de notificação ativado' : 'Som de notificação desativado'}
            >
              {somAtivo ? (
                <Volume2 className="w-4 h-4 text-green-600" />
              ) : (
                <VolumeX className="w-4 h-4 text-gray-500" />
              )}
              <span className="ml-2 text-xs">{somAtivo ? 'Som On' : 'Som Off'}</span>
            </Button>
            <Link to={createPageUrl('ConfiguracaoChatbot')}>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Configurações
              </Button>
            </Link>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
            <ChatTab contatoInicial={contatoParaConversa} onContatoSelecionado={() => setContatoParaConversa(null)} />
          </TabsContent>

          <TabsContent value="contatos" className="mt-4">
            <ContatosTab onIniciarConversa={handleIniciarConversa} />
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