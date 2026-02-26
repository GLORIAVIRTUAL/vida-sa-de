import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Find all agendamentos with "Lidiane" in observacoes
        const limit = 1000;
        const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            limit: limit
        });
        
        const agendamentosLidiane = agendamentos.filter(a => 
            a.observacoes && 
            a.observacoes.toLowerCase().includes('lidiane')
        );
        
        const lidianeId = '6967d7f6de081dae6837a4bc';
        let updatedAgendamentos = 0;
        let updatedOS = 0;
        let logs = [];
        
        for (const ag of agendamentosLidiane) {
            logs.push(`Found Agendamento ${ag.id} for ${ag.paciente_nome}`);
            
            // Update Agendamento if not Lidiane
            if (ag.medico_id !== lidianeId) {
                await base44.asServiceRole.entities.Agendamento.update(ag.id, {
                    medico_id: lidianeId
                });
                updatedAgendamentos++;
                logs.push(`  -> Updated Agendamento medico_id to Lidiane`);
            }
            
            // Find corresponding OrdemServico
            const osList = await base44.asServiceRole.entities.OrdemServico.filter({
                agendamento_id: ag.id
            });
            
            for (const os of osList) {
                if (os.medico_id !== lidianeId) {
                    const newItens = os.itens ? os.itens.map(item => {
                        return {
                            ...item,
                            descricao: item.descricao.replace(/Ramão de Souza/i, 'Lidiane Goldani')
                        };
                    }) : os.itens;
                    
                    await base44.asServiceRole.entities.OrdemServico.update(os.id, {
                        medico_id: lidianeId,
                        itens: newItens
                    });
                    updatedOS++;
                    logs.push(`  -> Updated OrdemServico ${os.id} to Lidiane`);
                }
            }
        }
        
        return Response.json({ 
            success: true, 
            updatedAgendamentos, 
            updatedOS,
            found: agendamentosLidiane.length,
            logs
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});