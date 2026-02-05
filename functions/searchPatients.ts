import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função para normalizar strings (remove acentos e põe em minúsculas)
const normalize = (str) => {
    if (!str) return '';
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body = {};
        try { body = await req.json(); } catch (e) {}
        const { termo, paciente_id } = body;

        // 2. Usar Service Role para pegar pacientes (bypass RLS)
        const adminClient = base44.asServiceRole;

        // 2b. Se tem paciente_id, buscar diretamente
        if (paciente_id) {
            // Escanear em lotes até encontrar o paciente por ID
            let skip = 0;
            const batchSize = 500;
            for (let i = 0; i < 100; i++) {
                const batch = await adminClient.entities.Paciente.filter({}, '-created_date', batchSize, skip);
                if (!batch || batch.length === 0) break;
                const found = batch.find(p => p.id === paciente_id);
                if (found) {
                    console.log(`✅ Paciente encontrado por ID no lote ${i + 1}`);
                    return Response.json([found]);
                }
                skip += batchSize;
                if (batch.length < batchSize) break;
            }
            console.log(`❌ Paciente com ID ${paciente_id} não encontrado`);
            return Response.json([]);
        }

        // 3. Se não tem termo, retorna os 50 mais recentes
        if (!termo || String(termo).trim().length === 0) {
            const recentes = await adminClient.entities.Paciente.list('-created_date', 50);
            return Response.json(recentes || []);
        }

        // 4. Busca por nome: escanear TODOS os pacientes em lotes, parando cedo se possível
        const searchTerms = normalize(termo).split(/\s+/).filter(t => t.length > 0);
        const filtered = [];
        let skip = 0;
        const batchSize = 500;
        const maxResults = 100;
        let totalScanned = 0;
        
        for (let i = 0; i < 100; i++) { // Max 50000 pacientes
            const batch = await adminClient.entities.Paciente.filter({}, '-created_date', batchSize, skip);
            if (!batch || batch.length === 0) break;
            
            totalScanned += batch.length;
            
            for (const paciente of batch) {
                const searchableText = normalize(
                    `${paciente.nome} ${paciente.cpf} ${paciente.telefone} ${paciente.email} ${paciente.convenio}`
                );
                if (searchTerms.every(term => searchableText.includes(term))) {
                    filtered.push(paciente);
                }
            }
            
            skip += batchSize;
            if (batch.length < batchSize) break; // Último lote
            
            // Se já encontrou resultados suficientes E já escaneou bastante, podemos parar
            if (filtered.length >= maxResults) break;
        }

        console.log(`🔍 Busca: "${termo}" | Total Escaneado: ${totalScanned} | Encontrados: ${filtered.length}`);
        return Response.json(filtered.slice(0, maxResults));

    } catch (error) {
        console.error('❌ Erro na busca:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});