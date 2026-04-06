import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { date } = await req.json();
    if (!date) {
      return Response.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });
    }

    // Buscar todas as OS do dia (excluindo canceladas)
    const allOS = await base44.asServiceRole.entities.OrdemServico.filter(
      { data_execucao: date, status_pagamento: { $ne: 'Cancelado' } },
      'created_date',
      500
    );

    let totalFaturamento = 0;
    let totalRepasse = 0;
    let totalImposto = 0;
    let totalClinica = 0;
    const detalhes = [];

    for (const os of allOS) {
      const vf = os.valor_final || 0;
      const rep = os.valor_repasse_medico || 0;
      const imp = os.valor_imposto || 0;
      const repLab = os.valor_repasse_laboratorio || 0;
      const cli = vf - rep - repLab - imp;

      totalFaturamento += vf;
      totalRepasse += rep;
      totalImposto += imp;
      totalClinica += cli;

      detalhes.push({
        paciente: os.paciente_nome || '-',
        tipo: os.tipo_servico || '-',
        descricao: os.itens?.[0]?.descricao || '-',
        pagamento: os.forma_pagamento || '-',
        valor_final: vf,
        repasse: rep,
        imposto: imp,
        clinica: cli,
        status: os.status_pagamento || 'Pendente'
      });
    }

    return Response.json({
      date,
      total_os: allOS.length,
      total_faturamento: Math.round(totalFaturamento * 100) / 100,
      total_repasse: Math.round(totalRepasse * 100) / 100,
      total_imposto: Math.round(totalImposto * 100) / 100,
      total_clinica: Math.round(totalClinica * 100) / 100,
      detalhes
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});