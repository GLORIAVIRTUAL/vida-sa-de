import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log("🔄 Iniciando correção de nomes de pacientes em OS...");

        // Buscar as últimas 50 OS
        const osList = await base44.asServiceRole.entities.OrdemServico.list('-created_date', 50);
        let updatedCount = 0;
        
        for (const os of osList) {
            // Se não tem nome salvo, mas tem ID
            if ((!os.paciente_nome || os.paciente_nome === 'Não encontrado') && os.paciente_id) {
                console.log(`🔍 Buscando paciente para OS ${os.id} (Paciente ID: ${os.paciente_id})`);
                
                const patients = await base44.asServiceRole.entities.Paciente.filter({id: os.paciente_id});
                
                if (patients && patients.length > 0) {
                    const patient = patients[0];
                    await base44.asServiceRole.entities.OrdemServico.update(os.id, {
                        paciente_nome: patient.nome
                    });
                    console.log(`✅ OS ${os.id} atualizada com nome: ${patient.nome}`);
                    updatedCount++;
                } else {
                    console.warn(`⚠️ Paciente ${os.paciente_id} não encontrado no banco.`);
                }
            }
        }
        
        return Response.json({ success: true, updated: updatedCount, message: `${updatedCount} registros corrigidos.` });
    } catch (error) {
        console.error("❌ Erro ao corrigir nomes:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});