import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ message: "Método não permitido. Use POST." }), { status: 405 });
    }

    try {
        const payload = await req.json();
        
        console.log('📨 Z-API Webhook recebido:', JSON.stringify(payload, null, 2));

        // Verificar se é uma mensagem RECEBIDA (do paciente) - múltiplos formatos
        // NOTA: Também aceita fromMe=true para casos de teste onde o mesmo número envia confirmação
        const temMensagemTexto = payload.text?.message || payload.body || payload.message;
        const temMidia = payload.image || payload.document || payload.audio || payload.video || payload.sticker;
        const temConteudo = temMensagemTexto || temMidia;
        const isReceivedMessage = 
            (payload.isGroup === false && payload.fromMe === false && temConteudo) ||
            (payload.event === 'message' && payload.fromMe === false) ||
            (payload.phone && temConteudo && !payload.fromMe);
        
        // Verificar se é uma confirmação (SIM) - aceita mesmo de fromMe=true para testes
        const mensagemTexto = (temMensagemTexto || '').toLowerCase().trim();
        const palavrasConfirmacao = ['sim', 'confirmo', 'confirmar', 'confirmado', 'ok', 'vou', 'estarei', 'irei', 's', '1', 'yes'];
        const ehConfirmacao = palavrasConfirmacao.some(p => mensagemTexto === p || mensagemTexto.startsWith(p + ' '));
        
        // Processar se for mensagem recebida OU se for confirmação (mesmo de fromMe=true)
        if (isReceivedMessage || (payload.phone && ehConfirmacao && !payload.fromApi)) {
            console.log('✅ Mensagem recebida detectada - processando...', { fromMe: payload.fromMe, ehConfirmacao });
            return await processarMensagemRecebida(base44, payload);
        }

        // Caso seja atualização de STATUS de mensagem enviada
        const messageId = payload.id || payload.messageId;
        const status = payload.status;

        if (messageId && status) {
            console.log('📊 Atualização de status:', { messageId, status });
            return await processarStatusMensagem(base44, messageId, status);
        }

        console.log('ℹ️ Payload não processado:', Object.keys(payload));
        return new Response(JSON.stringify({ message: "OK" }), { status: 200 });

    } catch (error) {
        console.error('❌ Erro no webhook Z-API:', error.message);
        return new Response(JSON.stringify({ error: 'Erro interno', details: error.message }), { status: 500 });
    }
});

// Cache simples para evitar processamento duplicado (em memória por instância)
const processedMessages = new Map();
const CACHE_TTL_MS = 60000; // 1 minuto

function isMessageProcessed(messageId) {
    const now = Date.now();
    // Limpar entradas antigas
    for (const [key, timestamp] of processedMessages.entries()) {
        if (now - timestamp > CACHE_TTL_MS) {
            processedMessages.delete(key);
        }
    }
    return processedMessages.has(messageId);
}

function markMessageProcessed(messageId) {
    processedMessages.set(messageId, Date.now());
}

