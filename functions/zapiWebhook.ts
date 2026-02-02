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
        console.log('🤖 Mensagem não é confirmação - encaminhando para chatbot IA...');
        
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
        
        // Encaminhar para o chatbot IA
        try {
            const resultadoChatbot = await base44.asServiceRole.functions.invoke('webhookWhatsappChatbot', {
                phone: telefone,
                fromMe: false,
                isGroup: false,
                text: { message: textoMensagem },
                senderName: payload.senderName || payload.chatName || 'Usuário',
                messageId: payload.messageId || payload.id,
                // Passar mídia se houver
                image: payload.image,
                document: payload.document,
                audio: payload.audio,
                video: payload.video,
                sticker: payload.sticker,
                location: payload.location
            });
            console.log('✅ Chatbot processou:', resultadoChatbot.data);
            return new Response(JSON.stringify({ message: "Encaminhado para chatbot", result: resultadoChatbot.data }), { status: 200 });
        } catch (chatbotError) {
            console.error('❌ Erro ao encaminhar para chatbot:', chatbotError.message);
            return new Response(JSON.stringify({ message: "Erro ao processar chatbot", error: chatbotError.message }), { status: 200 });
        }
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
    // Também buscar pelo nome do paciente no campo paciente_nome
    const nomesEncontrados = pacientesEncontrados.map(p => p.nome.toLowerCase());
    
    const agendamentos = todosAgendamentos.filter(a => {
        // Match por paciente_id
        const matchPorId = pacienteIds.includes(a.paciente_id);
        
        // Match por nome do paciente (para casos onde o ID não bate)
        const nomeAgendamentoLower = (a.paciente_nome || '').toLowerCase();
        const matchPorNome = nomesEncontrados.some(nome => 
            nomeAgendamentoLower.includes(nome.split(' ')[0]) || 
            nome.includes(nomeAgendamentoLower.split(' ')[0])
        );
        
        const statusOk = a.status === 'Agendado';
        const dataOk = a.data_agendamento >= hoje;
        
        if ((matchPorId || matchPorNome) && dataOk) {
            console.log(`🔍 Agendamento candidato: ${a.id} | ${a.paciente_nome} | ${a.data_agendamento} ${a.horario} | status=${a.status} | matchId=${matchPorId} matchNome=${matchPorNome}`);
        }
        
        return (matchPorId || matchPorNome) && statusOk && dataOk;
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