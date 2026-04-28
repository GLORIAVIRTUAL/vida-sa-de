import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const configs = await base44.asServiceRole.entities.ChatbotConfig.list();
    return Response.json({ configs });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});