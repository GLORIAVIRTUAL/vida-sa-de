import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Estratégia de busca paralela para performance
        let totalPacientes = 0;
        let offset = 0;
        const limit = 1000;
        const parallelRequests = 5; // Fazer 5 requisições simultâneas
        let hasMore = true;
        
        while (hasMore) {
            const promises = [];
            for (let i = 0; i < parallelRequests; i++) {
                const currentOffset = offset + (i * limit);
                // 'id' é menor que 'nome' se a intenção for só contar? 
                // O list não aceita projeção, então tanto faz o sort. Usando created_date que costuma ser indexado.
                promises.push(base44.entities.Paciente.list('-created_date', limit, currentOffset)
                    .then(res => Array.isArray(res) ? res.length : 0)
                    .catch(err => {
                        console.error(`Erro no offset ${currentOffset}:`, err);
                        return 0;
                    })
                );
            }

            const counts = await Promise.all(promises);
            const totalChunk = counts.reduce((a, b) => a + b, 0);
            totalPacientes += totalChunk;

            // Se algum lote retornou menos que o limite, ou a soma do chunk é menor que o esperado para um chunk cheio
            // Significa que chegamos ao fim.
            // Chunk cheio esperado = parallelRequests * limit
            
            if (totalChunk < (parallelRequests * limit)) {
                hasMore = false;
            } else {
                offset += (limit * parallelRequests);
            }
            
            // Safety break para evitar loop infinito em caso de erro bizarro
            if (offset > 100000) hasMore = false;
        }

        return Response.json({ totalPacientes });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});