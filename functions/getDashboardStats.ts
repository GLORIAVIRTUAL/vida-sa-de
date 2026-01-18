import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let totalPacientes = 0;
        
        try {
            // Contagem precisa usando busca binária
            // Primeiro, verificar se há pacientes
            const first = await base44.entities.Paciente.list('-created_date', 1, 0);
            if (!Array.isArray(first) || first.length === 0) {
                return Response.json({ totalPacientes: 0 });
            }
            
            // Busca binária para encontrar o total exato
            let low = 0;
            let high = 100000; // Máximo esperado
            
            // Primeiro, encontrar um limite superior
            let testSkip = 1000;
            while (testSkip <= high) {
                const test = await base44.entities.Paciente.list('-created_date', 1, testSkip);
                if (!Array.isArray(test) || test.length === 0) {
                    high = testSkip;
                    break;
                }
                low = testSkip;
                testSkip *= 2;
            }
            
            // Busca binária refinada
            while (low < high - 1) {
                const mid = Math.floor((low + high) / 2);
                const test = await base44.entities.Paciente.list('-created_date', 1, mid);
                if (Array.isArray(test) && test.length > 0) {
                    low = mid;
                } else {
                    high = mid;
                }
            }
            
            // O total é low + 1 (pois skip é 0-indexed)
            // Verificar exatamente quantos existem a partir de low
            const finalBatch = await base44.entities.Paciente.list('-created_date', 100, low);
            totalPacientes = low + (Array.isArray(finalBatch) ? finalBatch.length : 0);
            
        } catch (err) {
            console.error('Erro ao contar pacientes:', err);
            totalPacientes = 0;
        }

        return Response.json({ totalPacientes });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});