import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        // Payload opcional (continuação em cadeia)
        let payload = {};
        try { payload = await req.json(); } catch (_) { /* sem body */ }
        const execucao = Number(payload?.execucao || 1);
        const dryRun = payload?.dryRun === true;

        const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
        const token = Deno.env.get('ZAPI_TOKEN');
        const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

        // Continuação interna da fila é autorizada pela chave interna; demais chamadas exigem admin
        const continuacaoInterna = Number(payload?.execucao || 1) > 1 && payload?.internalKey === clientToken;
        if (!continuacaoInterna) {
            const user = await base44.auth.me();
            if (user?.role !== 'admin') {
                return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
            }
        }

        if (!instanceId || !token || !clientToken) {
            return Response.json({ error: 'Z-API não configurado' }, { status: 500 });
        }

        // Calcular data de amanhã (24 horas a partir de agora)
        const agora = new Date();
        const amanha = new Date(agora);
        amanha.setDate(amanha.getDate() + 1);
        const dataAmanha = amanha.toISOString().split('T')[0]; // formato YYYY-MM-DD

        console.log(`📅 Buscando agendamentos para ${dataAmanha}...`);

        // Buscar agendamentos de amanhã que ainda não foram notificados
        const todosAgendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            data_agendamento: dataAmanha
        });

        // Filtrar apenas os que estão "Agendado" ou "Confirmado" (não cancelados/finalizados)
        const agendamentosValidos = todosAgendamentos.filter(a => {
            if (!['Agendado', 'Confirmado'].includes(a.status)) return false;
            
            // Ignorar agendamentos de Turmas e Grupos (não precisam de confirmação)
            const isTurma = a.is_recorrente || 
                (a.observacoes && a.observacoes.toLowerCase().includes('aula de')) ||
                ['Hidroginástica', 'Pilates', 'Natação', 'Aula Coletiva'].includes(a.tipo_servico);
                
            return !isTurma;
        });

        console.log(`📊 Total de agendamentos para amanhã: ${agendamentosValidos.length}`);

        // Verificar quais já receberam lembrete — busca apenas logs recentes (últimos 3 dias)
        const tresDiasAtras = new Date();
        tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
        const notificacoesEnviadas = await base44.asServiceRole.entities.NotificationLog.filter({
            timestamp_envio: { $gte: tresDiasAtras.toISOString() }
        });
        const agendamentosNotificados = new Set(
            notificacoesEnviadas
                .filter(n => n.agendamento_id && n.mensagem_enviada?.includes('lembrete'))
                .map(n => n.agendamento_id)
        );

        // Buscar diretamente cada paciente vinculado, sem limite por antiguidade do cadastro
        const pacientesIds = [...new Set(agendamentosValidos.map(a => a.paciente_id).filter(Boolean))];
        const pacientesResultados = await Promise.allSettled(
            pacientesIds.map(id => base44.asServiceRole.entities.Paciente.get(id))
        );
        const pacientesMap = new Map();
        pacientesResultados.forEach((resultado, index) => {
            if (resultado.status === 'fulfilled' && resultado.value) {
                pacientesMap.set(pacientesIds[index], resultado.value);
            } else {
                console.error(`⚠️ Paciente não localizado: ${pacientesIds[index]}`);
            }
        });

        if (dryRun) {
            return Response.json({
                success: true,
                dryRun: true,
                dataAmanha,
                totalAgendamentos: agendamentosValidos.length,
                pacientesVinculados: pacientesIds.length,
                pacientesLocalizados: pacientesMap.size
            });
        }

        // Buscar médicos para incluir nome
        const medicosIds = [...new Set(agendamentosValidos.map(a => a.medico_id).filter(Boolean))];
        const todosMedicos = await base44.asServiceRole.entities.Medico.list('-created_date', 100);
        const medicosMap = new Map(todosMedicos.map(m => [m.id, m]));

        let enviados = 0;
        let erros = 0;
        const resultados = [];

        // Orçamento de tempo por execução: evita estourar o limite da função.
        // Se sobrar gente para notificar, a função se auto-reinvoca e continua.
        const inicioExecucao = Date.now();
        const TEMPO_LIMITE_MS = 60000;
        let interrompidoPorTempo = false;

        for (const agendamento of agendamentosValidos) {
            if (Date.now() - inicioExecucao > TEMPO_LIMITE_MS) {
                interrompidoPorTempo = true;
                break;
            }
            // Pular se já foi notificado
            if (agendamentosNotificados.has(agendamento.id)) {
                console.log(`⏭️ Agendamento ${agendamento.id} já notificado, pulando...`);
                continue;
            }

            const paciente = pacientesMap.get(agendamento.paciente_id);
            if (!paciente || !paciente.telefone) {
                console.log(`⚠️ Paciente sem telefone: ${agendamento.paciente_nome || agendamento.paciente_id}`);
                continue;
            }

            const medico = medicosMap.get(agendamento.medico_id);
            const nomeMedico = medico?.nome || 'profissional';
            const primeiroNome = paciente.nome?.split(' ')[0] || 'Paciente';

            // Formatar data para exibição (ex: 26 de agosto)
            const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
            const [ano, mes, dia] = dataAmanha.split('-');
            const dataFormatada = `${Number(dia)} de ${MESES[Number(mes) - 1]}`;

            const nomeMedicoFormatado = nomeMedico.startsWith('Dr') ? nomeMedico : `Dr(a). ${nomeMedico}`;
            const procedimentoTexto = agendamento.tipo_servico || 'Consulta';

            // Mesmo modelo usado nas notificações manuais (Lembrete de Consulta), sem link.
            const mensagem = `Olá ${primeiroNome}, aqui é a Glória do Centro Vida Saúde! 🏥\n\n` +
                `Passando para lembrar da sua consulta:\n\n` +
                `👨‍⚕️ Profissional: ${nomeMedicoFormatado}\n` +
                `📋 Procedimento: ${procedimentoTexto}\n` +
                `📆 Data: ${dataFormatada}\n` +
                `🕐 Horário: ${agendamento.horario}\n\n` +
                `✅ *Responda SIM para confirmar sua presença*\n\n` +
                `Por favor, chegue com 10 minutos de antecedência. Aguardamos você! 😊`;

            // Formatar telefone
            let telefone = paciente.telefone.replace(/\D/g, '');
            if (!telefone.startsWith('55')) {
                telefone = '55' + telefone;
            }

            try {
                // Enviar via Z-API
                const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Client-Token': clientToken
                    },
                    body: JSON.stringify({
                        phone: telefone,
                        message: mensagem
                    })
                });

                const result = await response.json();

                if (response.ok && (result.zapiMessageId || result.messageId || result.zaapId)) {
                    const timestampEnvio = new Date().toISOString();
                    
                    // Registrar envio no log
                    await base44.asServiceRole.entities.NotificationLog.create({
                        tipo_canal: 'whatsapp',
                        api_message_id: result.zapiMessageId || result.messageId || result.zaapId,
                        telefone_destino: telefone,
                        mensagem_enviada: `[lembrete 24h] ${mensagem.substring(0, 200)}...`,
                        agendamento_id: agendamento.id,
                        paciente_nome: paciente.nome,
                        status_entrega: 'enviado',
                        timestamp_envio: timestampEnvio
                    });

                    // Registrar no histórico do Contato para aparecer na conversa
                    try {
                        const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: telefone });
                        let contato = contatos?.[0];
                        if (!contato) {
                            const telSem55 = telefone.startsWith('55') ? telefone.slice(2) : telefone;
                            const contatos2 = await base44.asServiceRole.entities.Contato.filter({ telefone: telSem55 });
                            contato = contatos2?.[0];
                        }
                        if (contato) {
                            const historico = contato.historico_mensagens || [];
                            historico.push({
                                role: 'assistant',
                                content: `📢 [Lembrete Automático 24h]\n${mensagem}`,
                                timestamp: timestampEnvio,
                                humano: true
                            });
                            await base44.asServiceRole.entities.Contato.update(contato.id, {
                                historico_mensagens: historico,
                                ultima_resposta: mensagem,
                                ultima_interacao: timestampEnvio,
                                atendimento_humano: true,
                                conversa_finalizada: false
                            });
                        } else {
                            // Criar contato automaticamente se não existir
                            console.log(`📝 Criando contato para ${paciente.nome} (${telefone})`);
                            await base44.asServiceRole.entities.Contato.create({
                                nome: paciente.nome || 'Cliente',
                                telefone: telefone,
                                origem: 'Manual',
                                status: 'Cliente',
                                atendimento_humano: true,
                                paciente_id: agendamento.paciente_id || null,
                                historico_mensagens: [{
                                    role: 'assistant',
                                    content: `📢 [Lembrete Automático 24h]\n${mensagem}`,
                                    timestamp: timestampEnvio,
                                    humano: false
                                }],
                                ultima_resposta: mensagem,
                                ultima_interacao: timestampEnvio,
                                total_mensagens: 1
                            });
                            console.log(`✅ Contato criado automaticamente para ${paciente.nome}`);
                        }
                    } catch (histError) {
                        console.error(`⚠️ Erro ao registrar lembrete no histórico do contato:`, histError.message);
                    }

                    enviados++;
                    resultados.push({ paciente: paciente.nome, status: 'enviado' });
                    console.log(`✅ Lembrete enviado para ${paciente.nome} (${telefone})`);
                } else {
                    throw new Error(JSON.stringify(result));
                }

            } catch (error) {
                erros++;
                resultados.push({ paciente: paciente.nome, status: 'erro', erro: error.message });
                console.error(`❌ Erro ao enviar para ${paciente.nome}:`, error.message);
            }

            // Delay variável entre envios (entre 5s e 20s) para simular comportamento humano
            // e reduzir o risco de bloqueio do WhatsApp por envios em massa no mesmo ritmo.
            // Pula o delay se o orçamento de tempo já estourou (o break acontece na próxima volta).
            if (Date.now() - inicioExecucao <= TEMPO_LIMITE_MS) {
                const delayAleatorio = Math.floor(Math.random() * 4000) + 3000;
                await new Promise(resolve => setTimeout(resolve, delayAleatorio));
            }
        }

        // Se parou por tempo e ainda há agendamentos pendentes, dispara a continuação
        if (interrompidoPorTempo && execucao < 15) {
            console.log(`⏱️ Tempo limite atingido na execução ${execucao}, disparando continuação...`);
            const continuacao = base44.functions.invoke('enviarLembretesConsultas', { execucao: execucao + 1, internalKey: clientToken }).catch((e) => {
                console.error('⚠️ Erro ao disparar continuação:', e.message);
            });
            // Aguarda só o suficiente para a requisição de continuação ser despachada
            await Promise.race([continuacao, new Promise(resolve => setTimeout(resolve, 3000))]);
        }

        console.log(`📊 Resumo (execução ${execucao}): ${enviados} enviados, ${erros} erros${interrompidoPorTempo ? ' — continuação disparada' : ''}`);

        return Response.json({
            success: true,
            execucao,
            dataAmanha,
            totalAgendamentos: agendamentosValidos.length,
            enviados,
            erros,
            continuara: interrompidoPorTempo,
            resultados
        });

    } catch (error) {
        console.error('❌ Erro geral:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});