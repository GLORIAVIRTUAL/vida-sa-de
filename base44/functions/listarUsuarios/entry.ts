import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Permite admin da plataforma, admin do app ou email mestre
        const emailMestre = 'cristianogoldani@yahoo.com.br';
        const ehAdminPlataforma = user.role === 'admin';
        const ehAdminApp = user.app_role === 'admin';
        const ehEmailMestre = user.email?.toLowerCase().trim() === emailMestre;

        if (!ehAdminPlataforma && !ehAdminApp && !ehEmailMestre) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Lista todos os usuários via service role (contorna RLS do User)
        const usuarios = await base44.asServiceRole.entities.User.list();

        // Retorna apenas campos seguros e necessários para a UI
        const sanitizados = (usuarios || []).map(u => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
            app_role: u.app_role,
            display_name: u.display_name,
            created_date: u.created_date
        }));

        return Response.json({ usuarios: sanitizados });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});