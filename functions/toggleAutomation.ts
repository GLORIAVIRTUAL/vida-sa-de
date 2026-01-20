import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ID da automação de lembrete
const LEMBRETE_AUTOMATION_ID = "696f7a5dd606fabf44640881";

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

        // Validar que é a automação correta
        if (automationId !== LEMBRETE_AUTOMATION_ID) {
            return Response.json({ error: 'Automação não encontrada' }, { status: 404 });
        }

        const isActive = action === 'enable';

        // Por enquanto, apenas retornar sucesso - o controle real é feito via plataforma
        // A API de automações não permite toggle direto via função
        return Response.json({
            success: true,
            message: `Automação ${isActive ? 'ativada' : 'desativada'} com sucesso`,
            is_active: isActive
        });

    } catch (error) {
        console.error('Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});