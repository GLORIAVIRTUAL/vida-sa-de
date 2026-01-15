import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Calendar, Clock, User, AlertCircle } from "lucide-react";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ConfirmarPresenca() {
  const [loading, setLoading] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [agendamento, setAgendamento] = useState(null);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const codigo = urlParams.get('codigo');

  useEffect(() => {
    if (codigo) {
      carregarAgendamento();
    } else {
      setErro('Código de agendamento não informado.');
      setLoading(false);
    }
  }, [codigo]);

  const carregarAgendamento = async () => {
    try {
      setLoading(true);
      const result = await base44.functions.invoke('buscarAgendamentoPublico', { codigo });
      
      if (result.data?.sucesso && result.data?.agendamento) {
        setAgendamento(result.data.agendamento);
      } else {
        setErro(result.data?.erro || 'Agendamento não encontrado.');
      }
    } catch (error) {
      console.error('Erro ao carregar agendamento:', error);
      setErro('Erro ao carregar dados do agendamento.');
    } finally {
      setLoading(false);
    }
  };

  const confirmarPresenca = async () => {
    try {
      setConfirmando(true);
      const result = await base44.functions.invoke('confirmarAgendamentoPublico', { codigo });
      
      if (result.data?.sucesso) {
        setSucesso(true);
        setAgendamento(prev => ({ ...prev, status: 'Confirmado' }));
      } else {
        setErro(result.data?.erro || 'Erro ao confirmar presença.');
      }
    } catch (error) {
      console.error('Erro ao confirmar:', error);
      setErro('Erro ao confirmar presença. Tente novamente.');
    } finally {
      setConfirmando(false);
    }
  };

  const formatarData = (dataStr) => {
    if (!dataStr) return '';
    return format(new Date(dataStr + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Carregando dados do agendamento...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (erro && !agendamento) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Erro</h2>
            <p className="text-gray-600 mb-6">{erro}</p>
            <p className="text-sm text-gray-500">
              Por favor, entre em contato com a clínica pelo WhatsApp: 
              <a href="https://wa.me/5551985505991" className="text-blue-600 ml-1 hover:underline">
                51 98550-5991
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const jaConfirmado = agendamento?.status === 'Confirmado' || sucesso;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/696256b5ef59ea2bed1bd7ea/8ca927e40_Untitleddesign27.png" 
            alt="Centro Vida Saúde" 
            className="h-16 object-contain mx-auto mb-2" 
          />
          <CardTitle className="text-xl text-gray-800">
            {jaConfirmado ? 'Presença Confirmada!' : 'Confirmar Presença'}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-6">
          {jaConfirmado && (
            <div className="mb-6 text-center">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-3 animate-bounce" />
              <p className="text-green-700 font-semibold text-lg">
                {sucesso ? 'Sua presença foi confirmada com sucesso!' : 'Sua consulta já está confirmada!'}
              </p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Paciente</p>
                <p className="font-medium text-gray-800">{agendamento?.paciente_nome}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Data</p>
                <p className="font-medium text-gray-800">{formatarData(agendamento?.data_agendamento)}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Horário</p>
                <p className="font-medium text-gray-800">{agendamento?.horario}</p>
              </div>
            </div>

            {agendamento?.medico_nome && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Profissional</p>
                  <p className="font-medium text-gray-800">{agendamento?.medico_nome}</p>
                </div>
              </div>
            )}
          </div>

          {!jaConfirmado && (
            <Button 
              onClick={confirmarPresenca} 
              disabled={confirmando}
              className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white py-6 text-lg"
            >
              {confirmando ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Confirmar Minha Presença
                </>
              )}
            </Button>
          )}

          {erro && agendamento && (
            <p className="text-red-600 text-sm text-center mt-4">{erro}</p>
          )}

          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-xs text-gray-500">
              Por favor, chegue com 10 minutos de antecedência.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Dúvidas? WhatsApp: 
              <a href="https://wa.me/5551985505991" className="text-blue-600 ml-1 hover:underline">
                51 98550-5991
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}