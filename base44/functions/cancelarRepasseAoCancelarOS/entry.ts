import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Ao cancelar uma OS com repasse já realizado, cria um lançamento de estorno
 * vinculado à OS e marca o repasse como não realizado.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const cancelamentoDireto = Boolean(payload?.ordem_servico_id);
    let event = payload?.event || {};
    let data = payload?.data;
    let oldData = payload?.old_data;
    const entityId = payload?.ordem_servico_id || event?.entity_id;
    const atualizacoesOS = payload?.atualizacoes_os || {};

    if (cancelamentoDireto) {
      oldData = await base44.asServiceRole.entities.OrdemServico.get(entityId);
      data = { ...oldData, ...atualizacoesOS, status_pagamento: 'Cancelado' };
      event = { type: 'update', entity_name: 'OrdemServico', entity_id: entityId };
    }

    if (event?.type !== 'update' || event?.entity_name !== 'OrdemServico' || !entityId) {
      return Response.json({ message: 'Evento não aplicável.', skipped: true });
    }

    if (data?.status_pagamento !== 'Cancelado' || (!cancelamentoDireto && oldData?.status_pagamento === 'Cancelado')) {
      return Response.json({ message: 'OS não foi cancelada agora, ignorando.', skipped: true });
    }

    const os = payload?.payload_too_large || !data
      ? await base44.asServiceRole.entities.OrdemServico.get(entityId)
      : data;
    const valorRepasse = Math.round(Number(oldData?.valor_repasse_medico ?? os?.valor_repasse_medico ?? 0) * 100) / 100;
    const repasseRealizado = oldData?.repasse_realizado === true || os?.repasse_realizado === true;
    const concluirCancelamento = (extras = {}) => base44.asServiceRole.entities.OrdemServico.update(entityId, {
      ...(cancelamentoDireto ? atualizacoesOS : {}),
      status_pagamento: 'Cancelado',
      ...extras
    });

    if (!repasseRealizado || valorRepasse <= 0) {
      if (cancelamentoDireto) await concluirCancelamento();
      return Response.json({ message: 'OS cancelada sem repasse realizado para estornar', skipped: true });
    }

    const estornosExistentes = await base44.asServiceRole.entities.Lancamento.filter({
      ordem_servico_id: entityId,
      categoria: 'Repasse Médico',
      tipo: 'Entrada'
    });

    if (estornosExistentes.length > 0) {
      await concluirCancelamento({ repasse_realizado: false, data_repasse: null });
      return Response.json({
        message: 'Estorno já registrado, nenhuma duplicidade criada',
        skipped: true,
        lancamento_estorno_id: estornosExistentes[0].id
      });
    }

    let nomeMedico = '';
    if (os.medico_id) {
      const medico = await base44.asServiceRole.entities.Medico.get(os.medico_id);
      nomeMedico = medico?.nome || '';
    }

    const agora = new Date();
    const dataLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(agora);
    const horarioLocal = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const estorno = await base44.asServiceRole.entities.Lancamento.create({
      tipo: 'Entrada',
      categoria: 'Repasse Médico',
      descricao: `ESTORNO Repasse - OS ${os.numero_os || entityId.substring(0, 8)} cancelada${nomeMedico ? ` - Dr(a). ${nomeMedico}` : ''}`,
      valor: valorRepasse,
      data_lancamento: dataLocal,
      forma_pagamento: os.forma_pagamento || 'Dinheiro',
      ordem_servico_id: entityId,
      ...(os.medico_id ? { medico_id: os.medico_id } : {}),
      status: 'Realizado',
      observacoes: `Estorno automático em ${horarioLocal} - OS cancelada (paciente: ${os.paciente_nome || 'N/A'}, data execução: ${os.data_execucao || 'N/A'})`
    });

    await concluirCancelamento({ repasse_realizado: false, data_repasse: null });

    return Response.json({
      message: 'Estorno de repasse criado com sucesso',
      os_id: entityId,
      valor_estornado: valorRepasse,
      lancamento_estorno_id: estorno.id
    });
  } catch (error) {
    console.error('Erro ao estornar repasse:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}