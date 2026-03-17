import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { mes, dryRun = true } = await req.json();
    if (!mes) {
      return Response.json({ error: 'Informe o parâmetro "mes" (ex: 2025-10)' }, { status: 400 });
    }

    const [ano, mesNum] = mes.split('-').map(Number);
    const inicioMes = `${mes}-01`;
    const fimMes = new Date(ano, mesNum, 0).toISOString().split('T')[0];

    // Buscar categorias isentas (Particular e Cartão Mais Vida)
    const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({});
    const categoriasIsentas = new Set();
    for (const cat of categorias) {
      const nomeUpper = (cat.nome || '').toUpperCase();
      if (nomeUpper.includes('PARTICULAR') || nomeUpper.includes('MAIS VIDA')) {
        categoriasIsentas.add(cat.id);
      }
    }

    // Buscar todas as OS do mês
    let todasOS = [];
    let skip = 0;
    const limit = 100;
    while (true) {
      const lote = await base44.asServiceRole.entities.OrdemServico.filter(
        { data_execucao: { $gte: inicioMes, $lte: fimMes } },
        '-data_execucao',
        limit,
        skip
      );
      todasOS = todasOS.concat(lote);
      if (lote.length < limit) break;
      skip += limit;
    }

    console.log(`📋 Encontradas ${todasOS.length} OS no mês ${mes}`);
    console.log(`🔄 Recalculando impostos para OS de ${mes} | dryRun: ${dryRun}`);

    let totalAtualizado = 0;
    let totalSemAlteracao = 0;
    let totalComDiferenca = 0;
    const detalhes = [];

    for (const os of todasOS) {
      const isento = categoriasIsentas.has(os.categoria_preco_id);
      const valorFinal = os.valor_final || 0;
      const repasseMedico = os.valor_repasse_medico || 0;
      const repasseLab = os.valor_repasse_laboratorio || 0;

      let novoImposto = 0;
      if (!isento && valorFinal > 0) {
        novoImposto = Math.round(valorFinal * 0.10 * 100) / 100;
      }

      let novoClinica = Math.round((valorFinal - repasseMedico - repasseLab - novoImposto) * 100) / 100;
      if (novoClinica < 0) novoClinica = 0;

      const impostoAtual = os.valor_imposto || 0;
      const clinicaAtual = os.valor_clinica || 0;

      if (Math.abs(impostoAtual - novoImposto) < 0.01 && Math.abs(clinicaAtual - novoClinica) < 0.01) {
        totalSemAlteracao++;
        continue;
      }

      totalComDiferenca++;
      detalhes.push({
        os_id: os.id,
        numero_os: os.numero_os,
        paciente_nome: os.paciente_nome,
        categoria: isento ? 'ISENTO' : 'N/A',
        isento_imposto: isento,
        valor_final: valorFinal,
        repasse_medico: repasseMedico,
        imposto_antigo: impostoAtual,
        imposto_novo: novoImposto,
        clinica_antigo: clinicaAtual,
        clinica_novo: novoClinica
      });

      if (!dryRun) {
        for (let tentativa = 1; tentativa <= 3; tentativa++) {
          try {
            await base44.asServiceRole.entities.OrdemServico.update(os.id, {
              valor_imposto: novoImposto,
              valor_clinica: novoClinica
            });
            break;
          } catch (e) {
            if (tentativa < 3 && e.status === 429) {
              console.log(`⏳ Rate limit, aguardando ${tentativa * 5}s...`);
              await new Promise(r => setTimeout(r, tentativa * 5000));
            } else {
              throw e;
            }
          }
        }
        totalAtualizado++;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`✅ Concluído: ${totalAtualizado} atualizadas, ${totalSemAlteracao} sem alteração, ${totalComDiferenca} com diferenças`);

    return Response.json({
      success: true,
      mes,
      dryRun,
      total_os_mes: todasOS.length,
      total_atualizado: totalAtualizado,
      total_sem_alteracao: totalSemAlteracao,
      total_com_diferenca: totalComDiferenca,
      detalhes: detalhes.slice(0, 20)
    });
  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});