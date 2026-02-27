import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Save } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { OrdemServico } from "@/entities/all";
import { format } from 'date-fns';
import { useToast } from "@/components/ui/use-toast"; // Import useToast
import { base44 } from "@/api/base44Client";
import { User } from "@/entities/all";

const formasPagamento = ["Dinheiro", "Cartão Débito", "Cartão Crédito", "PIX", "Transferência", "Convênio", "Múltiplas Formas"];

// Taxas padronizadas (Grupo 1 e Grupo 2)
const taxasGrupo1 = { 1: 3.64, 2: 4.62, 3: 5.54, 4: 6.19, 5: 7.04, 6: 7.89, 7: 8.94, 8: 9.89, 9: 10.84, 10: 11.49, 11: 12.19, 12: 12.89 };
const taxasGrupo2 = { 1: 4.64, 2: 5.62, 3: 6.54, 4: 7.19, 5: 8.04, 6: 8.89, 7: 9.94, 8: 10.89, 9: 11.84, 10: 12.49, 11: 13.19, 12: 13.89 };

const taxasCartao = {
  credito: {
    'VISA_CREDITO': { label: 'Visa Crédito', taxas: taxasGrupo1 },
    'MASTERCARD_CREDITO': { label: 'Mastercard Crédito', taxas: taxasGrupo1 },
    'HIPERCARD_CREDITO': { label: 'Hipercard Crédito', taxas: taxasGrupo1 },
    'ELO_CREDITO': { label: 'Elo Crédito', taxas: taxasGrupo2 },
    'AMEX_CREDITO': { label: 'Amex Crédito', taxas: taxasGrupo2 },
    'DINERS_CREDITO': { label: 'Diners Crédito', taxas: taxasGrupo1 },
    'CABAL_CREDITO': { label: 'Cabal Crédito', taxas: taxasGrupo1 }
  },
  debito: {
    'VISA_ELECTRON': { label: 'Visa Débito', taxa: 1.10 },
    'MAESTRO': { label: 'Mastercard Débito / Maestro', taxa: 1.10 },
    'ELO_DEBITO': { label: 'Elo Débito', taxa: 1.98 },
    'BANESCARD_DEBITO': { label: 'Banescard Débito', taxa: 1.10 }
  }
};

const bandeirasCredito = Object.keys(taxasCartao.credito);
const bandeirasDebito = Object.keys(taxasCartao.debito);

const normalizeString = (str) => {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
};

