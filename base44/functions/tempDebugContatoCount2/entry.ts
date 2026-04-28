import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const lote = await base44.asServiceRole.entities.Contato.list('-created_date', 5000);
  return Response.json({ length: lote.length });
});