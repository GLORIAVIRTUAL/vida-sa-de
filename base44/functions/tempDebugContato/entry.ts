import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: '5551997443800' });
    if (contatos.length === 0) return Response.json({ error: 'Contato não encontrado' });
    
    return Response.json({ 
        contato_id: contatos[0].id,
        atendimento_humano: contatos[0].atendimento_humano,
        historico_resumo: (contatos[0].historico_mensagens || []).map(m => `[${m.timestamp}] ${m.role}: ${m.content.substring(0,50)}`),
        pendentes: contatos[0].mensagens_pendentes || []
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});