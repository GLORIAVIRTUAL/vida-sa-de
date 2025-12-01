import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let body = {};
        try { body = await req.json(); } catch (e) {}
        const { fix = false } = body;

        // 1. Buscar referências (limite alto para garantir que pegamos todos)
        const medicos = await base44.entities.Medico.list('', 1000);
        const pacientes = await base44.entities.Paciente.list('', 1000); // Verificando os 1000 mais recentes/padrão
        
        const medicosIds = new Set(medicos.map(m => m.id));
        const pacientesIds = new Set(pacientes.map(p => p.id));

        // 2. Buscar Agendamentos recentes
        const agendamentos = await base44.entities.Agendamento.list('-data_agendamento', 500);

        const issues = [];
        const fixedIds = [];

        for (const ag of agendamentos) {
            // Verificar Médico Inexistente
            // O frontend quebra se o médico do agendamento não estiver na lista carregada
            if (ag.medico_id && !medicosIds.has(ag.medico_id)) {
                issues.push({
                    type: 'medico_missing',
                    agendamento_id: ag.id,
                    data: ag.data_agendamento,
                    horario: ag.horario,
                    medico_id: ag.medico_id,
                    description: `Agendamento dia ${ag.data_agendamento} (${ag.horario}) aponta para médico ID ${ag.medico_id} que não existe ou não foi carregado.`
                });

                if (fix) {
                    // Remove o ID inválido para evitar crash
                    await base44.entities.Agendamento.update(ag.id, { medico_id: null });
                    fixedIds.push(ag.id);
                }
            }

            // Verificar Paciente Inexistente
            if (ag.paciente_id && !pacientesIds.has(ag.paciente_id)) {
                 issues.push({
                    type: 'paciente_missing',
                    agendamento_id: ag.id,
                     data: ag.data_agendamento,
                    horario: ag.horario,
                    paciente_id: ag.paciente_id,
                    description: `Agendamento dia ${ag.data_agendamento} (${ag.horario}) aponta para paciente ID ${ag.paciente_id} não encontrado.`
                });
            }
        }

        return Response.json({
            total_agendamentos_verificados: agendamentos.length,
            total_medicos_db: medicos.length,
            total_pacientes_db: pacientes.length,
            issues_found: issues.length,
            issues,
            fixed,
            fixed_ids: fixedIds
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});