// Processa mensagens recebidas dos pacientes (confirmações)
async function processarMensagemRecebida(base44, payload) {
    const messageId = payload.messageId || payload.id;
    
    // ANTI-DUPLICATA: Verificar se esta mensagem já foi processada
    if (messageId && isMessageProcessed(messageId)) {
        console.log('⏭️ Mensagem já processada (cache). Ignorando duplicata:', messageId);
        return new Response(JSON.stringify({ message: "Duplicata ignorada" }), { status: 200 });
    }
    
    // Marcar como processada IMEDIATAMENTE
    if (messageId) {
        markMessageProcessed(messageId);
    }
    
    // IMPORTANTE: Para mensagens enviadas PELA clínica (fromMe=true), o 'phone' é o destinatário (paciente)
    // Para mensagens RECEBIDAS (fromMe=false), o 'phone' também é o remetente (paciente)
    // O 'connectedPhone' é sempre o número conectado ao Z-API (clínica)
    const telefone = payload.phone || payload.from;
    const mensagem = (payload.text?.message || payload.body || payload.message || '').toLowerCase().trim();
    
    console.log('📱 Telefone raw:', telefone, '| connectedPhone:', payload.connectedPhone, '| fromMe:', payload.fromMe);
    
    console.log('📱 Processando mensagem:', { telefone, mensagem, messageId });

    // Palavras-chave para confirmação
    const palavrasConfirmacao = ['sim', 'confirmo', 'confirmar', 'confirmado', 'ok', 'vou', 'estarei', 'irei', 's', '1', 'yes'];
    const ehConfirmacao = palavrasConfirmacao.some(p => mensagem === p || mensagem.startsWith(p + ' '));

    if (!ehConfirmacao) {
        console.log('🤖 Mensagem não é confirmação - verificando modo de atendimento...');
        
        // Determinar o texto da mensagem baseado no tipo de mídia
        let textoMensagem = mensagem;
        if (!textoMensagem && payload.document) {
            textoMensagem = `[Documento: ${payload.document.fileName || 'arquivo'}]`;
        } else if (!textoMensagem && payload.image) {
            textoMensagem = payload.image.caption || '[Imagem recebida]';
        } else if (!textoMensagem && payload.audio) {
            textoMensagem = '[Áudio recebido]';
        } else if (!textoMensagem && payload.video) {
            textoMensagem = payload.video.caption || '[Vídeo recebido]';
        } else if (!textoMensagem && payload.sticker) {
            textoMensagem = '[Sticker recebido]';
        }
        
        console.log('📎 Mídia detectada:', {
            temDocumento: !!payload.document,
            temImagem: !!payload.image,
            temAudio: !!payload.audio,
            temVideo: !!payload.video,
            textoMensagem
        });
        
        // Verificar se o contato existe e está em modo humano
        const agora = new Date().toISOString();
        const senderName = payload.senderName || payload.chatName || 'Usuário';
        const msgId = payload.messageId || payload.id;
        
        // Extrair mídia URL
        let mediaUrl = null;
        let mediaType = 'text';
        if (payload.image) {
            mediaType = 'image';
            mediaUrl = payload.image.imageUrl || payload.image.url;
        } else if (payload.document) {
            mediaType = 'document';
            mediaUrl = payload.document.documentUrl || payload.document.url;
        } else if (payload.audio) {
            mediaType = 'audio';
            mediaUrl = payload.audio.audioUrl || payload.audio.url;
        } else if (payload.video) {
            mediaType = 'video';
            mediaUrl = payload.video.videoUrl || payload.video.url;
        }
        
        try {
            // Normalizar telefone para busca - buscar com e sem código de país
            const telNormalizado = telefone.replace(/\D/g, '');
            const variantes = [telefone, telNormalizado];
            if (telNormalizado.startsWith('55') && telNormalizado.length >= 12) {
                variantes.push(telNormalizado.slice(2)); // sem código país
            }
            if (!telNormalizado.startsWith('55') && telNormalizado.length >= 10) {
                variantes.push('55' + telNormalizado); // com código país
            }
            
            let contatos = [];
            for (const variante of variantes) {
                if (contatos.length > 0) break;
                contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: variante });
            }
            
            // Se encontrou múltiplos contatos para o mesmo número, unificar
            if (contatos.length <= 1) {
                // Tentar busca mais ampla se não encontrou
                if (contatos.length === 0) {
                    const todosContatos = await base44.asServiceRole.entities.Contato.list('-created_date', 500);
                    const ultimos8 = telNormalizado.slice(-8);
                    contatos = todosContatos.filter(c => {
                        const tel = (c.telefone || '').replace(/\D/g, '');
                        return tel.slice(-8) === ultimos8;
                    });
                }
            }
            
            // Unificar contatos duplicados - manter o mais antigo, mesclar histórico
            if (contatos.length > 1) {
                console.log(`⚠️ ${contatos.length} contatos encontrados para ${telefone} - unificando...`);
                contatos.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
                const principal = contatos[0];
                let historicoUnificado = [...(principal.historico_mensagens || [])];
                
                for (let i = 1; i < contatos.length; i++) {
                    const duplicado = contatos[i];
                    const histDup = duplicado.historico_mensagens || [];
                    // Mesclar mensagens que não existem no principal
                    for (const msg of histDup) {
                        const jaExiste = historicoUnificado.some(m => 
                            m.timestamp === msg.timestamp && m.content === msg.content
                        );
                        if (!jaExiste) historicoUnificado.push(msg);
                    }
                    // Deletar contato duplicado
                    try {
                        await base44.asServiceRole.entities.Contato.delete(duplicado.id);
                        console.log(`🗑️ Contato duplicado removido: ${duplicado.id} (${duplicado.nome})`);
                    } catch (e) {
                        console.error('Erro ao deletar duplicado:', e.message);
                    }
                }
                
                // Ordenar histórico por timestamp
                historicoUnificado.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
                
                // Atualizar principal com histórico unificado
                await base44.asServiceRole.entities.Contato.update(principal.id, {
                    historico_mensagens: historicoUnificado.slice(-100),
                    telefone: telefone // Garantir que o telefone está no formato mais recente
                });
                
                contatos = [principal];
                console.log(`✅ Contatos unificados no principal: ${principal.id}`);
            }
            
            if (contatos.length > 0) {
                const contato = contatos[0];
                
                // PADRÃO: Se atendimento_humano não está definido, assume HUMANO (true)
                const estaEmModoHumano = contato.atendimento_humano !== false;
                
                if (estaEmModoHumano) {
                    // Modo HUMANO: salvar mensagem no histórico aqui
                    const historicoAtual = contato.historico_mensagens || [];
                    historicoAtual.push({
                        role: 'user',
                        content: mediaUrl ? `${textoMensagem}\n${mediaUrl}` : textoMensagem,
                        timestamp: agora,
                        mediaType: mediaType,
                        mediaUrl: mediaUrl,
                        messageId: msgId
                    });
                    await base44.asServiceRole.entities.Contato.update(contato.id, {
                        historico_mensagens: historicoAtual.slice(-50),
                        ultima_interacao: agora,
                        nome: contato.nome || senderName,
                        conversa_finalizada: false,
                        atendimento_humano: true
                    });
                    console.log('👤 Contato em atendimento HUMANO (padrão) - mensagem salva, NÃO processando IA');
                    return new Response(JSON.stringify({ message: "Atendimento humano", status: "salvo" }), { status: 200 });
                } else {
                    // Modo IA: Encaminhar para webhookWhatsappChatbot via invoke (com autenticação)
                    // Z-API NÃO pode chamar webhookWhatsappChatbot diretamente (precisa de auth Base44)
                    console.log('🤖 Contato em modo IA - encaminhando para webhookWhatsappChatbot...');
                    
                    try {
                        const resultado = await base44.asServiceRole.functions.invoke('webhookWhatsappChatbot', payload);
                        console.log('✅ webhookWhatsappChatbot retornou:', JSON.stringify(resultado.data).substring(0, 200));
                        return new Response(JSON.stringify(resultado.data), { status: 200 });
                    } catch (invokeError) {
                        console.error('❌ Erro ao encaminhar para webhookWhatsappChatbot:', invokeError.message);
                        return new Response(JSON.stringify({ error: invokeError.message }), { status: 500 });
                    }
                }
            } else {
                // Novo contato - criar em modo HUMANO
                const historicoInicial = [{
                    role: 'user',
                    content: mediaUrl ? `${textoMensagem}\n${mediaUrl}` : textoMensagem,
                    timestamp: agora,
                    mediaType: mediaType,
                    mediaUrl: mediaUrl,
                    messageId: msgId
                }];
                
                await base44.asServiceRole.entities.Contato.create({
                    nome: senderName,
                    telefone: telefone,
                    origem: 'WhatsApp',
                    status: 'Novo',
                    atendimento_humano: true, // SEMPRE começa em modo HUMANO
                    atendente_atual: null,
                    atendente_id: null,
                    historico_mensagens: historicoInicial,
                    ultima_interacao: agora
                });
                
                console.log('👤 Novo contato criado em modo HUMANO - NÃO processando IA');
                return new Response(JSON.stringify({ message: "Novo contato em modo humano", status: "salvo" }), { status: 200 });
            }
        } catch (contatoError) {
            console.error('⚠️ Erro ao verificar/criar contato:', contatoError.message);
        }
        
        // Se chegou aqui sem retornar, algo inesperado aconteceu
        console.log('⚠️ Fluxo inesperado - retornando OK');
        return new Response(JSON.stringify({ message: "OK" }), { status: 200 });
    }
    
    console.log('✅ Confirmação detectada!');

    // Normalizar telefone
    const telefoneNormalizado = telefone.replace(/\D/g, '');
    const ultimos8Digitos = telefoneNormalizado.slice(-8);
    const ultimos9Digitos = telefoneNormalizado.slice(-9);
    const ultimos11Digitos = telefoneNormalizado.slice(-11);

    console.log('🔍 Telefone recebido:', telefone);
    console.log('🔍 Telefone normalizado:', telefoneNormalizado);
    console.log('🔍 Últimos 8/9/11 dígitos:', ultimos8Digitos, ultimos9Digitos, ultimos11Digitos);

    // Buscar todos os pacientes
    const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 1000);
    console.log('📊 Total de pacientes:', todosPacientes.length);
    
    // Encontrar TODOS os pacientes que correspondem ao telefone
    const pacientesEncontrados = [];
    for (const p of todosPacientes) {
        if (!p.telefone) continue;
        const telPaciente = p.telefone.replace(/\D/g, '');
        if (telPaciente.length < 8) continue;
        
        // Log para debug - mostrar comparação
        if (p.nome.toLowerCase().includes('antonio')) {
            console.log(`🔎 Comparando com ${p.nome}: tel=${telPaciente}, últimos8=${telPaciente.slice(-8)}`);
        }
        
        if (telPaciente.endsWith(ultimos8Digitos) || 
            telPaciente.endsWith(ultimos9Digitos) ||
            telefoneNormalizado.endsWith(telPaciente.slice(-8)) ||
            telefoneNormalizado.endsWith(telPaciente.slice(-9)) ||
            telPaciente === ultimos11Digitos) {
            pacientesEncontrados.push(p);
            console.log('✅ Match encontrado:', p.nome, p.telefone);
        }
    }
    
    // Pegar IDs de todos os pacientes encontrados
    const pacienteIds = pacientesEncontrados.map(p => p.id);

    if (pacientesEncontrados.length === 0) {
        console.log('❌ Paciente não encontrado para telefone:', telefoneNormalizado);
        return new Response(JSON.stringify({ 
            message: "Paciente não encontrado",
            telefone: telefoneNormalizado,
            totalPacientes: todosPacientes.length
        }), { status: 200 });
    }
    
    console.log('👤 Pacientes encontrados:', pacientesEncontrados.map(p => p.nome));

    // Buscar agendamentos futuros de QUALQUER um dos pacientes encontrados com status "Agendado"
    const hoje = new Date().toISOString().split('T')[0];
    
    // Buscar agendamentos futuros diretamente (mais eficiente)
    const todosAgendamentos = await base44.asServiceRole.entities.Agendamento.filter({
        data_agendamento: { $gte: hoje }
    });
    
    console.log('📊 Total de agendamentos no sistema:', todosAgendamentos.length);
    console.log('📅 Data de hoje:', hoje);
    console.log('🆔 IDs dos pacientes:', pacienteIds);
    
    // Filtrar agendamentos que pertencem a qualquer um dos pacientes encontrados
    // APENAS por paciente_id - NÃO usar match por primeiro nome pois causa falsos positivos
    // (ex: "Antonio Thiago" e "Antonio Simon" são pacientes diferentes)
    
    const agendamentos = todosAgendamentos.filter(a => {
        // Match APENAS por paciente_id - mais seguro
        const matchPorId = pacienteIds.includes(a.paciente_id);
        
        // Match por nome COMPLETO (não apenas primeiro nome) como fallback
        const nomeAgendamentoLower = (a.paciente_nome || '').toLowerCase().trim();
        const matchPorNomeCompleto = pacientesEncontrados.some(p => {
            const nomePacienteLower = (p.nome || '').toLowerCase().trim();
            // Exigir match do nome completo ou quase completo (pelo menos 2 palavras coincidindo)
            return nomeAgendamentoLower === nomePacienteLower ||
                   (nomePacienteLower.split(' ').filter(w => w.length > 2 && nomeAgendamentoLower.includes(w)).length >= 2 &&
                    nomeAgendamentoLower.split(' ').filter(w => w.length > 2 && nomePacienteLower.includes(w)).length >= 2);
        });
        
        const statusOk = a.status === 'Agendado';
        const dataOk = a.data_agendamento >= hoje;
        
        if ((matchPorId || matchPorNomeCompleto) && dataOk) {
            console.log(`🔍 Agendamento candidato: ${a.id} | ${a.paciente_nome} | ${a.data_agendamento} ${a.horario} | status=${a.status} | matchId=${matchPorId} matchNome=${matchPorNomeCompleto}`);
        }
        
        return (matchPorId || matchPorNomeCompleto) && statusOk && dataOk;
    });

    if (agendamentos.length === 0) {
        console.log('❌ Nenhum agendamento com status "Agendado" para:', pacientesEncontrados.map(p => p.nome));
        
        // Log de debug - mostrar agendamentos futuros sem filtro de status
        const agendamentosSemFiltroStatus = todosAgendamentos.filter(a => {
            const matchPorId = pacienteIds.includes(a.paciente_id);
            const nomeAgendamentoLower = (a.paciente_nome || '').toLowerCase();
            const matchPorNome = nomesEncontrados.some(nome => 
                nomeAgendamentoLower.includes(nome.split(' ')[0])
            );
            return (matchPorId || matchPorNome) && a.data_agendamento >= hoje;
        });
        
        console.log('📋 Agendamentos futuros (todos status):', agendamentosSemFiltroStatus.map(a => ({
            id: a.id,
            paciente: a.paciente_nome,
            data: a.data_agendamento,
            horario: a.horario,
            status: a.status
        })));
        
        return new Response(JSON.stringify({ 
            message: "Nenhum agendamento pendente",
            pacientesEncontrados: pacientesEncontrados.map(p => ({ id: p.id, nome: p.nome })),
            totalAgendamentosEncontrados: todosAgendamentos.length,
            agendamentosFuturos: agendamentosSemFiltroStatus.length
        }), { status: 200 });
    }
    
    console.log('📅 Agendamentos encontrados:', agendamentos.length);

    // Ordenar agendamentos por data/horário
    const agendamentosOrdenados = agendamentos.sort((a, b) => {
        const dataA = new Date(`${a.data_agendamento}T${a.horario || '00:00'}`);
        const dataB = new Date(`${b.data_agendamento}T${b.horario || '00:00'}`);
        return dataA - dataB;
    });
    
    // Verificar se há apenas um agendamento - confirmar diretamente
    // Se há múltiplos, confirmar o mais próximo (geralmente é o que recebeu lembrete)
    const agendamentoParaConfirmar = agendamentosOrdenados[0];
    
    // Encontrar o paciente específico deste agendamento
    const pacienteDoAgendamento = pacientesEncontrados.find(p => p.id === agendamentoParaConfirmar.paciente_id) || pacientesEncontrados[0];

    console.log('🔄 Confirmando agendamento:', agendamentoParaConfirmar.id, 'de', agendamentoParaConfirmar.paciente_nome || pacienteDoAgendamento.nome);
    console.log('📋 Total de agendamentos elegíveis:', agendamentosOrdenados.length);
    if (agendamentosOrdenados.length > 1) {
        console.log('⚠️ Múltiplos agendamentos encontrados - confirmando o mais próximo');
        agendamentosOrdenados.forEach((a, i) => console.log(`   ${i+1}. ${a.paciente_nome} - ${a.data_agendamento} ${a.horario}`));
    }
    
    // Usar nome do agendamento se disponível, senão usar do paciente
    const nomeParaMensagem = agendamentoParaConfirmar.paciente_nome || pacienteDoAgendamento.nome;
    
    await base44.asServiceRole.entities.Agendamento.update(agendamentoParaConfirmar.id, {
        status: 'Confirmado'
    });
    
    console.log('✅ Agendamento confirmado com sucesso!');

    // Criar notificação para a equipe
    try {
        await base44.asServiceRole.entities.Notification.create({
            type: 'confirmacao_recebida',
            message: `✅ ${nomeParaMensagem} confirmou presença para ${agendamentoParaConfirmar.data_agendamento} às ${agendamentoParaConfirmar.horario} via WhatsApp`,
            data: { 
                agendamentoId: agendamentoParaConfirmar.id,
                pacienteNome: nomeParaMensagem,
                telefone: telefone
            }
        });
    } catch (e) {
        // Ignora erro de notificação
    }

    // Enviar mensagem de confirmação de volta
    try {
        await enviarMensagemZapi(telefone, 
            `✅ Perfeito, ${nomeParaMensagem.split(' ')[0]}! Sua presença está confirmada para o dia ${formatarData(agendamentoParaConfirmar.data_agendamento)} às ${agendamentoParaConfirmar.horario}.\n\nLembre-se de chegar com 10 minutos de antecedência. Até lá! 😊\n\n*Centro Vida Saúde*`
        );
    } catch (e) {
        // Ignora erro de envio
    }

    return new Response(JSON.stringify({ 
        message: "Confirmação processada",
        agendamentoId: agendamentoParaConfirmar.id,
        paciente: nomeParaMensagem
    }), { status: 200 });
}

