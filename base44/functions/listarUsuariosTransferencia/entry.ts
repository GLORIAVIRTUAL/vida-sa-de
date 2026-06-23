import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Qualquer atendente autenticado pode listar os colegas para transferir uma conversa.
        // Usa service role para contornar a RLS do User (que normalmente só permite admin listar).
        const usuarios = await base44.asServiceRole.entities.User.list();

        // Retorna apenas campos seguros e necessários para a UI de transferência
        const sanitizados = (usuarios || []).map(u => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            display_name: u.display_name
        }));

        return Response.json({ usuarios: sanitizados });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});