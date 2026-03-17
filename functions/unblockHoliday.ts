import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    const medicos = await base44.asServiceRole.entities.Medico.list();

    let atualizados = 0;

    for (const medico of medicos) {
      const horarios = medico.horarios_atendimento || [];
      const horariosAtualizados = horarios.filter(h => !(h.data_especifica === data_feriado && h.bloqueado === true));
      
      if (horariosAtualizados.length !== horarios.length) {
        await base44.asServiceRole.entities.Medico.update(medico.id, {
          horarios_atendimento: horariosAtualizados
        });
        atualizados++;
      }
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