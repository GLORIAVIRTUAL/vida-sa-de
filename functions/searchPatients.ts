import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { termo, limit = 50 } = await req.json();

        if (!termo || termo.trim().length < 2) {
            return Response.json([]);
        }

        const cleanTermo = termo.trim();
        
        // Construct the query
        // Note: Backend SDK filter supports mongo-like queries
        const query = {
            $or: [
                { nome: { $regex: cleanTermo, $options: 'i' } },
                { cpf: { $regex: cleanTermo, $options: 'i' } },
                { telefone: { $regex: cleanTermo, $options: 'i' } },
                { email: { $regex: cleanTermo, $options: 'i' } }
            ]
        };

        const results = await base44.entities.Paciente.filter(query, 'nome', limit);

        return Response.json(results || []);
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});