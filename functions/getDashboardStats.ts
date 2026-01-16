import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Contagem rápida: busca apenas 1 registro para verificar se há pacientes
        // e usa um valor estimado baseado em batches pequenos
        let totalPacientes = 0;
        
        try {
            // Conta em batches menores para evitar timeout
            const batch1 = await base44.entities.Paciente.list('-created_date', 50, 0);
            if (!Array.isArray(batch1) || batch1.length === 0) {
                return Response.json({ totalPacientes: 0 });
            }
            
            // Se tem registros, faz uma estimativa rápida
            // Busca alguns pontos para estimar o total
            const batch2 = await base44.entities.Paciente.list('-created_date', 50, 5000);
            const batch3 = await base44.entities.Paciente.list('-created_date', 50, 10000);
            const batch4 = await base44.entities.Paciente.list('-created_date', 50, 20000);
            const batch5 = await base44.entities.Paciente.list('-created_date', 50, 25000);
            
            // Estima baseado no último batch com dados
            if (Array.isArray(batch5) && batch5.length > 0) {
                totalPacientes = 25000 + batch5.length;
            } else if (Array.isArray(batch4) && batch4.length > 0) {
                totalPacientes = 20000 + batch4.length;
            } else if (Array.isArray(batch3) && batch3.length > 0) {
                totalPacientes = 10000 + batch3.length;
            } else if (Array.isArray(batch2) && batch2.length > 0) {
                totalPacientes = 5000 + batch2.length;
            } else {
                totalPacientes = batch1.length;
            }
            
        } catch (err) {
            console.error('Erro ao estimar pacientes:', err);
            totalPacientes = 0;
        }

        return Response.json({ totalPacientes });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});