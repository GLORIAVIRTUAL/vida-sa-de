import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validar auth
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse body com segurança
        let body = {};
        try {
            body = await req.json();
        } catch (e) {
            console.error("Erro parse JSON:", e);
            return Response.json([]);
        }

        const { termo, limit = 100 } = body;

        console.log(`🔍 Backend Search: "${termo}"`);

        if (!termo || String(termo).trim().length < 2) {
            return Response.json([]);
        }

        const cleanTermo = String(termo).trim();
        
        // Simplificação: Busca direta com Regex simples (Case Insensitive)
        // Removida lógica complexa de acentos temporariamente para isolar falhas
        const query = {
            $or: [
                { nome: { $regex: cleanTermo, $options: 'i' } },
                { email: { $regex: cleanTermo, $options: 'i' } },
                { cpf: { $regex: cleanTermo, $options: 'i' } },
                { telefone: { $regex: cleanTermo, $options: 'i' } }
            ]
        };

        // Executar busca
        // Importante: O segundo parametro do filter é sort, o terceiro é limit
        const results = await base44.entities.Paciente.filter(query, '-created_date', Number(limit));
        
        console.log(`✅ Encontrados: ${results?.length || 0}`);

        return Response.json(results || []);

    } catch (error) {
        console.error('❌ Search Function Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});