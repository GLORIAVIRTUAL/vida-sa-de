import React, { useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, CreditCard, Send, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function CartaoDigital({ venda, titular = true, dependente = null }) {
  const cartaoRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const { toast } = useToast();

  // Determinar dados do cartão
  const nomeTitular = titular ? venda.titular?.nome : dependente?.nome;
  const cpfTitular = titular ? venda.titular?.cpf : dependente?.cpf;
  const tipoRelacao = titular ? "TITULAR" : "DEPENDENTE";

  const baixarCartao = async () => {
    if (!cartaoRef.current) return;

    try {
      const canvas = await html2canvas(cartaoRef.current, {
        scale: 3,
        backgroundColor: null,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 15000,
        removeContainer: true,
      });

      const link = document.createElement('a');
      const nomeArquivo = `cartao-mais-vida-${nomeTitular?.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.download = nomeArquivo;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Erro ao gerar cartão:', error);
      alert('Erro ao gerar o cartão digital.');
    }
  };

  const enviarCartaoWhatsapp = async () => {
    setEnviando(true);
    
    try {
      // Obter telefone do portador
      const telefone = titular ? venda.titular?.telefone : (dependente?.telefone || venda.titular?.telefone);
      const nomePaciente = titular ? venda.titular?.nome : dependente?.nome;

      if (!telefone) {
        toast({
          title: "Erro",
          description: "Telefone não encontrado. Atualize o cadastro.",
          variant: "destructive"
        });
        return;
      }

      // Gerar imagem do cartão
      const canvas = await html2canvas(cartaoRef.current, {
        scale: 3,
        backgroundColor: null,
        logging: false,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 15000,
        removeContainer: true,
      });

      const imagemBase64 = canvas.toDataURL('image/png');

      // Enviar via backend
      const response = await base44.functions.invoke('enviarCartaoWhatsapp', {
        telefone,
        imagemBase64,
        nomePaciente
      });

      if (response.data.success) {
        toast({
          title: "Cartão Enviado! 🎉",
          description: `Enviado com sucesso para ${telefone}`,
          duration: 5000
        });
      } else {
        throw new Error(response.data.error || 'Erro ao enviar');
      }

    } catch (error) {
      console.error('❌ Erro ao enviar cartão:', error);
      toast({
        title: "Erro ao enviar",
        description: error.message || "Não foi possível enviar o cartão. Verifique o telefone e tente novamente.",
        variant: "destructive",
        duration: 7000
      });
    } finally {
      setEnviando(false);
    }
  };

  if (!venda || !nomeTitular) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Preview do Cartão */}
      <div 
        ref={cartaoRef} 
        className="w-[450px] h-[280px] bg-gradient-to-br from-emerald-600 via-teal-700 to-green-800 rounded-2xl shadow-2xl text-white relative overflow-hidden"
        style={{ fontFamily: 'Arial, sans-serif', padding: '20px 20px 16px 20px' }}
      >
        {/* Elementos de fundo decorativos */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full -ml-16 -mb-16"></div>

        {/* Header - Logos */}
        <div className="flex items-start justify-between mb-3 relative z-10">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/2b9859adb_Untitleddesign30.png" 
            alt="Cartão Mais Vida" 
            className="h-11 w-auto object-contain"
            crossOrigin="anonymous"
          />
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" 
            alt="Centro Vida Saúde" 
            className="h-8 w-auto object-contain bg-white rounded px-2 py-0.5"
            crossOrigin="anonymous"
          />
        </div>

        {/* Tipo de Cartão */}
        <div className="mb-2 relative z-10">
          <div className="inline-block bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">
            {tipoRelacao}
          </div>
        </div>

        {/* Informações do Portador */}
        <div className="space-y-1.5 relative z-10">
          {/* Nome */}
          <div>
            <p className="text-[10px] text-white/70 uppercase tracking-wider mb-0.5">Nome do Portador</p>
            <p className="text-base font-bold leading-snug" style={{ wordBreak: 'break-word', minHeight: '2.4em', display: 'flex', alignItems: 'center' }}>
              {nomeTitular}
            </p>
          </div>

          {/* Plano */}
          <div>
            <p className="text-[10px] text-white/70 uppercase tracking-wider mb-0.5">Plano</p>
            <p className="text-sm font-semibold leading-tight">{venda.tipo_plano}</p>
          </div>

          {/* CPF e Validade */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <p className="text-[10px] text-white/70 uppercase tracking-wider mb-0.5">CPF</p>
              <p className="text-sm font-semibold">
                {cpfTitular?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/70 uppercase tracking-wider mb-0.5">Validade</p>
              <p className="text-sm font-semibold">
                {venda.validade_cartao 
                  ? format(new Date(venda.validade_cartao + 'T00:00:00'), "MM/yy", { locale: ptBR })
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="absolute bottom-3 right-5 z-10">
          <p className="text-[10px] text-white/60">Centro Vida Saúde</p>
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={baixarCartao} className="bg-blue-600 hover:bg-blue-700" size="lg">
          <Download className="w-4 h-4 mr-2" />
          Baixar
        </Button>
        <Button 
          onClick={enviarCartaoWhatsapp}
          disabled={enviando}
          className="bg-green-600 hover:bg-green-700" 
          size="lg"
        >
          {enviando ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Enviar WhatsApp
            </>
          )}
        </Button>
      </div>
    </div>
  );
}