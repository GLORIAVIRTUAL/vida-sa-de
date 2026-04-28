import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: '555197443800' });
    return Response.json({ contatos });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});