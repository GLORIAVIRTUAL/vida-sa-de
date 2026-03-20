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

        // Find all agendamentos for Dr. Antuan on this date
        const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            data_agendamento: dataAgendamento,
            medico_id: medicoId
        }, '', 100);

        let updatedOrdens = 0;
        let foundIssues = [];

        for (const agendamento of agendamentos) {
            // Find corresponding OrdemServico records
            const ordens = await base44.asServiceRole.entities.OrdemServico.filter({
                agendamento_id: agendamento.id
            });
            
            for (const os of ordens) {
                if (os.medico_id !== medicoId) {
                    foundIssues.push({
                        os_id: os.id,
                        paciente: os.paciente_nome,
                        old_medico_id: os.medico_id
                    });
                    
                    await base44.asServiceRole.entities.OrdemServico.update(os.id, {
                        medico_id: medicoId
                    });
                    updatedOrdens++;
                }
            }
        }

        return Response.json({ 
            success: true, 
            agendamentosCount: agendamentos.length,
            updatedOrdens,
            foundIssues
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});