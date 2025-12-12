import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Brain, Send, Sparkles, Loader2, AlertCircle, Download, TrendingUp, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { DollarSign, Users, Calendar, BarChart, FileText, Activity } from 'lucide-react';
import { InvokeLLM } from "@/integrations/Core";
import { Agendamento, OrdemServico, Lancamento, Medico, Paciente, VendaCartao, Procedimento, Exame } from "@/entities/all";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { safeApiCall } from "@/components/shared/apiThrottle";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";

const exemplosPergunta = [
  "Relatório completo de repasses médicos hoje",
  "Me dê o fluxo do caixa de hoje",
  "Análise de desempenho financeiro do mês",
  "Relatório detalhado de atendimentos por médico",
  "Como melhorar a taxa de comparecimento dos pacientes?",
  "Quais estratégias para aumentar o faturamento?",
  "Análise de rentabilidade por especialidade médica",
];

const DynamicIcon = ({ name, ...props }) => {
  const icons = { DollarSign, Users, Calendar, BarChart, FileText, Activity, TrendingUp, Brain, Sparkles };
  const IconComponent = icons[name] || Activity;
  return <IconComponent {...props} />;
};

export default function AssistenteIA() {
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const coletarDadosDetalhados = async () => {
    try {
      console.log('🤖 [AssistenteIA] Coletando dados detalhados...');

      // Coletar TODOS os dados do sistema SEM LIMITE
      const [agendamentos, ordensServico, lancamentos, medicos, pacientes, vendasCartao, procedimentos, exames] = await Promise.all([
        Agendamento.list("-created_date", 50000).catch(() => []),
        OrdemServico.list("-created_date", 50000).catch(() => []),
        Lancamento.list("-data_lancamento", 50000).catch(() => []),
        Medico.list("nome", 5000).catch(() => []),
        Paciente.list("-created_date", 50000).catch(() => []),
        VendaCartao.list("-created_date", 50000).catch(() => []),
        Procedimento.list("nome", 5000).catch(() => []),
        Exame.list("nome", 5000).catch(() => [])
      ]);

      console.log('📊 [AssistenteIA] Total de registros carregados:');
      console.log(`  - Pacientes: ${pacientes.length}`);
      console.log(`  - Agendamentos: ${agendamentos.length}`);
      console.log(`  - Ordens de Serviço: ${ordensServico.length}`);
      console.log(`  - Lançamentos: ${lancamentos.length}`);
      console.log(`  - Vendas Cartão: ${vendasCartao.length}`);
      console.log(`  - Médicos: ${medicos.length}`);
      console.log(`  - Procedimentos: ${procedimentos.length}`);
      console.log(`  - Exames: ${exames.length}`);

      // DATAS
      const hoje = new Date().toISOString().split('T')[0];
      const mesAtual = new Date().toISOString().substring(0, 7);
      const inicioSemana = new Date();
      inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
      const semanaAtual = inicioSemana.toISOString().split('T')[0];

      // ORDENS DE SERVIÇO COM DETALHES - USAR TODAS AS PAGAS
      const ordensHoje = ordensServico.filter(os => os.data_execucao === hoje && os.status_pagamento === "Pago");
      const ordensMes = ordensServico.filter(os => os.data_execucao?.startsWith(mesAtual) && os.status_pagamento === "Pago");
      
      console.log(`📋 [AssistenteIA] Ordens filtradas para ${mesAtual}:`, ordensMes.length);
      console.log(`📋 [AssistenteIA] Ordens de hoje (${hoje}):`, ordensHoje.length);
      
      // Análise de formas de pagamento nas ordens de serviço - COM DETALHES DE PACIENTES
      const formasPagamentoOS = {};
      const ordensDetalhadas = [];
      
      ordensMes.forEach(os => {
        const pac = pacientes.find(p => p.id === os.paciente_id);
        const med = medicos.find(m => m.id === os.medico_id);
        
        // Processar múltiplas formas de pagamento
        if (os.forma_pagamento === "Múltiplas Formas" && os.pagamentos_detalhados && Array.isArray(os.pagamentos_detalhados)) {
          os.pagamentos_detalhados.forEach(pag => {
            const forma = pag.forma || "Não informado";
            
            // Adicionar aos detalhes
            ordensDetalhadas.push({
              os_id: os.id,
              paciente_nome: pac?.nome || os.paciente_nome || 'N/A',
              medico_nome: med?.nome || 'N/A',
              data: os.data_execucao,
              tipo_servico: os.tipo_servico,
              forma_pagamento: forma,
              valor: pag.valor || 0,
              status: os.status_pagamento
            });
            
            // Agrupar por forma
            if (!formasPagamentoOS[forma]) {
              formasPagamentoOS[forma] = { quantidade: 0, valor_total: 0, transacoes: [] };
            }
            formasPagamentoOS[forma].quantidade += 1;
            formasPagamentoOS[forma].valor_total += (pag.valor || 0);
            formasPagamentoOS[forma].transacoes.push({
              paciente: pac?.nome || os.paciente_nome || 'N/A',
              data: os.data_execucao,
              valor: pag.valor || 0,
              tipo: os.tipo_servico
            });
          });
        } else {
          // Forma única de pagamento
          const forma = os.forma_pagamento || "Não informado";
          
          ordensDetalhadas.push({
            os_id: os.id,
            paciente_nome: pac?.nome || os.paciente_nome || 'N/A',
            medico_nome: med?.nome || 'N/A',
            data: os.data_execucao,
            tipo_servico: os.tipo_servico,
            forma_pagamento: forma,
            valor: os.valor_final || 0,
            status: os.status_pagamento
          });
          
          if (!formasPagamentoOS[forma]) {
            formasPagamentoOS[forma] = { quantidade: 0, valor_total: 0, transacoes: [] };
          }
          formasPagamentoOS[forma].quantidade += 1;
          formasPagamentoOS[forma].valor_total += (os.valor_final || 0);
          formasPagamentoOS[forma].transacoes.push({
            paciente: pac?.nome || os.paciente_nome || 'N/A',
            data: os.data_execucao,
            valor: os.valor_final || 0,
            tipo: os.tipo_servico
          });
        }
      });
      
      console.log(`📊 [AssistenteIA] Formas de pagamento processadas:`, Object.keys(formasPagamentoOS));
      Object.entries(formasPagamentoOS).forEach(([forma, dados]) => {
        console.log(`  ${forma}: ${dados.quantidade} transações = R$ ${dados.valor_total.toFixed(2)}`);
      });

      // VENDAS DE CARTÃO - ANÁLISE DETALHADA COM LISTA DE CLIENTES E DEPENDENTES
      const vendasCartaoMes = vendasCartao.filter(v => v.data_venda?.startsWith(mesAtual));
      const vendasCartaoHoje = vendasCartao.filter(v => v.data_venda === hoje);

      console.log(`💳 [AssistenteIA] Vendas de cartão no mês ${mesAtual}:`, vendasCartaoMes.length);

      // Contar dependentes
      let totalDependentesTodas = 0;
      let totalDependentesMes = 0;
      let totalDependentesHoje = 0;

      vendasCartao.forEach(v => {
        const numDependentes = (v.dependentes && Array.isArray(v.dependentes)) ? v.dependentes.length : 0;
        totalDependentesTodas += numDependentes;
      });

      vendasCartaoMes.forEach(v => {
        const numDependentes = (v.dependentes && Array.isArray(v.dependentes)) ? v.dependentes.length : 0;
        totalDependentesMes += numDependentes;
      });

      vendasCartaoHoje.forEach(v => {
        const numDependentes = (v.dependentes && Array.isArray(v.dependentes)) ? v.dependentes.length : 0;
        totalDependentesHoje += numDependentes;
      });

      console.log(`👨‍👩‍👧‍👦 [AssistenteIA] Dependentes cadastrados: ${totalDependentesTodas}`);
      console.log(`👨‍👩‍👧‍👦 [AssistenteIA] Dependentes do mês: ${totalDependentesMes}`);

      const vendasPorForma = {};
      vendasCartaoMes.forEach(v => {
        const forma = v.forma_pagamento || 'Não informado';
        if (!vendasPorForma[forma]) {
          vendasPorForma[forma] = { quantidade: 0, valor_total: 0, clientes: [] };
        }
        vendasPorForma[forma].quantidade += 1;
        vendasPorForma[forma].valor_total += (v.valor_total || 0);

        const numDeps = (v.dependentes && Array.isArray(v.dependentes)) ? v.dependentes.length : 0;

        vendasPorForma[forma].clientes.push({
          titular: v.titular?.nome || 'N/A',
          cpf: v.titular?.cpf || 'N/A',
          data: v.data_venda,
          plano: v.tipo_plano,
          valor: v.valor_total || 0,
          dependentes: numDeps
        });
      });

      // LANÇAMENTOS FINANCEIROS - DETALHADOS
      const entradas = lancamentos.filter(l => l.tipo === "Entrada");
      const saidas = lancamentos.filter(l => l.tipo === "Saída");
      
      console.log(`💰 [AssistenteIA] Lançamentos - Entradas: ${entradas.length}, Saídas: ${saidas.length}`);
      
      // Análise de formas de pagamento nos lançamentos
      const formasPagamentoLancamentos = {};
      const lancamentosMes = lancamentos.filter(l => l.data_lancamento?.startsWith(mesAtual));
      
      lancamentosMes.forEach(l => {
        if (l.forma_pagamento) {
          const forma = l.forma_pagamento;
          if (!formasPagamentoLancamentos[forma]) {
            formasPagamentoLancamentos[forma] = { entradas: 0, saidas: 0, total: 0 };
          }
          if (l.tipo === "Entrada") {
            formasPagamentoLancamentos[forma].entradas += (l.valor || 0);
          } else {
            formasPagamentoLancamentos[forma].saidas += (l.valor || 0);
          }
          formasPagamentoLancamentos[forma].total = formasPagamentoLancamentos[forma].entradas - formasPagamentoLancamentos[forma].saidas;
        }
      });
      
      console.log(`💵 [AssistenteIA] Lançamentos do mês (${mesAtual}):`, lancamentosMes.length);
      
      // Lançamentos de HOJE detalhados
      const entradasHoje = entradas.filter(l => l.data_lancamento === hoje);
      const saidasHoje = saidas.filter(l => l.data_lancamento === hoje);
      
      const totalEntradasHoje = entradasHoje.reduce((sum, e) => sum + (e.valor || 0), 0);
      const totalSaidasHoje = saidasHoje.reduce((sum, s) => sum + (s.valor || 0), 0);
      const saldoHoje = totalEntradasHoje - totalSaidasHoje;

      // DETALHAMENTO DE REPASSES POR MÉDICO (HOJE)
      const repassesHojePorMedico = {};
      ordensHoje.forEach(os => {
        if (!os.medico_id || !os.valor_repasse_medico) return;
        
        const medico = medicos.find(m => m.id === os.medico_id);
        const paciente = pacientes.find(p => p.id === os.paciente_id);
        
        if (!medico) return;
        
        if (!repassesHojePorMedico[os.medico_id]) {
          repassesHojePorMedico[os.medico_id] = {
            medico_nome: medico.nome,
            especialidade: medico.especialidade,
            atendimentos: [],
            total_bruto: 0,
            total_repasse: 0,
            total_impostos: 0,
            total_clinica: 0
          };
        }
        
        const impostos = (os.valor_repasse_medico / 0.9) * 0.1;
        
        repassesHojePorMedico[os.medico_id].atendimentos.push({
          paciente_nome: paciente?.nome || 'N/A',
          tipo_servico: os.tipo_servico,
          valor_total: os.valor_final,
          valor_repasse: os.valor_repasse_medico,
          valor_impostos: impostos,
          valor_clinica: os.valor_clinica
        });
        
        repassesHojePorMedico[os.medico_id].total_bruto += os.valor_final;
        repassesHojePorMedico[os.medico_id].total_repasse += os.valor_repasse_medico;
        repassesHojePorMedico[os.medico_id].total_impostos += impostos;
        repassesHojePorMedico[os.medico_id].total_clinica += os.valor_clinica;
      });

      // DETALHAMENTO DE REPASSES POR MÉDICO (MÊS)
      const repassesMesPorMedico = {};
      ordensMes.forEach(os => {
        if (!os.medico_id || !os.valor_repasse_medico) return;
        
        const medico = medicos.find(m => m.id === os.medico_id);
        if (!medico) return;
        
        if (!repassesMesPorMedico[os.medico_id]) {
          repassesMesPorMedico[os.medico_id] = {
            medico_nome: medico.nome,
            quantidade: 0,
            total_repasse: 0
          };
        }
        
        repassesMesPorMedico[os.medico_id].quantidade += 1;
        repassesMesPorMedico[os.medico_id].total_repasse += os.valor_repasse_medico;
      });

      // ANÁLISE DE AGENDAMENTOS DETALHADA
      const agendamentosHoje = agendamentos.filter(a => a.data_agendamento === hoje);
      const agendamentosMes = agendamentos.filter(a => a.data_agendamento?.startsWith(mesAtual));
      
      console.log(`📅 [AssistenteIA] Agendamentos do mês (${mesAtual}):`, agendamentosMes.length);
      const canceladosMes = agendamentosMes.filter(a => a.status === "Cancelado").length;
      const finalizadosMes = agendamentosMes.filter(a => a.status === "Finalizado").length;
      const naoCompareceuMes = agendamentosMes.filter(a => a.status === "Não Compareceu").length;
      const confirmadosMes = agendamentosMes.filter(a => a.status === "Confirmado").length;
      const pagosMes = agendamentosMes.filter(a => a.status === "Pago").length;

      // Estatísticas detalhadas por médico
      const estatisticasMedicos = medicos.map(medico => {
        const agendamentosMedico = agendamentosMes.filter(a => a.medico_id === medico.id);
        const ordensMedico = ordensMes.filter(os => os.medico_id === medico.id);
        const faturamento = ordensMedico.reduce((sum, os) => sum + (os.valor_final || 0), 0);
        const repasse = ordensMedico.reduce((sum, os) => sum + (os.valor_repasse_medico || 0), 0);
        
        return {
          nome: medico.nome,
          especialidade: medico.especialidade,
          atendimentos_mes: agendamentosMedico.length,
          faturamento_mes: faturamento,
          repasse_mes: repasse
        };
      });

      // CÁLCULO PRECISO - Remover CPFs vazios/inválidos
      const cpfsValidos = pacientes.filter(p => p.cpf && p.cpf.trim() !== '').map(p => p.cpf);
      const cpfsUnicos = [...new Set(cpfsValidos)];
      
      // FATURAMENTO BRUTO - Soma direta das OS pagas (sem duplicação)
      const faturamentoBrutoMes = ordensMes.reduce((sum, os) => sum + (os.valor_final || 0), 0);
      const totalRepassesMes = ordensMes.reduce((sum, os) => sum + (os.valor_repasse_medico || 0), 0);
      const totalClinicaMes = ordensMes.reduce((sum, os) => sum + (os.valor_clinica || 0), 0);
      
      // LANÇAMENTOS - Filtrar por mês
      const entradasMes = entradas.filter(e => e.data_lancamento?.startsWith(mesAtual));
      const saidasMes = saidas.filter(s => s.data_lancamento?.startsWith(mesAtual));
      const totalEntradasMes = entradasMes.reduce((sum, e) => sum + (e.valor || 0), 0);
      const totalSaidasMes = saidasMes.reduce((sum, s) => sum + (s.valor || 0), 0);
      
      console.log(`💰 [AssistenteIA] VALIDAÇÃO DE VALORES:`);
      console.log(`  - Faturamento Bruto (OS): R$ ${faturamentoBrutoMes.toFixed(2)}`);
      console.log(`  - Total Repasses: R$ ${totalRepassesMes.toFixed(2)}`);
      console.log(`  - Total Clínica: R$ ${totalClinicaMes.toFixed(2)}`);
      console.log(`  - Entradas (Lançamentos): R$ ${totalEntradasMes.toFixed(2)}`);
      console.log(`  - Saídas (Lançamentos): R$ ${totalSaidasMes.toFixed(2)}`);
      console.log(`  - Resultado: R$ ${(totalEntradasMes - totalSaidasMes).toFixed(2)}`);

      const resumo = {
        totais: {
          pacientes: pacientes.length,
          pacientes_unicos: cpfsUnicos.length,
          medicos: medicos.length,
          medicos_ativos: medicos.filter(m => m.status === 'Ativo').length,
          agendamentos_total: agendamentos.length,
          ordens_servico_total: ordensServico.length,
          vendas_cartao_total: vendasCartao.length,
          procedimentos_cadastrados: procedimentos.length,
          exames_cadastrados: exames.length,
        },
        hoje: {
          data: hoje,
          agendamentos: agendamentosHoje.length,
          agendamentos_detalhados: agendamentosHoje.map(a => {
            const pac = pacientes.find(p => p.id === a.paciente_id);
            const med = medicos.find(m => m.id === a.medico_id);
            return {
              paciente: pac?.nome || 'N/A',
              medico: med?.nome || 'N/A',
              horario: a.horario,
              tipo: a.tipo_servico,
              status: a.status
            };
          }),
          ordens_servico_pagas: ordensHoje.length,
          faturamento_total: ordensHoje.reduce((sum, os) => sum + (os.valor_final || 0), 0),
          repasses_detalhados: Object.values(repassesHojePorMedico),
          fluxo_caixa: {
            entradas: entradasHoje.map(e => ({
              categoria: e.categoria,
              descricao: e.descricao,
              valor: e.valor,
              forma_pagamento: e.forma_pagamento
            })),
            saidas: saidasHoje.map(s => ({
              categoria: s.categoria,
              descricao: s.descricao,
              valor: s.valor,
              forma_pagamento: s.forma_pagamento
            })),
            total_entradas: totalEntradasHoje,
            total_saidas: totalSaidasHoje,
            saldo: saldoHoje
          }
        },
        mes_atual: {
          mes: format(new Date(mesAtual + '-01'), "MMMM 'de' yyyy", { locale: ptBR }),
          agendamentos: agendamentosMes.length,
          agendamentos_finalizados: finalizadosMes,
          agendamentos_pagos: pagosMes,
          agendamentos_confirmados: confirmadosMes,
          agendamentos_cancelados: canceladosMes,
          nao_compareceu: naoCompareceuMes,
          taxa_comparecimento: agendamentosMes.length > 0 ? ((finalizadosMes / agendamentosMes.length) * 100).toFixed(1) : 0,
          taxa_cancelamento: agendamentosMes.length > 0 ? ((canceladosMes / agendamentosMes.length) * 100).toFixed(1) : 0,
          faturamento_bruto: faturamentoBrutoMes,
          total_repasses: totalRepassesMes,
          total_clinica: totalClinicaMes,
          entradas_financeiras: totalEntradasMes,
          saidas_financeiras: totalSaidasMes,
          repasses_por_medico: Object.values(repassesMesPorMedico),
          estatisticas_medicos: estatisticasMedicos.filter(e => e.atendimentos_mes > 0),
          // NOVO: Análise de formas de pagamento
          vendas_cartao: {
            total_vendas: vendasCartaoMes.length,
            valor_total: vendasCartaoMes.reduce((sum, v) => sum + (v.valor_total || 0), 0),
            total_dependentes_cadastrados: totalDependentesTodas,
            dependentes_mes: totalDependentesMes,
            dependentes_hoje: totalDependentesHoje,
            por_forma_pagamento: Object.entries(vendasPorForma).map(([forma, dados]) => ({
              forma,
              quantidade: dados.quantidade,
              valor_total: dados.valor_total,
              clientes: dados.clientes
            }))
          },
          ordens_servico_detalhadas: ordensDetalhadas,
          ordens_servico_por_forma: Object.entries(formasPagamentoOS).map(([forma, dados]) => ({
            forma,
            quantidade: dados.quantidade,
            valor_total: dados.valor_total,
            transacoes: dados.transacoes
          })),
          lancamentos_por_forma: Object.entries(formasPagamentoLancamentos).map(([forma, dados]) => ({
            forma,
            entradas: dados.entradas,
            saidas: dados.saidas,
            saldo: dados.total
          }))
        },
        dados_brutos: {
          total_agendamentos_sistema: agendamentos?.length || 0,
          total_ordens_servico: ordensServico?.length || 0,
          total_lancamentos: lancamentos?.length || 0
        }
      };

      console.log('✅ [AssistenteIA] ═══════════════════════════════════════');
      console.log('✅ [AssistenteIA] RESUMO FINAL - VALORES VALIDADOS:');
      console.log('✅ [AssistenteIA] ═══════════════════════════════════════');
      console.log(`  📊 Pacientes cadastrados: ${resumo.totais.pacientes}`);
      console.log(`  👥 Pacientes únicos (CPF): ${resumo.totais.pacientes_unicos}`);
      console.log(`  👨‍⚕️ Médicos ativos: ${resumo.totais.medicos_ativos} / ${resumo.totais.medicos}`);
      console.log(`  📅 Agendamentos do mês: ${resumo.mes_atual.agendamentos}`);
      console.log(`  📋 OS pagas do mês: ${ordensMes.length}`);
      console.log(`  💰 Faturamento Bruto (OS): R$ ${resumo.mes_atual.faturamento_bruto.toFixed(2)}`);
      console.log(`  💵 Entradas (Lançamentos): R$ ${resumo.mes_atual.entradas_financeiras.toFixed(2)}`);
      console.log(`  📤 Saídas (Lançamentos): R$ ${resumo.mes_atual.saidas_financeiras.toFixed(2)}`);
      console.log(`  💼 Resultado Final: R$ ${(resumo.mes_atual.entradas_financeiras - resumo.mes_atual.saidas_financeiras).toFixed(2)}`);
      console.log('✅ [AssistenteIA] ═══════════════════════════════════════');
      
      return resumo;
      
    } catch (error) {
      console.error("❌ [AssistenteIA] Erro ao coletar dados:", error);
      throw new Error(`Erro ao coletar dados: ${error.message}`);
    }
  };

  const gerarRelatorio = async () => {
    if (!pergunta.trim()) {
      setErro("Por favor, digite uma pergunta.");
      return;
    }
    
    setCarregando(true);
    setResposta(null);
    setErro(null);
    
    try {
      console.log('📊 [AssistenteIA] Iniciando geração de relatório...');
      console.log('❓ [AssistenteIA] Pergunta:', pergunta);
      
      const dados = await coletarDadosDetalhados();
      console.log('📦 [AssistenteIA] Dados coletados:', dados);

      // Detectar se é um relatório que precisa de tabela
      const precisaTabela = pergunta.toLowerCase().includes('relatório') || 
                           pergunta.toLowerCase().includes('repasse') ||
                           pergunta.toLowerCase().includes('detalhado') ||
                           pergunta.toLowerCase().includes('tabela') ||
                           pergunta.toLowerCase().includes('fluxo') ||
                           pergunta.toLowerCase().includes('caixa') ||
                           pergunta.toLowerCase().includes('lista') ||
                           pergunta.toLowerCase().includes('pacientes que') ||
                           pergunta.toLowerCase().includes('clientes que');

      // NOVO: Montar tabela de fluxo de caixa
      let tabelaFluxoCaixaString = ''; // Renamed to avoid conflict with the HTML string
      if (dados.hoje.fluxo_caixa && (pergunta.toLowerCase().includes('fluxo') || pergunta.toLowerCase().includes('caixa'))) {
        const fc = dados.hoje.fluxo_caixa;
        
        tabelaFluxoCaixaString = `
📊 FLUXO DE CAIXA - ${format(new Date(dados.hoje.data + 'T00:00:00'), "dd/MM/yyyy")}

💰 ENTRADAS (${fc.entradas.length} lançamentos):
${fc.entradas.map(e => `  - ${e.categoria}: ${e.descricao} - R$ ${e.valor.toFixed(2)} (${e.forma_pagamento})`).join('\n') || '  Nenhuma entrada hoje'}

TOTAL ENTRADAS: R$ ${fc.total_entradas.toFixed(2)}

📤 SAÍDAS (${fc.saidas.length} lançamentos):
${fc.saidas.map(s => `  - ${s.categoria}: ${s.descricao} - R$ ${s.valor.toFixed(2)} (${s.forma_pagamento})`).join('\n') || '  Nenhuma saída hoje'}

TOTAL SAÍDAS: R$ ${fc.total_saidas.toFixed(2)}

💵 SALDO DO DIA: R$ ${fc.saldo.toFixed(2)} ${fc.saldo >= 0 ? '✅' : '❌'}
`;
      }

      // Montar dados detalhados de repasses
      let tabelaRepassesHoje = '';
      if (dados.hoje.repasses_detalhados.length > 0) {
        tabelaRepassesHoje = dados.hoje.repasses_detalhados.map(r => {
          const atendimentos = r.atendimentos.map(a => 
            `  - ${a.paciente_nome} (${a.tipo_servico}): Valor Total R$ ${a.valor_total.toFixed(2)} | Repasse R$ ${a.valor_repasse.toFixed(2)} | Impostos R$ ${a.valor_impostos.toFixed(2)} | Clínica R$ ${a.valor_clinica.toFixed(2)}`
          ).join('\n');
          
          return `
${r.medico_nome} (${r.especialidade}):
${atendimentos}
  TOTAIS: Bruto R$ ${r.total_bruto.toFixed(2)} | Repasse R$ ${r.total_repasse.toFixed(2)} | Impostos R$ ${r.total_impostos.toFixed(2)} | Clínica R$ ${r.total_clinica.toFixed(2)}
`;
        }).join('\n');
      }

      const prompt = `Você é um CONSULTOR ESPECIALISTA em gestão de clínicas médicas com 20 anos de experiência.

PERGUNTA DO GESTOR: ${pergunta}

═══════════════════════════════════════════════════════════
DADOS COMPLETOS DO SISTEMA - CENTRO VIDA SAÚDE
═══════════════════════════════════════════════════════════

📊 CADASTROS TOTAIS:
- Pacientes cadastrados: ${dados.totais.pacientes} (${dados.totais.pacientes_unicos} únicos por CPF)
- Médicos cadastrados: ${dados.totais.medicos} (${dados.totais.medicos_ativos} ativos)
- Procedimentos cadastrados: ${dados.totais.procedimentos_cadastrados}
- Exames cadastrados: ${dados.totais.exames_cadastrados}
- Total de agendamentos (histórico): ${dados.dados_brutos.total_agendamentos_sistema}
- Total de ordens de serviço: ${dados.dados_brutos.total_ordens_servico}
- Total de vendas de cartão: ${dados.totais.vendas_cartao_total}
- Total de lançamentos financeiros: ${dados.dados_brutos.total_lancamentos}

📅 AGENDAMENTOS HOJE (${format(new Date(dados.hoje.data + 'T00:00:00'), "dd/MM/yyyy")}):
- Total de agendamentos: ${dados.hoje.agendamentos}
${dados.hoje.agendamentos_detalhados.length > 0 ? `
Detalhamento:
${dados.hoje.agendamentos_detalhados.map(a => 
  `  • ${a.horario} - ${a.paciente} com Dr(a). ${a.medico} (${a.tipo}) - Status: ${a.status}`
).join('\n')}` : '  Nenhum agendamento hoje'}

📅 AGENDAMENTOS ESTE MÊS (${dados.mes_atual.mes}):
- Total: ${dados.mes_atual.agendamentos}
- Finalizados: ${dados.mes_atual.agendamentos_finalizados}
- Pagos: ${dados.mes_atual.agendamentos_pagos}
- Confirmados: ${dados.mes_atual.agendamentos_confirmados}
- Cancelados: ${dados.mes_atual.agendamentos_cancelados}
- Não compareceram: ${dados.mes_atual.nao_compareceu}
- Taxa de comparecimento: ${dados.mes_atual.taxa_comparecimento}%
- Taxa de cancelamento: ${dados.mes_atual.taxa_cancelamento}%

${tabelaFluxoCaixaString}

💰 FINANCEIRO DETALHADO ESTE MÊS:
- Faturamento Bruto (OS): R$ ${dados.mes_atual.faturamento_bruto.toFixed(2)}
- Total de Repasses Médicos: R$ ${dados.mes_atual.total_repasses.toFixed(2)}
- Valor Líquido Clínica (OS): R$ ${dados.mes_atual.total_clinica.toFixed(2)}
- Entradas (Lançamentos): R$ ${dados.mes_atual.entradas_financeiras.toFixed(2)}
- Saídas (Lançamentos): R$ ${dados.mes_atual.saidas_financeiras.toFixed(2)}
- Resultado Final: R$ ${(dados.mes_atual.entradas_financeiras - dados.mes_atual.saidas_financeiras).toFixed(2)}

💼 REPASSES MÉDICOS HOJE (${format(new Date(dados.hoje.data + 'T00:00:00'), "dd/MM/yyyy")}):
${dados.hoje.repasses_detalhados.length > 0 ? tabelaRepassesHoje : 'Nenhum repasse hoje'}

📈 DESEMPENHO POR MÉDICO ESTE MÊS:
${dados.mes_atual.estatisticas_medicos.length > 0 ? dados.mes_atual.estatisticas_medicos.map(e => 
  `• Dr(a). ${e.nome} (${e.especialidade}):
  - Atendimentos: ${e.atendimentos_mes}
  - Faturamento: R$ ${e.faturamento_mes.toFixed(2)}
  - Repasse: R$ ${e.repasse_mes.toFixed(2)}`
).join('\n') : 'Nenhum atendimento registrado este mês'}

📊 REPASSES MÉDICOS - RESUMO MENSAL:
${dados.mes_atual.repasses_por_medico.map(r => 
  `• ${r.medico_nome}: ${r.quantidade} atendimento(s) - Total de Repasse: R$ ${r.total_repasse.toFixed(2)}`
).join('\n')}

💳 VENDAS DE CARTÃO MAIS VIDA ESTE MÊS:
- Total de vendas: ${dados.mes_atual.vendas_cartao.total_vendas}
- Valor total arrecadado: R$ ${dados.mes_atual.vendas_cartao.valor_total.toFixed(2)}
- 👨‍👩‍👧‍👦 Total de dependentes cadastrados (histórico completo): ${dados.mes_atual.vendas_cartao.total_dependentes_cadastrados}
- 👨‍👩‍👧‍👦 Dependentes cadastrados este mês: ${dados.mes_atual.vendas_cartao.dependentes_mes}
- 👨‍👩‍👧‍👦 Dependentes cadastrados hoje: ${dados.mes_atual.vendas_cartao.dependentes_hoje}
${dados.mes_atual.vendas_cartao.por_forma_pagamento.length > 0 ? `
Detalhamento por forma de pagamento com lista de clientes:
${dados.mes_atual.vendas_cartao.por_forma_pagamento.map(f => 
  `  • ${f.forma}: ${f.quantidade} venda(s) - R$ ${f.valor_total.toFixed(2)}
${f.clientes && f.clientes.length > 0 ? 
  f.clientes.map(c => 
    `      - ${c.titular} (CPF: ${c.cpf}) | ${c.data} | ${c.plano} | ${c.dependentes} dependente(s) | R$ ${c.valor.toFixed(2)}`
  ).join('\n') 
  : ''}`
).join('\n')}` : ''}

💰 ORDENS DE SERVIÇO - ANÁLISE POR FORMA DE PAGAMENTO:
${dados.mes_atual.ordens_servico_por_forma.length > 0 ? 
  dados.mes_atual.ordens_servico_por_forma.map(f => 
    `• ${f.forma}: ${f.quantidade} OS - Total: R$ ${f.valor_total.toFixed(2)}
${f.transacoes && f.transacoes.length > 0 ? 
  f.transacoes.slice(0, 5).map(t => 
    `    - ${t.paciente} (${t.data}): R$ ${t.valor.toFixed(2)} - ${t.tipo}`
  ).join('\n') + (f.transacoes.length > 5 ? `\n    ... e mais ${f.transacoes.length - 5} transação(ões)` : '') 
  : ''}`
  ).join('\n') : 'Nenhuma OS registrada'}

📋 LISTA COMPLETA DE TODAS AS ${dados.mes_atual.ordens_servico_detalhadas.length} ORDENS DE SERVIÇO DO MÊS:
${dados.mes_atual.ordens_servico_detalhadas.slice(0, 100).map(os => 
  `• ${os.paciente_nome} | ${os.data} | ${os.tipo_servico} | ${os.forma_pagamento} | R$ ${os.valor.toFixed(2)}`
).join('\n')}
${dados.mes_atual.ordens_servico_detalhadas.length > 100 ? `\n... e mais ${dados.mes_atual.ordens_servico_detalhadas.length - 100} ordens` : ''}

📊 LANÇAMENTOS FINANCEIROS - POR FORMA DE PAGAMENTO:
${dados.mes_atual.lancamentos_por_forma.length > 0 ? 
  dados.mes_atual.lancamentos_por_forma.map(f => 
    `• ${f.forma}:
  - Entradas: R$ ${f.entradas.toFixed(2)}
  - Saídas: R$ ${f.saidas.toFixed(2)}
  - Saldo: R$ ${f.saldo.toFixed(2)}`
  ).join('\n') : 'Nenhum lançamento com forma de pagamento especificada'}

${precisaTabela ? `
🔥 ATENÇÃO: A pergunta solicita um RELATÓRIO DETALHADO COM TABELA.
Você DEVE incluir uma tabela HTML formatada com os dados.

${pergunta.toLowerCase().includes('lista') || pergunta.toLowerCase().includes('pacientes que') || pergunta.toLowerCase().includes('clientes que') ? `
🚨 ATENÇÃO: O usuário pediu uma LISTA de pacientes/clientes!

Você DEVE criar uma tabela HTML COMPLETA com TODOS os registros que atendem o critério.

Exemplo para lista de pacientes que pagaram com PIX:
<div class="tabela-relatorio">
  <h3>📋 Lista de Pacientes que Pagaram com PIX - Dezembro/2025</h3>
  <table class="relatorio-tabela">
    <thead>
      <tr>
        <th>Paciente</th>
        <th>Data</th>
        <th>Valor</th>
        <th>Tipo de Serviço</th>
      </tr>
    </thead>
    <tbody>
      <!-- FILTRE dados.mes_atual.ordens_servico_por_forma onde forma === "PIX" -->
      <!-- PARA CADA transacao em PIX.transacoes: -->
      <tr>
        <td>[Nome do Paciente]</td>
        <td>[Data formatada]</td>
        <td style="color: #059669;">R$ [Valor]</td>
        <td>[Tipo]</td>
      </tr>
      <!-- FIM DO LOOP -->
    </tbody>
  </table>
</div>

IMPORTANTE: Liste LINHA POR LINHA, não resuma!
` : ''}

${(pergunta.toLowerCase().includes('fluxo') || pergunta.toLowerCase().includes('caixa')) && dados.hoje.fluxo_caixa ? `
Para FLUXO DE CAIXA, use esta estrutura:
<div class="tabela-relatorio">
  <h3>💰 Fluxo de Caixa - ${format(new Date(dados.hoje.data + 'T00:00:00'), "dd/MM/yyyy")}</h3>
  
  <h4 style="color: #059669; margin-top: 20px;">💰 ENTRADAS</h4>
  <table class="relatorio-tabela">
    <thead>
      <tr>
        <th>Categoria</th>
        <th>Descrição</th>
        <th>Valor</th>
        <th>Forma Pagamento</th>
      </tr>
    </thead>
    <tbody>
      ${dados.hoje.fluxo_caixa.entradas.length > 0 ? dados.hoje.fluxo_caixa.entradas.map(e => `
      <tr>
        <td>${e.categoria}</td>
        <td>${e.descricao}</td>
        <td style="color: #059669; font-weight: bold;">R$ ${e.valor.toFixed(2)}</td>
        <td>${e.forma_pagamento}</td>
      </tr>
      `).join('') : '<tr><td colspan="4">Nenhuma entrada registrada hoje.</td></tr>'}
      <tr class="subtotal">
        <td colspan="2"><strong>TOTAL ENTRADAS</strong></td>
        <td colspan="2" style="color: #059669;"><strong>R$ ${dados.hoje.fluxo_caixa.total_entradas.toFixed(2)}</strong></td>
      </tr>
    </tbody>
  </table>

  <h4 style="color: #dc2626; margin-top: 20px;">📤 SAÍDAS</h4>
  <table class="relatorio-tabela">
    <thead>
      <tr>
        <th>Categoria</th>
        <th>Descrição</th>
        <th>Valor</th>
        <th>Forma Pagamento</th>
      </tr>
    </thead>
    <tbody>
      ${dados.hoje.fluxo_caixa.saidas.length > 0 ? dados.hoje.fluxo_caixa.saidas.map(s => `
      <tr>
        <td>${s.categoria}</td>
        <td>${s.descricao}</td>
        <td style="color: #dc2626; font-weight: bold;">R$ ${s.valor.toFixed(2)}</td>
        <td>${s.forma_pagamento}</td>
      </tr>
      `).join('') : '<tr><td colspan="4">Nenhuma saída registrada hoje.</td></tr>'}
      <tr class="subtotal">
        <td colspan="2"><strong>TOTAL SAÍDAS</strong></td>
        <td colspan="2" style="color: #dc2626;"><strong>R$ ${dados.hoje.fluxo_caixa.total_saidas.toFixed(2)}</strong></td>
      </tr>
    </tbody>
  </table>

  <div style="background: ${dados.hoje.fluxo_caixa.saldo >= 0 ? '#d1fae5' : '#fee2e2'}; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: center;">
    <h3 style="color: ${dados.hoje.fluxo_caixa.saldo >= 0 ? '#065f46' : '#991b1b'}; margin: 0;">
      💵 SALDO DO DIA: R$ ${dados.hoje.fluxo_caixa.saldo.toFixed(2)}
    </h3>
    <p style="margin-top: 8px; color: #6b7280; font-size: 14px;">
      ${dados.hoje.fluxo_caixa.saldo >= 0 ? '✅ Saldo positivo' : '❌ Saldo negativo'}
    </p>
  </div>
</div>
` : ''}

Para REPASSES MÉDICOS, use esta estrutura:
- Agrupe por médico
- Mostre cada atendimento em uma linha da tabela
- Colunas: Paciente | Tipo Serviço | Valor Total | Repasse Médico | Impostos (10%) | Valor Clínica
- Adicione linhas de SUBTOTAL por médico
- Adicione linha de TOTAL GERAL no final
` : ''}

🚨 INSTRUÇÕES CRÍTICAS - LEIA COM ATENÇÃO 🚨

QUANDO O USUÁRIO PEDIR UMA "LISTA" DE PACIENTES/CLIENTES POR FORMA DE PAGAMENTO:

1. Use EXATAMENTE os dados de "ordens_servico_por_forma" fornecidos no contexto
2. CADA entrada em "transacoes" representa UM registro real do banco de dados
3. NÃO invente, NÃO estime, NÃO aproxime valores - use APENAS os dados fornecidos
4. Para PIX: use dados.mes_atual.ordens_servico_por_forma["PIX"].transacoes
5. Para Cartão: use dados.mes_atual.ordens_servico_por_forma["Cartão Crédito"] ou ["Cartão Débito"]

ESTRUTURA OBRIGATÓRIA DA TABELA HTML:

<div class="tabela-relatorio">
  <h3>📋 [Título claro]</h3>
  <p><strong>Total de registros encontrados: [número exato]</strong></p>
  <table class="relatorio-tabela">
    <thead>
      <tr>
        <th>Nº</th>
        <th>Paciente</th>
        <th>Data</th>
        <th>Valor</th>
        <th>Tipo de Serviço</th>
      </tr>
    </thead>
    <tbody>
      <!-- LOOP por cada item em transacoes -->
      <tr>
        <td>[índice]</td>
        <td>[paciente_nome]</td>
        <td>[data formatada]</td>
        <td style="color: #059669;">R$ [valor]</td>
        <td>[tipo]</td>
      </tr>
    </tbody>
  </table>
  <p><strong>TOTAL: R$ [soma exata]</strong></p>
</div>

VALIDAÇÃO DOS NÚMEROS:
- Some TODOS os valores da lista e mostre o total
- O total deve bater com o valor_total da forma de pagamento
- Se não bater, PARE e revise a lista

${precisaTabela ? 'OBRIGATÓRIO: Inclua tabela HTML com os dados detalhados' : ''}

Responda em JSON com:
{
  "report_title": "Título executivo do relatório",
  "summary": "Análise detalhada (3-5 parágrafos)",
  ${precisaTabela ? '"html_table": "Tabela HTML completa formatada com os dados",' : ''}
  "key_metrics": [
    {"label": "Nome da métrica", "value": "Valor", "icon": "Users|DollarSign|Calendar|BarChart|TrendingUp"}
  ],
  "insights": [
    {"type": "positive|warning|critical", "title": "Título", "description": "Descrição"}
  ],
  "recommendations": [
    {"priority": "high|medium|low", "action": "Ação", "impact": "Impacto", "effort": "Esforço"}
  ]
}`;

      console.log('🧠 [AssistenteIA] Enviando para LLM...');
      
      const schema = {
        type: "object",
        properties: {
          report_title: { type: "string" },
          summary: { type: "string" },
          key_metrics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                icon: { type: "string" }
              }
            }
          },
          insights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["positive", "warning", "critical"] },
                title: { type: "string" },
                description: { type: "string" }
              }
            }
          },
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                priority: { type: "string", enum: ["high", "medium", "low"] },
                action: { type: "string" },
                impact: { type: "string" },
                effort: { type: "string" }
              }
            }
          }
        },
        required: ["report_title", "summary"]
      };

      if (precisaTabela) {
        schema.properties.html_table = { type: "string" };
      }

      const resultado = await InvokeLLM({
        prompt: prompt,
        add_context_from_internet: false,
        response_json_schema: schema
      });

      console.log('✅ [AssistenteIA] Resposta recebida:', resultado);
      
      if (!resultado || typeof resultado !== 'object') {
        throw new Error('Resposta inválida da IA');
      }
      
      setResposta(resultado);
      
    } catch (error) {
      console.error("❌ [AssistenteIA] Erro completo:", error);
      setErro(`Erro ao gerar relatório: ${error.message}`);
      
      setResposta({
        report_title: "Erro ao Gerar Relatório",
        summary: `Detalhes técnicos: ${error.message}. Por favor, tente uma pergunta mais simples.`,
        key_metrics: [],
        insights: [],
        recommendations: []
      });
    } finally {
      setCarregando(false);
    }
  };

  const baixarRelatorio = () => {
    if (!resposta) return;

    const dataAtual = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${resposta.report_title}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 40px; 
            color: #333; 
            line-height: 1.6;
          }
          .header { 
            display: flex; 
            align-items: center; 
            border-bottom: 3px solid #7c3aed; 
            padding-bottom: 20px; 
            margin-bottom: 30px; 
          }
          .logo { width: 80px; height: 80px; margin-right: 20px; }
          .clinic-info { flex: 1; }
          .clinic-name { font-size: 24px; font-weight: bold; color: #7c3aed; }
          .report-title { 
            font-size: 28px; 
            font-weight: bold; 
            margin: 30px 0 20px 0; 
            color: #1f2937;
          }
          .meta-info {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            font-size: 14px;
            color: #6b7280;
          }
          .summary {
            background: #f9fafb;
            padding: 20px;
            border-left: 4px solid #7c3aed;
            margin-bottom: 30px;
            white-space: pre-wrap;
          }
          
          /* ESTILOS PARA TABELA DE RELATÓRIO */
          .tabela-relatorio {
            margin: 30px 0;
            page-break-inside: avoid;
          }
          .tabela-relatorio h3 {
            color: #1f2937;
            margin-bottom: 15px;
            font-size: 20px;
          }
          .tabela-relatorio h4 {
            font-size: 18px;
            margin-top: 20px;
            margin-bottom: 10px;
          }
          .relatorio-tabela {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .relatorio-tabela th {
            background: #7c3aed;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            font-size: 14px;
          }
          .relatorio-tabela td {
            padding: 10px 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
          }
          .relatorio-tabela tr:hover {
            background: #f9fafb;
          }
          .medico-header {
            background: #ede9fe !important;
          }
          .medico-header td {
            color: #6b21a8;
            font-weight: bold;
            padding: 12px !important;
          }
          .subtotal {
            background: #f3f4f6 !important;
            font-weight: 600;
          }
          .subtotal td {
            border-top: 2px solid #7c3aed;
            border-bottom: 2px solid #7c3aed;
            padding: 12px !important;
          }
          .total-geral {
            background: #7c3aed !important;
            color: white !important;
          }
          .total-geral td {
            color: white !important;
            font-weight: bold;
            padding: 14px 12px !important;
            font-size: 14px;
          }
          
          .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
          }
          .metric-card {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
          }
          .metric-label { 
            font-size: 12px; 
            color: #6b7280; 
            margin-bottom: 5px;
          }
          .metric-value { 
            font-size: 24px; 
            font-weight: bold; 
            color: #1f2937;
          }
          .section-title {
            font-size: 20px;
            font-weight: bold;
            margin: 30px 0 15px 0;
            color: #1f2937;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
          }
          .insight {
            background: white;
            border-left: 4px solid #ddd;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 4px;
          }
          .insight.positive { border-left-color: #10b981; background: #f0fdf4; }
          .insight.warning { border-left-color: #f59e0b; background: #fffbeb; }
          .insight.critical { border-left-color: #ef4444; background: #fef2f2; }
          .insight-title {
            font-weight: bold;
            margin-bottom: 5px;
            font-size: 16px;
          }
          .insight.positive .insight-title { color: #047857; }
          .insight.warning .insight-title { color: #d97706; }
          .insight.critical .insight-title { color: #dc2626; }
          .recommendation {
            background: white;
            border: 1px solid #e5e7eb;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 8px;
          }
          .rec-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          .rec-action {
            font-weight: bold;
            font-size: 16px;
            color: #1f2937;
          }
          .priority-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
          }
          .priority-high { background: #fef2f2; color: #dc2626; }
          .priority-medium { background: #fffbeb; color: #d97706; }
          .priority-low { background: #f0fdf4; color: #047857; }
          .rec-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
            font-size: 14px;
          }
          .rec-detail {
            background: #f9fafb;
            padding: 8px;
            border-radius: 4px;
          }
          .rec-detail strong {
            color: #6b7280;
            font-size: 12px;
          }
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            font-size: 12px;
            color: #6b7280;
          }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo" class="logo no-print">
          <div class="clinic-info">
            <div class="clinic-name">CENTRO VIDA SAÚDE</div>
            <div style="font-size: 14px; color: #6b7280;">Relatório de Gestão - Assistente IA</div>
          </div>
        </div>

        <div class="meta-info">
          📅 Gerado em: ${dataAtual}<br>
          🤖 Análise realizada por: Assistente IA Especializado em Gestão de Clínicas
        </div>

        <div class="report-title">${resposta.report_title}</div>

        <div class="summary">
          <strong style="color: #7c3aed;">📊 ANÁLISE EXECUTIVA:</strong><br><br>
          ${resposta.summary}
        </div>

        ${resposta.html_table ? resposta.html_table : ''}

        ${resposta.key_metrics && resposta.key_metrics.length > 0 ? `
          <div class="section-title">📈 Principais Indicadores</div>
          <div class="metrics-grid">
            ${resposta.key_metrics.map(metric => `
              <div class="metric-card">
                <div class="metric-label">${metric.label}</div>
                <div class="metric-value">${metric.value}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${resposta.insights && resposta.insights.length > 0 ? `
          <div class="section-title">💡 Insights e Análises</div>
          ${resposta.insights.map(insight => `
            <div class="insight ${insight.type}">
              <div class="insight-title">
                ${insight.type === 'positive' ? '✅' : insight.type === 'warning' ? '⚠️' : '🚨'} 
                ${insight.title}
              </div>
              <div>${insight.description}</div>
            </div>
          `).join('')}
        ` : ''}

        ${resposta.recommendations && resposta.recommendations.length > 0 ? `
          <div class="section-title">🎯 Recomendações Estratégicas</div>
          ${resposta.recommendations.map((rec, index) => `
            <div class="recommendation">
              <div class="rec-header">
                <div class="rec-action">${index + 1}. ${rec.action}</div>
                <span class="priority-badge priority-${rec.priority}">
                  ${rec.priority === 'high' ? 'ALTA PRIORIDADE' : rec.priority === 'medium' ? 'PRIORIDADE MÉDIA' : 'PRIORIDADE BAIXA'}
                </span>
              </div>
              <div class="rec-details">
                <div class="rec-detail">
                  <strong>IMPACTO ESPERADO:</strong><br>
                  ${rec.impact}
                </div>
                <div class="rec-detail">
                  <strong>ESFORÇO NECESSÁRIO:</strong><br>
                  ${rec.effort}
                </div>
              </div>
            </div>
          `).join('')}
        ` : ''}

        <div class="footer">
          <strong>Centro Vida Saúde</strong> - Sistema de Gestão Inteligente<br>
          Relatório gerado automaticamente pelo Assistente IA | gloriavirtual.com
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  const insightTypeConfig = {
    positive: {
      icon: CheckCircle2,
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      textColor: "text-green-800",
      iconColor: "text-green-600"
    },
    warning: {
      icon: AlertTriangle,
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
      textColor: "text-yellow-800",
      iconColor: "text-yellow-600"
    },
    critical: {
      icon: AlertCircle,
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      textColor: "text-red-800",
      iconColor: "text-red-600"
    }
  };

  const priorityConfig = {
    high: { bgColor: "bg-red-100", textColor: "text-red-800", label: "ALTA" },
    medium: { bgColor: "bg-yellow-100", textColor: "text-yellow-800", label: "MÉDIA" },
    low: { bgColor: "bg-green-100", textColor: "text-green-800", label: "BAIXA" }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Brain className="w-6 h-6 text-purple-600" />
          Assistente IA - Consultor de Gestão
        </CardTitle>
        <p className="text-sm text-gray-600">
          Análises profundas com relatórios detalhados, tabelas e recomendações estratégicas
        </p>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {erro && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-500" />
            Exemplos de Perguntas Estratégicas:
          </h4>
          <div className="flex flex-wrap gap-2">
            {exemplosPergunta.map((exemplo, index) => (
              <Badge
                key={index}
                variant="outline"
                className="cursor-pointer hover:bg-purple-50 hover:border-purple-300 text-xs"
                onClick={() => {
                  setPergunta(exemplo);
                  setResposta(null);
                  setErro(null);
                }}
              >
                {exemplo}
              </Badge>
            ))}
          </div>
        </div>

        <Textarea
          placeholder="Faça sua pergunta estratégica sobre a gestão da clínica..."
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          className="min-h-[100px]"
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              gerarRelatorio();
            }
          }}
        />
        
        <Button
          onClick={gerarRelatorio}
          disabled={carregando || !pergunta.trim()}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {carregando ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analisando dados e gerando relatório...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Gerar Análise Completa
            </>
          )}
        </Button>

        {carregando && (
          <div className="space-y-3 text-center p-8">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-purple-600" />
            <p className="font-medium text-gray-700">Consultando dados da clínica...</p>
            <p className="text-sm text-gray-500">Gerando relatórios detalhados e recomendações personalizadas</p>
          </div>
        )}

        {resposta && (
          <Card className="bg-gradient-to-br from-gray-50 to-white shadow-md">
            <CardHeader className="border-b">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-2xl text-gray-800 mb-2">{resposta.report_title}</CardTitle>
                  <p className="text-sm text-gray-500">
                    Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <Button onClick={baixarRelatorio} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Baixar Relatório
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Summary */}
              <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-600">
                <h3 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Análise Executiva
                </h3>
                <p className="text-gray-700 whitespace-pre-wrap">{resposta.summary}</p>
              </div>

              {/* Tabela HTML */}
              {resposta.html_table && (
                <>
                  <Separator />
                  <div 
                    className="tabela-container"
                    dangerouslySetInnerHTML={{ __html: resposta.html_table }}
                    style={{
                      '--table-border': '#e5e7eb',
                      '--table-header-bg': '#7c3aed',
                      '--table-row-hover': '#f9fafb',
                      '--medico-header-bg': '#ede9fe',
                      '--subtotal-bg': '#f3f4f6',
                      '--total-bg': '#7c3aed'
                    }}
                  />
                  <style jsx>{`
                    .tabela-container :global(.tabela-relatorio) {
                      margin: 20px 0;
                    }
                    .tabela-container :global(.tabela-relatorio h3) {
                      color: #1f2937;
                      margin-bottom: 15px;
                      font-size: 18px;
                      font-weight: 600;
                    }
                    .tabela-container :global(.tabela-relatorio h4) {
                      font-size: 16px;
                      margin-top: 15px;
                      margin-bottom: 8px;
                      font-weight: 600;
                    }
                    .tabela-container :global(.relatorio-tabela) {
                      width: 100%;
                      border-collapse: collapse;
                      border: 1px solid #e5e7eb;
                      border-radius: 8px;
                      overflow: hidden;
                    }
                    .tabela-container :global(.relatorio-tabela th) {
                      background: #7c3aed;
                      color: white;
                      padding: 12px;
                      text-align: left;
                      font-weight: 600;
                      font-size: 13px;
                    }
                    .tabela-container :global(.relatorio-tabela td) {
                      padding: 10px 12px;
                      border-bottom: 1px solid #e5e7eb;
                      font-size: 13px;
                    }
                    .tabela-container :global(.relatorio-tabela tbody tr:hover) {
                      background: #f9fafb;
                    }
                    .tabela-container :global(.medico-header) {
                      background: #ede9fe !important;
                    }
                    .tabela-container :global(.medico-header td) {
                      color: #6b21a8;
                      font-weight: bold;
                      padding: 12px !important;
                    }
                    .tabela-container :global(.subtotal) {
                      background: #f3f4f6 !important;
                      font-weight: 600;
                    }
                    .tabela-container :global(.subtotal td) {
                      border-top: 2px solid #7c3aed;
                      border-bottom: 2px solid #7c3aed;
                      padding: 12px !important;
                    }
                    .tabela-container :global(.total-geral) {
                      background: #7c3aed !important;
                    }
                    .tabela-container :global(.total-geral td) {
                      color: white !important;
                      font-weight: bold;
                      padding: 14px 12px !important;
                      font-size: 14px;
                    }
                  `}</style>
                </>
              )}

              {/* Key Metrics */}
              {resposta.key_metrics && resposta.key_metrics.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <BarChart className="w-5 h-5" />
                      Principais Indicadores
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {resposta.key_metrics.map((metric, index) => (
                        <Card key={index} className="flex items-center p-4 gap-4 bg-white">
                          <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                            <DynamicIcon name={metric.icon} className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">{metric.label}</p>
                            <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Insights */}
              {resposta.insights && resposta.insights.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Lightbulb className="w-5 h-5" />
                      Insights e Análises
                    </h3>
                    <div className="space-y-3">
                      {resposta.insights.map((insight, index) => {
                        const config = insightTypeConfig[insight.type] || insightTypeConfig.warning;
                        const IconComponent = config.icon;
                        return (
                          <Card key={index} className={`${config.bgColor} border ${config.borderColor}`}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <IconComponent className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                                <div>
                                  <h4 className={`font-semibold ${config.textColor} mb-1`}>{insight.title}</h4>
                                  <p className="text-sm text-gray-700">{insight.description}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Recommendations */}
              {resposta.recommendations && resposta.recommendations.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Recomendações Estratégicas
                    </h3>
                    <div className="space-y-3">
                      {resposta.recommendations.map((rec, index) => {
                        const priorityStyle = priorityConfig[rec.priority] || priorityConfig.medium;
                        return (
                          <Card key={index} className="bg-white">
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start mb-3">
                                <h4 className="font-semibold text-gray-900 flex-1">
                                  {index + 1}. {rec.action}
                                </h4>
                                <Badge className={`${priorityStyle.bgColor} ${priorityStyle.textColor} border-0 ml-2`}>
                                  {priorityStyle.label}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                <div className="bg-gray-50 p-3 rounded">
                                  <p className="text-xs font-medium text-gray-500 mb-1">IMPACTO ESPERADO</p>
                                  <p className="text-sm text-gray-700">{rec.impact}</p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded">
                                  <p className="text-xs font-medium text-gray-500 mb-1">ESFORÇO NECESSÁRIO</p>
                                  <p className="text-sm text-gray-700">{rec.effort}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}