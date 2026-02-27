import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // Buscar agendamento por nome do paciente (regex)
        const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            paciente_nome: { "$options": "i", "$regex": "SAID HUSSEIN" }
        });

        // Buscar todos os médicos para mapear nomes
        const medicos = await base44.asServiceRole.entities.Medico.list();
        const medicosMap = {};
        medicos.forEach(m => medicosMap[m.id] = m.nome);

        // Buscar todos os procedimentos
        const procedimentos = await base44.asServiceRole.entities.Procedimento.list();
        const procedimentosMap = {};
        procedimentos.forEach(p => procedimentosMap[p.id] = p.nome);

        const resultados = agendamentos.map(ag => {
            return {
                ...ag,
                medico_nome: medicosMap[ag.medico_id] || 'Desconhecido',
                procedimento_nome: ag.procedimento_id ? procedimentosMap[ag.procedimento_id] : 'N/A',
                itens_detalhados: (ag.itens_servico || []).map(item => ({
                    ...item,
                    medico_nome: item.medico_id ? medicosMap[item.medico_id] : null
                }))
            };
        });

        return Response.json({ count: resultados.length, resultados });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});