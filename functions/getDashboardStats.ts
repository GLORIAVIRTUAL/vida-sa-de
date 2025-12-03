import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Contagem sequencial para garantir precisão
        let totalPacientes = 0;
        let offset = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
            try {
                const batch = await base44.entities.Paciente.list('-created_date', limit, offset);
                const count = Array.isArray(batch) ? batch.length : 0;
                
                totalPacientes += count;
                offset += limit;

                // Se retornou menos que o limite, acabaram os registros
                if (count < limit) {
                    hasMore = false;
                }
                
                // Limite de segurança
                if (offset > 500000) hasMore = false;

            } catch (err) {
                console.error(`Erro ao contar pacientes no offset ${offset}:`, err);
                // Se der erro, paramos para evitar loop infinito ou dados corrompidos, 
                // mas retornamos o que já contamos.
                hasMore = false; 
            }
        }

        return Response.json({ totalPacientes });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});