import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const normalize = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body = {};
        try { body = await req.json(); } catch (e) {}
        const { termo, paciente_id, limit } = body;
        const adminClient = base44.asServiceRole;
        const maxResults = limit || 500;

        // Busca por ID direto
        if (paciente_id) {
            let skip = 0;
            const batchSize = 1000;
            for (let i = 0; i < 200; i++) {
                const batch = await adminClient.entities.Paciente.list('-created_date', batchSize, skip);
                if (!batch || batch.length === 0) break;
                const found = batch.find(p => p.id === paciente_id);
                if (found) return Response.json([found]);
                if (batch.length < batchSize) break;
                skip += batchSize;
            }
            return Response.json([]);
        }

        // Sem termo - retorna recentes
        if (!termo || String(termo).trim().length === 0) {
            const recentes = await adminClient.entities.Paciente.list('-created_date', 50);
            return Response.json(recentes || []);
        }

        // Busca por nome, CPF, telefone - varre TODOS os pacientes sem limite
        const searchTerms = normalize(termo).split(/\s+/).filter(t => t.length > 0);
        const filtered = [];
        let skip = 0;
        const batchSize = 1000;
        
        for (let i = 0; i < 200; i++) {
            const batch = await adminClient.entities.Paciente.list('-created_date', batchSize, skip);
            if (!batch || batch.length === 0) break;
            
            for (const paciente of batch) {
                const searchableText = normalize(
                    `${paciente.nome} ${paciente.cpf} ${paciente.telefone} ${paciente.email}`
                );
                if (searchTerms.every(term => searchableText.includes(term))) {
                    filtered.push(paciente);
                    if (filtered.length >= maxResults) break;
                }
            }
            
            if (filtered.length >= maxResults) break;
            if (batch.length < batchSize) break;
            skip += batchSize;
        }

        return Response.json(filtered);

    } catch (error) {
        console.error('Erro na busca:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});