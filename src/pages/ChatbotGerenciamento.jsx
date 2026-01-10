import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Settings, Copy, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ChatbotGerenciamento() {
  const { toast } = useToast();
  const [webhookURL, setWebhookURL] = useState('');
  const [copiado, setCopiado] = useState(false);

  // Construir URL do webhook
  useEffect(() => {
    const currentURL = window.location.origin;
    const url = `${currentURL}/api/apps/webhook/whatsappChatbot`;
    setWebhookURL(url);
  }, []);

  const copiarWebhook = () => {
    navigator.clipboard.writeText(webhookURL);
    setCopiado(true);
    toast({
      title: 'Copiado!',
      description: 'URL do webhook copiada para a área de transferência'
    });
    setTimeout(() => setCopiado(false), 2000);
  };

  const instrucoesConfiguracaoZ = `
1. Acesse https://z-api.io
2. Faça login ou crie uma conta
3. Crie uma nova instância de WhatsApp
4. Configure o webhook:
   - URL: ${webhookURL}
   - Evento: Mensagens recebidas (message.received)
5. Teste o webhook
6. Copie sua Instance ID e API Key
7. Adicione em Dashboard > Configurações > Variáveis de Ambiente:
   - WHATSAPP_INSTANCE_ID = (seu instance ID)
   - WHATSAPP_API_KEY = (sua API key)
`;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-8 h-8 text-green-600" />
            Chatbot de Agendamentos
          </h1>
          <p className="text-gray-600 mt-2">Configure e gerencie o chatbot inteligente conectado ao WhatsApp</p>
        </div>

        {/* Status */}
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Status do Chatbot</span>
              <Badge className="bg-green-600">Ativo</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Status da IA</p>
                <p className="font-bold text-green-700">✅ Agente Criado</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Webhook</p>
                <p className="font-bold text-blue-700">⚙️ Configurável</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Z-API</p>
                <p className="font-bold text-amber-700">⏳ Aguardando config</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuração do Webhook
            </CardTitle>
            <CardDescription>
              Use esta URL para configurar o webhook na Z-API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">URL do Webhook:</p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={webhookURL}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-lg bg-white text-sm font-mono"
                />
                <Button 
                  onClick={copiarWebhook}
                  variant="outline"
                  size="sm"
                >
                  {copiado ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                O webhook recebe todas as mensagens do WhatsApp e as processa com a IA para responder automaticamente.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Z-API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5" />
              Configurar Z-API
            </CardTitle>
            <CardDescription>
              Siga os passos para conectar o WhatsApp da sua clínica
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <pre className="text-xs font-mono text-gray-800 overflow-auto">
                {instrucoesConfiguracaoZ}
              </pre>
            </div>

            <a 
              href="https://z-api.io" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block"
            >
              <Button className="bg-blue-600 hover:bg-blue-700 gap-2">
                <ExternalLink className="w-4 h-4" />
                Ir para Z-API
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* Funcionalidades */}
        <Card>
          <CardHeader>
            <CardTitle>Funcionalidades do Chatbot</CardTitle>
            <CardDescription>O que o assistente de IA pode fazer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: '📅', title: 'Consultar Horários', desc: 'Verifica disponibilidade de médicos' },
                { icon: '🔖', title: 'Agendar Consultas', desc: 'Agenda automático de consultas e retornos' },
                { icon: '💊', title: 'Informar Preços', desc: 'Consulta valores de procedimentos e exames' },
                { icon: '📊', title: 'Gerar Orçamentos', desc: 'Cria orçamentos de exames personalizados' },
                { icon: '👥', title: 'Cadastro de Pacientes', desc: 'Cria pacientes rapidamente via chat' },
                { icon: '🔍', title: 'Buscar Resultados', desc: 'Acessa orçamentos e resultados de exames' }
              ].map((item, i) => (
                <div key={i} className="p-3 border rounded-lg hover:bg-gray-50 transition">
                  <p className="text-2xl mb-1">{item.icon}</p>
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Conexões */}
        <Card>
          <CardHeader>
            <CardTitle>Dados Conectados</CardTitle>
            <CardDescription>O chatbot tem acesso aos seguintes dados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                '✅ Médicos (horários, especialidades, disponibilidade)',
                '✅ Procedimentos (nomes, valores, especialidades)',
                '✅ Exames (nomes, preços, descrições)',
                '✅ Agendamentos (criar consultas automaticamente)',
                '✅ Pacientes (criar e consultar dados)',
                '✅ Tabela de Preços (valores por categoria e tipo)',
                '✅ Categorias de Preço (Particular, Convênios, etc)',
              ].map((item, i) => (
                <p key={i} className="text-gray-700 flex items-center gap-2">
                  {item}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Aviso */}
        <Alert>
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Importante:</strong> Configure as variáveis de ambiente WHATSAPP_INSTANCE_ID e WHATSAPP_API_KEY para que o chatbot funcione corretamente. Sem isso, o sistema receberá mensagens mas não conseguirá responder.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}