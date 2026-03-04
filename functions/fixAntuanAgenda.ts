import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const medicoId = '6967d7f6de081dae6837a4b3'; // Dr. Antuan
        const dataAgendamento = '2026-02-13';

        // Find all agendamentos on this date with missing medico_id
        const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            data_agendamento: dataAgendamento,
            medico_id: null
        }, '', 100);

        let updatedAgendamentos = 0;
        let updatedOrdens = 0;

        for (const agendamento of agendamentos) {
            // Update Agendamento
            await base44.asServiceRole.entities.Agendamento.update(agendamento.id, {
                medico_id: medicoId
            });
            updatedAgendamentos++;

            // Find and update corresponding OrdemServico records
            const ordens = await base44.asServiceRole.entities.OrdemServico.filter({
                agendamento_id: agendamento.id
            });
            
            for (const os of ordens) {
                if (os.medico_id !== medicoId) {
                    await base44.asServiceRole.entities.OrdemServico.update(os.id, {
                        medico_id: medicoId
                    });
                    updatedOrdens++;
                }
            }
        }

        return Response.json({ 
            success: true, 
            updatedAgendamentos, 
            updatedOrdens,
            pacientes: agendamentos.map(a => a.paciente_nome)
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});