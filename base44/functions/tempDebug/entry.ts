import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const contatos = await base44.asServiceRole.entities.Contato.list();
    
    // Filtrar todos os contatos cujo telefone termina com 999043573
    const alvo = "999043573";
    const contatosEncontrados = contatos.filter(c => {
      const tel = (c.telefone || "").replace(/\D/g, '');
      return tel.includes(alvo);
    });

    const resultado = contatosEncontrados.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      total_mensagens: c.historico_mensagens ? c.historico_mensagens.length : 0,
      ultima_interacao: c.ultima_interacao,
      mensagens_abril: (c.historico_mensagens || [])
        .filter(m => m.timestamp && m.timestamp.startsWith('2026-04'))
        .map(m => ({ data: m.timestamp, role: m.role, text: m.content }))
    }));

    return Response.json({ contatos: resultado });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});