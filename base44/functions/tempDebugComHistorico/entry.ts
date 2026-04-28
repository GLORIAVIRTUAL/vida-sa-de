import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const lote = await base44.asServiceRole.entities.Contato.list('-created_date', 5000);
  const comHistorico = lote.filter(c => 
      (c.historico_mensagens && c.historico_mensagens.length > 0) || c.ultima_mensagem
  );
  return Response.json({ total: lote.length, comHistorico: comHistorico.length });
});