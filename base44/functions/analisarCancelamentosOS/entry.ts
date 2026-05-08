import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Buscar OSs canceladas em abril/2026
    const dataInicio = '2026-04-01';
    const dataFim = '2026-04-30';

    const canceladas = await base44.asServiceRole.entities.OrdemServico.filter({
      status_pagamento: 'Cancelado',
      data_execucao: { $gte: dataInicio, $lte: dataFim }
    }, '-updated_date', 1000);

    // Agrupar por created_by (não temos campo "cancelado_por" — só temos quem criou)
    const porCriador = {};
    const detalhes = [];

    for (const os of canceladas) {
      const criador = os.created_by || 'desconhecido';
      if (!porCriador[criador]) {
        porCriador[criador] = { count: 0, valor_total: 0 };
      }
      porCriador[criador].count++;
      porCriador[criador].valor_total += (os.valor_final || 0);

      detalhes.push({
        id: os.id,
        numero_os: os.numero_os,
        paciente_nome: os.paciente_nome,
        data_execucao: os.data_execucao,
        updated_date: os.updated_date,
        created_by: os.created_by,
        valor_final: os.valor_final,
        observacoes: os.observacoes
      });
    }

    return Response.json({
      total_canceladas: canceladas.length,
      periodo: `${dataInicio} a ${dataFim}`,
      por_criador: porCriador,
      detalhes: detalhes.sort((a, b) => (b.updated_date || '').localeCompare(a.updated_date || ''))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});