import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Consumir o corpo da requisição se houver, para evitar problemas de stream não lido
        try { await req.json(); } catch (e) {}

        // Listar ordens de serviço ordenadas pela data de execução (realizadas)
        // Ordenação decrescente (-data_execucao) para mostrar as mais recentes primeiro
        const ordens = await base44.asServiceRole.entities.OrdemServico.list("-data_execucao", 500);

        return Response.json({ ordens });

    } catch (error) {
        console.error('Erro na função listOrdensServico:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});