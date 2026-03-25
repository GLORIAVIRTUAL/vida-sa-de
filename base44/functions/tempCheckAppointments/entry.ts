import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Search for patient
    const pacientes = await base44.asServiceRole.entities.Paciente.filter({ nome: { $regex: "Thiago", $options: "i" } });
    const thiago = pacientes.find(p => p.nome.toLowerCase().includes("cavalcanti"));
    
    if (!thiago) {
        return Response.json({ error: "Patient not found" });
    }

    const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({ paciente_id: thiago.id });
    const futuros = agendamentos.filter(a => a.data_agendamento >= "2026-03-25" && ['Agendado', 'Confirmado', 'Pago'].includes(a.status));
    
    return Response.json({ 
        paciente: thiago,
        futuros: futuros.map(a => ({ 
            id: a.id, 
            data: a.data_agendamento, 
            horario: a.horario, 
            medico_id: a.medico_id, 
            status: a.status,
            paciente_nome: a.paciente_nome 
        }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});