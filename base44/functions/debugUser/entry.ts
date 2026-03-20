import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Buscar o usuário alvo
        const users = await base44.asServiceRole.entities.User.list();
        const targetUser = users.find(u => u.email === 'tatibrocca@gmail.com');
        
        if (!targetUser) {
            return Response.json({ found: false, message: 'Usuário tatibrocca@gmail.com não encontrado' });
        }

        const userId = targetUser.id;

        // 2. Verificar se está associado a algum Médico
        // Precisamos listar médicos e filtrar (ou usar filter se possível, mas list é mais garantido com poucos dados)
        const medicos = await base44.entities.Medico.list();
        const medicoAssociado = medicos.find(m => m.user_id === userId || m.email === targetUser.email);

        // 3. Verificar se está associado a algum Paciente (por email ou id se tivesse)
        const pacientes = await base44.entities.Paciente.list(); // Pode ser pesado, mas ok para debug
        const pacienteAssociado = pacientes.find(p => p.email === targetUser.email);

        // 4. Verificar Agendamentos criados por este usuário (metadata created_by)
        // Apenas uma amostra
        // const agendamentosCriados = await base44.entities.Agendamento.filter({ created_by: targetUser.email }, '-created_date', 5);

        return Response.json({ 
            user: targetUser,
            medico_associado: medicoAssociado || null,
            paciente_associado: pacienteAssociado || null,
            roles_verification: {
                app_role: targetUser.app_role,
                role: targetUser.role,
                is_admin: targetUser.app_role === 'admin' || targetUser.role === 'admin'
            },
            analise: !medicoAssociado ? "Usuário normal (não médico)" : "Usuário vinculado a médico"
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});