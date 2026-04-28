import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let skip = 0;
  let total = 0;
  let batches = [];
  while(true) {
    const lote = await base44.asServiceRole.entities.Contato.list('-created_date', 500, skip);
    total += lote.length;
    batches.push(lote.length);
    if(lote.length < 500) break;
    skip += 500;
  }
  return Response.json({ total, batches });
});