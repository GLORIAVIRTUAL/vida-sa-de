import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dryRun = true, batch = 0, batchSize = 100 } = await req.json().catch(() => ({}));

    // Carregar médicos
    const medicos = await base44.asServiceRole.entities.Medico.filter({});
    const medicosMap = {};
    medicos.forEach(m => { medicosMap[m.id] = m; });

    // Carregar OS de março com repasse = 0 (paginado)
    const skipVal = batch * batchSize;
    const allOS = await base44.asServiceRole.entities.OrdemServico.list('-created_date', 500, skipVal);
    
    const osMar = (allOS || []).filter(os => 
      os.data_execucao >= '2026-03-01' && 
      os.data_execucao <= '2026-03-31' &&
      (os.valor_repasse_medico === 0 || os.valor_repasse_medico === null) &&
      os.status_pagamento !== 'Cancelado' &&
      os.medico_id
    );

    console.log(`Batch ${batch}: ${osMar.length} OS março com repasse zerado de ${(allOS || []).length} carregadas`);

    const agendaAuxiliar = ['ELETROCARDIO CLINICA', 'EXAMES', 'CARTÃO MAIS VIDA'];
    const resultados = [];
    const erros = [];

    for (const os of osMar) {
      const medico = medicosMap[os.medico_id];
      if (!medico) {
        erros.push({ os_id: os.id, paciente: os.paciente_nome, erro: `Médico ${os.medico_id} não encontrado` });
        continue;
      }
      if (agendaAuxiliar.includes(medico.nome)) continue;

      const categoriaId = os.categoria_preco_id;
      const tipoServico = os.tipo_servico;
      const valorFinal = os.valor_final || 0;
      let valorRepasse = 0;

      // 1. repasses_por_categoria
      const rc = (medico.repasses_por_categoria || []).find(r => r.categoria_id === categoriaId);
      
      if (rc) {
        if (tipoServico === 'Procedimento') {
          valorRepasse = rc.tipo_repasse === 'percentual'
            ? Math.round(valorFinal * (rc.valor_procedimento ?? rc.valor ?? 0) / 100 * 100) / 100
            : (rc.valor_procedimento ?? rc.valor ?? 0);
        } else {
          valorRepasse = rc.tipo_repasse === 'percentual'
            ? Math.round(valorFinal * (rc.valor ?? 0) / 100 * 100) / 100
            : (rc.valor ?? 0);
        }
      } else {
        // 2. Fallback campos legados
        const isPart = categoriaId === '6966af28c3f66155da5cd7c2';
        if (medico.tipo_repasse === 'percentual') {
          const pct = tipoServico === 'Procedimento'
            ? (isPart ? (medico.percentual_repasse_procedimento || medico.percentual_repasse || 0) : (medico.percentual_repasse_procedimento_convenio || medico.percentual_repasse_convenio || 0))
            : (isPart ? (medico.percentual_repasse || 0) : (medico.percentual_repasse_convenio || 0));
          valorRepasse = Math.round(valorFinal * pct / 100 * 100) / 100;
        } else if (medico.tipo_repasse === 'valor_fixo') {
          valorRepasse = tipoServico === 'Procedimento'
            ? (isPart ? (medico.valor_repasse_fixo_procedimento || medico.valor_repasse_fixo || 0) : (medico.valor_repasse_fixo_procedimento_convenio || medico.valor_repasse_fixo_convenio || 0))
            : (isPart ? (medico.valor_repasse_fixo || 0) : (medico.valor_repasse_fixo_convenio || 0));
        }
      }

      if (valorRepasse <= 0) {
        erros.push({ os_id: os.id, paciente: os.paciente_nome, medico: medico.nome, cat: categoriaId, tipo: tipoServico, valor: valorFinal, erro: 'Repasse=0' });
        continue;
      }

      const valorClinica = Math.round((valorFinal - valorRepasse - (os.valor_repasse_laboratorio || 0)) * 100) / 100;

      resultados.push({
        os_id: os.id,
        numero_os: os.numero_os,
        paciente: os.paciente_nome,
        medico: medico.nome,
        tipo: tipoServico,
        valor_final: valorFinal,
        repasse: valorRepasse,
        clinica: valorClinica
      });

      if (!dryRun) {
        await base44.asServiceRole.entities.OrdemServico.update(os.id, {
          valor_repasse_medico: valorRepasse,
          valor_clinica: valorClinica
        });
      }
    }

    return Response.json({
      modo: dryRun ? 'SIMULAÇÃO' : 'APLICADO',
      batch,
      os_total_carregadas: (allOS || []).length,
      os_marco_zeradas: osMar.length,
      corrigidas: resultados.length,
      erros_count: erros.length,
      resultados,
      erros
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});