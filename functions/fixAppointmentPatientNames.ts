import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log("🔄 Iniciando correção de nomes em Agendamentos...");

        // 1. Buscar Agendamentos recentes (limite seguro para não estourar tempo)
        // Ordenado por data de criação descrescente para pegar os mais recentes primeiro
        const agendamentos = await base44.entities.Agendamento.list('-created_date', 500);
        
        // 2. Buscar todos os pacientes para lookup rápido (map)
        // Assumindo que não há milhões de pacientes, senão precisaria de outra estratégia
        const pacientes = await base44.entities.Paciente.list();
        const pacientesMap = new Map(pacientes.map(p => [p.id, p.nome]));

        let fixedCount = 0;
        let errorsCount = 0;

        // 3. Iterar e corrigir
        for (const ag of agendamentos) {
            // Verifica se precisa corrigir: nome vazio, nulo, ou "undefined"/"N/A"
            const nomeAtual = ag.paciente_nome || "";
            const isInvalid = !nomeAtual || nomeAtual === "N/A" || nomeAtual.includes("undefined");

            if (isInvalid && ag.paciente_id) {
                const nomeCorreto = pacientesMap.get(ag.paciente_id);
                
                if (nomeCorreto) {
                    try {
                        await base44.entities.Agendamento.update(ag.id, {
                            paciente_nome: nomeCorreto
                        });
                        fixedCount++;
                    } catch (err) {
                        console.error(`Erro ao atualizar agendamento ${ag.id}:`, err);
                        errorsCount++;
                    }
                }
            }
        }

        return Response.json({ 
            success: true, 
            message: `Processo finalizado. ${fixedCount} nomes corrigidos.`,
            details: {
                total_checked: agendamentos.length,
                fixed: fixedCount,
                errors: errorsCount
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});