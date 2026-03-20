import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        // 0. Setup
        const base44 = createClientFromRequest(req);
        let body = {};
        try { body = await req.json(); } catch (_) {}
        const { fix = false } = body;
        const logs = [];

        logs.push("Starting check (Parallel Mode)...");

        // 1. Fetch Data Parallelly
        // Limit Pacientes to 1000 (should be enough for consistency check of recent items)
        // Limit Agendamentos to 200 (most recent) to avoid timeout
        const [medicosRes, pacientesRes, agendamentosRes] = await Promise.allSettled([
            base44.entities.Medico.list(),
            base44.entities.Paciente.list('-created_date', 1000), 
            base44.entities.Agendamento.list('-created_date', 200) 
        ]);

        const medicos = medicosRes.status === 'fulfilled' ? medicosRes.value : [];
        const pacientes = pacientesRes.status === 'fulfilled' ? pacientesRes.value : [];
        const agendamentos = agendamentosRes.status === 'fulfilled' ? agendamentosRes.value : [];

        if (medicosRes.status === 'rejected') logs.push("Error fetching Medicos: " + medicosRes.reason);
        if (pacientesRes.status === 'rejected') logs.push("Error fetching Pacientes: " + pacientesRes.reason);
        if (agendamentosRes.status === 'rejected') logs.push("Error fetching Agendamentos: " + agendamentosRes.reason);

        logs.push(`Fetched: ${medicos.length} medicos, ${pacientes.length} pacientes, ${agendamentos.length} agendamentos`);

        const medicosIds = new Set(medicos.map(m => m.id));
        const pacientesIds = new Set(pacientes.map(p => p.id));

        const issues = [];
        const fixedIds = [];

        // 2. Analyze
        for (const ag of agendamentos) {
            let issueType = null;
            let issueDesc = null;
            
            // Validate Date
            if (!ag.data_agendamento) {
                issueType = 'date_missing';
                issueDesc = 'Data ausente';
            } else if (!/^\d{4}-\d{2}-\d{2}$/.test(ag.data_agendamento)) {
                issueType = 'date_invalid';
                issueDesc = `Data inválida: ${ag.data_agendamento}`;
            }

            // Validate Time
            if (!issueType && !ag.horario) {
                issueType = 'time_missing';
                issueDesc = 'Horário ausente';
            }

            // Validate Medico (only if medico_id is present)
            if (!issueType && ag.medico_id && !medicosIds.has(ag.medico_id)) {
                issueType = 'medico_missing';
                issueDesc = `Médico ID ${ag.medico_id} não encontrado`;
            }
            
            // Validate Paciente
            if (!issueType && ag.paciente_id && !pacientesIds.has(ag.paciente_id)) {
                 // Optional: we can flag this but usually it doesn't crash the calendar if handled in UI
                 // issues.push({ type: 'paciente_missing', ... })
            }

            if (issueType) {
                issues.push({
                    agendamento_id: ag.id,
                    type: issueType,
                    description: issueDesc,
                    data: ag.data_agendamento || 'N/A',
                    horario: ag.horario || 'N/A'
                });

                if (fix) {
                    try {
                        if (['date_missing', 'date_invalid', 'time_missing'].includes(issueType)) {
                            await base44.entities.Agendamento.delete(ag.id);
                            fixedIds.push(ag.id);
                        } else if (issueType === 'medico_missing') {
                            await base44.entities.Agendamento.update(ag.id, { medico_id: null });
                            fixedIds.push(ag.id);
                        }
                    } catch (err) {
                        logs.push(`Failed to fix ${ag.id}: ${err.message}`);
                    }
                }
            }
        }

        return Response.json({
            success: true,
            total_agendamentos_verificados: agendamentos.length,
            total_medicos_db: medicos.length,
            issues_found: issues.length,
            issues,
            fixed: fix,
            fixed_ids: fixedIds,
            logs
        });

    } catch (error) {
        // Return 200 with error details to avoid generic 500 in frontend
        return Response.json({ 
            success: false, 
            error: error.message,
            stack: error.stack
        }, { status: 200 });
    }
});