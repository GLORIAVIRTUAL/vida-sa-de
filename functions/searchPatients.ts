import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

function createAccentRegex(text) {
    try {
        const cleanText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return cleanText
            .replace(/a/gi, '[aáàâãäå]')
            .replace(/e/gi, '[eéèêë]')
            .replace(/i/gi, '[iíìîï]')
            .replace(/o/gi, '[oóòôõö]')
            .replace(/u/gi, '[uúùûü]')
            .replace(/c/gi, '[cç]')
            .replace(/n/gi, '[nñ]');
    } catch (e) {
        return text; // Fallback para texto simples
    }
}

Deno.serve(async (req) => {
    try {
        // 1. Setup
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Parse Body
        let body = {};
        try {
            body = await req.json();
        } catch (e) {
            // Se falhar o parse, tenta pegar query params ou assume vazio
            console.log("Body empty or invalid");
        }

        const { termo, limit = 500 } = body;

        // 3. Busca
        // Se não tiver termo, lista os últimos 500
        if (!termo || String(termo).trim().length === 0) {
             console.log("Listing recent patients...");
             const recentes = await base44.entities.Paciente.list('-created_date', 100);
             return Response.json(recentes || []);
        }

        const cleanTermo = String(termo).trim();
        const regexPattern = createAccentRegex(cleanTermo);
        
        console.log(`🔍 Searching for: "${cleanTermo}" (Regex: ${regexPattern})`);

        const query = {
            $or: [
                { nome: { $regex: regexPattern, $options: 'i' } },
                { cpf: { $regex: cleanTermo, $options: 'i' } },
                { telefone: { $regex: cleanTermo, $options: 'i' } },
                { email: { $regex: cleanTermo, $options: 'i' } }
            ]
        };

        const results = await base44.entities.Paciente.filter(query, '-created_date', Number(limit));
        
        console.log(`✅ Found ${results?.length || 0} patients`);

        return Response.json(results || []);

    } catch (error) {
        console.error('❌ CRITICAL ERROR in searchPatients:', error);
        return Response.json({ 
            error: error.message, 
            stack: error.stack 
        }, { status: 500 });
    }
});