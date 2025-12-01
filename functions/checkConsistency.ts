import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let body = {};
        try { body = await req.json(); } catch (e) {}
        const { fix = false } = body;

        // 1. Buscar referências
        const medicos = await base44.entities.Medico.list('', 1000);
        const pacientes = await base44.entities.Paciente.list('', 1000);
        
        const medicosIds = new Set(medicos.map(m => m.id));
        const pacientesIds = new Set(pacientes.map(p => p.id));

        // 2. Buscar Agendamentos (aumentar limite para pegar problemas antigos se houver)
        const agendamentos = await base44.entities.Agendamento.list('-data_agendamento', 1000);

        const issues = [];
        const fixedIds = [];

        for (const ag of agendamentos) {
            let issueType = null;
            let issueDesc = null;
            let needsFix = false;

            // Check 1: Data Inválida ou Ausente
            if (!ag.data_agendamento || ag.data_agendamento.trim() === '') {
                issueType = 'date_missing';
                issueDesc = `Agendamento ID ${ag.id} sem data definida.`;
                needsFix = true;
            } else {
                // Validar formato YYYY-MM-DD
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(ag.data_agendamento)) {
                    issueType = 'date_invalid';
                    issueDesc = `Agendamento ID ${ag.id} com data inválida: "${ag.data_agendamento}".`;
                    needsFix = true;
                }
            }

            // Check 2: Horário Inválido ou Ausente
            if (!issueType && (!ag.horario || ag.horario.trim() === '')) {
                 issueType = 'time_missing';
                 issueDesc = `Agendamento ID ${ag.id} sem horário definido.`;
                 needsFix = true;
            }

            // Check 3: Médico Inexistente (mas referenciado)
            if (!issueType && ag.medico_id && !medicosIds.has(ag.medico_id)) {
                issueType = 'medico_missing';
                issueDesc = `Agendamento ${ag.data_agendamento} aponta para médico inexistente ID ${ag.medico_id}.`;
                // Não deletar o agendamento, apenas limpar o médico
                if (fix) {
                    await base44.entities.Agendamento.update(ag.id, { medico_id: null });
                    fixedIds.push(ag.id);
                }
            }

            // Check 4: Paciente Inexistente (apenas reportar, pois pode ser visualizado como N/A)
            if (!issueType && ag.paciente_id && !pacientesIds.has(ag.paciente_id)) {
                 issueType = 'paciente_missing';
                 issueDesc = `Agendamento ${ag.data_agendamento} aponta para paciente inexistente ID ${ag.paciente_id}.`;
                 // Não é crítico para crash, geralmente o frontend trata com ?.nome
            }

            if (issueType) {
                issues.push({
                    type: issueType,
                    agendamento_id: ag.id,
                    data: ag.data_agendamento,
                    horario: ag.horario,
                    description: issueDesc
                });

                if (needsFix && fix) {
                    // Para datas inválidas, deletamos o agendamento pois é lixo
                    if (issueType === 'date_missing' || issueType === 'date_invalid' || issueType === 'time_missing') {
                        await base44.entities.Agendamento.delete(ag.id);
                        fixedIds.push(ag.id);
                    }
                }
            }
        }

        return Response.json({
            total_agendamentos_verificados: agendamentos.length,
            issues_found: issues.length,
            issues,
            fixed,
            fixed_ids: fixedIds
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});