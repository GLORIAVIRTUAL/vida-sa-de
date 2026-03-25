import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({ data_agendamento: "2026-04-01" });
    const agendamentos2 = await base44.asServiceRole.entities.Agendamento.filter({ data_agendamento: "2026-04-03" });
    
    return Response.json({ 
        agendamentos: agendamentos.map(a => ({ id: a.id, paciente_id: a.paciente_id, paciente_nome: a.paciente_nome, horario: a.horario, medico_id: a.medico_id, status: a.status })),
        agendamentos2: agendamentos2.map(a => ({ id: a.id, paciente_id: a.paciente_id, paciente_nome: a.paciente_nome, horario: a.horario, medico_id: a.medico_id, status: a.status }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});