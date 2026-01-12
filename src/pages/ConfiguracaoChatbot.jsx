import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { Save, Plus, Trash2, Bot, Zap, Globe, Clock, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ConfiguracaoChatbot() {
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState([]);
  const [configAtual, setConfigAtual] = useState({
    nome: 'Chatbot Principal',
    ativo: true,
    modelo_llm: 'gpt-4o-mini',
    prompt_sistema: '',
    temperatura: 0.7,
    palavras_chave: [],
    campos_personalizados: [],
    webhook_url: '',
    webhook_eventos: [],
    api_integracao: {
      url: '',
      metodo: 'POST',
      headers: {},
      corpo_requisicao: '',
      autenticacao_tipo: 'nenhuma',
      autenticacao_valor: ''
    },
    horario_atendimento: {
      ativo: false,
      mensagem_fora_horario: 'Estamos fora do horário de atendimento. Retornaremos em breve!',
      horarios: []
    },
    limite_mensagens_dia: 50,
    timeout_conversa_minutos: 30
  });

  useEffect(() => {
    carregarConfiguracoes();
  }, []);

  const carregarConfiguracoes = async () => {
    try {
      const data = await base44.entities.ChatbotConfig.list();
      setConfigs(data);
      if (data.length > 0) {
        setConfigAtual(data[0]);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  };

  const salvarConfiguracao = async () => {
    setLoading(true);
    try {
      if (configAtual.id) {
        await base44.entities.ChatbotConfig.update(configAtual.id, configAtual);
        toast({
          title: '✅ Configuração atualizada',
          description: 'As configurações do chatbot foram salvas com sucesso.'
        });
      } else {
        const novaConfig = await base44.entities.ChatbotConfig.create(configAtual);
        setConfigAtual(novaConfig);
        toast({
          title: '✅ Configuração criada',
          description: 'Nova configuração do chatbot criada com sucesso.'
        });
      }
      await carregarConfiguracoes();
    } catch (error) {
      toast({
        title: '❌ Erro ao salvar',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const adicionarPalavraChave = () => {
    setConfigAtual({
      ...configAtual,
      palavras_chave: [
        ...(configAtual.palavras_chave || []),
        { palavra: '', resposta_automatica: '', acoes: [] }
      ]
    });
  };

  const removerPalavraChave = (index) => {
    const novasPalavras = [...configAtual.palavras_chave];
    novasPalavras.splice(index, 1);
    setConfigAtual({ ...configAtual, palavras_chave: novasPalavras });
  };

  const atualizarPalavraChave = (index, campo, valor) => {
    const novasPalavras = [...configAtual.palavras_chave];
    novasPalavras[index] = { ...novasPalavras[index], [campo]: valor };
    setConfigAtual({ ...configAtual, palavras_chave: novasPalavras });
  };

  const adicionarCampoPersonalizado = () => {
    setConfigAtual({
      ...configAtual,
      campos_personalizados: [
        ...(configAtual.campos_personalizados || []),
        { nome: '', tipo: 'texto', obrigatorio: false, opcoes: [] }
      ]
    });
  };

  const removerCampoPersonalizado = (index) => {
    const novosCampos = [...configAtual.campos_personalizados];
    novosCampos.splice(index, 1);
    setConfigAtual({ ...configAtual, campos_personalizados: novosCampos });
  };

  const atualizarCampoPersonalizado = (index, campo, valor) => {
    const novosCampos = [...configAtual.campos_personalizados];
    novosCampos[index] = { ...novosCampos[index], [campo]: valor };
    setConfigAtual({ ...configAtual, campos_personalizados: novosCampos });
  };

  const adicionarHorario = () => {
    const novosHorarios = [...(configAtual.horario_atendimento?.horarios || [])];
    novosHorarios.push({ dia_semana: 1, inicio: '09:00', fim: '18:00' });
    setConfigAtual({
      ...configAtual,
      horario_atendimento: {
        ...configAtual.horario_atendimento,
        horarios: novosHorarios
      }
    });
  };

  const removerHorario = (index) => {
    const novosHorarios = [...configAtual.horario_atendimento.horarios];
    novosHorarios.splice(index, 1);
    setConfigAtual({
      ...configAtual,
      horario_atendimento: {
        ...configAtual.horario_atendimento,
        horarios: novosHorarios
      }
    });
  };

  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="w-8 h-8 text-blue-600" />
            Configuração do Chatbot
          </h1>
          <p className="text-gray-500 mt-1">Configure o comportamento e integrações do seu chatbot</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={configAtual.ativo ? 'default' : 'secondary'}>
            {configAtual.ativo ? '🟢 Ativo' : '🔴 Inativo'}
          </Badge>
          <Button onClick={salvarConfiguracao} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="geral">
            <Settings className="w-4 h-4 mr-2" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="ia">
            <Bot className="w-4 h-4 mr-2" />
            IA & Prompt
          </TabsTrigger>
          <TabsTrigger value="palavras">
            <Zap className="w-4 h-4 mr-2" />
            Palavras-Chave
          </TabsTrigger>
          <TabsTrigger value="integracao">
            <Globe className="w-4 h-4 mr-2" />
            Integrações
          </TabsTrigger>
          <TabsTrigger value="horarios">
            <Clock className="w-4 h-4 mr-2" />
            Horários
          </TabsTrigger>
        </TabsList>

        {/* Tab Geral */}
        <TabsContent value="geral" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>Defina as configurações básicas do chatbot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Configuração</Label>
                  <Input
                    value={configAtual.nome}
                    onChange={(e) => setConfigAtual({ ...configAtual, nome: e.target.value })}
                    placeholder="Ex: Chatbot Agendamentos"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch
                      checked={configAtual.ativo}
                      onCheckedChange={(checked) => setConfigAtual({ ...configAtual, ativo: checked })}
                    />
                    <span>{configAtual.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Limite de Mensagens por Dia</Label>
                  <Input
                    type="number"
                    value={configAtual.limite_mensagens_dia}
                    onChange={(e) => setConfigAtual({ ...configAtual, limite_mensagens_dia: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout da Conversa (minutos)</Label>
                  <Input
                    type="number"
                    value={configAtual.timeout_conversa_minutos}
                    onChange={(e) => setConfigAtual({ ...configAtual, timeout_conversa_minutos: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campos Personalizados</CardTitle>
              <CardDescription>Defina campos customizados para coletar informações específicas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configAtual.campos_personalizados?.map((campo, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="grid grid-cols-3 gap-3 flex-1">
                      <div className="space-y-2">
                        <Label>Nome do Campo</Label>
                        <Input
                          value={campo.nome}
                          onChange={(e) => atualizarCampoPersonalizado(index, 'nome', e.target.value)}
                          placeholder="Ex: Data de Nascimento"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                          value={campo.tipo}
                          onValueChange={(value) => atualizarCampoPersonalizado(index, 'tipo', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="texto">Texto</SelectItem>
                            <SelectItem value="numero">Número</SelectItem>
                            <SelectItem value="data">Data</SelectItem>
                            <SelectItem value="booleano">Sim/Não</SelectItem>
                            <SelectItem value="opcao_multipla">Opção Múltipla</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Obrigatório</Label>
                        <div className="flex items-center h-10">
                          <Switch
                            checked={campo.obrigatorio}
                            onCheckedChange={(checked) => atualizarCampoPersonalizado(index, 'obrigatorio', checked)}
                          />
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removerCampoPersonalizado(index)}
                      className="ml-2"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                  {campo.tipo === 'opcao_multipla' && (
                    <div className="space-y-2">
                      <Label>Opções (separadas por vírgula)</Label>
                      <Input
                        value={campo.opcoes?.join(', ')}
                        onChange={(e) => atualizarCampoPersonalizado(index, 'opcoes', e.target.value.split(',').map(o => o.trim()))}
                        placeholder="Ex: Sim, Não, Talvez"
                      />
                    </div>
                  )}
                </div>
              ))}
              <Button onClick={adicionarCampoPersonalizado} variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Campo
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab IA & Prompt */}
        <TabsContent value="ia" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Modelo de IA</CardTitle>
              <CardDescription>Escolha o modelo de linguagem e ajuste seus parâmetros</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modelo LLM</Label>
                  <Select
                    value={configAtual.modelo_llm}
                    onValueChange={(value) => setConfigAtual({ ...configAtual, modelo_llm: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o (Mais Avançado)</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini (Rápido e Econômico)</SelectItem>
                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                      <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Temperatura ({configAtual.temperatura})</Label>
                  <Input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={configAtual.temperatura}
                    onChange={(e) => setConfigAtual({ ...configAtual, temperatura: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    {configAtual.temperatura < 0.5 && 'Mais preciso e focado'}
                    {configAtual.temperatura >= 0.5 && configAtual.temperatura < 1 && 'Balanceado'}
                    {configAtual.temperatura >= 1 && 'Mais criativo e variado'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prompt do Sistema</CardTitle>
              <CardDescription>Defina o comportamento e personalidade do chatbot</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={configAtual.prompt_sistema}
                onChange={(e) => setConfigAtual({ ...configAtual, prompt_sistema: e.target.value })}
                placeholder="Exemplo:&#10;Você é um assistente virtual do Centro Vida Saúde.&#10;Você é educado, profissional e ajuda pacientes a agendar consultas.&#10;Sempre confirme os dados antes de criar um agendamento.&#10;Se não souber algo, peça ajuda ao time."
                rows={15}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Palavras-Chave */}
        <TabsContent value="palavras" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Palavras-Chave e Respostas Automáticas</CardTitle>
              <CardDescription>Configure respostas automáticas para palavras-chave específicas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configAtual.palavras_chave?.map((palavra, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Palavra-Chave</Label>
                          <Input
                            value={palavra.palavra}
                            onChange={(e) => atualizarPalavraChave(index, 'palavra', e.target.value)}
                            placeholder="Ex: preço, horário, cancelar"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Ações (separadas por vírgula)</Label>
                          <Input
                            value={palavra.acoes?.join(', ')}
                            onChange={(e) => atualizarPalavraChave(index, 'acoes', e.target.value.split(',').map(a => a.trim()))}
                            placeholder="Ex: enviar_email, notificar_equipe"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Resposta Automática</Label>
                        <Textarea
                          value={palavra.resposta_automatica}
                          onChange={(e) => atualizarPalavraChave(index, 'resposta_automatica', e.target.value)}
                          placeholder="Ex: Nossos horários de atendimento são de segunda a sexta, das 8h às 18h."
                          rows={3}
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removerPalavraChave(index)}
                      className="ml-2"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button onClick={adicionarPalavraChave} variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Palavra-Chave
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Integrações */}
        <TabsContent value="integracao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhook</CardTitle>
              <CardDescription>Configure webhooks para receber eventos do chatbot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL do Webhook</Label>
                <Input
                  value={configAtual.webhook_url}
                  onChange={(e) => setConfigAtual({ ...configAtual, webhook_url: e.target.value })}
                  placeholder="https://sua-api.com/webhook"
                />
              </div>
              <div className="space-y-2">
                <Label>Eventos</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['nova_mensagem', 'conversa_iniciada', 'conversa_finalizada', 'agendamento_criado', 'dados_coletados'].map((evento) => (
                    <div key={evento} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={configAtual.webhook_eventos?.includes(evento)}
                        onChange={(e) => {
                          const novosEventos = e.target.checked
                            ? [...(configAtual.webhook_eventos || []), evento]
                            : configAtual.webhook_eventos.filter(ev => ev !== evento);
                          setConfigAtual({ ...configAtual, webhook_eventos: novosEventos });
                        }}
                        className="rounded"
                      />
                      <Label className="font-normal">{evento.replace(/_/g, ' ')}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API HTTP Externa</CardTitle>
              <CardDescription>Configure chamadas HTTP para integração com serviços externos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>URL da API</Label>
                  <Input
                    value={configAtual.api_integracao?.url || ''}
                    onChange={(e) => setConfigAtual({
                      ...configAtual,
                      api_integracao: { ...configAtual.api_integracao, url: e.target.value }
                    })}
                    placeholder="https://api.exemplo.com/endpoint"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Método HTTP</Label>
                  <Select
                    value={configAtual.api_integracao?.metodo || 'POST'}
                    onValueChange={(value) => setConfigAtual({
                      ...configAtual,
                      api_integracao: { ...configAtual.api_integracao, metodo: value }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Autenticação</Label>
                  <Select
                    value={configAtual.api_integracao?.autenticacao_tipo || 'nenhuma'}
                    onValueChange={(value) => setConfigAtual({
                      ...configAtual,
                      api_integracao: { ...configAtual.api_integracao, autenticacao_tipo: value }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Nenhuma</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Token/Chave</Label>
                  <Input
                    type="password"
                    value={configAtual.api_integracao?.autenticacao_valor || ''}
                    onChange={(e) => setConfigAtual({
                      ...configAtual,
                      api_integracao: { ...configAtual.api_integracao, autenticacao_valor: e.target.value }
                    })}
                    placeholder="Seu token de autenticação"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Headers Customizados (JSON)</Label>
                <Textarea
                  value={JSON.stringify(configAtual.api_integracao?.headers || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const headers = JSON.parse(e.target.value);
                      setConfigAtual({
                        ...configAtual,
                        api_integracao: { ...configAtual.api_integracao, headers }
                      });
                    } catch {}
                  }}
                  placeholder='{"Content-Type": "application/json"}'
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Corpo da Requisição (JSON)</Label>
                <Textarea
                  value={configAtual.api_integracao?.corpo_requisicao || ''}
                  onChange={(e) => setConfigAtual({
                    ...configAtual,
                    api_integracao: { ...configAtual.api_integracao, corpo_requisicao: e.target.value }
                  })}
                  placeholder='{"mensagem": "{{mensagem}}", "usuario": "{{usuario}}"}'
                  rows={4}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Use variáveis como: {`{{mensagem}}`}, {`{{usuario}}`}, {`{{telefone}}`}, {`{{timestamp}}`}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Horários */}
        <TabsContent value="horarios" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Horário de Atendimento</CardTitle>
              <CardDescription>Configure os horários em que o chatbot está ativo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={configAtual.horario_atendimento?.ativo}
                  onCheckedChange={(checked) => setConfigAtual({
                    ...configAtual,
                    horario_atendimento: { ...configAtual.horario_atendimento, ativo: checked }
                  })}
                />
                <Label>Ativar controle de horário</Label>
              </div>

              {configAtual.horario_atendimento?.ativo && (
                <>
                  <div className="space-y-2">
                    <Label>Mensagem Fora do Horário</Label>
                    <Textarea
                      value={configAtual.horario_atendimento?.mensagem_fora_horario}
                      onChange={(e) => setConfigAtual({
                        ...configAtual,
                        horario_atendimento: {
                          ...configAtual.horario_atendimento,
                          mensagem_fora_horario: e.target.value
                        }
                      })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Horários de Atendimento</Label>
                    {configAtual.horario_atendimento?.horarios?.map((horario, index) => (
                      <div key={index} className="flex items-center gap-3 border rounded-lg p-3">
                        <Select
                          value={horario.dia_semana?.toString()}
                          onValueChange={(value) => {
                            const novosHorarios = [...configAtual.horario_atendimento.horarios];
                            novosHorarios[index].dia_semana = parseInt(value);
                            setConfigAtual({
                              ...configAtual,
                              horario_atendimento: {
                                ...configAtual.horario_atendimento,
                                horarios: novosHorarios
                              }
                            });
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {diasSemana.map((dia, i) => (
                              <SelectItem key={i} value={i.toString()}>{dia}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="time"
                          value={horario.inicio}
                          onChange={(e) => {
                            const novosHorarios = [...configAtual.horario_atendimento.horarios];
                            novosHorarios[index].inicio = e.target.value;
                            setConfigAtual({
                              ...configAtual,
                              horario_atendimento: {
                                ...configAtual.horario_atendimento,
                                horarios: novosHorarios
                              }
                            });
                          }}
                          className="w-32"
                        />
                        <span>até</span>
                        <Input
                          type="time"
                          value={horario.fim}
                          onChange={(e) => {
                            const novosHorarios = [...configAtual.horario_atendimento.horarios];
                            novosHorarios[index].fim = e.target.value;
                            setConfigAtual({
                              ...configAtual,
                              horario_atendimento: {
                                ...configAtual.horario_atendimento,
                                horarios: novosHorarios
                              }
                            });
                          }}
                          className="w-32"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removerHorario(index)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                    <Button onClick={adicionarHorario} variant="outline" className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Horário
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}