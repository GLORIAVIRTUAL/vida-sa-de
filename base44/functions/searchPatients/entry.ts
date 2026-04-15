import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const normalize = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar autenticação - qualquer usuário logado pode buscar
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (e) {
            // Fallback: tentar verificar se há token válido
        }
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body = {};
        try { body = await req.json(); } catch (e) {}
        const { termo, paciente_id, limit } = body;
        
        // IMPORTANTE: Usar asServiceRole para que TODOS os usuários autenticados
        // possam buscar pacientes (não apenas admins)
        const client = base44.asServiceRole;
        const maxResults = limit || 500;

        // Busca por ID direto
        if (paciente_id) {
            let skip = 0;
            const batchSize = 1000;
            for (let i = 0; i < 200; i++) {
                const batch = await client.entities.Paciente.list('-created_date', batchSize, skip);
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
            const recentes = await client.entities.Paciente.list('-created_date', 50);
            return Response.json(recentes || []);
        }

        // Busca otimizada direto no banco de dados
        const regexTerm = termo.trim().split(/\s+/).join('.*');
        const cleanNumber = termo.replace(/\D/g, '');
        
        const orConditions = [
            { nome: { $regex: regexTerm, $options: 'i' } }
        ];
        
        if (cleanNumber.length > 0) {
            orConditions.push({ cpf: { $regex: cleanNumber, $options: 'i' } });
            orConditions.push({ telefone: { $regex: cleanNumber, $options: 'i' } });
        }

        const filtered = await client.entities.Paciente.filter({ $or: orConditions }, '-created_date', maxResults);
        return Response.json(filtered || []);

    } catch (error) {
        console.error('Erro na busca:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});