import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  await base44.asServiceRole.entities.Contato.create({
      nome: 'Teste Limite',
      telefone: '5599999999999',
      status: 'Novo',
      origem: 'WhatsApp',
      atendimento_humano: false
  });
  
  const lote = await base44.asServiceRole.entities.Contato.list('-created_date', 5000);
  return Response.json({ length: lote.length });
});