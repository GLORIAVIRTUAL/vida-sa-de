import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body = {};
        try { body = await req.json(); } catch (e) {}

        const { dataInicio, dataFim } = body;

        // Construir filtro de data
        const filtro = {};
        if (dataInicio || dataFim) {
            filtro.data_execucao = {};
            if (dataInicio) filtro.data_execucao.$gte = dataInicio;
            if (dataFim) filtro.data_execucao.$lte = dataFim;
        }

        let ordens;
        if (Object.keys(filtro).length > 0) {
            ordens = await base44.asServiceRole.entities.OrdemServico.filter(filtro, "-data_execucao", 2000);
        } else {
            ordens = await base44.asServiceRole.entities.OrdemServico.list("-data_execucao", 2000);
        }

        return Response.json({ ordens });

    } catch (error) {
        console.error('Erro na função listOrdensServico:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});