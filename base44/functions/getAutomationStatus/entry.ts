import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Dados da automação hardcoded (obtidos via list_automations)
const LEMBRETE_AUTOMATION = {
    id: "696f7a5dd606fabf44640881",
    name: "Lembrete de Consultas 24h"
};

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

        // Usar dados fixos da automação conhecida
        if (name === LEMBRETE_AUTOMATION.name) {
            return Response.json({
                success: true,
                automation: {
                    id: LEMBRETE_AUTOMATION.id,
                    name: LEMBRETE_AUTOMATION.name,
                    is_active: true // valor padrão - será controlado pelo toggle
                }
            });
        }

        return Response.json({ 
            success: false, 
            message: 'Automação não encontrada',
            automation: null 
        });

    } catch (error) {
        console.error('Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});