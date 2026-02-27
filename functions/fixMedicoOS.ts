import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Autenticação admin
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        console.log('🔧 Iniciando correção de médicos nas OS...');

        // 1. Buscar todas as OS
        const ordensServico = await base44.asServiceRole.entities.OrdemServico.list();
        console.log(`📋 Total de OS encontradas: ${ordensServico.length}`);

        // 2. Buscar todos os agendamentos para comparação
        const agendamentos = await base44.asServiceRole.entities.Agendamento.list();
        const agendamentosMap = {};
        agendamentos.forEach(ag => {
            agendamentosMap[ag.id] = ag;
        });

        let corrigidas = 0;
        let erros = 0;
        const detalhes = [];

        // 3. Verificar cada OS
        for (const os of ordensServico) {
            try {
                const agendamento = agendamentosMap[os.agendamento_id];
                
                if (!agendamento) {
                    console.log(`⚠️ OS ${os.id} - Agendamento não encontrado: ${os.agendamento_id}`);
                    continue;
                }

                // Determinar o médico correto baseado no agendamento
                let medicoCorretoId = agendamento.medico_id;
                if (!medicoCorretoId && agendamento.itens_servico && agendamento.itens_servico.length > 0) {
                    medicoCorretoId = agendamento.itens_servico[0].medico_id || null;
                }

                // Verificar se o médico da OS é diferente do médico correto
                const medicoOsErrado = os.medico_id !== medicoCorretoId;
                
                if (medicoOsErrado) {
                    console.log(`🔧 Corrigindo OS ${os.numero_os || os.id}`);
                    console.log(`   - Médico errado: ${os.medico_id}`);
                    console.log(`   - Médico correto: ${medicoCorretoId}`);
                    
                    await base44.asServiceRole.entities.OrdemServico.update(os.id, {
                        medico_id: medicoCorretoId
                    });
                    
                    corrigidas++;
                    detalhes.push({
                        numero_os: os.numero_os || os.id,
                        medico_anterior: os.medico_id,
                        medico_corrigido: agendamento.medico_id,
                        paciente: os.paciente_nome
                    });
                }
            } catch (err) {
                console.error(`❌ Erro ao processar OS ${os.id}:`, err);
                erros++;
            }
        }

        console.log(`✅ Correção concluída:`);
        console.log(`   - OS corrigidas: ${corrigidas}`);
        console.log(`   - Erros: ${erros}`);

        return Response.json({
            success: true,
            message: `Correção concluída: ${corrigidas} OS corrigidas, ${erros} erros`,
            corrigidas,
            erros,
            detalhes
        });

    } catch (error) {
        console.error('❌ Erro geral:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});