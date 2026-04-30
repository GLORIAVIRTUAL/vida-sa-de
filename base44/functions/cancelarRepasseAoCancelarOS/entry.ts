import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

/**
 * Quando uma OS com repasse_realizado=true é cancelada,
 * cria automaticamente um lançamento de ESTORNO (Entrada) na categoria Repasse Médico
 * para anular o repasse já lançado, evitando inflação na DRE.
 *
 * Trigger: entity automation on OrdemServico update, quando status_pagamento muda para "Cancelado".
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const event = payload?.event || {};
    const data = payload?.data;
    const oldData = payload?.old_data;
    const entityId = event?.entity_id;

    const novoStatus = data?.status_pagamento;
    const statusAntigo = oldData?.status_pagamento;

    // Só processa se mudou para "Cancelado" agora
    if (novoStatus !== 'Cancelado' || statusAntigo === 'Cancelado') {
      return Response.json({ message: 'OS não foi cancelada agora, ignorando.', skipped: true });
    }

    if (!entityId) {
      return Response.json({ error: 'entity_id ausente' }, { status: 400 });
    }

    // Carrega OS atualizada se payload veio truncado
    let os = data;
    if (payload?.payload_too_large || !os) {
      os = await base44.asServiceRole.entities.OrdemServico.get(entityId);
    }

    // Só cria estorno se o repasse foi efetivamente realizado
    const valorRepasse = os?.valor_repasse_medico || 0;
    const repasseRealizado = os?.repasse_realizado === true;

    if (!repasseRealizado || valorRepasse <= 0) {
      console.log(`ℹ️ OS ${entityId} cancelada, mas não tinha repasse realizado. Nada a estornar.`);
      return Response.json({ message: 'Sem repasse realizado para estornar', skipped: true });
    }

    // Verifica se já não foi estornado antes (idempotência)
    const estornosExistentes = await base44.asServiceRole.entities.Lancamento.filter({
      ordem_servico_id: entityId,
      categoria: 'Repasse Médico',
      tipo: 'Entrada'
    });

    if (estornosExistentes && estornosExistentes.length > 0) {
      console.log(`⚠️ Estorno já existe para OS ${entityId}. Ignorando.`);
      return Response.json({ message: 'Estorno já registrado', skipped: true });
    }

    // Busca nome do médico
    let nomeMedico = '';
    if (os.medico_id) {
      try {
        const medico = await base44.asServiceRole.entities.Medico.get(os.medico_id);
        nomeMedico = medico?.nome || '';
      } catch (e) {
        nomeMedico = '';
      }
    }

    // Cria lançamento de ESTORNO (Entrada na mesma categoria para anular o impacto)
    const hoje = new Date().toISOString().split('T')[0];
    const estorno = await base44.asServiceRole.entities.Lancamento.create({
      tipo: 'Entrada',
      categoria: 'Repasse Médico',
      descricao: `ESTORNO Repasse - OS ${os.numero_os || entityId.substring(0, 8)} cancelada${nomeMedico ? ` - Dr(a). ${nomeMedico}` : ''}`,
      valor: valorRepasse,
      data_lancamento: hoje,
      forma_pagamento: 'Dinheiro',
      ordem_servico_id: entityId,
      medico_id: os.medico_id || null,
      status: 'Realizado',
      observacoes: `Estorno automático em ${new Date().toLocaleString('pt-BR')} - OS cancelada (paciente: ${os.paciente_nome || 'N/A'}, data execução: ${os.data_execucao})`
    });

    // Atualiza a OS marcando o repasse como não-realizado
    await base44.asServiceRole.entities.OrdemServico.update(entityId, {
      repasse_realizado: false
    });

    console.log(`✅ Estorno R$ ${valorRepasse} criado para OS ${entityId}`);

    return Response.json({
      message: 'Estorno de repasse criado com sucesso',
      os_id: entityId,
      valor_estornado: valorRepasse,
      lancamento_estorno_id: estorno.id
    });
  } catch (error) {
    console.error('❌ Erro ao estornar repasse:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});