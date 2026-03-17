import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Recalcula valor_imposto, valor_repasse_medico e valor_clinica para OS de um mês específico
// Regra: Convênios = 10% imposto sobre valor bruto ANTES de calcular repasse
// Particular e Cartão Mais Vida = SEM imposto

const normalizeString = (str) => {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { mes, dryRun } = await req.json();
    // mes no formato "YYYY-MM", ex: "2025-03"
    
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return Response.json({ error: 'Informe o mês no formato YYYY-MM (ex: 2025-03)' }, { status: 400 });
    }

    console.log(`🔄 Recalculando impostos para OS de ${mes} | dryRun: ${dryRun || false}`);

    // Carregar dados necessários
    const [todasOS, categorias, medicos, procedimentos] = await Promise.all([
      base44.asServiceRole.entities.OrdemServico.list('-data_execucao', 10000),
      base44.asServiceRole.entities.CategoriaPreco.list(),
      base44.asServiceRole.entities.Medico.list(),
      base44.asServiceRole.entities.Procedimento.list()
    ]);

    // Filtrar OS do mês
    const osMes = todasOS.filter(os => {
      if (!os.data_execucao) return false;
      return os.data_execucao.startsWith(mes);
    });

    console.log(`📋 Encontradas ${osMes.length} OS no mês ${mes}`);

    const resultados = [];
    let totalAtualizado = 0;
    let totalSemAlteracao = 0;

    for (const os of osMes) {
      // Pular canceladas
      if (os.status_pagamento === 'Cancelado') {
        totalSemAlteracao++;
        continue;
      }

      // Determinar categoria
      const categoria = categorias.find(c => c.id === os.categoria_preco_id);
      const categoriaNome = categoria?.nome || '';
      const categoriaNorm = normalizeString(categoriaNome);

      const isParticular = categoriaNorm === 'PARTICULAR';
      const isCartaoMaisVida = categoriaNorm.includes('CARTAO') && categoriaNorm.includes('MAIS') && categoriaNorm.includes('VIDA');
      const isentoImposto = isParticular || isCartaoMaisVida;

      const valorFinal = os.valor_final || 0;
      const percentualImposto = isentoImposto ? 0 : 10;
      const valorImposto = valorFinal * (percentualImposto / 100);
      const valorBaseRepasse = valorFinal - valorImposto;

      // Encontrar médico
      const medico = medicos.find(m => m.id === os.medico_id);
      
      let repasseMedico = 0;

      if (medico && valorFinal > 0) {
        const tipoRepasse = medico.tipo_repasse || 'percentual';
        
        // Buscar configuração específica por categoria
        const repasseEspecifico = medico.repasses_por_categoria?.find(
          r => r.categoria_id === os.categoria_preco_id
        );

        // Buscar procedimento se aplicável
        const procedimento = os.procedimento_id ? procedimentos.find(p => p.id === os.procedimento_id) : null;

        let percentual = 0;
        let repasseFixo = 0;

        if (os.tipo_servico === 'Procedimento' && procedimento) {
          if (procedimento.valor_repasse_medico > 0) {
            repasseFixo = procedimento.valor_repasse_medico;
          } else if (procedimento.percentual_repasse_medico > 0) {
            percentual = procedimento.percentual_repasse_medico;
          } else if (repasseEspecifico && repasseEspecifico.valor_procedimento > 0) {
            if (repasseEspecifico.tipo_repasse === 'valor_fixo') {
              repasseFixo = repasseEspecifico.valor_procedimento;
            } else {
              percentual = repasseEspecifico.valor_procedimento;
            }
          } else if (tipoRepasse === 'valor_fixo') {
            repasseFixo = isParticular
              ? (medico.valor_repasse_fixo_procedimento || medico.valor_repasse_fixo || 0)
              : (medico.valor_repasse_fixo_procedimento_convenio || medico.valor_repasse_fixo_convenio || 0);
          } else {
            percentual = isParticular
              ? (medico.percentual_repasse_procedimento || medico.percentual_repasse || 0)
              : (medico.percentual_repasse_procedimento_convenio || medico.percentual_repasse_convenio || 0);
          }
        } else {
          // Consultas / Retornos
          if (repasseEspecifico && repasseEspecifico.valor > 0) {
            if (repasseEspecifico.tipo_repasse === 'valor_fixo') {
              repasseFixo = repasseEspecifico.valor;
            } else {
              percentual = repasseEspecifico.valor;
            }
          } else if (tipoRepasse === 'valor_fixo') {
            const fixoConvenio = medico.valor_repasse_fixo_convenio || 0;
            const fixoParticular = medico.valor_repasse_fixo || 0;
            repasseFixo = isParticular ? fixoParticular : (fixoConvenio || fixoParticular);
          } else {
            const percConvenio = medico.percentual_repasse_convenio || 0;
            const percParticular = medico.percentual_repasse || 0;
            percentual = isParticular ? percParticular : (percConvenio || percParticular);
          }
        }

        if (repasseFixo > 0) {
          repasseMedico = repasseFixo;
        } else if (percentual > 0) {
          // Calcular sobre a base APÓS imposto
          repasseMedico = valorBaseRepasse * (percentual / 100);
        }
      }

      // Manter repasse de laboratório original
      const repasseLab = os.valor_repasse_laboratorio || 0;
      
      // Valor clínica = valor final - imposto - repasse médico - repasse lab
      const valorClinica = valorFinal - valorImposto - repasseMedico - repasseLab;

      // Arredondar para 2 casas
      const novoImposto = parseFloat(valorImposto.toFixed(2));
      const novoRepasse = parseFloat(repasseMedico.toFixed(2));
      const novoClinica = parseFloat(Math.max(0, valorClinica).toFixed(2));

      const antigoImposto = os.valor_imposto || 0;
      const antigoRepasse = os.valor_repasse_medico || 0;
      const antigoClinica = os.valor_clinica || 0;

      const mudou = Math.abs(novoImposto - antigoImposto) > 0.01 ||
                     Math.abs(novoRepasse - antigoRepasse) > 0.01 ||
                     Math.abs(novoClinica - antigoClinica) > 0.01;

      if (mudou) {
        const registro = {
          os_id: os.id,
          numero_os: os.numero_os,
          paciente_nome: os.paciente_nome,
          medico_nome: medico?.nome || 'N/A',
          categoria: categoriaNome,
          isento_imposto: isentoImposto,
          valor_final: valorFinal,
          imposto_antigo: antigoImposto,
          imposto_novo: novoImposto,
          repasse_antigo: antigoRepasse,
          repasse_novo: novoRepasse,
          clinica_antigo: antigoClinica,
          clinica_novo: novoClinica
        };

        resultados.push(registro);

        if (!dryRun) {
          await base44.asServiceRole.entities.OrdemServico.update(os.id, {
            valor_imposto: novoImposto,
            valor_repasse_medico: novoRepasse,
            valor_clinica: novoClinica
          });
          totalAtualizado++;
        }
      } else {
        totalSemAlteracao++;
      }
    }

    console.log(`✅ Concluído: ${totalAtualizado} atualizadas, ${totalSemAlteracao} sem alteração, ${resultados.length} com diferenças`);

    return Response.json({
      success: true,
      mes,
      dryRun: dryRun || false,
      total_os_mes: osMes.length,
      total_atualizado: totalAtualizado,
      total_sem_alteracao: totalSemAlteracao,
      total_com_diferenca: resultados.length,
      detalhes: resultados
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});