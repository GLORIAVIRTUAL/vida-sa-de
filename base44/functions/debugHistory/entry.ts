import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const { telefone } = await req.json();
    const contatos = await base44.asServiceRole.entities.Contato.filter({telefone});
    if (!contatos.length) return Response.json({error: 'Not found'});
    const hist = contatos[0].historico_mensagens || [];
    return Response.json({ history: hist.slice(-5) });
});