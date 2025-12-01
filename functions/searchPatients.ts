import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

function createAccentRegex(text) {
    try {
        // Escape special regex chars
        const cleanText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Replace vowels with accent groups
        return cleanText
            .replace(/a/gi, '[aáàâãäå]')
            .replace(/e/gi, '[eéèêë]')
            .replace(/i/gi, '[iíìîï]')
            .replace(/o/gi, '[oóòôõö]')
            .replace(/u/gi, '[uúùûü]')
            .replace(/c/gi, '[cç]')
            .replace(/n/gi, '[nñ]');
    } catch (e) {
        return text;
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Autenticação (Segurança básica)
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body = {};
        try { body = await req.json(); } catch (e) {}
        
        const { termo, limit = 100 } = body;

        // 2. CRÍTICO: Usar Service Role para ver TODOS os pacientes
        // Se não usar isso, o usuário só vê os pacientes que ELE criou (se RLS estiver ativo/padrão)
        const adminClient = base44.asServiceRole;

        // 3. Se não tem termo, retorna recentes
        if (!termo || String(termo).trim().length === 0) {
             const recentes = await adminClient.entities.Paciente.list('-created_date', 50);
             return Response.json(recentes || []);
        }

        // 4. Lógica de Busca Inteligente (Split Terms)
        // "Antonio Thiago" vira ["Antonio", "Thiago"]
        // Busca registros que tenham "Antonio" E "Thiago" em qualquer campo
        const rawTerm = String(termo).trim();
        const terms = rawTerm.split(/\s+/).filter(t => t.length > 0);
        
        const andConditions = terms.map(t => {
            const regex = createAccentRegex(t);
            // Para cada palavra digitada, ela deve aparecer em Nome OU CPF OU Telefone...
            return {
                $or: [
                    { nome: { $regex: regex, $options: 'i' } },
                    { cpf: { $regex: t, $options: 'i' } }, // CPF sem regex de acento
                    { telefone: { $regex: t, $options: 'i' } },
                    { email: { $regex: t, $options: 'i' } }
                ]
            };
        });

        const query = { $and: andConditions };
        
        console.log(`🔍 Searching (Admin): "${rawTerm}" [${terms.length} parts]`);

        // Limite de segurança aumentado
        const searchLimit = Math.min(Math.max(Number(limit), 50), 1000);

        const results = await adminClient.entities.Paciente.filter(query, '-created_date', searchLimit);
        
        console.log(`✅ Found: ${results?.length || 0}`);

        return Response.json(results || []);

    } catch (error) {
        console.error('❌ Search Function Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});