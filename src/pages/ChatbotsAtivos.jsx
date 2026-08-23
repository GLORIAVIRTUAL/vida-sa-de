import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageCircle, Loader2, Send, RefreshCw, User, Phone, Calendar,
  TrendingUp, Clock, CheckCircle, XCircle, Activity, Users, Settings, Bot,
  Image, Paperclip, Mic, Smile, Zap, Volume2, VolumeX, CalendarPlus, DollarSign, Bell, ArrowRightLeft, Maximize2, Minimize2
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import ContatosTab from '../components/gloria/ContatosTab';
import NotificacoesTab from '../components/gloria/NotificacoesTab';
import { UserPlus } from 'lucide-react';
import CadastroRapidoPaciente from '../components/pacientes/CadastroRapidoPaciente';
import TransferirConversaModal from '../components/gloria/TransferirConversaModal';
import { motivosColunas, motivoInteresseMap, classificarMotivo } from '../components/gloria/pipelineMotivos';
import EspecialidadesTags from '../components/gloria/EspecialidadesTags';
import AvatarContato from '../components/gloria/AvatarContato';
import RelatorioChat from './RelatorioChat';

export const useContatosQuery = () => {
  return useQuery({
    queryKey: ['chatbots_contatos'],
    queryFn: async () => {
      // Carrega apenas as conversas mais recentes (sob demanda) para abrir rápido.
      // O chat sempre trabalha com as interações mais recentes; o restante não precisa
      // ser baixado de uma vez.
      const lote = await base44.entities.Contato.list('-ultima_interacao', 1000);
      return lote || [];
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });
};

// Função para renderizar conteúdo de mensagem (texto, imagem, documento, áudio)
function renderMensagemContent(content, isUser, msgData = {}) {
  if (!content) return null;
  
  // Se temos mediaUrl diretamente no objeto da mensagem, usar ela
  // Tratar "undefined" (string) como null
  const mediaUrlFromData = (msgData.mediaUrl && msgData.mediaUrl !== 'undefined') ? msgData.mediaUrl : null;
  const mediaTypeFromData = (msgData.mediaType && msgData.mediaType !== 'undefined') ? msgData.mediaType : null;
  
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
  const queryClient = useQueryClient();
  const { data: todosContatosData = [], isLoading: carregandoContatos } = useContatosQuery();
  const contatos = React.useMemo(() => {
    const comHistorico = todosContatosData.filter(c => 
      (c.historico_mensagens && c.historico_mensagens.length > 0) || c.ultima_mensagem
    );
    const contatosUnicosMap = new Map();
    comHistorico.forEach(c => {
      const telNorm = (c.telefone || '').replace(/\D/g, '');
      const telKey = telNorm.length >= 8 ? telNorm.slice(-8) : telNorm;
      if (telKey) {
        if (!contatosUnicosMap.has(telKey)) {
          contatosUnicosMap.set(telKey, { ...c, historico_mensagens: [...(c.historico_mensagens || [])] });
        } else {
          const existente = contatosUnicosMap.get(telKey);
          const histExistente = existente.historico_mensagens || [];
          const histNovo = c.historico_mensagens || [];
          histNovo.forEach(msg => {
            const jaExiste = histExistente.some(m => m.timestamp === msg.timestamp && m.content === msg.content);
            if (!jaExiste) histExistente.push(msg);
          });
          histExistente.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
          existente.historico_mensagens = histExistente;
          const dataAtual = new Date(c.ultima_interacao || c.updated_date || c.created_date || 0).getTime();
          const dataExistente = new Date(existente.ultima_interacao || existente.updated_date || existente.created_date || 0).getTime();
          if (dataAtual > dataExistente) {
            existente.ultima_interacao = c.ultima_interacao;
            existente.ultima_mensagem = c.ultima_mensagem;
            existente.ultima_resposta = c.ultima_resposta;
            existente.status = c.status;
            existente.conversa_finalizada = c.conversa_finalizada;
            existente.atendimento_humano = c.atendimento_humano;
            existente.atendente_atual = c.atendente_atual;
            existente.nome = c.nome || existente.nome;
            existente.id = c.id;
          }
        }
      } else {
        contatosUnicosMap.set(c.id, c);
      }
    });
    return Array.from(contatosUnicosMap.values()).sort((a, b) => {
      const aFinalizado = a.conversa_finalizada === true;
      const bFinalizado = b.conversa_finalizada === true;
      if (aFinalizado && !bFinalizado) return 1;
      if (!aFinalizado && bFinalizado) return -1;
      return 0;
    });
  }, [todosContatosData]);

  const [contatoSelecionado, setContatoSelecionado] = useState(null);
  const [inputMsg, setInputMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [modoHumano, setModoHumano] = useState(false);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [modalTransferirAberto, setModalTransferirAberto] = useState(false);
  const [modalTemplatesAberto, setModalTemplatesAberto] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateSelecionado, setTemplateSelecionado] = useState('');
  const [carregandoTemplates, setCarregandoTemplates] = useState(false);
  const [enviandoTemplate, setEnviandoTemplate] = useState(false);
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroData, setFiltroData] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [chatExpandido, setChatExpandido] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);
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
    await queryClient.invalidateQueries({ queryKey: ['chatbots_contatos'] });
  };

  // Marcar manualmente o motivo da conversa: grava no contato e reflete no Pipeline
  const marcarMotivo = async (motivoId) => {
    if (!contatoSelecionado?.id || !motivoId) return;
    const novoInteresse = motivoInteresseMap[motivoId] || 'Outro';
    const interessesAtuais = contatoSelecionado.interesses || [];
    const novosInteresses = [...interessesAtuais, novoInteresse];
    const novoEvento = {
      tag: novoInteresse,
      tipo: 'motivo',
      acao: 'adicionar',
      atendente: currentUser?.display_name || currentUser?.full_name || currentUser?.email || 'Não identificado',
      atendente_id: currentUser?.id || null,
      timestamp: new Date().toISOString()
    };
    const dadosExtras = {
      ...(contatoSelecionado.dados_extras || {}),
      tag_historico: [...(contatoSelecionado.dados_extras?.tag_historico || []), novoEvento]
    };
    setContatoSelecionado(prev => prev ? { ...prev, interesses: novosInteresses, dados_extras: dadosExtras } : prev);
    try {
      await base44.entities.Contato.update(contatoSelecionado.id, { interesses: novosInteresses, dados_extras: dadosExtras });
      await buscarContatos();
    } catch (error) {
      console.error('Erro ao marcar motivo:', error);
    }
  };

  // Alternar uma especialidade como tag do contato (adiciona se não tiver, remove se já tiver)
  const adicionarTagEspecialidade = async (especialidade) => {
    if (!contatoSelecionado?.id || !especialidade) return;
    const tagsAtuais = contatoSelecionado.tags || [];
    const jaExiste = tagsAtuais.some(t => (t || '').trim().toLowerCase() === especialidade.trim().toLowerCase());
    const novasTags = jaExiste
      ? tagsAtuais.filter(t => (t || '').trim().toLowerCase() !== especialidade.trim().toLowerCase())
      : [...tagsAtuais, especialidade];
    const novoEvento = {
      tag: especialidade,
      tipo: 'especialidade',
      acao: jaExiste ? 'remover' : 'adicionar',
      atendente: currentUser?.display_name || currentUser?.full_name || currentUser?.email || 'Não identificado',
      atendente_id: currentUser?.id || null,
      timestamp: new Date().toISOString()
    };
    const dadosExtras = {
      ...(contatoSelecionado.dados_extras || {}),
      tag_historico: [...(contatoSelecionado.dados_extras?.tag_historico || []), novoEvento]
    };
    setContatoSelecionado(prev => prev ? { ...prev, tags: novasTags, dados_extras: dadosExtras } : prev);
    try {
      await base44.entities.Contato.update(contatoSelecionado.id, { tags: novasTags, dados_extras: dadosExtras });
      await buscarContatos();
    } catch (error) {
      console.error('Erro ao alternar tag:', error);
    }
  };

  // Atualizar contato selecionado em tempo real
  const atualizarContatoSelecionado = async () => {
    if (!contatoSelecionado?.id) return;
    try {
      const contatoAtualizado = await base44.entities.Contato.get(contatoSelecionado.id);
      if (contatoAtualizado) {
        setContatoSelecionado(prev => {
          if (!prev || prev.id !== contatoAtualizado.id) return contatoAtualizado;
          
          const lenPrev = prev.historico_mensagens?.length || 0;
          const lenNovo = contatoAtualizado.historico_mensagens?.length || 0;
          
          // Se a tela tem mais mensagens que o banco (devido a um envio otimista recente),
          // preserva o histórico local para a mensagem não sumir até o banco sincronizar.
          if (lenPrev > lenNovo) {
            return { ...contatoAtualizado, historico_mensagens: prev.historico_mensagens };
          }
          return contatoAtualizado;
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar:', error);
    }
  };

  // Manter referência sempre atual do texto digitado, sem recriar o intervalo
  const inputMsgRef = useRef('');
  useEffect(() => { inputMsgRef.current = inputMsg; }, [inputMsg]);

  // Atualizar apenas contato selecionado a cada 2 segundos (rápido)
  // Pausa a atualização enquanto o atendente está digitando para não tirar o foco da caixa de texto
  useEffect(() => {
    const interval = setInterval(() => {
      if (inputMsgRef.current.trim().length > 0) return;
      atualizarContatoSelecionado();
    }, 2000);
    return () => clearInterval(interval);
  }, [contatoSelecionado?.id]);

  // Selecionar contato inicial quando vier da aba de contatos ou notificações
  useEffect(() => {
    if (!contatoInicial) return;
    
    // Buscar o contato na lista pelo telefone (com normalização)
    const telInicial = (contatoInicial.telefone || '').replace(/\D/g, '');
    const contatoExistente = contatos.find(c => {
      const telC = (c.telefone || '').replace(/\D/g, '');
      return telC === telInicial || telC === '55' + telInicial || '55' + telC === telInicial;
    });
    
    if (contatoExistente) {
      setContatoSelecionado(contatoExistente);
    } else if (contatoInicial.id) {
      // Se tem id, é um contato real vindo da busca
      setContatoSelecionado(contatoInicial);
    } else {
      setContatoSelecionado(contatoInicial);
    }
    onContatoSelecionado && onContatoSelecionado();
  }, [contatoInicial]); // Removido 'contatos' das dependências

  // Removido: useEffect que atualizava contato ao mudar lista de contatos
  // Agora a atualização é feita apenas pelo atualizarContatoSelecionado (a cada 2s)
  // Isso evita trocar de conversa quando a lista é reordenada

  useEffect(() => {
    if (contatoSelecionado) {
      setModoHumano(contatoSelecionado.atendimento_humano || false);
    }
  }, [contatoSelecionado?.id]);

  const enviarMensagem = (textoCustom, skipRefresh = false) => {
    const texto = textoCustom || inputMsg;
    if (!texto.trim() || !contatoSelecionado) return;
    if (!textoCustom) setInputMsg('');

    // Optimistic update: adicionar mensagem localmente de imediato
    const nomeUsuario = currentUser?.display_name || currentUser?.full_name || 'Recepção';
    const novaMensagem = {
      role: 'assistant',
      content: `[👤 ${nomeUsuario}]: ${texto}`,
      timestamp: new Date().toISOString(),
      humano: true
    };
    const telefoneAlvo = contatoSelecionado.telefone;
    const contatoIdAlvo = contatoSelecionado.id;

    setContatoSelecionado(prev => {
      if (!prev) return prev;
      const historicoAtual = prev.historico_mensagens || [];
      return { ...prev, historico_mensagens: [...historicoAtual, novaMensagem] };
    });

    // Envia em background (não bloqueia o input), mas AVISA o atendente se falhar
    base44.functions.invoke('enviarMensagemHumano', {
      phoneNumber: telefoneAlvo,
      messageText: texto,
      contatoId: contatoIdAlvo
    }).then((resp) => {
      if (resp?.data && resp.data.success === false) {
        throw new Error(resp.data.error || 'Falha no envio');
      }
    }).catch((error) => {
      const detalhe = error?.response?.data?.error || error?.message || 'Erro desconhecido';
      console.error('Erro ao enviar:', detalhe);
      // Marcar a mensagem otimista como NÃO enviada, para o atendente saber
      setContatoSelecionado(prev => {
        if (!prev) return prev;
        const hist = [...(prev.historico_mensagens || [])];
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i]?.timestamp === novaMensagem.timestamp && hist[i]?.content === novaMensagem.content) {
            hist[i] = { ...hist[i], falha_envio: true };
            break;
          }
        }
        return { ...prev, historico_mensagens: hist };
      });
      alert(
        '⚠️ A mensagem NÃO foi entregue ao cliente.\n\n' +
        'Motivo: ' + detalhe + '\n\n' +
        'Se o cliente não enviou mensagem nas últimas 24h, o WhatsApp bloqueia o envio de texto livre. ' +
        'Nesse caso, use o botão de Template (Meta) para reiniciar a conversa.'
      );
    });
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
        atendimento_humano: true,
        atendente_atual: null,
        atendente_id: null
      });

      setContatoSelecionado({...contatoSelecionado, conversa_finalizada: true, status: 'Cliente', atendimento_humano: true, atendente_atual: null, atendente_id: null});
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

      // Se desativou modo humano (volta pra Glória), fazer a Glória processar a última mensagem do cliente
      if (!novoModo) {
        const mensagens = contatoSelecionado.historico_mensagens || [];
        // Encontrar a última mensagem do usuário (cliente)
        const ultimasMsgsUser = mensagens.filter(m => m.role === 'user');
        const ultimaMsgUser = ultimasMsgsUser.length > 0 ? ultimasMsgsUser[ultimasMsgsUser.length - 1] : null;
        
        if (ultimaMsgUser) {
          // Verificar se a Glória (IA, não humano) já respondeu após essa mensagem
          const idxUltimaUser = mensagens.lastIndexOf(ultimaMsgUser);
          const jaRespondeu = mensagens.slice(idxUltimaUser + 1).some(m => m.role === 'assistant' && !m.humano);
          
          if (!jaRespondeu) {
            try {
              // Limpar o conteúdo da mensagem (remover URLs de mídia coladas)
              let textoParaProcessar = (ultimaMsgUser.content || '').split('\n')[0].trim();
              if (!textoParaProcessar) textoParaProcessar = 'oi';

              // Chamar processarMensagemAgente que gera a resposta da IA
              const resultado = await base44.functions.invoke('processarMensagemAgente', {
                phoneNumber: contatoSelecionado.telefone,
                messageText: textoParaProcessar,
                senderName: contatoSelecionado.nome || 'Cliente',
                pacienteId: contatoSelecionado.paciente_id || null,
                mediaType: 'text',
                mediaUrl: null,
                messageId: null
              });

              // Se a Glória gerou resposta, enviar via WhatsApp usando reativarGloria (backend com Z-API)
              if (resultado.data?.resposta) {
                await base44.functions.invoke('reativarGloria', {
                  phoneNumber: contatoSelecionado.telefone,
                  resposta: resultado.data.resposta,
                  contatoId: contatoSelecionado.id,
                  arquivoParaEnviar: resultado.data.arquivoParaEnviar || null
                });
              }
            } catch (err) {
              console.error('Erro ao reativar Glória:', err);
            }
          }
        }
      }

      await buscarContatos();
    } catch (error) {
      alert('Erro: ' + error.message);
    }
  };

  const toggleAlarmeSupervisor = async () => {
    if (!contatoSelecionado) return;
    try {
      const novoValor = !(contatoSelecionado.dados_extras?.alarme_supervisor === true);
      const dadosExtrasAtualizados = {
        ...(contatoSelecionado.dados_extras || {}),
        alarme_supervisor: novoValor,
        alarme_supervisor_data: novoValor ? new Date().toISOString() : null
      };

      await base44.entities.Contato.update(contatoSelecionado.id, {
        dados_extras: dadosExtrasAtualizados
      });

      setContatoSelecionado(prev => prev ? { ...prev, dados_extras: dadosExtrasAtualizados } : prev);
      queryClient.setQueryData(['chatbots_contatos'], (old = []) => old.map(c => 
        c.id === contatoSelecionado.id ? { ...c, dados_extras: dadosExtrasAtualizados } : c
      ));
    } catch (error) {
      alert('Erro ao ativar alarme: ' + error.message);
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

  const estaAguardandoResposta = (contato) => {
    if (!contato || contato.conversa_finalizada) return false;
    if (contato.atendente_atual) return false;

    const historico = contato.historico_mensagens || [];
    const ultimaMensagem = historico.length > 0 ? historico[historico.length - 1] : null;

    if (ultimaMensagem) {
      return ultimaMensagem.role === 'user';
    }

    return !!(contato.ultima_mensagem && !contato.ultima_resposta);
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

  if (carregandoContatos && contatos.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const mensagens = getMensagens(contatoSelecionado);
  const alarmeAtivo = contatoSelecionado?.dados_extras?.alarme_supervisor === true;

  // Filtrar contatos
  const contatosFiltrados = contatos.filter(contato => {
    // Filtro por status
    if (filtroStatus === 'minhas') {
      // Minhas = conversas onde o usuário atual é o atendente
      if (contato.conversa_finalizada) return false;
      if (!currentUser) return false;
      const nomeUsuario = currentUser.display_name || currentUser.full_name || '';
      const emailUsuario = currentUser.email || '';
      return (contato.atendente_atual && contato.atendente_atual === nomeUsuario) ||
             (contato.atendente_id && contato.atendente_id === currentUser.id) ||
             (contato.atendente_id && contato.atendente_id === emailUsuario);
    }
    if (filtroStatus === 'atendimento') {
      // Em atendimento = tem atendente humano atribuído e não finalizada
      if (contato.conversa_finalizada) return false;
      return contato.atendimento_humano && contato.atendente_atual;
    }
    if (filtroStatus === 'sem_resposta') {
      if (contato.atendimento_humano && contato.atendente_atual) return false;
      return estaAguardandoResposta(contato);
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
    <div className={chatExpandido
      ? "fixed inset-0 z-50 bg-white p-4 flex flex-col gap-4"
      : "grid grid-cols-1 lg:grid-cols-4 gap-4"}>
      <div className={chatExpandido ? "hidden" : "lg:col-span-1"}>
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
                 { value: 'minhas', label: 'Minhas' },
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
                      ? format(new Date(contato.ultima_interacao), 'dd/MM HH:mm', { locale: ptBR })
                      : '-';
                   const numMensagens = contato.historico_mensagens?.length || 0;
                   const alarmeContatoAtivo = contato.dados_extras?.alarme_supervisor === true;

                   return (
                     <button
                       key={contato.id}
                       onClick={() => setContatoSelecionado(contato)}
                       className={`w-full text-left p-3 hover:bg-gray-50 transition border-l-4 ${
                         alarmeContatoAtivo
                           ? 'bg-yellow-50 border-l-yellow-500 border-yellow-200 animate-pulse'
                           : contatoSelecionado?.id === contato.id 
                             ? 'bg-blue-50 border-l-blue-600 border-blue-200' 
                             : 'border-l-transparent'
                       } ${contato.conversa_finalizada ? 'opacity-50' : ''}`}
                     >
                       <div className="flex items-center gap-2 mb-1">
                         <AvatarContato contato={contato} size={32} />
                         <p className="font-semibold text-sm truncate flex-1">{contato.nome || 'Cliente'}</p>
                         <span className="text-[10px] text-gray-400">{ultimaIntercao}</span>
                       </div>
                       <div className="flex items-center gap-2 pl-10">
                         <p className="text-xs text-gray-500 truncate flex-1">{contato.telefone}</p>
                         {numMensagens > 0 && (
                           <Badge className="bg-blue-100 text-blue-700 text-[9px] px-1 py-0">{numMensagens}</Badge>
                         )}
                         {alarmeContatoAtivo && (
                           <Badge className="bg-yellow-200 text-yellow-900 text-[9px] px-1 py-0 animate-pulse">Alarme</Badge>
                         )}
                         {/* Ícones de status do atendimento */}
                         {contato.conversa_finalizada ? (
                           <Badge className="bg-gray-200 text-gray-600 text-[9px] px-1 py-0" title="Conversa finalizada">✓</Badge>
                         ) : contato.atendimento_humano && contato.atendente_atual ? (
                           <Badge className="bg-green-100 text-green-700 text-[9px] px-1 py-0" title={`Atendido por ${contato.atendente_atual}`}>
                             👤 {contato.atendente_atual.split(' ')[0]}
                           </Badge>
                         ) : estaAguardandoResposta(contato) ? (
                           <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100" title="Aguardando resposta"><User className="w-3 h-3 text-red-600" /></span>
                         ) : contato.atendimento_humano === false ? (
                           <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100" title="Atendimento por IA"><Bot className="w-3 h-3 text-blue-600" /></span>
                         ) : (
                           <Badge className="bg-red-100 text-red-700 text-[9px] px-1 py-0">Aguardando</Badge>
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

      <div className={chatExpandido ? "flex-1 min-h-0" : "lg:col-span-3"}>
        <Card className={`flex flex-col ${chatExpandido ? "h-full" : "h-[500px]"}`}>
          {contatoSelecionado ? (
            <>
              <CardHeader className={`border-b py-3 space-y-3 ${alarmeAtivo ? 'bg-gradient-to-r from-yellow-100 to-amber-100 animate-pulse' : 'bg-gradient-to-r from-blue-50 to-sky-50'}`}>
                {/* Linha 1: identificação + ações */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex items-center gap-3">
                    <AvatarContato contato={contatoSelecionado} size={40} />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{contatoSelecionado.nome || 'Cliente'}</p>
                      <p className="text-xs text-gray-500">{contatoSelecionado.telefone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <Button 
                      variant="default"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        navigate(createPageUrl('Agendamentos'), {
                          state: {
                            dadosIniciais: {
                              paciente_id: contatoSelecionado.paciente_id || null,
                              paciente_nome: contatoSelecionado.nome,
                              telefone: contatoSelecionado.telefone
                            }
                          }
                        });
                      }}
                    >
                      <CalendarPlus className="w-3 h-3 mr-1" />
                      Agendar
                    </Button>
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
                      variant={alarmeAtivo ? "default" : "outline"}
                      size="sm"
                      onClick={toggleAlarmeSupervisor}
                      className={alarmeAtivo ? "bg-yellow-500 hover:bg-yellow-600 text-slate-900" : "text-yellow-700 border-yellow-300 hover:bg-yellow-50"}
                    >
                      <Bell className="w-3 h-3 mr-1" />
                      {alarmeAtivo ? "Alarme Ativo" : "Alarme"}
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
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setModalTransferirAberto(true)}
                      className="text-blue-600 hover:bg-blue-50"
                    >
                      <ArrowRightLeft className="w-3 h-3 mr-1" />
                      Transferir
                    </Button>
                    <Button variant="outline" size="sm" onClick={finalizarConversa} className="text-red-600 hover:bg-red-50">
                      <XCircle className="w-3 h-3 mr-1" />
                      Finalizar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setChatExpandido(!chatExpandido)}
                      title={chatExpandido ? "Recolher" : "Expandir tela"}
                    >
                      {chatExpandido ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
                {/* Linha 2: classificadores */}
                <div className="flex items-start gap-2 flex-wrap">
                  <Select value={classificarMotivo(contatoSelecionado)} onValueChange={marcarMotivo}>
                    <SelectTrigger className="h-8 w-[200px] bg-white text-xs">
                      <SelectValue placeholder="Motivo da conversa" />
                    </SelectTrigger>
                    <SelectContent>
                      {motivosColunas.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${m.cor}`} />
                            {m.nome}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <EspecialidadesTags contato={contatoSelecionado} onAdicionarTag={adicionarTagEspecialidade} />
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
                {alarmeAtivo && (
                  <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded-lg text-xs text-yellow-900 flex items-center gap-2 animate-pulse">
                    <Bell className="w-4 h-4" />
                    <span><strong>Alarme ativo:</strong> este cliente está destacado para o supervisor.</span>
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
                              <div className={`px-3 pb-2 text-[10px] flex items-center ${msg.role === 'user' ? 'justify-start' : 'justify-end'} gap-1 ${
                                msg.role === 'user' 
                                  ? 'text-gray-400' 
                                  : isHumano 
                                    ? 'text-green-600' 
                                    : 'text-blue-200'
                              }`}>
                                {format(new Date(msg.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                                {msg.role === 'assistant' && (
                                  msg.falha_envio ? (
                                    <span className="ml-0.5 font-bold text-red-500" title="Falha no envio - cliente não recebeu">⚠ não enviada</span>
                                  ) : (
                                    <span className={`ml-0.5 font-bold ${isHumano ? 'text-green-500' : 'text-blue-200'}`}>✓✓</span>
                                  )
                                )}
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
                    onKeyPress={(e) => e.key === 'Enter' && enviarMensagem()}
                  />
                  <Button onClick={() => enviarMensagem()} disabled={!inputMsg.trim()} className="bg-blue-600 hover:bg-blue-700">
                    <Send className="w-4 h-4" />
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

      <TransferirConversaModal
        open={modalTransferirAberto}
        onClose={() => setModalTransferirAberto(false)}
        contato={contatoSelecionado}
        currentUser={currentUser}
        onTransferido={(nomeDestino) => {
          setContatoSelecionado(prev => prev ? { ...prev, atendente_atual: nomeDestino, atendimento_humano: true } : prev);
          buscarContatos();
        }}
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

// ========== COMPONENTE: PIPELINE POR MOTIVO ==========
function PipelineTab() {
  const queryClient = useQueryClient();
  const { data: todosContatos = [], isLoading: loading } = useContatosQuery();
  const [pipeline, setPipeline] = useState({});

  const carregarContatos = async () => {
    await queryClient.invalidateQueries({ queryKey: ['chatbots_contatos'] });
  };

  useEffect(() => {
    if (todosContatos.length === 0) return;
    const comHistorico = todosContatos.filter(c => c.historico_mensagens?.length > 0 || c.ultima_mensagem);
    const pipelineOrganizado = {};
    motivosColunas.forEach(m => { pipelineOrganizado[m.id] = []; });
    comHistorico.forEach(contato => {
      const motivo = classificarMotivo(contato);
      pipelineOrganizado[motivo].push(contato);
    });
    setPipeline(pipelineOrganizado);
  }, [todosContatos]);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;

    const novoPipeline = { ...pipeline };
    const contatoMovido = novoPipeline[source.droppableId][source.index];
    novoPipeline[source.droppableId].splice(source.index, 1);
    novoPipeline[destination.droppableId].splice(destination.index, 0, contatoMovido);
    setPipeline(novoPipeline);

    try {
      const novoInteresse = motivoInteresseMap[destination.droppableId] || 'Outro';
      const interessesAtuais = contatoMovido.interesses || [];
      await base44.entities.Contato.update(draggableId, {
        interesses: [...interessesAtuais, novoInteresse]
      });
    } catch (error) {
      console.error('Erro:', error);
      carregarContatos();
    }
  };

  if (loading && todosContatos.length === 0) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {motivosColunas.map((motivo) => {
          const Icon = motivo.icon;
          return (
            <Card key={motivo.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-600 leading-tight">{motivo.nome}</p>
                  <p className="text-xl font-bold">{pipeline[motivo.id]?.length || 0}</p>
                </div>
                <div className={`${motivo.cor} p-2 rounded-lg`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="overflow-x-auto pb-2" style={{ maxWidth: '100%', direction: 'rtl', transform: 'rotateX(180deg)' }}>
          <div className="inline-flex gap-2" style={{ minWidth: 'max-content', direction: 'ltr', transform: 'rotateX(180deg)' }}>
            {motivosColunas.map((motivo) => {
              const Icon = motivo.icon;
              return (
                <div key={motivo.id} className="flex flex-col flex-shrink-0" style={{ width: '200px' }}>
                  <div className={`${motivo.cor} text-white p-2 rounded-t-lg flex items-center gap-1`}>
                    <Icon className="w-3 h-3" />
                    <span className="text-[10px] font-semibold truncate">{motivo.nome}</span>
                    <Badge className="ml-auto bg-white/20 text-white text-[9px] px-1 py-0">{pipeline[motivo.id]?.length || 0}</Badge>
                  </div>
                  <Droppable droppableId={motivo.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 bg-gray-100 p-2 rounded-b-lg min-h-[400px] space-y-2 ${snapshot.isDraggingOver ? 'bg-purple-50' : ''}`}
                      >
                        {pipeline[motivo.id]?.map((contato, index) => (
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
                                  <p className="text-[10px] text-gray-500 truncate">{contato.telefone}</p>
                                  {contato.created_date && (
                                    <p className="text-[9px] text-gray-400">{format(new Date(contato.created_date), 'dd/MM', { locale: ptBR })}</p>
                                  )}
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {pipeline[motivo.id]?.length === 0 && (
                          <div className="text-center text-gray-400 text-xs py-8">Vazio</div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}

// ========== COMPONENTE: DASHBOARD ==========
function DashboardTab() {
  const { data: todosContatos = [], isLoading: loadingContatos } = useContatosQuery();
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = useQuery({
    queryKey: ['agendamentos_dashboard_semana'],
    queryFn: async () => {
      const hoje = new Date();
      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - 7);
      return await base44.entities.Agendamento.filter({
        data_agendamento: { $gte: format(inicioSemana, 'yyyy-MM-dd') }
      });
    },
    staleTime: 60000,
  });

  const loading = loadingContatos || loadingAgendamentos;
  const contatos = React.useMemo(() => todosContatos.filter(c => c.historico_mensagens?.length > 0 || c.ultima_mensagem), [todosContatos]);

  if (loading && todosContatos.length === 0 && agendamentos.length === 0) {
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
          <CardContent className="max-h-96 overflow-y-auto">
            {agendamentos.filter(a => a.agendado_por_tipo === 'chatbot').sort((a, b) => (b.data_agendamento || '').localeCompare(a.data_agendamento || '')).map((ag) => (
              <div key={ag.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{ag.paciente_nome}</p>
                  <p className="text-xs text-gray-500">{ag.data_agendamento ? format(new Date(ag.data_agendamento + 'T12:00:00'), 'dd/MM') : '--/--'} às {ag.horario}</p>
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
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Conversas
            </TabsTrigger>
            <TabsTrigger value="contatos" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Contatos
            </TabsTrigger>
            <TabsTrigger value="notificacoes" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notificações
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="relatorio" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Relatório
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

          <TabsContent value="notificacoes" className="mt-4">
            <NotificacoesTab onAbrirChat={async (telefone, nome) => {
              // Buscar contato real pelo telefone para ter o histórico completo
              try {
                const telLimpo = (telefone || '').replace(/\D/g, '');
                // Tentar várias variações do telefone
                const variantes = [
                  telLimpo,                                             // 5551999082553
                  telLimpo.startsWith('55') ? telLimpo.slice(2) : telLimpo, // 51999082553
                  !telLimpo.startsWith('55') ? '55' + telLimpo : telLimpo,  // 5551999082553
                ];
                
                let contatoEncontrado = null;
                
                // 1) Tentar buscar por filter com cada variante
                for (const tel of variantes) {
                  if (!tel) continue;
                  const resultados = await base44.entities.Contato.filter({ telefone: tel });
                  if (resultados && resultados.length > 0) {
                    contatoEncontrado = resultados[0];
                    break;
                  }
                }
                
                // 2) Se não achou com filter, buscar na lista geral com busca parcial
                if (!contatoEncontrado) {
                  const ultimos8 = telLimpo.slice(-8);
                  let todosContatos = [];
                  let skip = 0;
                  const batchSize = 500;
                  while (todosContatos.length < 10000) {
                    const lote = await base44.entities.Contato.list('-ultima_interacao', batchSize, skip);
                    if (!lote || lote.length === 0) break;
                    todosContatos = [...todosContatos, ...lote];
                    if (lote.length < batchSize) break;
                    skip += batchSize;
                  }
                  contatoEncontrado = todosContatos.find(c => {
                    const telC = (c.telefone || '').replace(/\D/g, '');
                    return telC.includes(ultimos8);
                  });
                }
                
                if (contatoEncontrado) {
                  setContatoParaConversa(contatoEncontrado);
                } else {
                  setContatoParaConversa({ telefone: telLimpo, nome, historico_mensagens: [] });
                }
              } catch (err) {
                console.error('Erro ao buscar contato:', err);
                setContatoParaConversa({ telefone, nome, historico_mensagens: [] });
              }
              setActiveTab('chat');
            }} />
          </TabsContent>

          <TabsContent value="pipeline" className="mt-4">
            <PipelineTab />
          </TabsContent>

          <TabsContent value="relatorio" className="mt-4">
            <RelatorioChat embedded />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}