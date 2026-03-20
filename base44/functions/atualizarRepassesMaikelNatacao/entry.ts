import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const medicos = await base44.asServiceRole.entities.Medico.list();
    const maikelNatacao = medicos.find((medico) =>
      medico.nome === 'Maikel Charlos' && medico.especialidade === 'Natação'
    );

    if (!maikelNatacao) {
      return Response.json({ error: 'Médico Maikel Charlos / Natação não encontrado' }, { status: 404 });
    }

    let todasOrdens = [];
    let skip = 0;
    const limit = 500;

    while (true) {
      const lote = await base44.asServiceRole.entities.OrdemServico.list('-data_execucao', limit, skip);
      if (!lote || lote.length === 0) break;
      todasOrdens = [...todasOrdens, ...lote];
      if (lote.length < limit) break;
      skip += limit;
    }

    const ordensMaikelNatacao = todasOrdens.filter((ordem) =>
      ordem.medico_id === maikelNatacao.id && ordem.status_pagamento !== 'Cancelado'
    );

    let atualizadas = 0;
    const detalhes = [];

    for (const ordem of ordensMaikelNatacao) {
      const valorFinal = roundCurrency(ordem.valor_final || 0);
      const repasseLaboratorio = roundCurrency(ordem.valor_repasse_laboratorio || 0);
      const novoRepasse = roundCurrency(valorFinal * 0.4);
      const novoValorClinica = roundCurrency(valorFinal - novoRepasse - repasseLaboratorio);

      const repasseAtual = roundCurrency(ordem.valor_repasse_medico || 0);
      const clinicaAtual = roundCurrency(ordem.valor_clinica || 0);

      if (repasseAtual === novoRepasse && clinicaAtual === novoValorClinica) {
        continue;
      }

      await base44.asServiceRole.entities.OrdemServico.update(ordem.id, {
        valor_repasse_medico: novoRepasse,
        valor_clinica: novoValorClinica
      });

      atualizadas += 1;
      detalhes.push({
        ordem_id: ordem.id,
        paciente_nome: ordem.paciente_nome,
        valor_final: valorFinal,
        repasse_anterior: repasseAtual,
        repasse_novo: novoRepasse
      });
    }

    await base44.asServiceRole.entities.Medico.update(maikelNatacao.id, {
      percentual_repasse: 40,
      percentual_repasse_convenio: 40,
      percentual_repasse_procedimento: 40,
      percentual_repasse_procedimento_convenio: 40
    });

    return Response.json({
      success: true,
      medico_id: maikelNatacao.id,
      medico: maikelNatacao.nome,
      especialidade: maikelNatacao.especialidade,
      ordens_encontradas: ordensMaikelNatacao.length,
      ordens_atualizadas: atualizadas,
      detalhes: detalhes.slice(0, 20)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});