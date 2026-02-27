import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
        
        if (configs.length > 0) {
            let config = configs[0];
            return Response.json({ 
                success: true, 
                config: config.prompt_sistema 
            });
        }
        
        return Response.json({ success: false, message: "Nenhuma configuração ativa encontrada." });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});