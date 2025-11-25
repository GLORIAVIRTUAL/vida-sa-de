import React, { useState, useEffect, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, User, Calendar, Stethoscope, Clock, Volume2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { ChamadaPaciente } from "@/entities/all";

const prioridadeColors = {
  "Normal": "bg-gray-100 text-gray-700",
  "Idoso (60+ anos)": "bg-blue-100 text-blue-700",
  "Deficiente Físico": "bg-purple-100 text-purple-700",
  "Gestante": "bg-pink-100 text-pink-700",
  "Lactante": "bg-green-100 text-green-700",
  "Criança de Colo": "bg-orange-100 text-orange-700",
  "Pessoa com Criança de Colo": "bg-red-100 text-red-700"
};

const prioridadeIcons = {
  "Normal": null,
  "Idoso (60+ anos)": "🧓",
  "Deficiente Físico": "♿",
  "Gestante": "🤱",
  "Lactante": "🍼",
  "Criança de Colo": "👶",
  "Pessoa com Criança de Colo": "👨‍👶"
};

export default function PainelTV() {
  const [chamadaAtual, setChamadaAtual] = useState(null);
  const [historicoChamadas, setHistoricoChamadas] = useState([]);
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [ultimaChamadaId, setUltimaChamadaId] = useState(null);

  useEffect(() => {
    // Atualizar relógio a cada segundo
    const intervalRelogio = setInterval(() => {
      setHoraAtual(new Date());
    }, 1000);

    return () => clearInterval(intervalRelogio);
  }, []);

  const reproduzirSom = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // SOM 1: Bipe inicial (agudo)
      const bipe1 = () => {
        const oscillator1 = audioContext.createOscillator();
        const gainNode1 = audioContext.createGain();
        
        oscillator1.connect(gainNode1);
        gainNode1.connect(audioContext.destination);
        
        oscillator1.type = 'sine';
        oscillator1.frequency.setValueAtTime(880, audioContext.currentTime); // Nota A5
        
        gainNode1.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode1.gain.linearRampToValueAtTime(0.6, audioContext.currentTime + 0.01);
        gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator1.start(audioContext.currentTime);
        oscillator1.stop(audioContext.currentTime + 0.3);
      };
      
      // SOM 2: Bipe médio
      const bipe2 = () => {
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();
        
        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);
        
        oscillator2.type = 'sine';
        oscillator2.frequency.setValueAtTime(698, audioContext.currentTime + 0.35); // Nota F5
        
        gainNode2.gain.setValueAtTime(0, audioContext.currentTime + 0.35);
        gainNode2.gain.linearRampToValueAtTime(0.6, audioContext.currentTime + 0.36);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.65);
        
        oscillator2.start(audioContext.currentTime + 0.35);
        oscillator2.stop(audioContext.currentTime + 0.65);
      };
      
      // SOM 3: Bipe final (agudo longo)
      const bipe3 = () => {
        const oscillator3 = audioContext.createOscillator();
        const gainNode3 = audioContext.createGain();
        
        oscillator3.connect(gainNode3);
        gainNode3.connect(audioContext.destination);
        
        oscillator3.type = 'sine';
        oscillator3.frequency.setValueAtTime(880, audioContext.currentTime + 0.7); // Nota A5
        
        gainNode3.gain.setValueAtTime(0, audioContext.currentTime + 0.7);
        gainNode3.gain.linearRampToValueAtTime(0.7, audioContext.currentTime + 0.71);
        gainNode3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.3);
        
        oscillator3.start(audioContext.currentTime + 0.7);
        oscillator3.stop(audioContext.currentTime + 1.3);
      };
      
      // Executar sequência de bipes
      bipe1();
      bipe2();
      bipe3();
      
      console.log("🔊 Som de chamada reproduzido com sucesso!");
    } catch (error) {
      console.error("Erro ao reproduzir som:", error);
      // Fallback: vibração no celular
      if (navigator.vibrate) {
        navigator.vibrate([300, 100, 300, 100, 500]);
      }
    }
  }, []);

  const verificarNovasChamadas = useCallback(async () => {
    try {
      const chamadas = await ChamadaPaciente.filter(
        { status: 'ativa' },
        '-created_date',
        1
      );

      if (chamadas && chamadas.length > 0) {
        const novaChamada = chamadas[0];
        
        // Se é uma nova chamada (diferente da última processada)
        if (novaChamada.id !== ultimaChamadaId) {
          console.log('🔔 [PainelTV] Nova chamada detectada:', novaChamada);
          
          setUltimaChamadaId(novaChamada.id);
          setChamadaAtual({
            id: novaChamada.id,
            nomePaciente: novaChamada.paciente_nome,
            nomeMedico: novaChamada.medico_nome,
            especialidade: novaChamada.especialidade,
            horario: novaChamada.horario,
            prioridade: novaChamada.prioridade,
            timestamp: novaChamada.created_date
          });
          
          // Adicionar ao histórico
          setHistoricoChamadas(prev => [{
            nomePaciente: novaChamada.paciente_nome,
            nomeMedico: novaChamada.medico_nome,
            especialidade: novaChamada.especialidade,
            horario: novaChamada.horario,
            timestamp: novaChamada.created_date
          }, ...prev].slice(0, 5));

          // 🔊 REPRODUZIR SOM
          reproduzirSom();

          // Marcar como exibida
          await ChamadaPaciente.update(novaChamada.id, { 
            status: 'exibida',
            exibida_em: new Date().toISOString()
          });

          // Remover chamada atual após 15 segundos
          setTimeout(() => {
            setChamadaAtual(null);
          }, 15000);
        }
      }
    } catch (error) {
      console.error('[PainelTV] Erro ao verificar chamadas:', error);
    }
  }, [ultimaChamadaId, reproduzirSom]);

  useEffect(() => {
    // Verificar imediatamente ao carregar
    verificarNovasChamadas();

    // Verificar novas chamadas a cada 2 segundos
    const intervalChamadas = setInterval(() => {
      verificarNovasChamadas();
    }, 2000);

    return () => clearInterval(intervalChamadas);
  }, [verificarNovasChamadas]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-white rounded-xl shadow-lg p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" 
              alt="CENTRO VIDA SAÚDE" 
              className="h-16 object-contain" 
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">CENTRO VIDA SAÚDE</h1>
              <p className="text-gray-600">Painel de Chamadas</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-blue-600">
              {format(horaAtual, 'HH:mm:ss')}
            </div>
            <div className="text-sm text-gray-600">
              {format(horaAtual, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </div>
          </div>
        </div>
      </div>

      {/* Chamada Atual - Grande e Destacada */}
      <AnimatePresence>
        {chamadaAtual && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: -50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
            transition={{ type: "spring", bounce: 0.4 }}
            className="max-w-7xl mx-auto mb-8"
          >
            <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-2xl border-4 border-white">
              <div className="p-12">
                <div className="flex items-center justify-center gap-6 mb-8">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <Bell className="w-20 h-20" />
                  </motion.div>
                  <h2 className="text-6xl font-bold">CHAMADA</h2>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: 0.3 }}
                  >
                    <Volume2 className="w-20 h-20" />
                  </motion.div>
                </div>

                <div className="text-center space-y-6">
                  <div className="bg-white text-blue-900 rounded-2xl p-8 shadow-xl">
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <User className="w-12 h-12" />
                      <p className="text-3xl font-semibold">Paciente:</p>
                    </div>
                    <p className="text-7xl font-bold mb-4">{chamadaAtual.nomePaciente}</p>
                    
                    {chamadaAtual.prioridade && chamadaAtual.prioridade !== 'Normal' && (
                      <Badge className={`${prioridadeColors[chamadaAtual.prioridade]} text-2xl px-6 py-2`}>
                        {prioridadeIcons[chamadaAtual.prioridade]} {chamadaAtual.prioridade}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <Stethoscope className="w-8 h-8" />
                        <p className="text-2xl font-semibold">Médico</p>
                      </div>
                      <p className="text-3xl font-bold">{chamadaAtual.nomeMedico}</p>
                      <p className="text-xl mt-2 opacity-90">{chamadaAtual.especialidade}</p>
                    </div>

                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <Clock className="w-8 h-8" />
                        <p className="text-2xl font-semibold">Horário</p>
                      </div>
                      <p className="text-4xl font-bold">{chamadaAtual.horario}</p>
                    </div>

                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <Calendar className="w-8 h-8" />
                        <p className="text-2xl font-semibold">Data</p>
                      </div>
                      <p className="text-2xl font-bold">
                        {format(new Date(), "dd/MM/yyyy")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Histórico de Chamadas */}
      {!chamadaAtual && historicoChamadas.length > 0 && (
        <div className="max-w-7xl mx-auto">
          <Card className="bg-white shadow-xl">
            <div className="p-8">
              <h3 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <Clock className="w-8 h-8 text-blue-600" />
                Últimas Chamadas
              </h3>
              <div className="space-y-4">
                {historicoChamadas.map((chamada, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-6 bg-gray-50 rounded-xl border-2 border-gray-200"
                  >
                    <div className="flex items-center gap-4">
                      <User className="w-8 h-8 text-blue-600" />
                      <div>
                        <p className="text-2xl font-bold text-gray-900">{chamada.nomePaciente}</p>
                        <p className="text-lg text-gray-600">{chamada.nomeMedico} • {chamada.especialidade}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">{chamada.horario}</p>
                      <p className="text-sm text-gray-500">
                        {format(new Date(chamada.timestamp), "HH:mm:ss")}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Mensagem quando não há chamadas */}
      {!chamadaAtual && historicoChamadas.length === 0 && (
        <div className="max-w-7xl mx-auto">
          <Card className="bg-white shadow-xl">
            <div className="p-16 text-center">
              <Bell className="w-24 h-24 mx-auto mb-6 text-gray-300" />
              <h3 className="text-4xl font-bold text-gray-400 mb-4">Aguardando Chamadas</h3>
              <p className="text-2xl text-gray-500">
                As chamadas dos pacientes aparecerão aqui automaticamente
              </p>
              <p className="text-lg text-gray-400 mt-4">
                ✅ Conectado e verificando a cada 2 segundos
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}