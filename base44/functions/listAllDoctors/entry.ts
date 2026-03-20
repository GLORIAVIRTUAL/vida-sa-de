import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const medicos = await base44.asServiceRole.entities.Medico.list();
        const nomes = medicos.map(m => ({id: m.id, nome: m.nome}));

        return Response.json({ count: nomes.length, nomes });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});