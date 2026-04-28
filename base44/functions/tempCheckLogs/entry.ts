import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Buscar logs de webhook
    const logs = await base44.asServiceRole.entities.WebhookLog.list('-created_date', 50);
    
    const logsFiltrados = logs.filter(l => 
        l.body && (l.body.includes('97443800') || l.body.includes('997443800'))
    ).map(l => ({
        created_date: l.created_date,
        body: JSON.parse(l.body)
    }));

    return Response.json({ 
        totalLogsAvaliados: logs.length,
        encontrados: logsFiltrados.length,
        logs: logsFiltrados
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});