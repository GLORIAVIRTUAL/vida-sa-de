import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (e) {}
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const adminClient = base44.asServiceRole;
        let totalPacientes = 0;
        
        try {
            // Contar pacientes paginando em lotes grandes
            let skip = 0;
            const batchSize = 1000;
            
            for (let i = 0; i < 200; i++) {
                const batch = await adminClient.entities.Paciente.list('-created_date', batchSize, skip);
                if (!Array.isArray(batch) || batch.length === 0) break;
                totalPacientes += batch.length;
                if (batch.length < batchSize) break;
                skip += batchSize;
            }
            
            console.log('Total pacientes contados:', totalPacientes);
        } catch (err) {
            console.error('Erro ao contar pacientes:', err);
            totalPacientes = 0;
        }

        return Response.json({ totalPacientes });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});