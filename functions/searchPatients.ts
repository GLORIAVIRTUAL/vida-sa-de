import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function createAccentRegex(text) {
    const cleanText = escapeRegExp(text);
    // Substituições comuns de vogais por grupos de regex que cobrem acentos
    return cleanText
        .replace(/a/gi, '[aáàâãäå]')
        .replace(/e/gi, '[eéèêë]')
        .replace(/i/gi, '[iíìîï]')
        .replace(/o/gi, '[oóòôõö]')
        .replace(/u/gi, '[uúùûü]')
        .replace(/c/gi, '[cç]')
        .replace(/n/gi, '[nñ]');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body = {};
        try {
            body = await req.json();
        } catch (e) {
            return Response.json([]);
        }

        const { termo, limit = 100 } = body;

        // Se não tiver termo, retorna os mais recentes
        if (!termo || String(termo).trim().length === 0) {
             const recentes = await base44.entities.Paciente.list('-created_date', 50);
             return Response.json(recentes || []);
        }

        const cleanTermo = String(termo).trim();
        const regexPattern = createAccentRegex(cleanTermo);
        
        console.log(`🔍 Search Pattern: "${regexPattern}" (Original: "${cleanTermo}")`);

        const query = {
            $or: [
                { nome: { $regex: regexPattern, $options: 'i' } },
                { email: { $regex: regexPattern, $options: 'i' } },
                { cpf: { $regex: cleanTermo, $options: 'i' } }, // CPF geralmente não tem acento
                { telefone: { $regex: cleanTermo, $options: 'i' } }
            ]
        };

        // Aumentando limite para 500 para garantir que retorne tudo
        const searchLimit = Math.max(Number(limit), 500);

        const results = await base44.entities.Paciente.filter(query, '-created_date', searchLimit);
        
        console.log(`✅ Found: ${results?.length || 0}`);

        return Response.json(results || []);

    } catch (error) {
        console.error('❌ Search Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});