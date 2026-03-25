import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const tPacs = await base44.asServiceRole.entities.Paciente.list('-created_date', 5000);
    const pF = tPacs.filter(p => (p.telefone || '').replace(/\D/g, '').slice(-8) === "88020504");
    
    const pIds = pF.map(p => p.id);
    const hj = "2026-03-25";
    const tAgs = await base44.asServiceRole.entities.Agendamento.filter({data_agendamento: {$gte: hj}});
    const aC = tAgs.filter(a => pIds.includes(a.paciente_id) && ['Agendado', 'Confirmado', 'Pago'].includes(a.status));
    
    return Response.json({ 
        pacientes_encontrados: pF.map(p => ({ id: p.id, nome: p.nome, telefone: p.telefone })),
        agendamentos: aC.map(a => ({ id: a.id, paciente_nome: a.paciente_nome, data: a.data_agendamento, horario: a.horario }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});