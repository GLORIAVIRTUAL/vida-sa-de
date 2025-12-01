import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let body = {};
        try { 
            // Only try to parse JSON if the request has a body
            if (req.body) {
                body = await req.json(); 
            }
        } catch (e) {
            console.warn("Failed to parse body:", e);
        }
        
        const { fix = false } = body;
        const debugLogs = [];

        debugLogs.push("Step 1: Listing Medicos...");
        // Using default sort or explicit sort if needed. Try/catch for safety.
        let medicos = [];
        try {
            medicos = await base44.entities.Medico.list();
        } catch (err) {
            debugLogs.push("Error listing Medicos: " + err.message);
            throw new Error("Falha ao listar Médicos: " + err.message);
        }

        debugLogs.push("Step 2: Listing Pacientes...");
        let pacientes = [];
        try {
            pacientes = await base44.entities.Paciente.list();
        } catch (err) {
            debugLogs.push("Error listing Pacientes: " + err.message);
            throw new Error("Falha ao listar Pacientes: " + err.message);
        }
        
        const medicosIds = new Set(medicos.map(m => m.id));
        const pacientesIds = new Set(pacientes.map(p => p.id));

        debugLogs.push("Step 3: Listing Agendamentos...");
        let agendamentos = [];
        try {
            // Getting latest appointments
            agendamentos = await base44.entities.Agendamento.list('-created_date', 500);
        } catch (err) {
             debugLogs.push("Error listing Agendamentos: " + err.message);
             throw new Error("Falha ao listar Agendamentos: " + err.message);
        }

        const issues = [];
        const fixedIds = [];

        debugLogs.push(`Step 4: Checking ${agendamentos.length} appointments...`);

        for (const ag of agendamentos) {
            let issueType = null;
            let issueDesc = null;
            let needsFix = false;

            // Safe access to properties
            const dataAgendamento = ag.data_agendamento ? String(ag.data_agendamento).trim() : '';
            const horario = ag.horario ? String(ag.horario).trim() : '';

            // Check 1: Data Inválida ou Ausente
            if (!dataAgendamento) {
                issueType = 'date_missing';
                issueDesc = `Agendamento ID ${ag.id} sem data definida.`;
                needsFix = true;
            } else {
                // Validar formato YYYY-MM-DD
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(dataAgendamento)) {
                    issueType = 'date_invalid';
                    issueDesc = `Agendamento ID ${ag.id} com data inválida: "${dataAgendamento}".`;
                    needsFix = true;
                }
            }

            // Check 2: Horário Inválido ou Ausente
            if (!issueType && !horario) {
                 issueType = 'time_missing';
                 issueDesc = `Agendamento ID ${ag.id} sem horário definido.`;
                 needsFix = true;
            }

            // Check 3: Médico Inexistente (mas referenciado)
            if (!issueType && ag.medico_id && !medicosIds.has(ag.medico_id)) {
                issueType = 'medico_missing';
                issueDesc = `Agendamento ${dataAgendamento} aponta para médico inexistente ID ${ag.medico_id}.`;
                
                if (fix) {
                    try {
                        await base44.entities.Agendamento.update(ag.id, { medico_id: null });
                        fixedIds.push(ag.id);
                    } catch (e) {
                        debugLogs.push(`Failed to fix medico_id for ${ag.id}: ${e.message}`);
                    }
                }
            }

            // Check 4: Paciente Inexistente (apenas reportar)
            if (!issueType && ag.paciente_id && !pacientesIds.has(ag.paciente_id)) {
                 issueType = 'paciente_missing';
                 issueDesc = `Agendamento ${dataAgendamento} aponta para paciente inexistente ID ${ag.paciente_id}.`;
            }

            if (issueType) {
                issues.push({
                    type: issueType,
                    agendamento_id: ag.id,
                    data: dataAgendamento,
                    horario: horario,
                    description: issueDesc
                });

                if (needsFix && fix) {
                    // Deletar agendamentos corrompidos
                    if (issueType === 'date_missing' || issueType === 'date_invalid' || issueType === 'time_missing') {
                        try {
                            await base44.entities.Agendamento.delete(ag.id);
                            fixedIds.push(ag.id);
                        } catch (e) {
                            debugLogs.push(`Failed to delete bad appointment ${ag.id}: ${e.message}`);
                        }
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
            fixed,
            fixed_ids: fixedIds,
            debug_logs: debugLogs
        });

    } catch (error) {
        return Response.json({ 
            success: false,
            error: error.message, 
            stack: error.stack 
        }, { status: 500 });
    }
});