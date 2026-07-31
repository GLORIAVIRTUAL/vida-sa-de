import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Ao cancelar uma OS com repasse já realizado, cria um lançamento de estorno
 * vinculado à OS e marca o repasse como não realizado.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const event = payload?.event || {};
    const data = payload?.data;
    const oldData = payload?.old_data;
    const entityId = event?.entity_id;

    if (event?.type !== 'update' || event?.entity_name !== 'OrdemServico') {
      return Response.json({ message: 'Evento não aplicável.', skipped: true });
    }

    if (data?.status_pagamento !== 'Cancelado' || oldData?.status_pagamento === 'Cancelado') {
      return Response.json({ message: 'OS não foi cancelada agora, ignorando.', skipped: true });
    }

    if (!entityId) {
      return Response.json({ error: 'entity_id ausente' }, { status: 400 });
    }

    const os = payload?.payload_too_large || !data
      ? await base44.asServiceRole.entities.OrdemServico.get(entityId)
      : data;
    const valorRepasse = Number(oldData?.valor_repasse_medico ?? os?.valor_repasse_medico ?? 0);
    const repasseRealizado = oldData?.repasse_realizado === true || os?.repasse_realizado === true;

    if (!repasseRealizado || valorRepasse <= 0) {
      return Response.json({ message: 'Sem repasse realizado para estornar', skipped: true });
    }

    const estornosExistentes = await base44.asServiceRole.entities.Lancamento.filter({
      ordem_servico_id: entityId,
      categoria: 'Repasse Médico',
      tipo: 'Entrada'
    });

    if (estornosExistentes.length > 0) {
      return Response.json({ message: 'Estorno já registrado', skipped: true });
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

    await base44.asServiceRole.entities.OrdemServico.update(entityId, {
      repasse_realizado: false
    });

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