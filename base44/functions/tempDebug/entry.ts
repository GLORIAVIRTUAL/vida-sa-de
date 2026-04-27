import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Buscar todos os contatos
    let todosContatos = [];
    let skip = 0;
    const limit = 500;
    while (true) {
        const batch = await base44.asServiceRole.entities.Contato.list('-created_date', limit, skip);
        todosContatos = todosContatos.concat(batch);
        if (batch.length < limit) break;
        skip += limit;
    }

    const merged = [];
    const noMatch = [];

    // Encontrar contatos com telefones muito longos (>= 14 dígitos)
    const contatosEstranhos = todosContatos.filter(c => {
        const tel = (c.telefone || "").replace(/\D/g, '');
        return tel.length >= 14;
    });

    for (const estranho of contatosEstranhos) {
        if (!estranho.nome) continue;
        
        // Buscar contatos normais (telefone < 14) com o MESMO NOME
        const contatosNormais = todosContatos.filter(c => {
            const tel = (c.telefone || "").replace(/\D/g, '');
            return tel.length < 14 && 
                   c.nome && 
                   c.nome.toLowerCase().trim() === estranho.nome.toLowerCase().trim() && 
                   c.id !== estranho.id;
        });

        if (contatosNormais.length > 0) {
            // Ordenar para pegar o registro mais antigo como principal
            contatosNormais.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
            const principal = contatosNormais[0];

            // Mesclar o histórico de mensagens
            let historicoUnificado = [...(principal.historico_mensagens || [])];
            const histDup = estranho.historico_mensagens || [];
            
            let mensagensAdicionadas = 0;
            for (const msg of histDup) {
                const jaExiste = historicoUnificado.some(m => 
                    m.timestamp === msg.timestamp && m.content === msg.content
                );
                if (!jaExiste) {
                    historicoUnificado.push(msg);
                    mensagensAdicionadas++;
                }
            }
            
            historicoUnificado.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

            // Atualizar ficha principal
            await base44.asServiceRole.entities.Contato.update(principal.id, {
                historico_mensagens: historicoUnificado.slice(-200)
            });

            // Apagar a duplicata com número estranho
            await base44.asServiceRole.entities.Contato.delete(estranho.id);

            merged.push({
                nome: estranho.nome,
                telefone_estranho: estranho.telefone,
                telefone_principal: principal.telefone,
                mensagens_mescladas: mensagensAdicionadas
            });
        } else {
            noMatch.push({
                nome: estranho.nome,
                telefone_estranho: estranho.telefone
            });
        }
    }

    return Response.json({ 
        total_encontrados: contatosEstranhos.length,
        mesclados: merged.length,
        detalhes_mesclados: merged,
        nao_mesclados: noMatch.length,
        detalhes_nao_mesclados: noMatch
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});