
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { 
  User, 
  Stethoscope, 
  TestTube, 
  Calendar, 
  DollarSign, 
  Save, 
  X, 
  AlertCircle, 
  CheckCircle,
  Edit,
  ChevronsUpDown,
  Trash2
} from "lucide-react";
import { Paciente, Agendamento, OrdemServico } from "@/entities/all";
import { format } from "date-fns";

// Função de proteção que garante que valores sempre sejam seguros
const protegerDados = (valor, tipoEsperado = 'array') => {
  if (tipoEsperado === 'array') {
    return Array.isArray(valor) ? valor : [];
  }
  if (tipoEsperado === 'object') {
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  }
  if (tipoEsperado === 'string') {
    return typeof valor === 'string' ? valor : '';
  }
  if (tipoEsperado === 'number') {
    return typeof valor === 'number' && !isNaN(valor) ? valor : 0;
  }
  return valor;
};

// Função para normalizar strings (remover acentos e converter para minúsculas)
const normalizarString = (str) => {
  return protegerDados(str, 'string')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

// Função para identificar múltiplos exames em uma linha
const identificarExamesMultiplos = (nomeExameSolicitado, examesDisponiveis) => {
  const nomeSeguro = protegerDados(nomeExameSolicitado, 'string');
  const examesSeguro = protegerDados(examesDisponiveis, 'array');
  
  if (!nomeSeguro || examesSeguro.length === 0) {
    return [];
  }
  
  const nomeNormalizado = normalizarString(nomeSeguro);
  if (!nomeNormalizado) return [];
  
  // Separadores comuns que indicam múltiplos exames
  const separadores = [' e ', ' + ', ' mais ', ' with ', ' com '];
  
  let partesExame = [nomeNormalizado];
  
  // Tentar dividir por cada separador
  for (const separador of separadores) {
    if (nomeNormalizado.includes(separador)) {
      partesExame = nomeNormalizado.split(separador).filter(parte => parte.trim());
      break;
    }
  }
  
  const examesEncontrados = [];
  
  // Para cada parte, tentar encontrar correspondência nos exames disponíveis
  partesExame.forEach(parte => {
    const parteLimpa = parte.trim();
    if (!parteLimpa) return;
    
    // Busca exata primeiro
    let exameEncontrado = examesSeguro.find(exame => 
      exame && exame.nome && normalizarString(exame.nome) === parteLimpa
    );
    
    // Se não encontrou, busca por inclusão (contém a palavra)
    if (!exameEncontrado) {
      exameEncontrado = examesSeguro.find(exame => {
        if (!exame || !exame.nome) return false;
        const nomeExameNormalizado = normalizarString(exame.nome);
        return nomeExameNormalizado.includes(parteLimpa) || parteLimpa.includes(nomeExameNormalizado);
      });
    }
    
    if (exameEncontrado && exameEncontrado.id && !examesEncontrados.some(e => e && e.id === exameEncontrado.id)) {
      examesEncontrados.push(exameEncontrado);
    }
  });
  
  return examesEncontrados;
};

export default function RevisorDados({ 
  dados, 
  examesDisponiveis, 
  medicosSistema, 
  onConfirmar, 
  onCancelar 
}) {
  // Proteger todos os dados de entrada
  const dadosSeguro = protegerDados(dados, 'object');
  const examesDisponiveisSeguro = protegerDados(examesDisponiveis, 'array');
  const medicosSeguro = protegerDados(medicosSistema, 'array');

  const [dadosRevisados, setDadosRevisados] = useState({
    paciente: {},
    medico_solicitante: {},
    exames_solicitados: [],
    exames_selecionados: [],
    data_agendamento: format(new Date(), 'yyyy-MM-dd'),
    observacoes: "",
    criar_agendamento: true,
    criar_orcamento: true
  });

  const [valorTotal, setValorTotal] = useState(0);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [popoverExameAberto, setPopoverExameAberto] = useState(false);
  const [buscaExame, setBuscaExame] = useState("");

  useEffect(() => {
    if (dadosSeguro && Object.keys(dadosSeguro).length > 0) {
      let examesMapeados = [];
      const examesSolicitadosSafe = protegerDados(dadosSeguro.exames_solicitados, 'array');

      if (examesSolicitadosSafe.length > 0 && examesDisponiveisSeguro.length > 0) {
        examesSolicitadosSafe.forEach(exameSolicitado => {
          if (exameSolicitado && exameSolicitado.nome) {
            const examesEncontrados = identificarExamesMultiplos(exameSolicitado.nome, examesDisponiveisSeguro);
            protegerDados(examesEncontrados, 'array').forEach(exame => {
              if (exame && exame.id && !examesMapeados.includes(exame.id)) {
                examesMapeados.push(exame.id);
              }
            });
          }
        });
      }

      setDadosRevisados({
        paciente: protegerDados(dadosSeguro.paciente, 'object'),
        medico_solicitante: protegerDados(dadosSeguro.medico_solicitante, 'object'),
        exames_solicitados: examesSolicitadosSafe,
        exames_selecionados: examesMapeados,
        data_agendamento: protegerDados(dadosSeguro.data_solicitacao, 'string') || format(new Date(), 'yyyy-MM-dd'),
        observacoes: protegerDados(dadosSeguro.observacoes_gerais, 'string'),
        criar_agendamento: true,
        criar_orcamento: true,
      });
    }
  }, [dadosSeguro, examesDisponiveisSeguro]);

  useEffect(() => {
    const exames = protegerDados(dadosRevisados.exames_selecionados, 'array');
    
    if (exames.length > 0 && examesDisponiveisSeguro.length > 0) {
      const total = exames.reduce((acc, exameId) => {
        const exame = examesDisponiveisSeguro.find(e => e && e.id === exameId);
        const valor = protegerDados(exame?.valor_particular, 'number');
        return acc + valor;
      }, 0);
      setValorTotal(parseFloat(total.toFixed(2)));
    } else {
      setValorTotal(0);
    }
  }, [dadosRevisados.exames_selecionados, examesDisponiveisSeguro]);

  const handleInputChange = (campo, valor, secao = null) => {
    setDadosRevisados(prev => {
      if (secao) {
        return { 
          ...prev, 
          [secao]: { 
            ...protegerDados(prev[secao], 'object'), 
            [campo]: valor 
          } 
        };
      }
      return { ...prev, [campo]: valor };
    });
  };

  const handleAdicionarExame = (exameId) => {
    if (!exameId) return;
    
    setDadosRevisados(prev => {
      const examesAtuais = protegerDados(prev.exames_selecionados, 'array');
      if (!examesAtuais.includes(exameId)) {
        return { ...prev, exames_selecionados: [...examesAtuais, exameId] };
      }
      return prev;
    });
    
    setPopoverExameAberto(false);
    setBuscaExame("");
  };

  const handleRemoverExame = (exameId) => {
    if (!exameId) return;
    setDadosRevisados(prev => ({
      ...prev,
      exames_selecionados: protegerDados(prev.exames_selecionados, 'array').filter(id => id !== exameId)
    }));
  };

  const handleConfirmar = async () => {
    setProcessando(true);
    setErro("");

    try {
      // Validações antes de prosseguir
      const cpfPaciente = protegerDados(dadosRevisados.paciente, 'object').cpf;
      const nomePaciente = protegerDados(dadosRevisados.paciente, 'object').nome;
      const examesSelecionados = protegerDados(dadosRevisados.exames_selecionados, 'array');

      // Validar dados obrigatórios
      if (!nomePaciente || !nomePaciente.trim()) {
        throw new Error("Nome do paciente é obrigatório.");
      }

      if (!cpfPaciente || !cpfPaciente.trim()) {
        throw new Error("CPF do paciente é obrigatório.");
      }

      if (examesSelecionados.length === 0) {
        throw new Error("Selecione pelo menos um exame para continuar.");
      }

      let pacienteId;
      
      // Buscar paciente existente por CPF
      const pacientesExistentes = await Paciente.filter({ cpf: cpfPaciente }).catch(() => []);
      const pacientesSeguro = protegerDados(pacientesExistentes, 'array');
      
      if (pacientesSeguro.length > 0) {
        pacienteId = pacientesSeguro[0].id;
      } else {
        // Criar novo paciente com dados mínimos obrigatórios
        const dadosPaciente = {
          nome: nomePaciente,
          cpf: cpfPaciente,
          telefone: protegerDados(dadosRevisados.paciente, 'object').telefone || '',
          convenio: protegerDados(dadosRevisados.paciente, 'object').convenio || 'Particular'
        };

        const novoPaciente = await Paciente.create(dadosPaciente);
        pacienteId = novoPaciente.id;
      }

      let agendamentoId = null;

      if ((dadosRevisados.criar_agendamento || dadosRevisados.criar_orcamento) && examesSelecionados.length > 0) {
        const novoAgendamento = await Agendamento.create({
          paciente_id: pacienteId,
          medico_id: null,
          data_agendamento: dadosRevisados.data_agendamento,
          horario: "08:00",
          tipo_servico: "Exame",
          exames_ids: examesSelecionados,
          status: "Agendado",
          valor_total: valorTotal,
          forma_pagamento: "Particular",
          observacoes: `Criado via requisição médica. ${dadosRevisados.observacoes || ""}`
        });
        agendamentoId = novoAgendamento.id;
        window.dispatchEvent(new CustomEvent('agendamentoCriado'));
      }

      if (dadosRevisados.criar_orcamento && pacienteId && agendamentoId) {
        const itensOrcamento = examesSelecionados.map(exameId => {
          const exame = examesDisponiveisSeguro.find(e => e && e.id === exameId);
          const valorExame = protegerDados(exame?.valor_particular, 'number');
          return {
            descricao: `Exame: ${exame?.nome || 'Não encontrado'}`,
            quantidade: 1,
            valor_unitario: valorExame,
            valor_total: valorExame
          };
        });

        await OrdemServico.create({
          agendamento_id: agendamentoId,
          paciente_id: pacienteId,
          medico_id: null,
          data_execucao: dadosRevisados.data_agendamento,
          tipo_servico: "Exame",
          exames_ids: examesSelecionados,
          valor_total: valorTotal,
          desconto: 0,
          valor_final: valorTotal,
          status_pagamento: "Pendente",
          itens: itensOrcamento,
          observacoes: `Orçamento gerado a partir da requisição: ${dadosSeguro?.arquivo_original || "N/A"}`
        });
      }

      if (onConfirmar) {
        onConfirmar(dadosRevisados);
      }
      
    } catch (error) {
      console.error("Erro ao processar dados:", error);
      setErro("Erro: " + (error.message || "Erro desconhecido"));
    } finally {
      setProcessando(false);
    }
  };
  
  // Variáveis seguras para renderização
  const examesSelecionados = protegerDados(dadosRevisados.exames_selecionados, 'array');
  const examesSolicitados = protegerDados(dadosRevisados.exames_solicitados, 'array');

  // Filtrar exames disponíveis para mostrar no popover
  const examesParaAdicionar = examesDisponiveisSeguro.filter(exame => {
    if (!exame || !exame.id || !exame.nome) return false;
    
    // Não mostrar exames já selecionados
    if (examesSelecionados.includes(exame.id)) return false;
    
    // Aplicar filtro de busca se houver
    if (protegerDados(buscaExame, 'string').trim()) {
      const termoBusca = normalizarString(buscaExame);
      const nomeExameNormalizado = normalizarString(exame.nome);
      const codigoExameNormalizado = normalizarString(exame.codigo || "");
      const tipoExameNormalizado = normalizarString(exame.tipo || "");

      return nomeExameNormalizado.includes(termoBusca) ||
             codigoExameNormalizado.includes(termoBusca) ||
             tipoExameNormalizado.includes(termoBusca);
    }
    
    return true;
  });

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit className="w-5 h-5 text-blue-600" />
          Revisar e Confirmar Dados Extraídos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="paciente" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="paciente">Paciente</TabsTrigger>
            <TabsTrigger value="medico">Médico</TabsTrigger>
            <TabsTrigger value="exames">Exames</TabsTrigger>
            <TabsTrigger value="confirmacao">Confirmação</TabsTrigger>
          </TabsList>

          <TabsContent value="paciente" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nome">Nome do Paciente *</Label>
                <Input
                  id="nome"
                  value={protegerDados(dadosRevisados.paciente, 'object').nome || ""}
                  onChange={(e) => handleInputChange("nome", e.target.value, "paciente")}
                  className={!protegerDados(dadosRevisados.paciente, 'object').nome ? "border-red-300" : ""}
                  placeholder="Nome completo do paciente"
                />
                {!protegerDados(dadosRevisados.paciente, 'object').nome && (
                  <p className="text-xs text-red-500 mt-1">Campo obrigatório</p>
                )}
              </div>
              <div>
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  value={protegerDados(dadosRevisados.paciente, 'object').cpf || ""}
                  onChange={(e) => handleInputChange("cpf", e.target.value, "paciente")}
                  className={!protegerDados(dadosRevisados.paciente, 'object').cpf ? "border-red-300" : ""}
                  placeholder="000.000.000-00"
                />
                {!protegerDados(dadosRevisados.paciente, 'object').cpf && (
                  <p className="text-xs text-red-500 mt-1">Campo obrigatório</p>
                )}
              </div>
              <div>
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={protegerDados(dadosRevisados.paciente, 'object').telefone || ""}
                  onChange={(e) => handleInputChange("telefone", e.target.value, "paciente")}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div>
                <Label htmlFor="convenio">Convênio</Label>
                <Select 
                  value={protegerDados(dadosRevisados.paciente, 'object').convenio || "Particular"}
                  onValueChange={(value) => handleInputChange("convenio", value, "paciente")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Particular">Particular</SelectItem>
                    <SelectItem value="Unimed">Unimed</SelectItem>
                    <SelectItem value="Bradesco Saúde">Bradesco Saúde</SelectItem>
                    <SelectItem value="SulAmérica">SulAmérica</SelectItem>
                    <SelectItem value="Amil">Amil</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="medico" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="medico-nome">Nome do Médico Solicitante</Label>
                <Input
                  id="medico-nome"
                  value={protegerDados(dadosRevisados.medico_solicitante, 'object').nome || ""}
                  onChange={(e) => handleInputChange("nome", e.target.value, "medico_solicitante")}
                />
              </div>
              <div>
                <Label htmlFor="crm">CRM</Label>
                <Input
                  id="crm"
                  value={protegerDados(dadosRevisados.medico_solicitante, 'object').crm || ""}
                  onChange={(e) => handleInputChange("crm", e.target.value, "medico_solicitante")}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="exames" className="space-y-4">
            <Alert>
              <TestTube className="h-4 w-4" />
              <AlertDescription>
                A IA identificou os seguintes termos: <strong className="font-semibold">
                  {examesSolicitados.map(e => protegerDados(e, 'object')?.nome || 'Item inválido').join(', ') || 'Nenhum'}
                </strong>.
                <br />
                Confira, remova ou adicione exames na lista abaixo.
              </AlertDescription>
            </Alert>
            
            <div className="pt-2">
              <h4 className="font-medium mb-3">Exames Selecionados para Agendamento ({examesSelecionados.length})</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {examesSelecionados.length > 0 ? (
                  examesSelecionados.map(exameId => {
                    const exame = examesDisponiveisSeguro.find(e => e && e.id === exameId);
                    if (!exame) return null;
                    return (
                      <div key={exame.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                        <div>
                          <p className="font-medium">{exame.nome}</p>
                          <p className="text-sm text-gray-600">
                            {exame.tipo && <span className="bg-gray-100 px-2 py-1 rounded text-xs mr-2">{exame.tipo}</span>}
                            R$ {protegerDados(exame.valor_particular, 'number').toFixed(2)}
                          </p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRemoverExame(exame.id)} 
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                    <TestTube className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Nenhum exame selecionado.</p>
                    <p className="text-xs text-gray-400 mt-1">Adicione exames para continuar.</p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <Popover open={popoverExameAberto} onOpenChange={setPopoverExameAberto}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start text-left"
                    >
                      <span className="flex items-center gap-2">
                        <TestTube className="w-4 h-4" />
                        Adicionar outro exame...
                      </span>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-auto" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Buscar exame por nome, código ou tipo..."
                        value={buscaExame}
                        onValueChange={setBuscaExame}
                      />
                      <CommandList>
                        <CommandEmpty>Nenhum exame encontrado.</CommandEmpty>
                        <CommandGroup className="max-h-60 overflow-y-auto">
                          {examesParaAdicionar.map(exame => (
                            <CommandItem
                              key={exame.id}
                              value={`${exame.nome} ${exame.codigo || ''} ${exame.tipo || ''}`}
                              onSelect={() => handleAdicionarExame(exame.id)}
                              className="cursor-pointer"
                            >
                              <div className="flex flex-col w-full">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{exame.nome}</span>
                                  <span className="text-sm text-gray-500">
                                    R$ {protegerDados(exame.valor_particular, 'number').toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex gap-2 mt-1">
                                  {exame.tipo && (
                                    <Badge variant="secondary" className="text-xs">
                                      {exame.tipo}
                                    </Badge>
                                  )}
                                  {exame.codigo && (
                                    <span className="text-xs text-gray-400">
                                      Cód: {exame.codigo}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">Valor Total dos Exames Selecionados:</span>
                <span className="text-xl font-bold text-blue-600">R$ {valorTotal.toFixed(2)}</span>
              </div>
              {examesSelecionados.length > 0 && (
                <p className="text-sm text-blue-600 mt-1">
                  {examesSelecionados.length} exame{examesSelecionados.length !== 1 ? 's' : ''} selecionado{examesSelecionados.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="confirmacao" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="data-agendamento">Data do Agendamento</Label>
                <Input
                  id="data-agendamento"
                  type="date"
                  value={dadosRevisados.data_agendamento}
                  onChange={(e) => handleInputChange("data_agendamento", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={dadosRevisados.observacoes}
                  onChange={(e) => handleInputChange("observacoes", e.target.value)}
                  placeholder="Observações adicionais..."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="criar-agendamento"
                    checked={dadosRevisados.criar_agendamento}
                    onCheckedChange={(checked) => handleInputChange("criar_agendamento", !!checked)}
                  />
                  <Label htmlFor="criar-agendamento">Criar Agendamento</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="criar-orcamento"
                    checked={dadosRevisados.criar_orcamento}
                    onCheckedChange={(checked) => handleInputChange("criar_orcamento", !!checked)}
                  />
                  <Label htmlFor="criar-orcamento">Gerar Orçamento</Label>
                </div>
              </div>

              {erro && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">
                    {erro}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={onCancelar}>
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirmar}
            disabled={
              processando || 
              examesSelecionados.length === 0 ||
              !protegerDados(dadosRevisados.paciente, 'object').nome ||
              !protegerDados(dadosRevisados.paciente, 'object').cpf
            }
            className="bg-blue-600 hover:bg-blue-700"
          >
            {processando ? (
              <>
                <TestTube className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Confirmar e Criar
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
