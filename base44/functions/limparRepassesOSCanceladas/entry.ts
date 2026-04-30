import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

/**
 * Cria estornos retroativos para todas as OSs canceladas que têm repasse_realizado=true
 * mas não possuem ainda um lançamento de estorno.
 * Apenas admin.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && user?.app_role !== 'admin') {
      return Response.json({ error: 'Apenas admin pode executar.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const dataInicio = body?.data_inicio || null; // ex: '2026-04-01'
    const dataFim = body?.data_fim || null; // ex: '2026-04-30'

    // Filtro de OS canceladas com repasse realizado
    const filtro = {
      status_pagamento: 'Cancelado',
      repasse_realizado: true
    };
    if (dataInicio && dataFim) {
      filtro.data_execucao = { $gte: dataInicio, $lte: dataFim };
    }

    const osCanceladas = await base44.asServiceRole.entities.OrdemServico.filter(filtro, undefined, 5000);
    const osComRepasse = osCanceladas.filter(os => (os.valor_repasse_medico || 0) > 0);

    console.log(`📊 ${osComRepasse.length} OS canceladas com repasse realizado encontradas`);

    // Buscar todos os estornos (Entradas em Repasse Médico) para evitar duplicar
    const estornosExistentes = await base44.asServiceRole.entities.Lancamento.filter({
      categoria: 'Repasse Médico',
      tipo: 'Entrada'
    }, undefined, 5000);
    const osIdsJaEstornadas = new Set(
      estornosExistentes.filter(e => e.ordem_servico_id).map(e => e.ordem_servico_id)
    );

    const aProcessar = osComRepasse.filter(os => !osIdsJaEstornadas.has(os.id));
    const valorTotal = aProcessar.reduce((s, o) => s + (o.valor_repasse_medico || 0), 0);

    console.log(`🎯 ${aProcessar.length} estornos a criar (R$ ${valorTotal.toFixed(2)})`);

    const detalhes = aProcessar.slice(0, 50).map(os => ({
      os_id: os.id,
      data: os.data_execucao,
      paciente: os.paciente_nome,
      medico_id: os.medico_id,
      valor_repasse: os.valor_repasse_medico
    }));

    let criados = 0;
    if (!dryRun) {
      const hoje = new Date().toISOString().split('T')[0];
      const chunkSize = 5;

      for (let i = 0; i < aProcessar.length; i += chunkSize) {
        const chunk = aProcessar.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async os => {
          await base44.asServiceRole.entities.Lancamento.create({
            tipo: 'Entrada',
            categoria: 'Repasse Médico',
            descricao: `ESTORNO Repasse - OS ${os.numero_os || os.id.substring(0, 8)} cancelada`,
            valor: os.valor_repasse_medico || 0,
            data_lancamento: hoje,
            forma_pagamento: 'Dinheiro',
            ordem_servico_id: os.id,
            medico_id: os.medico_id || null,
            status: 'Realizado',
            observacoes: `Estorno retroativo em ${new Date().toLocaleString('pt-BR')} - OS cancelada (paciente: ${os.paciente_nome || 'N/A'}, data execução: ${os.data_execucao})`
          });
          await base44.asServiceRole.entities.OrdemServico.update(os.id, { repasse_realizado: false });
        }));
        criados += chunk.length;
        await new Promise(r => setTimeout(r, 250));
      }
    }

    return Response.json({
      message: dryRun
        ? `[DRY-RUN] ${aProcessar.length} estornos seriam criados`
        : `✅ ${criados} estornos criados`,
      total_os_canceladas_com_repasse: osComRepasse.length,
      ja_estornadas_anteriormente: osComRepasse.length - aProcessar.length,
      estornos_pendentes: aProcessar.length,
      valor_total_estornar: valorTotal,
      detalhes,
      dry_run: dryRun,
      filtro_periodo: dataInicio && dataFim ? { dataInicio, dataFim } : 'Todos os períodos'
    });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});