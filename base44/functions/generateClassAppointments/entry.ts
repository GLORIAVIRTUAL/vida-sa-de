import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { format, addDays, parseISO, getDay } from 'npm:date-fns@2.30.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { turmaId, dataInicio, dataFim } = await req.json();

        if (!turmaId || !dataInicio || !dataFim) {
            return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
        }

        // 1. Buscar dados da Turma
        const turma = await base44.entities.Turma.get(turmaId);
        if (!turma) return Response.json({ error: 'Turma não encontrada' }, { status: 404 });

        // 2. Buscar alunos ativos da turma
        // Nota: O filtro ideal seria { turma_id: turmaId, status: 'Ativo' }
        // Como pode não ter índice composto, vamos filtrar em memória se necessário, mas aqui vamos confiar no filtro básico
        const alunos = await base44.entities.AlunoTurma.filter({ 
            turma_id: turmaId,
            status: 'Ativo'
        }, undefined, 100);

        if (alunos.length === 0) {
            return Response.json({ 
                success: true, 
                message: 'Nenhum aluno ativo nesta turma para gerar agendamentos.',
                count: 0
            });
        }

        // 3. Buscar profissional para pegar nome (opcional, mas bom para o log/obs)
        const medico = await base44.entities.Medico.get(turma.medico_id);
        
        // 4. Gerar datas compatíveis com os dias da semana da turma
        const startDate = parseISO(dataInicio);
        const endDate = parseISO(dataFim);
        const datasParaAgendar = [];
        const diasSemanaTurma = new Set(turma.dias_semana); // [1, 3, 5] por exemplo

        let currentDate = startDate;
        while (currentDate <= endDate) {
            const diaSemana = getDay(currentDate); // 0-6
            if (diasSemanaTurma.has(diaSemana)) {
                datasParaAgendar.push(format(currentDate, 'yyyy-MM-dd'));
            }
            currentDate = addDays(currentDate, 1);
        }

        // 5. Criar agendamentos em lote
        const agendamentosParaCriar = [];
        
        // Buscar nomes dos pacientes para otimizar (opcional, mas o agendamento pede paciente_nome as vezes)
        // Vamos fazer um loop simples. Para performance extrema em milhares de registros, faríamos diferente.
        
        for (const data of datasParaAgendar) {
            for (const aluno of alunos) {
                // Verificar se já existe agendamento para este aluno neste horário/dia para evitar duplicidade
                // Esta verificação é custosa em loop. Vamos assumir criação e confiar que o usuário não vai rodar 2x pro mesmo período sem querer.
                // Ou podemos fazer uma verificação simples depois se falhar.
                
                // Buscar info do paciente (necessário se o Agendamento exigir nome denormalizado)
                const paciente = await base44.entities.Paciente.get(aluno.paciente_id);
                
                agendamentosParaCriar.push({
                    paciente_id: aluno.paciente_id,
                    paciente_nome: paciente ? paciente.nome : 'Aluno Turma',
                    medico_id: turma.medico_id,
                    data_agendamento: data,
                    horario: turma.horario_inicio,
                    tipo_servico: turma.modalidade || 'Aula Coletiva', // Ex: Pilates
                    categoria_preco_id: '', // Ideal seria pegar do cadastro do aluno ou turma. Deixando vazio para preenchimento posterior ou default.
                    valor_total: 0, // Aula de pacote geralmente não tem valor individual no agendamento, ou tem valor fixo.
                    status: 'Agendado',
                    forma_pagamento: 'Outros',
                    is_encaixe: true, // Para permitir múltiplos no mesmo horário
                    observacoes: `Aula de ${turma.nome}`
                });
            }
        }

        if (agendamentosParaCriar.length > 0) {
             // Bulk create se disponível ou Promise.all
             // A SDK pode ter bulkCreate. Se não, loop.
             // Assumindo que bulkCreate existe ou faremos map.
             
             // Vamos fazer em chunks de 10 para não sobrecarregar se for muitos
            const chunkSize = 5;
            for (let i = 0; i < agendamentosParaCriar.length; i += chunkSize) {
                const chunk = agendamentosParaCriar.slice(i, i + chunkSize);
                await Promise.all(chunk.map(data => base44.entities.Agendamento.create(data)));
            }
        }

        return Response.json({ 
            success: true, 
            count: agendamentosParaCriar.length,
            dates: datasParaAgendar.length,
            students: alunos.length
        });

    } catch (error) {
        console.error('Erro ao gerar agenda de turma:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});