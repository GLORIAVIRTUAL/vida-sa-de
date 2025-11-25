import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, CheckCircle, Calendar, Clock, Stethoscope } from "lucide-react";

import FormularioAgendamentoOnline from '../components/agendamento-online/FormularioAgendamentoOnline';

export default function AgendamentoOnline() {
  const [etapaAtual, setEtapaAtual] = useState('formulario'); // formulario, sucesso
  const [agendamentoRealizado, setAgendamentoRealizado] = useState(null);

  const handleAgendamentoSucesso = (dadosAgendamento) => {
    setAgendamentoRealizado(dadosAgendamento);
    setEtapaAtual('sucesso');
  };

  const novoAgendamento = () => {
    setEtapaAtual('formulario');
    setAgendamentoRealizado(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-4">
      {/* Header Público */}
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" 
              alt="CENTRO VIDA SAÚDE" 
              className="h-16 object-contain" 
            />
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">CENTRO VIDA SAÚDE</h1>
          <div className="flex items-center justify-center gap-2 text-lg text-blue-600 mb-4">
            <Calendar className="w-5 h-5" />
            <span>Agendamento Online</span>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Agende sua consulta de forma rápida, segura e sem sair de casa. 
            Escolha o médico, data e horário que melhor se adequam à sua agenda.
          </p>
        </div>

        {/* Indicadores de Processo */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center ${etapaAtual === 'formulario' ? 'text-blue-600' : 'text-green-600'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${etapaAtual === 'formulario' ? 'bg-blue-600' : 'bg-green-600'}`}>
                1
              </div>
              <span className="ml-2 font-medium">Preencher Dados</span>
            </div>
            
            <div className="w-8 h-px bg-gray-300"></div>
            
            <div className={`flex items-center ${etapaAtual === 'sucesso' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${etapaAtual === 'sucesso' ? 'bg-green-600' : 'bg-gray-400'}`}>
                2
              </div>
              <span className="ml-2 font-medium">Confirmação</span>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        {etapaAtual === 'formulario' && (
          <FormularioAgendamentoOnline 
            onSucesso={handleAgendamentoSucesso}
          />
        )}

        {etapaAtual === 'sucesso' && (
          <Card className="max-w-2xl mx-auto shadow-xl border-green-200">
            <CardHeader className="text-center bg-green-50">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-2xl text-green-800">Agendamento Realizado com Sucesso!</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {agendamentoRealizado && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-gray-800 mb-3">Detalhes do seu agendamento:</h3>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span>Data: {agendamentoRealizado.data_formatada}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>Horário: {agendamentoRealizado.horario}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-blue-600" />
                      <span>Médico: {agendamentoRealizado.medico_nome}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2">📋 Próximos Passos:</h4>
                <ul className="text-blue-700 text-sm space-y-1 ml-4">
                  <li>• Chegue 15 minutos antes do horário agendado</li>
                  <li>• Traga um documento de identidade com foto</li>
                  <li>• Se necessário, traga carteirinha do convênio</li>
                  <li>• Em caso de imprevistos, entre em contato conosco</li>
                </ul>
              </div>

              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h4 className="font-semibold text-green-800 mb-2">📱 Contato</h4>
                <p className="text-green-700 text-sm">
                  Para reagendar ou esclarecer dúvidas, entre em contato conosco pelo telefone ou WhatsApp
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button onClick={novoAgendamento} variant="outline" className="flex-1">
                  Fazer Novo Agendamento
                </Button>
                <Button 
                  onClick={() => window.print()} 
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  Imprimir Comprovante
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t border-gray-200">
          <div className="flex items-center justify-center gap-1 text-gray-600 text-sm mb-2">
            <Heart className="w-4 h-4 text-red-500" />
            <span>Cuidando da sua saúde com excelência</span>
          </div>
          <p className="text-xs text-gray-500">
            Sistema desenvolvido por <strong>Glória Virtual - Soluções com Inteligência Artificial</strong>
          </p>
        </div>
      </div>
    </div>
  );
}