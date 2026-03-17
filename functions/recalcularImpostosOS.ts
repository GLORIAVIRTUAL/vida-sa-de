import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Recalcula APENAS valor_imposto e valor_clinica para OS de um mês específico
// Regra: Convênios = 10% imposto sobre valor bruto. Particular e Cartão Mais Vida = SEM imposto
// O repasse do médico (valor_repasse_medico) é MANTIDO como está - NÃO é recalculado.
// Apenas o imposto é adicionado e o valor_clinica é ajustado.

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
    
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return Response.json({ error: 'Informe o mês no formato YYYY-MM (ex: 2026-03)' }, { status: 400 });
    }

    console.log(`🔄 Recalculando impostos para OS de ${mes} | dryRun: ${dryRun || false}`);

    const [todasOS, categorias] = await Promise.all([
      base44.asServiceRole.entities.OrdemServico.list('-data_execucao', 10000),
      base44.asServiceRole.entities.CategoriaPreco.list()
    ]);

    const osMes = todasOS.filter(os => os.data_execucao && os.data_execucao.startsWith(mes));
    console.log(`📋 Encontradas ${osMes.length} OS no mês ${mes}`);

    const resultados = [];
    let totalAtualizado = 0;
    let totalSemAlteracao = 0;

    for (const os of osMes) {
      if (os.status_pagamento === 'Cancelado') { totalSemAlteracao++; continue; }

      const categoria = categorias.find(c => c.id === os.categoria_preco_id);
      const categoriaNorm = normalizeString(categoria?.nome || '');
      const isParticular = categoriaNorm === 'PARTICULAR';
      const isCartaoMaisVida = categoriaNorm.includes('CARTAO') && categoriaNorm.includes('MAIS') && categoriaNorm.includes('VIDA');
      const isentoImposto = isParticular || isCartaoMaisVida;

      const valorFinal = os.valor_final || 0;
      const novoImposto = isentoImposto ? 0 : parseFloat((valorFinal * 0.10).toFixed(2));
      
      // Manter repasse do médico e lab como estão
      const repasseMedico = os.valor_repasse_medico || 0;
      const repasseLab = os.valor_repasse_laboratorio || 0;
      
      // Recalcular valor_clinica = valor_final - imposto - repasse_medico - repasse_lab
      const novoClinica = parseFloat(Math.max(0, valorFinal - novoImposto - repasseMedico - repasseLab).toFixed(2));

      const antigoImposto = os.valor_imposto || 0;
      const antigoClinica = os.valor_clinica || 0;

      const mudou = Math.abs(novoImposto - antigoImposto) > 0.01 || Math.abs(novoClinica - antigoClinica) > 0.01;

      if (mudou) {
        resultados.push({
          os_id: os.id,
          numero_os: os.numero_os,
          paciente_nome: os.paciente_nome,
          categoria: categoria?.nome || 'N/A',
          isento_imposto: isentoImposto,
          valor_final: valorFinal,
          repasse_medico: repasseMedico,
          imposto_antigo: antigoImposto,
          imposto_novo: novoImposto,
          clinica_antigo: antigoClinica,
          clinica_novo: novoClinica
        });

        if (!dryRun) {
          await base44.asServiceRole.entities.OrdemServico.update(os.id, {
            valor_imposto: novoImposto,
            valor_clinica: novoClinica
          });
          totalAtualizado++;
          // Delay para evitar rate limit
          if (totalAtualizado % 5 === 0) {
            await new Promise(r => setTimeout(r, 2000));
          }
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
      detalhes: resultados.slice(0, 50) // Limitar para não estourar resposta
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});