import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // Usar service role para listar todos os usuários
        const users = await base44.asServiceRole.entities.User.list();
        
        const targetUser = users.find(u => u.email === 'tatibrocca@gmail.com');
        
        if (!targetUser) {
            return Response.json({ found: false, message: 'Usuário não encontrado' });
        }

        return Response.json({ 
            found: true, 
            user: targetUser,
            allRoles: users.map(u => u.role || u.app_role) // Para comparar
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});