import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Contagem total de pacientes (loop para superar limites de paginação)
        let totalPacientes = 0;
        let offset = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
            // 'nome' é usado para ordenação, mas não afeta a contagem
            const batch = await base44.entities.Paciente.list('nome', limit, offset);
            const count = Array.isArray(batch) ? batch.length : 0;
            
            totalPacientes += count;
            
            if (count < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        }

        return Response.json({ totalPacientes });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});