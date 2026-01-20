import React, { useState, useEffect, useCallback } from "react";
import { ApiKey } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import ProtectedRoute from "../components/auth/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, KeyRound, Copy, Check, Trash2, Power, PowerOff, Calendar, Loader2, Bell, BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPageUrl } from "@/utils";
import { Label } from "@/components/ui/label";

const WIDGET_KEY_NAME = "Widget de Agendamento Online (Padrão)";

const generateApiKeyString = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let apiKey = 'sk_';
  for (let i = 0; i < 48; i++) {
    apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return apiKey;
};

export default function ApiIntegracoes() {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingWidget, setLoadingWidget] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState(null);

  // Simplificação dos estados para o widget
  const [embedCode, setEmbedCode] = useState('');
  const [widgetUrl, setWidgetUrl] = useState('');
  const [copiedEmbedCode, setCopiedEmbedCode] = useState(false);

  // Estado para automação de lembretes
  const [lembreteAtivo, setLembreteAtivo] = useState(false);
  const [lembreteLoading, setLembreteLoading] = useState(true);
  const [lembreteAutomationId, setLembreteAutomationId] = useState(null);

  const setupPage = useCallback(async () => {
    setLoading(true);
    setLoadingWidget(true);
    try {
      const keys = await ApiKey.list("-created_date");
      setApiKeys(keys);

      let widgetKey = keys.find(k => k.name === WIDGET_KEY_NAME);

      if (!widgetKey) {
        // Se a chave do widget não existir, cria automaticamente
        const newKeyString = generateApiKeyString();
        const newKeyData = { name: WIDGET_KEY_NAME, key: newKeyString, status: "Ativo" };
        widgetKey = await ApiKey.create(newKeyData);
        // Recarrega a lista para incluir a nova chave
        const updatedKeys = await ApiKey.list("-created_date");
        setApiKeys(updatedKeys);
      }

      // Gera o código de incorporação com a chave encontrada ou criada
      const url = `${window.location.origin}${createPageUrl('AgendamentoOnline')}?apiKey=${widgetKey.key}`;
      setWidgetUrl(url);

      const code = `<iframe
  src="${url}"
  width="100%"
  height="700"
  style="border:none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
  title="Agendamento Online"
></iframe>`;
      setEmbedCode(code);

    } catch (error) {
      console.error("Erro ao configurar a página de integrações:", error);
    } finally {
      setLoading(false);
      setLoadingWidget(false);
    }
  }, [setApiKeys, setEmbedCode, setWidgetUrl, setLoading, setLoadingWidget]);


  useEffect(() => {
    setupPage();
    carregarStatusLembrete();
  }, [setupPage]);

  const carregarStatusLembrete = async () => {
    setLembreteLoading(true);
    try {
      const response = await base44.functions.invoke('getAutomationStatus', { name: 'Lembrete de Consultas 24h' });
      if (response.data?.automation) {
        setLembreteAtivo(response.data.automation.is_active);
        setLembreteAutomationId(response.data.automation.id);
      }
    } catch (error) {
      console.error('Erro ao carregar status do lembrete:', error);
    } finally {
      setLembreteLoading(false);
    }
  };

  const toggleLembrete = async () => {
    if (!lembreteAutomationId) return;
    setLembreteLoading(true);
    try {
      await base44.functions.invoke('toggleAutomation', { 
        automationId: lembreteAutomationId,
        action: lembreteAtivo ? 'disable' : 'enable'
      });
      setLembreteAtivo(!lembreteAtivo);
    } catch (error) {
      console.error('Erro ao alterar status do lembrete:', error);
      alert('Erro ao alterar status do lembrete automático');
    } finally {
      setLembreteLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const newKey = {
        name: newKeyName,
        key: generateApiKeyString(),
        status: "Ativo",
      };
      await ApiKey.create(newKey);
      setNewKeyName("");
      // Apenas recarrega a lista de chaves, sem afetar o widget
      const keys = await ApiKey.list("-created_date");
      setApiKeys(keys);
    } catch (error) {
      console.error("Erro ao criar chave de API:", error);
    }
  };

  const handleToggleStatus = async (key) => {
    try {
      const newStatus = key.status === "Ativo" ? "Inativo" : "Ativo";
      await ApiKey.update(key.id, { status: newStatus });
      const keys = await ApiKey.list("-created_date");
      setApiKeys(keys);
    } catch (error) {
      console.error("Erro ao alterar status da chave:", error);
    }
  };

  const copyToClipboard = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopiedEmbedCode(true);
    setTimeout(() => setCopiedEmbedCode(false), 2000);
  };

  return (
    <ProtectedRoute
      requiredRole="admin"
      fallbackMessage="Apenas administradores podem gerenciar chaves de API."
    >
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <KeyRound className="w-8 h-8 text-indigo-600" />
              API e Integrações
            </h1>
            <p className="text-gray-600 mt-1">
              Incorpore o agendamento em seu site e gerencie chaves de API para outras integrações.
            </p>
          </div>
          
          {/* Card para Agendamento Online simplificado */}
          {/* Card para Lembrete Automático */}
          <Card className="mb-8 border-2 border-green-200 bg-green-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {lembreteAtivo ? <Bell className="w-6 h-6 text-green-600" /> : <BellOff className="w-6 h-6 text-gray-400" />}
                Lembrete Automático de Consultas (WhatsApp)
              </CardTitle>
              <p className="text-gray-600">
                Envia automaticamente lembretes via WhatsApp para pacientes com consultas agendadas para o dia seguinte.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
                <div>
                  <p className="font-medium">Envio diário às 15:00</p>
                  <p className="text-sm text-gray-500">Lembra pacientes das consultas do dia seguinte</p>
                </div>
                <div className="flex items-center gap-3">
                  {lembreteLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  ) : (
                    <>
                      <span className={`text-sm font-medium ${lembreteAtivo ? 'text-green-600' : 'text-gray-500'}`}>
                        {lembreteAtivo ? 'Ativo' : 'Desativado'}
                      </span>
                      <Switch 
                        checked={lembreteAtivo} 
                        onCheckedChange={toggleLembrete}
                        disabled={lembreteLoading || !lembreteAutomationId}
                      />
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8 border-2 border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                Agendamento Online no seu Site
              </CardTitle>
              <p className="text-gray-600">
                Basta copiar o código abaixo e colar no seu site para começar a receber agendamentos.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingWidget ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in">
                  <div>
                    <Label className="font-semibold">1. Copie e cole este código no seu site</Label>
                    <p className="text-sm text-gray-500 mb-2">Insira este bloco de código no local da página onde o agendamento deve aparecer.</p>
                    <div className="relative">
                      <Textarea
                        readOnly
                        value={embedCode}
                        className="bg-gray-900 text-green-400 font-mono text-xs h-40 resize-none"
                      />
                      <Button onClick={copyEmbedCode} size="sm" className="absolute top-2 right-2">
                        {copiedEmbedCode ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        {copiedEmbedCode ? 'Copiado!' : 'Copiar'}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="font-semibold">2. Pré-visualização do Widget</Label>
                     <div className="mt-2 border rounded-lg p-4 bg-white">
                       <iframe
                         src={widgetUrl}
                         width="100%"
                         height="500"
                         className="border rounded-md"
                         title="Preview do Agendamento Online"
                       ></iframe>
                     </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Criar Nova Chave de API (para outras integrações)</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Input
                placeholder="Nome da chave (ex: Chatbot)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="max-w-xs"
              />
              <Button onClick={handleCreateKey} disabled={!newKeyName.trim()} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-2" />
                Gerar Chave
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chaves de API Existentes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Chave</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array(2).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    apiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-2">
                            <span>{`${key.key.substring(0, 12)}...`}</span>
                            <Button variant="ghost" size="icon" onClick={() => copyToClipboard(key.key)}>
                              {copiedKey === key.key ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={key.status === "Ativo" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                            {key.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleToggleStatus(key)}>
                            {key.status === 'Ativo' ? 
                              <><PowerOff className="w-4 h-4 mr-2" />Desativar</> : 
                              <><Power className="w-4 h-4 mr-2" />Ativar</>
                            }
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}