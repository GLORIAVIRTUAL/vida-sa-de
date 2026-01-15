import React, { useState, useEffect, useRef } from 'react';
import { Contato, User } from '@/entities/all';
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const ultimaVerificacaoRef = useRef(null);
  const ultimaInteracaoConhecidaRef = useRef(null);
  const somAtivoRef = useRef(somAtivo);

  // Verificar autenticação ao montar
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await User.me();
        setIsAuthenticated(!!user);
      } catch (error) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Manter ref atualizado
  useEffect(() => {
    somAtivoRef.current = somAtivo;
  }, [somAtivo]);

  // Salvar preferência de som
  useEffect(() => {
    localStorage.setItem('chatSomAtivo', JSON.stringify(somAtivo));
  }, [somAtivo]);

  // Tocar som de notificação usando Web Audio API (mais confiável)
  const tocarSom = () => {
    if (!somAtivoRef.current) return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Som de "ding" para mensagem
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      // Segunda nota
      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
      oscillator2.type = 'sine';
      oscillator2.frequency.setValueAtTime(1108.73, audioContext.currentTime + 0.1); // C#6
      gainNode2.gain.setValueAtTime(0, audioContext.currentTime + 0.1);
      gainNode2.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.11);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      oscillator2.start(audioContext.currentTime + 0.1);
      oscillator2.stop(audioContext.currentTime + 0.4);
      
      console.log('🔔 Som de mensagem reproduzido!');
    } catch (e) {
      console.log('Erro ao tocar som:', e);
    }
  };

  // Polling para verificar novas mensagens
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const verificarNovasMensagens = async () => {
      try {
        const contatos = await Contato.list('-updated_date', 20);
        
        // Na primeira execução, apenas armazenar os timestamps das últimas mensagens de usuário
        if (ultimaVerificacaoRef.current === null) {
          ultimaVerificacaoRef.current = new Date();
          
          // Armazenar timestamps das mensagens de usuário já existentes
          const timestampsExistentes = {};
          contatos.forEach(c => {
            if (c.historico_mensagens?.length > 0) {
              // Pegar a última mensagem do usuário
              const ultimaMsgUsuario = [...c.historico_mensagens].reverse().find(m => m.role === 'user');
              if (ultimaMsgUsuario?.timestamp) {
                timestampsExistentes[c.id] = ultimaMsgUsuario.timestamp;
              }
            }
          });
          ultimaInteracaoConhecidaRef.current = timestampsExistentes;
          console.log('📱 Chat notificações inicializado');
          return;
        }

        // Verificar cada contato por novas mensagens de usuário
        for (const contato of contatos) {
          if (!contato.historico_mensagens?.length) continue;
          
          // Pegar a última mensagem do usuário
          const ultimaMsgUsuario = [...contato.historico_mensagens].reverse().find(m => m.role === 'user');
          if (!ultimaMsgUsuario?.timestamp) continue;
          
          const timestampConhecido = ultimaInteracaoConhecidaRef.current[contato.id];
          
          // Se é uma nova mensagem (timestamp diferente do conhecido)
          if (ultimaMsgUsuario.timestamp !== timestampConhecido) {
            const dataMensagem = new Date(ultimaMsgUsuario.timestamp);
            
            // E é mais recente que nossa última verificação
            if (dataMensagem > ultimaVerificacaoRef.current) {
              console.log('📱 Nova mensagem de:', contato.nome, '-', ultimaMsgUsuario.content?.substring(0, 50));
              
              // Criar notificação
              const novaNotificacao = {
                id: Date.now() + Math.random(),
                nome: contato.nome || 'Novo contato',
                telefone: contato.telefone,
                mensagem: ultimaMsgUsuario.content?.substring(0, 100) || 'Nova mensagem',
                timestamp: new Date()
              };

              setNotificacoes(prev => {
                // Evitar duplicatas do mesmo telefone nos últimos 30s
                if (prev.some(n => n.telefone === novaNotificacao.telefone && 
                    Date.now() - n.timestamp.getTime() < 30000)) {
                  return prev;
                }
                return [novaNotificacao, ...prev].slice(0, 5);
              });

              tocarSom();
            }
            
            // Atualizar timestamp conhecido
            ultimaInteracaoConhecidaRef.current[contato.id] = ultimaMsgUsuario.timestamp;
          }
        }

        ultimaVerificacaoRef.current = new Date();
      } catch (error) {
        // Silenciar erros de permissão
        if (!error.message?.includes('403') && !error.message?.includes('Rate limit')) {
          console.error('Erro ao verificar mensagens:', error);
        }
      }
    };

    // Verificar após 2 segundos
    const timeout = setTimeout(verificarNovasMensagens, 2000);
    
    // Verificar a cada 8 segundos
    const interval = setInterval(verificarNovasMensagens, 8000);
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isAuthenticated]);

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