import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data_feriado } = await req.json();

    if (!data_feriado) {
      return Response.json({ error: 'data_feriado é obrigatório' }, { status: 400 });
    }

    // Buscar todos os médicos
    const medicos = await base44.asServiceRole.entities.Medico.list();

    let atualizados = 0;

    for (const medico of medicos) {
      const horarios = medico.horarios_atendimento || [];

      // Verificar se já existe bloqueio para essa data
      const jaBloqueado = horarios.some(h => h.data_especifica === data_feriado && h.bloqueado === true);
      if (jaBloqueado) continue;

      horarios.push({
        data_especifica: data_feriado,
        recorrencia: "Apenas uma vez",
        bloqueado: true,
        horario_inicio: "00:00",
        horario_fim: "23:59",
        dia_semana: null
      });

      await base44.asServiceRole.entities.Medico.update(medico.id, {
        horarios_atendimento: horarios
      });

      atualizados++;
    }

    return Response.json({
      success: true,
      total_medicos: medicos.length,
      medicos_atualizados: atualizados,
      data_feriado
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});