import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

/**
 * Audita OS pagas/finalizadas dessa semana (24/04 a 30/04) com repasse zerado,
 * onde o médico TEM repasse configurado para a categoria.
 * Apenas LISTA — não modifica nada.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Buscar OS da semana
    const ordens = await base44.asServiceRole.entities.OrdemServico.filter({
      data_execucao: { $gte: '2026-04-24', $lte: '2026-04-30' },
      status_pagamento: 'Pago'
    });

    // Filtrar apenas com repasse zerado e tipo de serviço médico (consulta/procedimento/retorno)
    const zeradas = ordens.filter(os =>
      (os.valor_repasse_medico === 0 || os.valor_repasse_medico == null) &&
      ['Consulta', 'Procedimento', 'Retorno'].includes(os.tipo_servico) &&
      os.medico_id
    );

    // Carregar médicos relevantes
    const medicoIds = [...new Set(zeradas.map(os => os.medico_id))];
    const medicos = {};
    for (const id of medicoIds) {
      try {
        medicos[id] = await base44.asServiceRole.entities.Medico.get(id);
      } catch (e) {
        medicos[id] = null;
      }
    }

    // Para cada OS zerada, calcular qual seria o repasse esperado
    const detalhes = zeradas.map(os => {
      const medico = medicos[os.medico_id];
      let repasseEsperado = 0;
      let origemRepasse = 'sem configuração';

      if (medico) {
        // 1. repasses_por_categoria (mais específico)
        const repCat = (medico.repasses_por_categoria || []).find(r => r.categoria_id === os.categoria_preco_id);
        if (repCat) {
          const isProcedimento = os.tipo_servico === 'Procedimento';
          const valor = isProcedimento ? repCat.valor_procedimento : repCat.valor;
          if (valor && valor > 0) {
            if (repCat.tipo_repasse === 'percentual') {
              repasseEsperado = (os.valor_final * valor) / 100;
            } else {
              repasseEsperado = valor;
            }
            origemRepasse = `categoria (${repCat.tipo_repasse}: ${valor})`;
          }
        }
      }

      return {
        os_id: os.id,
        numero_os: os.numero_os,
        data: os.data_execucao,
        paciente: os.paciente_nome,
        medico: medico?.nome || 'desconhecido',
        medico_id: os.medico_id,
        tipo_servico: os.tipo_servico,
        categoria_id: os.categoria_preco_id,
        valor_final: os.valor_final,
        valor_repasse_atual: os.valor_repasse_medico,
        repasse_esperado: repasseEsperado,
        origem: origemRepasse,
        precisa_correcao: repasseEsperado > 0
      };
    });

    const precisaCorrecao = detalhes.filter(d => d.precisa_correcao);
    const semConfiguracao = detalhes.filter(d => !d.precisa_correcao);

    return Response.json({
      total_os_pagas_semana: ordens.length,
      total_zeradas: zeradas.length,
      total_precisa_correcao: precisaCorrecao.length,
      total_sem_config_medico: semConfiguracao.length,
      total_repasse_a_corrigir: precisaCorrecao.reduce((s, d) => s + d.repasse_esperado, 0),
      precisa_correcao: precisaCorrecao,
      sem_configuracao: semConfiguracao
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});