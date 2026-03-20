import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
    
    if (configs.length > 0) {
      const promptObj = JSON.parse(configs[0].prompt_sistema);
      return Response.json({ intencoes: promptObj.intencoes });
    }
    return Response.json({ error: 'No config found' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});