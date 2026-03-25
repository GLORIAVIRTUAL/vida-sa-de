import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const ags = await base44.asServiceRole.entities.Agendamento.filter({ data_agendamento: "2026-04-01", horario: "17:00" });
    const ags2 = await base44.asServiceRole.entities.Agendamento.filter({ data_agendamento: "2026-04-03", horario: "10:00" });
    
    return Response.json({ 
        ags: ags.map(a => ({ id: a.id, paciente_nome: a.paciente_nome, medico_id: a.medico_id })),
        ags2: ags2.map(a => ({ id: a.id, paciente_nome: a.paciente_nome, medico_id: a.medico_id }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});