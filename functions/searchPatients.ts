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
        const { termo, paciente_id } = body;
        const adminClient = base44.asServiceRole;

        // Busca por ID - escaneia até encontrar
        if (paciente_id) {
            let skip = 0;
            const batchSize = 500;
            for (let i = 0; i < 100; i++) {
                const batch = await adminClient.entities.Paciente.filter({}, '-created_date', batchSize, skip);
                if (!batch || batch.length === 0) break;
                const found = batch.find(p => p.id === paciente_id);
                if (found) return Response.json([found]);
                skip += batchSize;
                if (batch.length < batchSize) break;
            }
            return Response.json([]);
        }

        // Sem termo - retorna recentes
        if (!termo || String(termo).trim().length === 0) {
            const recentes = await adminClient.entities.Paciente.list('-created_date', 50);
            return Response.json(recentes || []);
        }

        // Busca por nome - otimizada com parada rápida
        const searchTerms = normalize(termo).split(/\s+/).filter(t => t.length > 0);
        const filtered = [];
        let skip = 0;
        const batchSize = 500;
        const maxResults = 20; // Reduzido - raramente precisamos de mais
        
        for (let i = 0; i < 100; i++) {
            const batch = await adminClient.entities.Paciente.filter({}, '-created_date', batchSize, skip);
            if (!batch || batch.length === 0) break;
            
            for (const paciente of batch) {
                const nomeNorm = normalize(paciente.nome);
                // Busca otimizada: só no nome primeiro (mais rápido)
                if (searchTerms.every(term => nomeNorm.includes(term))) {
                    filtered.push(paciente);
                    if (filtered.length >= maxResults) break;
                }
            }
            
            // Se já encontrou resultados suficientes, para
            if (filtered.length >= maxResults) break;
            
            skip += batchSize;
            if (batch.length < batchSize) break;
            
            // Se já encontrou pelo menos 1 resultado e escaneou 3 lotes, para
            // (provavelmente já encontrou o que precisava)
            if (filtered.length > 0 && i >= 2) break;
        }

        // Se não encontrou nada por nome, tentar busca mais ampla (CPF, telefone)
        if (filtered.length === 0) {
            skip = 0;
            for (let i = 0; i < 100; i++) {
                const batch = await adminClient.entities.Paciente.filter({}, '-created_date', batchSize, skip);
                if (!batch || batch.length === 0) break;
                
                for (const paciente of batch) {
                    const searchableText = normalize(
                        `${paciente.nome} ${paciente.cpf} ${paciente.telefone}`
                    );
                    if (searchTerms.every(term => searchableText.includes(term))) {
                        filtered.push(paciente);
                        if (filtered.length >= maxResults) break;
                    }
                }
                
                if (filtered.length >= maxResults) break;
                skip += batchSize;
                if (batch.length < batchSize) break;
                if (filtered.length > 0 && i >= 2) break;
            }
        }

        return Response.json(filtered);

    } catch (error) {
        console.error('Erro na busca:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});