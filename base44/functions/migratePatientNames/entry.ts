import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Usar service role para ter acesso total
        const adminBase44 = base44.asServiceRole;

        console.log("🔄 Iniciando migração de nomes de pacientes nos agendamentos...");

        // 1. Buscar todos os pacientes (limitado a 5000 para segurança, mas idealmente paginado)
        const pacientes = await adminBase44.entities.Paciente.list('-created_date', 5000);
        const pacientesMap = new Map(pacientes.map(p => [p.id, p.nome]));
        console.log(`👥 ${pacientes.length} pacientes carregados na memória.`);

        // 2. Buscar todos os agendamentos
        const agendamentos = await adminBase44.entities.Agendamento.list('-created_date', 5000);
        console.log(`📅 ${agendamentos.length} agendamentos carregados.`);

        let atualizados = 0;
        let erros = 0;
        let ignorados = 0;

        // 3. Atualizar agendamentos que estão sem nome
        for (const agendamento of agendamentos) {
            // Se já tem nome ou não tem paciente_id, pula
            if (agendamento.paciente_nome || !agendamento.paciente_id) {
                ignorados++;
                continue;
            }

            const nomePaciente = pacientesMap.get(agendamento.paciente_id);

            if (nomePaciente) {
                try {
                    await adminBase44.entities.Agendamento.update(agendamento.id, {
                        paciente_nome: nomePaciente
                    });
                    atualizados++;
                    // Log a cada 50 para não floodar
                    if (atualizados % 50 === 0) console.log(`✅ ${atualizados} agendamentos atualizados...`);
                } catch (err) {
                    console.error(`❌ Erro ao atualizar agendamento ${agendamento.id}:`, err);
                    erros++;
                }
            } else {
                console.warn(`⚠️ Paciente ID ${agendamento.paciente_id} não encontrado para agendamento ${agendamento.id}`);
                erros++;
            }
        }

        return Response.json({
            success: true,
            message: "Migração concluída",
            stats: {
                total_agendamentos: agendamentos.length,
                atualizados,
                ignorados,
                erros
            }
        });

    } catch (error) {
        console.error("❌ Erro fatal na migração:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});