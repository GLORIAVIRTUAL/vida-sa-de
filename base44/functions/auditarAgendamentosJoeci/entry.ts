import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const normalizar = (texto = '') => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const body = await req.json().catch(() => ({}));
    const dataFiltro = body?.data || null;

    const medicos = await base44.asServiceRole.entities.Medico.list();
    const joeci = medicos.find((item) => {
      const data = item.data || item;
      return normalizar(data.nome).includes('joeci') && normalizar(data.nome).includes('oliveira');
    });

    if (!joeci) {
      return Response.json({ error: 'Joeci de Oliveira não encontrada' }, { status: 404 });
    }

    const agendamentosResposta = await base44.asServiceRole.entities.Agendamento.list();
    const ordensResposta = await base44.asServiceRole.entities.OrdemServico.list();
    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.items)) return value.items;
      if (Array.isArray(value?.data)) return value.data;
      return [];
    };

    const agendamentos = toArray(agendamentosResposta);
    const ordens = toArray(ordensResposta);

    const agendamentosJoeci = agendamentos
      .map((item) => ({ id: item.id, ...(item.data || item) }))
      .filter((item) => item.medico_id === joeci.id || (item.itens_servico || []).some((servico) => servico.medico_id === joeci.id));

    const ordensJoeci = ordens
      .map((item) => ({ id: item.id, ...(item.data || item) }))
      .filter((item) => item.medico_id === joeci.id);

    const datas = new Set([
      ...agendamentosJoeci.map((item) => item.data_agendamento).filter(Boolean),
      ...ordensJoeci.map((item) => item.data_execucao).filter(Boolean),
    ]);

    const resumoPorDia = Array.from(datas).sort().reverse().map((data) => {
      const ags = agendamentosJoeci.filter((item) => item.data_agendamento === data);
      const oss = ordensJoeci.filter((item) => item.data_execucao === data);
      return {
        data,
        total_agendamentos: ags.length,
        total_agendamentos_ativos: ags.filter((item) => item.status !== 'Cancelado').length,
        total_os: oss.length,
        total_os_consulta: oss.filter((item) => item.tipo_servico === 'Consulta').length,
        pacientes_agendamentos: ags.map((item) => ({ id: item.id, paciente_nome: item.paciente_nome, horario: item.horario, status: item.status })),
        pacientes_os: oss.map((item) => ({ id: item.id, numero_os: item.numero_os, paciente_nome: item.paciente_nome, tipo_servico: item.tipo_servico, valor_repasse_medico: item.valor_repasse_medico })),
      };
    });

    const detalhado = dataFiltro
      ? resumoPorDia.find((item) => item.data === dataFiltro) || null
      : null;

    return Response.json({
      medico_id: joeci.id,
      medico_nome: (joeci.data || joeci).nome,
      total_agendamentos_joeci: agendamentosJoeci.length,
      total_os_joeci: ordensJoeci.length,
      resumo_por_dia: resumoPorDia.slice(0, 20),
      detalhado,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});