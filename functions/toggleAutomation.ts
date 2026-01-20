import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { automationId, action } = await req.json();
        
        if (!automationId || !action) {
            return Response.json({ error: 'automationId e action são obrigatórios' }, { status: 400 });
        }

        if (!['enable', 'disable'].includes(action)) {
            return Response.json({ error: 'action deve ser "enable" ou "disable"' }, { status: 400 });
        }

        const isActive = action === 'enable';

        // Atualizar automação via API
        const response = await fetch(
            `https://base44.app/api/apps/${Deno.env.get('BASE44_APP_ID')}/automations/${automationId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': req.headers.get('Authorization'),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_active: isActive })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao atualizar automação: ${errorText}`);
        }

        const result = await response.json();

        return Response.json({
            success: true,
            message: `Automação ${isActive ? 'ativada' : 'desativada'} com sucesso`,
            automation: result
        });

    } catch (error) {
        console.error('Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});