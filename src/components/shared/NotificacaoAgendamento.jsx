import React, { useEffect, useState, useRef } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Calendar, Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Notification, User } from "@/entities/all";
import { base44 } from "@/api/base44Client";

export default function NotificacaoAgendamento() {
  const { toast } = useToast();
  const [ultimaNotificacaoId, setUltimaNotificacaoId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const processedIdsRef = useRef(new Set());

  // Verificar autenticação ao montar o componente
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

  const reproduzirSom = () => {
    try {
      // Som de sino agradável
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Primeira nota (Dó)
      const oscillator1 = audioContext.createOscillator();
      const gainNode1 = audioContext.createGain();
      oscillator1.connect(gainNode1);
      gainNode1.connect(audioContext.destination);
      oscillator1.type = 'sine';
      oscillator1.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      gainNode1.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode1.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator1.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.5);

      // Segunda nota (Mi)
      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
      oscillator2.type = 'sine';
      oscillator2.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15); // E5
      gainNode2.gain.setValueAtTime(0, audioContext.currentTime + 0.15);
      gainNode2.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.16);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.65);
      oscillator2.start(audioContext.currentTime + 0.15);
      oscillator2.stop(audioContext.currentTime + 0.65);

      // Terceira nota (Sol)
      const oscillator3 = audioContext.createOscillator();
      const gainNode3 = audioContext.createGain();
      oscillator3.connect(gainNode3);
      gainNode3.connect(audioContext.destination);
      oscillator3.type = 'sine';
      oscillator3.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.3); // G5
      gainNode3.gain.setValueAtTime(0, audioContext.currentTime + 0.3);
      gainNode3.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.31);
      gainNode3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.9);
      oscillator3.start(audioContext.currentTime + 0.3);
      oscillator3.stop(audioContext.currentTime + 0.9);

      console.log('🔔 Som de notificação reproduzido!');
    } catch (error) {
      console.log("Não foi possível reproduzir o som:", error);
      // Vibração como fallback
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    }
  };

  const reproduzirSomCancelamento = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      const oscillator1 = audioContext.createOscillator();
      const gainNode1 = audioContext.createGain();
      oscillator1.connect(gainNode1);
      gainNode1.connect(audioContext.destination);
      oscillator1.type = 'sine';
      oscillator1.frequency.setValueAtTime(783.99, audioContext.currentTime);
      gainNode1.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode1.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.01);
      gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator1.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.3);

      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
      oscillator2.type = 'sine';
      oscillator2.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15);
      gainNode2.gain.setValueAtTime(0, audioContext.currentTime + 0.15);
      gainNode2.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.16);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.45);
      oscillator2.start(audioContext.currentTime + 0.15);
      oscillator2.stop(audioContext.currentTime + 0.45);

      const oscillator3 = audioContext.createOscillator();
      const gainNode3 = audioContext.createGain();
      oscillator3.connect(gainNode3);
      gainNode3.connect(audioContext.destination);
      oscillator3.type = 'sine';
      oscillator3.frequency.setValueAtTime(392.00, audioContext.currentTime + 0.3);
      gainNode3.gain.setValueAtTime(0, audioContext.currentTime + 0.3);
      gainNode3.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.31);
      gainNode3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.7);
      oscillator3.start(audioContext.currentTime + 0.3);
      oscillator3.stop(audioContext.currentTime + 0.7);
    } catch (error) {
      console.log("Não foi possível reproduzir o som:", error);
      if (navigator.vibrate) {
        navigator.vibrate([300, 100, 300]);
      }
    }
  };

  const reproduzirSomConfirmacao = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Som de "ding-dong" agradável para confirmação
      const osc1 = audioContext.createOscillator();
      const gain1 = audioContext.createGain();
      osc1.connect(gain1);
      gain1.connect(audioContext.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
      gain1.gain.setValueAtTime(0, audioContext.currentTime);
      gain1.gain.linearRampToValueAtTime(0.35, audioContext.currentTime + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      osc1.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.4);

      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, audioContext.currentTime + 0.2); // A5
      gain2.gain.setValueAtTime(0, audioContext.currentTime + 0.2);
      gain2.gain.linearRampToValueAtTime(0.35, audioContext.currentTime + 0.21);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.7);
      osc2.start(audioContext.currentTime + 0.2);
      osc2.stop(audioContext.currentTime + 0.7);
    } catch (error) {
      console.log("Não foi possível reproduzir o som:", error);
    }
  };

  useEffect(() => {
    // IMPORTANTE: Não executar se não estiver autenticado
    if (!isAuthenticated) {
      console.log('⚠️ Usuário não autenticado - pulando verificação de notificações');
      return;
    }

    const verificarNotificacoes = async () => {
      try {
        // 1. Acionar verificação de lembretes no backend (não bloqueante)
        // Chama a função para gerar notificações de lembrete se houver
        base44.functions.invoke('checkTeamReminders').catch(console.error);

        // 2. Buscar notificações não lidas (qualquer tipo, mas vamos focar nos tipos conhecidos)
        // Vamos buscar as últimas não lidas
        const notificacoes = await Notification.filter(
          { is_read: false },
          '-created_date',
          5 // Buscar um pouco mais para garantir
        );

        if (notificacoes && notificacoes.length > 0) {
          // Pegar a mais recente para exibir
          const novaNotificacao = notificacoes[0];
          
          // Verificar se é uma notificação diferente da última processada
          if (novaNotificacao.id !== ultimaNotificacaoId) {
            console.log('🔔 Nova notificação detectada!', novaNotificacao);
            
            setUltimaNotificacaoId(novaNotificacao.id);
            
            // Reproduzir som
            reproduzirSom();
            
            if (novaNotificacao.type === 'lembrete_equipe') {
              // Toast específico para lembrete
              toast({
                title: (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse" />
                    <span className="font-bold text-lg text-amber-800">Lembrete da Equipe</span>
                  </div>
                ),
                description: (
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="text-sm font-medium text-gray-800">{novaNotificacao.message}</span>
                  </div>
                ),
                duration: 15000, // Mais tempo para ler
                className: "border-amber-500 bg-amber-50 shadow-2xl border-2",
              });
            } else if (novaNotificacao.type === 'agendamento_cancelado') {
              // Toast específico para cancelamento - som de alerta diferente
              reproduzirSomCancelamento();
              
              toast({
                title: (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
                    <span className="font-bold text-lg text-red-800">❌ Consulta Cancelada!</span>
                  </div>
                ),
                description: (
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="text-sm font-medium text-gray-800">{novaNotificacao.message}</span>
                    <div className="text-xs font-semibold mt-1 px-2 py-1 rounded-full inline-flex items-center gap-1 w-fit bg-red-100 text-red-700">
                      🤖 Cancelado via WhatsApp - Glória
                    </div>
                  </div>
                ),
                duration: 15000,
                className: "border-red-500 bg-red-50 shadow-2xl border-2",
              });
            } else {
              // Toast para novo agendamento - verificar se foi pela Glória ou usuário
              const agendadoPor = novaNotificacao.data?.agendado_por;
              const agendadoPorTipo = novaNotificacao.data?.agendado_por_tipo;
              
              const isGloria = agendadoPorTipo === 'chatbot' || agendadoPor === 'Glória';
              
              toast({
                title: (
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-500 animate-bounce" />
                    <span className="font-bold text-lg">🎉 Novo Agendamento!</span>
                  </div>
                ),
                description: (
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">{novaNotificacao.message}</span>
                    </div>
                    <div className={`text-xs font-semibold mt-1 px-2 py-1 rounded-full inline-flex items-center gap-1 w-fit ${isGloria ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                      {isGloria ? (
                        <>🤖 Agendado pela Glória</>
                      ) : (
                        <>👤 Agendado por {agendadoPor || 'usuário'}</>
                      )}
                    </div>
                  </div>
                ),
                duration: 10000,
                className: isGloria ? "border-purple-500 bg-purple-50 shadow-2xl border-2" : "border-blue-500 bg-blue-50 shadow-2xl border-2",
              });
            }

            // Marcar como lida
            await Notification.update(novaNotificacao.id, { is_read: true });
            
            console.log('✅ Notificação processada e marcada como lida');
          }
        }
      } catch (error) {
        // Silenciar erros de permissão e rate limit
        if (error.message?.includes('403') || 
            error.message?.includes('access') || 
            error.message?.includes('Rate limit') ||
            error.message?.includes('private')) {
          // Erro de permissão - não logar para não poluir o console
          return;
        }
        console.error("Erro ao verificar notificações:", error);
      }
    };

    // Verificar imediatamente ao montar
    setTimeout(verificarNotificacoes, 2000);

    // Verificar a cada 15 segundos
    const interval = setInterval(verificarNotificacoes, 15000);

    return () => {
      clearInterval(interval);
    };
  }, [ultimaNotificacaoId, toast, isAuthenticated]);

  return null;
}