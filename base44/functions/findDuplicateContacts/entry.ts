import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        // Buscar todos os contatos
        const contatos = await base44.asServiceRole.entities.Contato.list('-created_date', 1000);
        
        // Agrupar por últimos 8 dígitos do telefone
        const grupos = {};
        
        for (const contato of contatos) {
            const tel = (contato.telefone || '').replace(/\D/g, '');
            if (tel.length < 8) continue;
            
            const chave = tel.slice(-8);
            
            if (!grupos[chave]) {
                grupos[chave] = [];
            }
            grupos[chave].push({
                id: contato.id,
                nome: contato.nome,
                telefone: contato.telefone,
                created_date: contato.created_date,
                total_mensagens: contato.total_mensagens || 0,
                historico_count: (contato.historico_mensagens || []).length,
                atendimento_humano: contato.atendimento_humano,
                conversa_finalizada: contato.conversa_finalizada
            });
        }
        
        // Filtrar apenas grupos com duplicatas
        const duplicatas = {};
        for (const [chave, lista] of Object.entries(grupos)) {
            if (lista.length > 1) {
                duplicatas[chave] = lista;
            }
        }
        
        const totalDuplicatas = Object.keys(duplicatas).length;
        const totalRegistrosDuplicados = Object.values(duplicatas).reduce((sum, list) => sum + list.length, 0);
        
        return Response.json({
            total_contatos: contatos.length,
            telefones_duplicados: totalDuplicatas,
            registros_duplicados: totalRegistrosDuplicados,
            duplicatas
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});