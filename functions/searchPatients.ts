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
        // Remove tudo que não é dígito para buscar em campos numéricos
        const digitsOnly = cleanTermo.replace(/\D/g, '');
        
        const query = {
            $or: [
                // Busca por nome (case insensitive)
                { nome: { $regex: cleanTermo, $options: 'i' } },
                // Busca por email
                { email: { $regex: cleanTermo, $options: 'i' } }
            ]
        };

        // Se tiver dígitos, adiciona busca por CPF e Telefone (que podem estar formatados ou não no banco)
        // Como não sabemos como está no banco, buscamos pela string original (regex) E pelos dígitos apenas (se o banco tiver só dígitos)
        // Mas regex em número pode ser lento se não indexado. O Base44 guarda tudo como string ou conforme schema?
        // Schema diz string.
        
        if (digitsOnly.length > 0) {
            // Busca por CPF e Telefone com regex para pegar parcial
            query.$or.push({ cpf: { $regex: digitsOnly, $options: 'i' } });
            query.$or.push({ telefone: { $regex: digitsOnly, $options: 'i' } });
            
            // Também tenta buscar com o termo original (caso tenha formatação no banco e o usuário digitou formatado)
            if (digitsOnly !== cleanTermo) {
                 query.$or.push({ cpf: { $regex: cleanTermo, $options: 'i' } });
                 query.$or.push({ telefone: { $regex: cleanTermo, $options: 'i' } });
            }
        }

        console.log(`🔍 Buscando pacientes: ${cleanTermo} (digits: ${digitsOnly})`);

        const results = await base44.entities.Paciente.filter(query, 'nome', limit);

        return Response.json(results || []);
    } catch (error) {
        console.error('❌ Erro na busca de pacientes:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});