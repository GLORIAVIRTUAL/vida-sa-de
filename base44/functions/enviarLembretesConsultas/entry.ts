import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
        const token = Deno.env.get('ZAPI_TOKEN');
        const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

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
        const agendamentosValidos = todosAgendamentos.filter(a => 
            ['Agendado', 'Confirmado'].includes(a.status)
        );

        console.log(`📊 Total de agendamentos para amanhã: ${agendamentosValidos.length}`);

        // Verificar quais já receberam lembrete (usando ScheduledNotification ou NotificationLog)
        const notificacoesEnviadas = await base44.asServiceRole.entities.NotificationLog.filter({});
        const agendamentosNotificados = new Set(
            notificacoesEnviadas
                .filter(n => n.agendamento_id && n.mensagem_enviada?.includes('lembrete'))
                .map(n => n.agendamento_id)
        );

        // Buscar dados dos pacientes
        const pacientesIds = [...new Set(agendamentosValidos.map(a => a.paciente_id).filter(Boolean))];
        const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 1000);
        const pacientesMap = new Map(todosPacientes.map(p => [p.id, p]));

        // Buscar médicos para incluir nome
        const medicosIds = [...new Set(agendamentosValidos.map(a => a.medico_id).filter(Boolean))];
        const todosMedicos = await base44.asServiceRole.entities.Medico.list('-created_date', 100);
        const medicosMap = new Map(todosMedicos.map(m => [m.id, m]));

        let enviados = 0;
        let erros = 0;
        const resultados = [];

        for (const agendamento of agendamentosValidos) {
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

            // Formatar data para exibição
            const [ano, mes, dia] = dataAmanha.split('-');
            const dataFormatada = `${dia}/${mes}/${ano}`;

            // Montar mensagem
            const mensagem = `Olá, ${primeiroNome}! 😊\n\n` +
                `Passando para lembrar da sua consulta *amanhã (${dataFormatada})* às *${agendamento.horario}* ` +
                `com ${nomeMedico}.\n\n` +
                `📍 *Centro Vida Saúde*\n` +
                `Tristão Monteiro, 580 – Bairro Zona Nova, Tramandaí/RS – CEP: 95590-000 (próximo ao fórum)\n\n` +
                `📌 *Localização:* https://www.google.com/maps/place/29%C2%B059'49.5%22S+50%C2%B008'34.3%22W/@-29.997081,-50.1428653\n\n` +
                `Por favor, chegue com *10 minutos de antecedência*.\n\n` +
                `Responda *SIM* para confirmar sua presença ou entre em contato caso precise reagendar.\n\n` +
                `Até amanhã! 🙏`;

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
                                humano: false
                            });
                            await base44.asServiceRole.entities.Contato.update(contato.id, {
                                historico_mensagens: historico,
                                ultima_resposta: mensagem,
                                ultima_interacao: timestampEnvio
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

            // Pequeno delay entre envios para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`📊 Resumo: ${enviados} enviados, ${erros} erros`);

        return Response.json({
            success: true,
            dataAmanha,
            totalAgendamentos: agendamentosValidos.length,
            enviados,
            erros,
            resultados
        });

    } catch (error) {
        console.error('❌ Erro geral:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});