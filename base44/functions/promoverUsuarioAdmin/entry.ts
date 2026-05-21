import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Apenas admins ou o email mestre podem promover
        const emailAutorizado = 'cristianogoldani@yahoo.com.br';
        const ehAdmin = user.role === 'admin';
        const ehEmailMestre = user.email?.toLowerCase().trim() === emailAutorizado;

        if (!ehAdmin && !ehEmailMestre) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { email } = await req.json();
        if (!email) {
            return Response.json({ error: 'email é obrigatório' }, { status: 400 });
        }

        // Busca o usuário pelo email
        const usuarios = await base44.asServiceRole.entities.User.filter({ email: email.trim() });
        if (!usuarios || usuarios.length === 0) {
            return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
        }

        const alvo = usuarios[0];

        // Atualiza role da plataforma + app_role
        await base44.asServiceRole.entities.User.update(alvo.id, {
            role: 'admin',
            app_role: 'admin'
        });

        return Response.json({
            success: true,
            message: `Usuário ${email} promovido a admin com sucesso`,
            user_id: alvo.id
        });
    } catch (error) {
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});