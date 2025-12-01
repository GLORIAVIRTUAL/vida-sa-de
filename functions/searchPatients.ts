import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

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
        const { termo } = body;

        // 2. Usar Service Role para pegar TODOS os pacientes (bypass RLS)
        const adminClient = base44.asServiceRole;

        // 3. Buscar TODOS os pacientes (limite de segurança de 2000)
        // Trazendo tudo para filtrar em memória (mais confiável para busca textual complexa)
        const allPatients = await adminClient.entities.Paciente.list('-created_date', 2000);

        if (!allPatients || allPatients.length === 0) {
            return Response.json([]);
        }

        // 4. Se não tem termo, retorna os 50 mais recentes
        if (!termo || String(termo).trim().length === 0) {
             return Response.json(allPatients.slice(0, 50));
        }

        // 5. Filtragem em Memória (Robustez total)
        const searchTerms = normalize(termo).split(/\s+/).filter(t => t.length > 0);
        
        const filtered = allPatients.filter(paciente => {
            // Monta uma string única com todos os dados pesquisáveis do paciente
            const searchableText = normalize(
                `${paciente.nome} ${paciente.cpf} ${paciente.telefone} ${paciente.email} ${paciente.convenio}`
            );

            // Verifica se TODOS os termos digitados existem nos dados do paciente
            // Ex: "Antonio Thiago" -> "antonio" deve existir E "thiago" deve existir
            return searchTerms.every(term => searchableText.includes(term));
        });

        console.log(`🔍 Busca: "${termo}" | Total Banco: ${allPatients.length} | Encontrados: ${filtered.length}`);

        // Retorna os top 100 resultados
        return Response.json(filtered.slice(0, 100));

    } catch (error) {
        console.error('❌ Erro na busca:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});