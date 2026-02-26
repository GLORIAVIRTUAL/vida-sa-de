import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import fs from 'node:fs';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
    
    if (configs.length > 0) {
      fs.writeFileSync('/tmp/prompt.json', configs[0].prompt_sistema);
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'No config found' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});