// Processa atualizações de status de mensagens enviadas
async function processarStatusMensagem(base44, messageId, status) {
    let nossoStatus;
    switch (status) {
        case 'SENT': nossoStatus = 'enviado'; break;
        case 'DELIVERED': nossoStatus = 'entregue'; break;
        case 'READ': nossoStatus = 'lido'; break;
        case 'FAIL':
        case 'NOT_SENT': nossoStatus = 'falhou'; break;
        default: return new Response(JSON.stringify({ message: "OK" }), { status: 200 });
    }
    
    const notificationLogs = await base44.asServiceRole.entities.NotificationLog.filter({
        api_message_id: messageId
    });
    
    if (notificationLogs && notificationLogs.length > 0) {
        await base44.asServiceRole.entities.NotificationLog.update(notificationLogs[0].id, {
            status_entrega: nossoStatus
        });
    }

    return new Response(JSON.stringify({ message: "Status atualizado" }), { status: 200 });
}

function formatarData(dataStr) {
    try {
        const d = new Date(dataStr + 'T12:00:00');
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dataStr;
    }
}

async function enviarMensagemZapi(telefone, mensagem) {
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    const telefoneFormatado = telefone.replace(/\D/g, '');
    
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Client-Token': clientToken
        },
        body: JSON.stringify({
            phone: telefoneFormatado,
            message: mensagem
        })
    });

    return response.json();
}