export default function FormularioOS({
  agendamento,
  medico,
  paciente,
  procedimento,
  exames,
  categorias,
  medicos = [],
  procedimentos = [],
  onSalvar,
  onCancelar
}) {
  // CORREÇÃO: Priorizar SEMPRE o medico_id do agendamento
  const [medicoSelecionadoId, setMedicoSelecionadoId] = useState(() => {
    // Na inicialização, priorizar o médico do agendamento
    // Verifica primeiro o medico_id principal
    if (agendamento?.medico_id) return agendamento.medico_id;
    // Se for procedimento/exame e tiver itens de serviço com médico
    if (agendamento?.itens_servico?.length > 0 && agendamento.itens_servico[0].medico_id) {
      return agendamento.itens_servico[0].medico_id;
    }
    return medico?.id || null;
  });

  // Se agendamento mudar, atualizar o medico selecionado
  useEffect(() => {
    // SEMPRE usar o médico do agendamento se existir
    if (agendamento?.medico_id) {
      setMedicoSelecionadoId(agendamento.medico_id);
    } else if (agendamento?.itens_servico && agendamento.itens_servico.length > 0 && agendamento.itens_servico[0].medico_id) {
      setMedicoSelecionadoId(agendamento.itens_servico[0].medico_id);
    } else if (medico?.id) {
      setMedicoSelecionadoId(medico.id);
    }
  }, [agendamento, medico]);

  const [dados, setDados] = useState({
    valor_total: 0,
    desconto: 0,
    juros: 0,
    valor_final: 0,
    forma_pagamento: "Dinheiro",
    parcelas: 1,
    bandeira_cartao: null,
    status_pagamento: "Pendente",
    observacoes: "",
    itens: [],
    valor_repasse_medico: 0,
    valor_repasse_laboratorio: 0,
    valor_clinica: 0,
    cobrar_taxa: false,
    pagamentos_detalhados: []
  });
  
  // Estados para múltiplas formas de pagamento
  const [pagamento1, setPagamento1] = useState({ forma: '', valor: '' });
  const [pagamento2, setPagamento2] = useState({ forma: '', valor: '' });
  const [salvando, setSalvando] = useState(false);
  const [avisoCategoria, setAvisoCategoria] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const { toast } = useToast(); // Initialize useToast

  // Buscar usuário atual para salvar quem gerou a OS
  useEffect(() => {
    // Delay pequeno para evitar chamadas simultâneas com outros componentes
    const timer = setTimeout(() => {
      User.me().then(user => setCurrentUser(user)).catch(() => {});
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // DEBUG: Log inicial
  useEffect(() => {
    console.log('═══════════════════════════════════════');
    console.log('🔍 DEBUG FormularioOS - DADOS RECEBIDOS');
    console.log('═══════════════════════════════════════');
    console.log('Agendamento completo:', agendamento);
    console.log('categoria_preco_id do agendamento:', agendamento?.categoria_preco_id);
    console.log('Categorias disponíveis:', categorias);
    console.log('═══════════════════════════════════════\n');

    if (!agendamento?.categoria_preco_id) {
      console.error('❌ CRÍTICO: Agendamento SEM categoria_preco_id!');
      setAvisoCategoria(true);
    } else {
      const categoria = categorias?.find(c => c.id === agendamento.categoria_preco_id);
      console.log('✅ Categoria encontrada:', categoria?.nome);
      setAvisoCategoria(false);
    }
  }, [agendamento, categorias]);

  // Calcular valores iniciais
  useEffect(() => {
    if (!agendamento) return;

    const medicoAtual = medicos.find(m => m.id === medicoSelecionadoId) || medico;

    let valorTotal = 0;
    let itensOS = [];
    
    // Capturar desconto e acréscimo do agendamento (se existirem)
    const descontoAgendamento = parseFloat(agendamento.desconto_manual) || 0;
    const acrescimoAgendamento = parseFloat(agendamento.acrescimo_manual) || 0;

    // Verificar se há itens_servico (Múltiplos Serviços ou agendamentos com detalhamento)
    if (agendamento.itens_servico && agendamento.itens_servico.length > 0) {
      console.log('📦 Processando itens_servico:', agendamento.itens_servico);
      
      agendamento.itens_servico.forEach((item, index) => {
        const valorItem = parseFloat(item.valor) || 0;
        valorTotal += valorItem;
        
        let descricaoItem = item.descricao || '';
        
        // Buscar nome do médico vinculado ao item (se houver)
        let medicoNome = '';
        if (item.medico_id) {
          const medicoItem = medicos.find(m => m.id === item.medico_id);
          medicoNome = medicoItem ? medicoItem.nome : '';
        }
        
        // Buscar nome do procedimento vinculado ao item (se houver)
        let procedimentoNome = '';
        if (item.procedimento_id) {
          const procItem = procedimentos.find(p => p.id === item.procedimento_id);
          procedimentoNome = procItem ? procItem.nome : '';
        }
        
        // Se não tem descrição, montar baseado no tipo
        if (!descricaoItem) {
          if (item.tipo === 'Consulta') {
            descricaoItem = medicoNome ? `Consulta - Dr(a). ${medicoNome}` : `Consulta`;
          } else if (item.tipo === 'Procedimento') {
            if (procedimentoNome && medicoNome) {
              descricaoItem = `Procedimento: ${procedimentoNome} - Dr(a). ${medicoNome}`;
            } else if (procedimentoNome) {
              descricaoItem = `Procedimento: ${procedimentoNome}`;
            } else if (procedimento) {
              descricaoItem = `Procedimento: ${procedimento.nome}`;
            } else {
              descricaoItem = `Procedimento`;
            }
          } else if (item.tipo === 'Exame' && item.exame_id && exames) {
            const exame = exames.find(e => e.id === item.exame_id);
            descricaoItem = exame ? `Exame: ${exame.nome}` : `Exame`;
          } else if (item.tipo === 'Retorno') {
            descricaoItem = medicoNome ? `Retorno - Dr(a). ${medicoNome}` : `Retorno`;
          } else {
            descricaoItem = item.tipo || `Item ${index + 1}`;
          }
        } else {
          // Se já tem descrição mas tem médico vinculado, adicionar o nome do médico
          if (medicoNome && !descricaoItem.includes(medicoNome)) {
            descricaoItem = `${descricaoItem} - Dr(a). ${medicoNome}`;
          }
        }
        
        itensOS.push({
          descricao: descricaoItem,
          tipo: item.tipo,
          valor_unitario: valorItem,
          quantidade: 1,
          valor_total: valorItem
        });
      });
    } else if (agendamento.tipo_servico === "Consulta" || agendamento.tipo_servico === "Retorno") {
      if (agendamento.valor_total > 0) {
        valorTotal = parseFloat(agendamento.valor_total);
      }

      if (medicoAtual) {
        const tipoServico = agendamento.tipo_servico === "Retorno" ? "Retorno" : "Consulta";
        itensOS.push({
          descricao: `${tipoServico} ${medicoAtual.especialidade || ''} - Dr(a). ${medicoAtual.nome}`,
          tipo: agendamento.tipo_servico,
          valor_unitario: valorTotal,
          quantidade: 1,
          valor_total: valorTotal
        });
      } else {
        itensOS.push({
          descricao: `${agendamento.tipo_servico}`,
          tipo: agendamento.tipo_servico,
          valor_unitario: valorTotal,
          quantidade: 1,
          valor_total: valorTotal
        });
      }
    } else if (agendamento.tipo_servico === "Procedimento") {
      if (agendamento.valor_total > 0) {
        valorTotal = parseFloat(agendamento.valor_total);
      } else if (procedimento && procedimento.valor_particular) {
        valorTotal = parseFloat(procedimento.valor_particular);
      }

      // Buscar nome do médico vinculado ao agendamento
      let medicoNomeProcedimento = '';
      if (medicoSelecionadoId) {
        const medicoProc = medicos.find(m => m.id === medicoSelecionadoId);
        medicoNomeProcedimento = medicoProc ? medicoProc.nome : '';
      }

      if (procedimento) {
        const descricaoProc = medicoNomeProcedimento 
          ? `Procedimento: ${procedimento.nome} - Dr(a). ${medicoNomeProcedimento}`
          : `Procedimento: ${procedimento.nome}`;
        itensOS.push({
          descricao: descricaoProc,
          tipo: 'Procedimento',
          valor_unitario: valorTotal,
          quantidade: 1,
          valor_total: valorTotal
        });
      } else {
        const descricaoProc = medicoNomeProcedimento 
          ? `Procedimento - Dr(a). ${medicoNomeProcedimento}`
          : `Procedimento`;
        itensOS.push({
          descricao: descricaoProc,
          tipo: 'Procedimento',
          valor_unitario: valorTotal,
          quantidade: 1,
          valor_total: valorTotal
        });
      }
    } else if (agendamento.tipo_servico === "Exame") {
      // REGRA: Sempre usar o valor_total do agendamento como fonte da verdade.
      // O agendamento já foi calculado com a tabela de preços correta.
      valorTotal = parseFloat(agendamento.valor_total) || 0;
      
      if (agendamento.exames_ids && exames) {
        const numExames = agendamento.exames_ids.length;
        let somaItens = 0;
        
        agendamento.exames_ids.forEach((exameId, idx) => {
          const exame = exames.find(e => e.id === exameId);
          const nomeExame = exame ? exame.nome : `Exame ${idx + 1}`;
          
          // Distribuir o valor total proporcionalmente entre os exames
          let valorItem;
          if (idx < numExames - 1) {
            valorItem = parseFloat((valorTotal / numExames).toFixed(2));
          } else {
            // Último item recebe o restante para evitar erro de centavos
            valorItem = parseFloat((valorTotal - somaItens).toFixed(2));
          }
          somaItens += valorItem;
          
          itensOS.push({
            descricao: `Exame: ${nomeExame}`,
            tipo: 'Exame',
            valor_unitario: valorItem,
            quantidade: 1,
            valor_total: valorItem
          });
        });
      } else {
        // Sem detalhamento de exames, item único
        itensOS.push({
          descricao: 'Exames',
          tipo: 'Exame',
          valor_unitario: valorTotal,
          quantidade: 1,
          valor_total: valorTotal
        });
      }
    } else if (agendamento.tipo_servico === "Múltiplos Serviços") {
      // Fallback se não tem itens_servico mas é múltiplos serviços
      valorTotal = parseFloat(agendamento.valor_total) || 0;
      itensOS.push({
        descricao: `Múltiplos Serviços`,
        tipo: 'Múltiplos Serviços',
        valor_unitario: valorTotal,
        quantidade: 1,
        valor_total: valorTotal
      });
    }

    let repasseMedico = 0;
    let repasseLab = 0;

    if (medicoAtual && valorTotal > 0) {
      const categoriaNome = categorias?.find(c => c.id === agendamento.categoria_preco_id)?.nome || '';
      const categoriaNormalizada = normalizeString(categoriaNome);

      const isParticular = categoriaNormalizada === 'PARTICULAR';
      const isCartaoMaisVida = categoriaNormalizada.includes('CARTAO') && categoriaNormalizada.includes('MAIS') && categoriaNormalizada.includes('VIDA');

      // Categorias isentas de imposto: Particular e Cartão Mais Vida
      const isentoImposto = isParticular || isCartaoMaisVida;

      let percentual = 0;
      let repasseFixo = 0;
      
      // Verificar tipo de repasse do médico (valor_fixo ou percentual)
      const tipoRepasse = medicoAtual.tipo_repasse || 'percentual';

      // Lógica diferenciada para Procedimentos vs Consultas
      if (agendamento.tipo_servico === 'Procedimento' && procedimento) {
        // 1. Prioridade: Definição no próprio Procedimento (Valor Fixo)
        if (procedimento.valor_repasse_medico > 0) {
          repasseFixo = procedimento.valor_repasse_medico;
        } 
        // 2. Fallback: Configuração do Médico para Procedimentos
        else if (tipoRepasse === 'valor_fixo') {
          repasseFixo = isParticular
            ? (medicoAtual.valor_repasse_fixo_procedimento || medicoAtual.valor_repasse_fixo || 0)
            : (medicoAtual.valor_repasse_fixo_procedimento_convenio || medicoAtual.valor_repasse_fixo_convenio || 0);
        } else {
          percentual = isParticular
            ? (medicoAtual.percentual_repasse_procedimento || medicoAtual.percentual_repasse || 0)
            : (medicoAtual.percentual_repasse_procedimento_convenio || medicoAtual.percentual_repasse_convenio || 0);
        }
      } else {
        // Lógica para Consultas
        if (tipoRepasse === 'valor_fixo') {
          // Médico configurado com valor fixo
          repasseFixo = isParticular
            ? (medicoAtual.valor_repasse_fixo || 0)
            : (medicoAtual.valor_repasse_fixo_convenio || 0);
        } else {
          // Médico configurado com percentual
          percentual = isParticular
            ? (medicoAtual.percentual_repasse || 0)
            : (medicoAtual.percentual_repasse_convenio || medicoAtual.percentual_repasse || 0);
        }
      }

      if (repasseFixo > 0) {
        // Se for valor fixo, usar diretamente
        repasseMedico = repasseFixo;
      } else if (percentual > 0) {
        // Calcular repasse sobre o valor final da venda (com desconto/acréscimo)
        const valorFinalVenda = valorTotal - descontoAgendamento + acrescimoAgendamento;
        const bruto = valorFinalVenda * (percentual / 100);
        // NÃO aplicar imposto de 10% para Particular e Cartão Mais Vida
        repasseMedico = isentoImposto ? bruto : bruto * 0.90;
      }
      }

      if (agendamento.tipo_servico === 'Exame' && agendamento.exames_ids && exames) {
      agendamento.exames_ids.forEach(exameId => {
        const exame = exames.find(e => e.id === exameId);
        if (exame && exame.percentual_repasse_laboratorio) {
          const valor = agendamento.convenio === 'Particular' 
            ? (exame.valor_particular || 0)
            : (exame.valor_convenio || exame.valor_particular || 0);
          
          const repasse = valor * (exame.percentual_repasse_laboratorio / 100);
          repasseLab += repasse;
        }
      });
    }

    const valorClinica = valorTotal - repasseMedico - repasseLab;

    // Calcular valor final considerando desconto/acréscimo do agendamento
    const valorFinalCalculado = valorTotal - descontoAgendamento + acrescimoAgendamento;
    const valorClinicaAjustado = valorFinalCalculado - repasseMedico - repasseLab;

    setDados(prev => ({
      ...prev,
      valor_total: valorTotal,
      desconto: descontoAgendamento,
      valor_final: valorFinalCalculado,
      itens: itensOS,
      valor_repasse_medico: repasseMedico,
      valor_repasse_laboratorio: repasseLab,
      valor_clinica: valorClinicaAjustado > 0 ? valorClinicaAjustado : valorFinalCalculado - repasseMedico - repasseLab
    }));
  }, [agendamento, medico, procedimento, exames, categorias, medicoSelecionadoId, medicos]);

  useEffect(() => {
    let valorComDesconto = dados.valor_total - dados.desconto;
    let novoJuros = 0;

    if (dados.cobrar_taxa && ['Cartão Crédito', 'Cartão Débito'].includes(dados.forma_pagamento) && dados.bandeira_cartao) {
      let taxaPercentual = 0;

      if (dados.forma_pagamento === 'Cartão Crédito') {
        // Acessar .taxas pois agora o objeto tem label e taxas
        taxaPercentual = taxasCartao.credito[dados.bandeira_cartao]?.taxas?.[dados.parcelas] || 0;
      } else if (dados.forma_pagamento === 'Cartão Débito') {
        // Acessar .taxa
        taxaPercentual = taxasCartao.debito[dados.bandeira_cartao]?.taxa || 0;
      }

      if (taxaPercentual > 0) {
        const taxaDecimal = taxaPercentual / 100;
        const valorComTaxa = valorComDesconto / (1 - taxaDecimal);
        novoJuros = valorComTaxa - valorComDesconto;
      }
    }

    setDados(prev => ({
      ...prev,
      juros: novoJuros,
      valor_final: valorComDesconto + novoJuros
    }));
  }, [dados.valor_total, dados.desconto, dados.cobrar_taxa, dados.forma_pagamento, dados.bandeira_cartao, dados.parcelas]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSalvando(true);

    try {
      console.log('═══════════════════════════════════════');
      console.log('💾 CRIANDO ORDEM DE SERVIÇO');
      console.log('═══════════════════════════════════════');
      console.log('Agendamento recebido:', agendamento);
      console.log('categoria_preco_id do agendamento:', agendamento?.categoria_preco_id);

      // CRÍTICO: Verificar categoria
      const categoriaId = agendamento?.categoria_preco_id;
      
      if (!categoriaId) {
        console.error('❌ AGENDAMENTO SEM CATEGORIA!');
        toast({
          title: "Erro Crítico",
          description: "Agendamento sem categoria de preço. Feche este formulário e edite o agendamento para adicionar uma categoria.",
          variant: "destructive"
        });
        setSalvando(false);
        return;
      }

      const categoria = categorias?.find(c => c.id === categoriaId);
      console.log('✅ Categoria a ser salva:', categoria?.nome, '(ID:', categoriaId, ')');

      // Obter nome do paciente para garantir envio
      const nomePaciente = paciente?.nome || agendamento?.paciente_nome;

      // Montar array de pagamentos detalhados se for Múltiplas Formas
      let pagamentosDetalhados = [];
      if (dados.forma_pagamento === 'Múltiplas Formas') {
        if (pagamento1.forma && pagamento1.valor) {
          pagamentosDetalhados.push({ forma: pagamento1.forma, valor: parseFloat(pagamento1.valor) || 0 });
        }
        if (pagamento2.forma && pagamento2.valor) {
          pagamentosDetalhados.push({ forma: pagamento2.forma, valor: parseFloat(pagamento2.valor) || 0 });
        }
      }

      // Nome do usuário que está gerando a OS
      const nomeUsuario = currentUser?.display_name || currentUser?.full_name || currentUser?.email;

      const osData = {
        agendamento_id: agendamento.id,
        paciente_id: agendamento.paciente_id,
        paciente_nome: nomePaciente,
        medico_id: medicoSelecionadoId || null,
        data_execucao: agendamento.data_agendamento,
        tipo_servico: agendamento.tipo_servico,
        categoria_preco_id: categoriaId, // FORÇAR INCLUSÃO
        valor_total: dados.valor_total,
        desconto: dados.desconto,
        juros: dados.juros,
        valor_final: dados.valor_final,
        forma_pagamento: dados.forma_pagamento,
        pagamentos_detalhados: pagamentosDetalhados,
        parcelas: dados.parcelas,
        bandeira_cartao: dados.bandeira_cartao,
        status_pagamento: dados.status_pagamento,
        observacoes: dados.observacoes,
        itens: dados.itens,
        valor_repasse_medico: dados.valor_repasse_medico,
        valor_repasse_laboratorio: dados.valor_repasse_laboratorio,
        valor_clinica: dados.valor_clinica,
        gerado_por: nomeUsuario // Nome do usuário que gerou a OS
      };

      if (agendamento.tipo_servico === 'Procedimento' && agendamento.procedimento_id) {
        osData.procedimento_id = agendamento.procedimento_id;
      }

      if (agendamento.tipo_servico === 'Exame' && agendamento.exames_ids) {
        osData.exames_ids = agendamento.exames_ids;
      }

      console.log('📦 Dados da OS (JSON):', JSON.stringify(osData, null, 2));
      console.log('📦 categoria_preco_id incluída?', 'categoria_preco_id' in osData);
      console.log('📦 Valor da categoria_preco_id:', osData.categoria_preco_id);

      // MUDANÇA: Usar backend function para integrar com pagamento
      console.log('🚀 Enviando requisição para criar OS...');
      
      let response;
      try {
        // Adicionar timeout de 30 segundos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        response = await base44.functions.invoke('createOrdemServico', osData);
        clearTimeout(timeoutId);
      } catch (fetchError) {
        console.error('❌ Erro na chamada da função:', fetchError);
        if (fetchError.name === 'AbortError') {
          throw new Error('Timeout: A requisição demorou muito. Tente novamente.');
        }
        throw fetchError;
      }
      
      console.log('📥 Resposta recebida:', response?.data);
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Erro ao processar OS no servidor');
      }

      const novaOS = response.data.os;
      const transaction = response.data.transaction;
      
      console.log('✅ OS processada com sucesso!');
      console.log('✅ ID da OS:', novaOS.id);

      if (transaction) {
         toast({
            title: "Enviado para Maquininha 💳",
            description: "Aguarde o processamento no terminal. A página será atualizada automaticamente.",
            className: "bg-blue-50 border-blue-200",
            duration: 4000
         });
      } else {
         toast({
            title: "Sucesso!",
            description: "Ordem de Serviço criada com sucesso!",
            duration: 3000
         });
      }

      // Chamar onSalvar imediatamente para atualização otimista
      onSalvar(novaOS);
    } catch (error) {
      console.error('❌ Erro ao criar OS:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar OS",
        variant: "destructive"
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onCancelar}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col"> {/* Removed p-0, adjusted max-h */}
        <DialogHeader className="p-6 pb-0 flex-shrink-0">
          <DialogTitle>Criar Ordem de Serviço</DialogTitle> {/* Changed title */}
        </DialogHeader>
        
        {avisoCategoria && (
          <Alert variant="destructive" className="mx-6 mt-4"> {/* Added mx-6 mt-4 for spacing */}
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>ATENÇÃO:</strong> Este agendamento não possui categoria de preço definida. 
              Por favor, cancele e edite o agendamento para adicionar uma categoria antes de criar a OS.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6"> {/* Wrapped content in form, added padding and spacing */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-gray-500">Paciente</Label>
                  <p className="font-semibold">{paciente?.nome || agendamento?.paciente_nome || 'Nome não disponível'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">CPF</Label>
                  <p className="font-semibold">{paciente?.cpf || 'Não informado'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Profissional</Label>
                  <p className="font-semibold">
                    {medicoSelecionadoId 
                      ? medicos.find(m => m.id === medicoSelecionadoId)?.nome || 'Profissional não encontrado'
                      : 'Sem profissional'
                    }
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Convênio</Label>
                  <p className="font-semibold">
                    {agendamento.convenio}
                    {agendamento.nome_prefeitura && ` - ${agendamento.nome_prefeitura}`}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Tipo de Serviço</Label>
                  <p className="font-semibold">{agendamento.tipo_servico}</p>
                </div>
                <div className="col-span-2 md:col-span-1 p-2 bg-blue-50 rounded">
                  <Label className="text-xs text-gray-500">Categoria (DEBUG)</Label>
                  <p className="font-semibold text-blue-600">
                    {agendamento.categoria_preco_id 
                      ? categorias?.find(c => c.id === agendamento.categoria_preco_id)?.nome || 'Não encontrada'
                      : '❌ SEM CATEGORIA'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card> {/* Removed mt-4 from Card */}
            <CardContent className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.itens.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-red-500">
                        ⚠️ Nenhum item encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    dados.itens.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell className="text-right">R$ {(item.valor_total || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-right font-semibold">Subtotal</TableCell>
                    <TableCell className="text-right font-semibold">R$ {dados.valor_total.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-right">Desconto (R$)</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={dados.desconto}
                        onChange={e => setDados(prev => ({ ...prev, desconto: parseFloat(e.target.value) || 0 }))}
                        className="text-right w-32"
                        min="0"
                        step="0.01"
                      />
                    </TableCell>
                  </TableRow>
                  {dados.desconto > 0 && (
                    <TableRow className="text-green-600">
                      <TableCell className="text-right">Desconto Aplicado</TableCell>
                      <TableCell className="text-right">- R$ {dados.desconto.toFixed(2)}</TableCell>
                    </TableRow>
                  )}
                  {dados.juros > 0 && (
                    <TableRow className="text-red-600">
                      <TableCell className="text-right font-semibold">Taxas de Cartão</TableCell>
                      <TableCell className="text-right font-semibold">+ R$ {dados.juros.toFixed(2)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow className="border-t-2 bg-blue-50">
                    <TableCell className="text-right text-xl font-bold text-blue-900">TOTAL A PAGAR</TableCell>
                    <TableCell className="text-right text-xl font-bold text-blue-900">
                      R$ {dados.valor_final.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          <Card> {/* Removed mt-4 from Card */}
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="cobrar-taxa" 
                  checked={dados.cobrar_taxa}
                  onCheckedChange={(checked) => setDados(prev => ({ ...prev, cobrar_taxa: checked }))}
                />
                <label htmlFor="cobrar-taxa" className="text-sm font-medium cursor-pointer">
                  Cobrar taxa de cartão do cliente
                </label>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select 
                    value={dados.forma_pagamento} 
                    onValueChange={(v) => {
                      setDados(prev => ({ ...prev, forma_pagamento: v, bandeira_cartao: null, parcelas: 1 }));
                      if (v !== 'Múltiplas Formas') {
                        setPagamento1({ forma: '', valor: '' });
                        setPagamento2({ forma: '', valor: '' });
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {formasPagamento.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Status do Pagamento</Label>
                  <Select 
                    value={dados.status_pagamento} 
                    onValueChange={(v) => setDados(prev => ({ ...prev, status_pagamento: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      <SelectItem value="Pago">Pago</SelectItem>
                      <SelectItem value="Cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {dados.forma_pagamento === 'Cartão Crédito' && (
                <div className="grid md:grid-cols-2 gap-4 p-4 border-2 border-blue-200 bg-blue-50 rounded-lg">
                  <div>
                    <Label>Bandeira do Cartão</Label>
                    <Select 
                      value={dados.bandeira_cartao || ""} 
                      onValueChange={(v) => setDados(prev => ({ ...prev, bandeira_cartao: v, parcelas: 1 }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {bandeirasCredito.map(b => (
                          <SelectItem key={b} value={b}>
                            {taxasCartao.credito[b].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Parcelas</Label>
                    <Select 
                      value={String(dados.parcelas)} 
                      onValueChange={v => setDados(prev => ({ ...prev, parcelas: parseInt(v) }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(p => {
                          const taxa = dados.bandeira_cartao && taxasCartao.credito[dados.bandeira_cartao]?.taxas?.[p];
                          return (
                            <SelectItem key={p} value={String(p)}>
                              {p}x {taxa ? `(Taxa: ${taxa}%)` : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {dados.forma_pagamento === 'Cartão Débito' && (
                <div className="p-4 border-2 border-green-200 bg-green-50 rounded-lg">
                  <Label>Bandeira do Cartão</Label>
                  <Select 
                    value={dados.bandeira_cartao || ""} 
                    onValueChange={v => setDados(prev => ({ ...prev, bandeira_cartao: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {bandeirasDebito.map(b => {
                        const info = taxasCartao.debito[b];
                        return (
                          <SelectItem key={b} value={b}>
                            {info.label} {info.taxa ? `(Taxa: ${info.taxa}%)` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {dados.forma_pagamento === 'Múltiplas Formas' && (
                <div className="p-4 border-2 border-purple-200 bg-purple-50 rounded-lg space-y-4">
                  <h4 className="font-medium text-purple-900">Detalhar Formas de Pagamento</h4>

                  {/* Pagamento 1 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Forma 1</Label>
                      <Select value={pagamento1.forma} onValueChange={(v) => setPagamento1(prev => ({ ...prev, forma: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                          <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                          <SelectItem value="PIX">PIX</SelectItem>
                          <SelectItem value="Transferência">Transferência</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={pagamento1.valor}
                        onChange={(e) => setPagamento1(prev => ({ ...prev, valor: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Pagamento 2 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Forma 2</Label>
                      <Select value={pagamento2.forma} onValueChange={(v) => setPagamento2(prev => ({ ...prev, forma: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                          <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                          <SelectItem value="PIX">PIX</SelectItem>
                          <SelectItem value="Transferência">Transferência</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={pagamento2.valor}
                        onChange={(e) => setPagamento2(prev => ({ ...prev, valor: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Total das formas */}
                  {(pagamento1.valor || pagamento2.valor) && (
                    <div className="pt-2 border-t border-purple-300">
                      <div className="flex justify-between text-sm">
                        <span className="text-purple-800">Total informado:</span>
                        <span className="font-bold text-purple-900">
                          R$ {((parseFloat(pagamento1.valor) || 0) + (parseFloat(pagamento2.valor) || 0)).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label>Observações</Label>
                <Input 
                  value={dados.observacoes} 
                  onChange={e => setDados(prev => ({ ...prev, observacoes: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>
          <DialogFooter className="p-0 flex-shrink-0"> {/* Moved DialogFooter inside form for submit button */}
            <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
            <Button type="submit" disabled={salvando || dados.valor_total === 0}>
              <Save className="w-4 h-4 mr-2" />
              {salvando ? "Salvando..." : "Salvar OS"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}