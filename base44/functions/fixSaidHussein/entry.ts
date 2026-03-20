import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // IDs identificados
        const idErradoRamao = "6967d7f6de081dae6837a4b9";
        const idCorretoLidiane = "6967d7f6de081dae6837a4bc";
        
        // Buscar agendamentos de SAID HUSSEIN com o médico errado
        const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            paciente_nome: { "$options": "i", "$regex": "SAID HUSSEIN" },
            medico_id: idErradoRamao
        });

        let updatedCount = 0;
        
        for (const ag of agendamentos) {
            // Verifica se tem observação mencionando Lidiane
            if (ag.observacoes && ag.observacoes.toLowerCase().includes("lidiane")) {
                await base44.asServiceRole.entities.Agendamento.update(ag.id, {
                    medico_id: idCorretoLidiane
                });
                updatedCount++;
            }
        }

        return Response.json({ 
            success: true, 
            message: `Atualizados ${updatedCount} agendamentos de SAID HUSSEIN para Dra. Lidiane`,
            updatedCount 
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});