import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Contato } from '@/entities/all';
import { MessageSquare, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function NotificacaoMensagemChat() {
  const [somAtivo, setSomAtivo] = useState(() => {
    const saved = localStorage.getItem('chatSomAtivo');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [notificacoes, setNotificacoes] = useState([]);
  const [ultimaVerificacao, setUltimaVerificacao] = useState(null);
  const audioRef = useRef(null);
  const ultimoContatoIdRef = useRef(null);

  // Salvar preferência de som
  useEffect(() => {
    localStorage.setItem('chatSomAtivo', JSON.stringify(somAtivo));
  }, [somAtivo]);

  // Criar elemento de áudio
  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
    audioRef.current.volume = 0.5;
  }, []);

  // Tocar som de notificação
  const tocarSom = useCallback(() => {
    if (somAtivo && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Erro ao tocar som:', e));
    }
  }, [somAtivo]);

  // Verificar novas mensagens
  const verificarNovasMensagens = useCallback(async () => {
    try {
      const contatos = await Contato.list('-ultima_interacao', 50);
      
      // Filtrar apenas contatos com mensagens não lidas (última mensagem do usuário)
      const contatosComNovasMensagens = contatos.filter(c => {
        if (!c.historico_mensagens || c.historico_mensagens.length === 0) return false;
        const ultimaMensagem = c.historico_mensagens[c.historico_mensagens.length - 1];
        return ultimaMensagem.role === 'user';
      });

      // Na primeira execução, apenas armazenar os IDs
      if (ultimaVerificacao === null) {
        setUltimaVerificacao(new Date());
        if (contatosComNovasMensagens.length > 0) {
          ultimoContatoIdRef.current = contatosComNovasMensagens[0].id;
        }
        return;
      }

      // Verificar se há novos contatos com mensagens
      if (contatosComNovasMensagens.length > 0) {
        const contatoMaisRecente = contatosComNovasMensagens[0];
        const ultimaInteracao = new Date(contatoMaisRecente.ultima_interacao);
        
        // Se a última interação é mais recente que nossa última verificação
        // E é um contato diferente ou a mesma pessoa mandou nova mensagem
        if (ultimaInteracao > ultimaVerificacao && 
            (contatoMaisRecente.id !== ultimoContatoIdRef.current || 
             ultimaInteracao.getTime() > ultimaVerificacao.getTime() + 5000)) {
          
          // Criar notificação
          const novaNotificacao = {
            id: Date.now(),
            nome: contatoMaisRecente.nome || 'Novo contato',
            telefone: contatoMaisRecente.telefone,
            mensagem: contatoMaisRecente.ultima_mensagem?.substring(0, 100) || 'Nova mensagem',
            timestamp: new Date()
          };

          setNotificacoes(prev => {
            // Evitar duplicatas
            if (prev.some(n => n.telefone === novaNotificacao.telefone && 
                Date.now() - n.timestamp.getTime() < 30000)) {
              return prev;
            }
            return [novaNotificacao, ...prev].slice(0, 5);
          });

          tocarSom();
          ultimoContatoIdRef.current = contatoMaisRecente.id;
        }
      }

      setUltimaVerificacao(new Date());
    } catch (error) {
      console.error('Erro ao verificar mensagens:', error);
    }
  }, [ultimaVerificacao, tocarSom]);

  // Polling para verificar novas mensagens
  useEffect(() => {
    verificarNovasMensagens();
    const interval = setInterval(verificarNovasMensagens, 10000); // A cada 10 segundos
    return () => clearInterval(interval);
  }, [verificarNovasMensagens]);

  // Auto-remover notificações após 15 segundos
  useEffect(() => {
    if (notificacoes.length === 0) return;
    
    const timer = setTimeout(() => {
      setNotificacoes(prev => prev.slice(0, -1));
    }, 15000);

    return () => clearTimeout(timer);
  }, [notificacoes]);

  const removerNotificacao = (id) => {
    setNotificacoes(prev => prev.filter(n => n.id !== id));
  };

  return (
    <>
      {/* Botão de toggle do som - fixo no canto */}
      <div className="fixed bottom-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSomAtivo(!somAtivo)}
          className={`rounded-full shadow-lg ${somAtivo ? 'bg-green-100 hover:bg-green-200' : 'bg-gray-100 hover:bg-gray-200'}`}
          title={somAtivo ? 'Som ativado - Clique para desativar' : 'Som desativado - Clique para ativar'}
        >
          {somAtivo ? (
            <Volume2 className="h-5 w-5 text-green-600" />
          ) : (
            <VolumeX className="h-5 w-5 text-gray-500" />
          )}
        </Button>
      </div>

      {/* Notificações */}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {notificacoes.map(notificacao => (
          <div
            key={notificacao.id}
            className="bg-white border border-green-200 rounded-lg shadow-xl p-4 animate-in slide-in-from-right duration-300"
          >
            <div className="flex items-start gap-3">
              <div className="bg-green-100 rounded-full p-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {notificacao.nome}
                  </p>
                  <button
                    onClick={() => removerNotificacao(notificacao.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-1">{notificacao.telefone}</p>
                <p className="text-sm text-gray-700 line-clamp-2">{notificacao.mensagem}</p>
                <Link
                  to={createPageUrl('ChatbotsAtivos')}
                  className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                  onClick={() => removerNotificacao(notificacao.id)}
                >
                  Ver conversa →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}