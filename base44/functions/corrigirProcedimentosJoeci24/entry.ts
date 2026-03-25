import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const normalizar = (texto = '') => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dataAlvo = body?.data || '2026-03-24';
    const geradoPor = body?.gerado_por || 'Yasmin';
    const dryRun = body?.dryRun ?? false;

    const medicos = await base44.asServiceRole.entities.Medico.list();
    const joeci = medicos
      .map((item) => ({ id: item.id, ...(item.data || item) }))
      .find((item) => normalizar(item.nome).includes('joeci') && normalizar(item.nome).includes('oliveira'));

    if (!joeci) {
      return Response.json({ error: 'Joeci de Oliveira não encontrada' }, { status: 404 });
    }

    const ordensResposta = await base44.asServiceRole.entities.OrdemServico.list('-created_date', 5000);
    const agendamentosResposta = await base44.asServiceRole.entities.Agendamento.list('-created_date', 5000);

    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.items)) return value.items;
      if (Array.isArray(value?.data)) return value.data;
      return [];
    };

    const ordens = toArray(ordensResposta).map((item) => ({ id: item.id, ...(item.data || item) }));
    const agendamentos = toArray(agendamentosResposta).map((item) => ({ id: item.id, ...(item.data || item) }));

    const ordensParaCorrigir = ordens.filter((os) => {
      const descricaoItem = Array.isArray(os.itens) ? String(os.itens?.[0]?.descricao || '') : '';
      return os.medico_id === joeci.id &&
        os.data_execucao === dataAlvo &&
        os.gerado_por === geradoPor &&
        os.status_pagamento === 'Pago' &&
        os.tipo_servico === 'Procedimento' &&
        (os.valor_repasse_medico || 0) === 0 &&
        normalizar(descricaoItem).includes('consulta');
    });

    const agendamentosParaCorrigir = agendamentos.filter((ag) =>
      ordensParaCorrigir.some((os) => os.agendamento_id === ag.id)
    );

    const repasseCorrigido = 40.95;
    const valorClinicaCorrigido = 17.55;

    if (!dryRun) {
      for (const os of ordensParaCorrigir) {
        const itensAtualizados = Array.isArray(os.itens)
          ? os.itens.map((item) => ({
              ...item,
              tipo: 'Consulta',
              descricao: String(item.descricao || '').replace(/^Procedimento:\s*/i, '').trim(),
            }))
          : os.itens;

        await base44.asServiceRole.entities.OrdemServico.update(os.id, {
          tipo_servico: 'Consulta',
          procedimento_id: null,
          valor_repasse_medico: repasseCorrigido,
          valor_clinica: valorClinicaCorrigido,
          itens: itensAtualizados,
        });
      }

      for (const ag of agendamentosParaCorrigir) {
        await base44.asServiceRole.entities.Agendamento.update(ag.id, {
          tipo_servico: 'Consulta',
          procedimento_id: null,
        });
      }
    }

    return Response.json({
      medico_id: joeci.id,
      medico_nome: joeci.nome,
      data_alvo: dataAlvo,
      gerado_por: geradoPor,
      dryRun,
      total_ordens_corrigidas: ordensParaCorrigir.length,
      total_agendamentos_corrigidos: agendamentosParaCorrigir.length,
      pacientes: ordensParaCorrigir.map((os) => ({
        os_id: os.id,
        agendamento_id: os.agendamento_id,
        paciente_nome: os.paciente_nome,
        numero_os: os.numero_os,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});