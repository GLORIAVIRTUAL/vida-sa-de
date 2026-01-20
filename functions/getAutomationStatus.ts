import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { name } = await req.json();
        
        if (!name) {
            return Response.json({ error: 'Nome da automação é obrigatório' }, { status: 400 });
        }

        // Buscar automações do app
        const automationsResponse = await fetch(
            `https://base44.app/api/apps/${Deno.env.get('BASE44_APP_ID')}/automations`,
            {
                headers: {
                    'Authorization': req.headers.get('Authorization'),
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!automationsResponse.ok) {
            throw new Error('Erro ao buscar automações');
        }

        const automations = await automationsResponse.json();
        const automation = automations.find(a => a.name === name);

        if (!automation) {
            return Response.json({ 
                success: false, 
                message: 'Automação não encontrada',
                automation: null 
            });
        }

        return Response.json({
            success: true,
            automation: {
                id: automation.id,
                name: automation.name,
                is_active: automation.is_active,
                description: automation.description,
                last_run_at: automation.last_run_at,
                start_time: automation.start_time
            }
        });

    } catch (error) {
        console.error('Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});