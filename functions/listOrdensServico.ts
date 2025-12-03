import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Listar ordens de serviço ordenadas pela data de criação (mais recentes primeiro)
        // Isso garante que as últimas "realizadas" (inseridas no sistema) apareçam no topo
        const ordens = await base44.asServiceRole.entities.OrdemServico.list("-created_date", 500);

        return Response.json({ ordens });

    } catch (error) {
        console.error('Erro ao listar OS:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});