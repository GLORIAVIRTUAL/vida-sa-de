import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ message: "Método não permitido. Use POST." }), { status: 405 });
    }

    try {
        const payload = await req.json();
        
        console.log('📨 Z-API Webhook recebido:', JSON.stringify(payload, null, 2));

        // IGNORAR mensagens enviadas pela própria API (fromApi=true ou fromMe=true)
        // Esses são callbacks da Z-API notificando que NOSSA mensagem foi enviada
        if (payload.fromApi === true) {
            console.log('⏭️ Ignorando callback de mensagem enviada pela API (fromApi=true)');
            return new Response(JSON.stringify({ message: "Callback API ignorado" }), { status: 200 });
        }
        
        if (payload.fromMe === true) {
            // fromMe=true pode ser confirmação manual OU callback de envio
            // Se tem status, é callback de status - tratar abaixo
            // Se não, ignorar (é eco da nossa própria mensagem)
            const temStatus = payload.status;
            if (!temStatus) {
                console.log('⏭️ Ignorando mensagem fromMe=true (eco da própria mensagem enviada)');
                return new Response(JSON.stringify({ message: "Eco ignorado" }), { status: 200 });
            }
        }
        
        // Verificar se é uma mensagem RECEBIDA (do paciente) - múltiplos formatos
        const temMensagemTexto = payload.text?.message || payload.body || payload.message;
        const temMidia = payload.image || payload.document || payload.audio || payload.video || payload.sticker;
        const temConteudo = temMensagemTexto || temMidia;
        const isReceivedMessage = 
            (payload.isGroup === false && payload.fromMe === false && temConteudo) ||
            (payload.event === 'message' && payload.fromMe === false) ||
            (payload.phone && temConteudo && !payload.fromMe);
        
        // Verificar se é uma confirmação (SIM) - apenas de mensagens RECEBIDAS (fromMe=false)
        const mensagemTexto = (temMensagemTexto || '').toLowerCase().trim();
        const palavrasConfirmacao = ['sim', 'confirmo', 'confirmar', 'confirmado', 'ok', 'vou', 'estarei', 'irei', 's', '1', 'yes'];
        const ehConfirmacao = palavrasConfirmacao.some(p => mensagemTexto === p || mensagemTexto.startsWith(p + ' '));
        
        // Processar apenas mensagens recebidas do paciente
        if (isReceivedMessage || (payload.phone && ehConfirmacao && !payload.fromMe && !payload.fromApi)) {
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

    // Se é confirmação, verificar se houve um LEMBRETE enviado recentemente (últimas 48h)
    // Se não houve lembrete, NÃO confirmar agendamento - tratar como mensagem normal para a IA responder
    let ehConfirmacaoReal = ehConfirmacao;
    if (ehConfirmacao) {
        console.log('🔍 Possível confirmação detectada - verificando se houve lembrete recente...');
        const telefoneNorm = telefone.replace(/\D/g, '');
        try {
            const logsRecentes = await base44.asServiceRole.entities.NotificationLog.list('-created_date', 50);
            const agora48hAtras = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            const houvaLembreteRecente = logsRecentes.some(log => {
                const telLog = (log.telefone_destino || '').replace(/\D/g, '');
                const matchTel = telLog.slice(-8) === telefoneNorm.slice(-8);
                const ehLembrete = (log.mensagem_enviada || '').toLowerCase().includes('lembr');
                const recente = (log.timestamp_envio || log.created_date || '') >= agora48hAtras;
                return matchTel && ehLembrete && recente;
            });
            if (!houvaLembreteRecente) {
                console.log('⏭️ Nenhum lembrete nas últimas 48h - NÃO é confirmação de agendamento, tratando como mensagem normal');
                ehConfirmacaoReal = false;
            } else {
                console.log('✅ Lembrete recente encontrado - processando como confirmação de agendamento');
            }
        } catch (e) {
            console.warn('⚠️ Erro ao verificar lembretes:', e.message);
            // Em caso de erro, não confirmar para evitar falsos positivos
            ehConfirmacaoReal = false;
        }
    }

    if (!ehConfirmacaoReal) {
        console.log('🤖 Mensagem não é confirmação de agendamento - verificando modo de atendimento...');
        
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
        
        // UPLOAD PERMANENTE: Se tem mídia com URL temporária, fazer upload ANTES de salvar no buffer
        // Isso garante que a URL não expire durante o debounce
        if (mediaUrl && mediaType !== 'text') {
            try {
                console.log('📥 [zapiWebhook] Fazendo upload permanente da mídia antes do buffer...');
                const mediaResponse = await fetch(mediaUrl, { redirect: 'follow' });
                if (mediaResponse.ok) {
                    const blob = await mediaResponse.blob();
                    if (blob.size > 0) {
                        const extMap = { image: 'jpg', document: 'pdf', audio: 'ogg', video: 'mp4' };
                        const ext = extMap[mediaType] || 'bin';
                        const mimeMap = { image: 'image/jpeg', document: 'application/pdf', audio: 'audio/ogg', video: 'video/mp4' };
                        const mimeType = mimeMap[mediaType] || blob.type;
                        const fileName = `whatsapp_${msgId || Date.now()}.${ext}`;
                        const file = new File([blob], fileName, { type: mimeType });
                        const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
                        if (uploadResult?.file_url) {
                            console.log('✅ [zapiWebhook] Mídia salva permanentemente:', uploadResult.file_url);
                            mediaUrl = uploadResult.file_url;
                        }
                    } else {
                        console.warn('⚠️ [zapiWebhook] Mídia com tamanho 0 - URL pode ter expirado');
                    }
                }
            } catch (uploadErr) {
                console.warn('⚠️ [zapiWebhook] Erro upload mídia:', uploadErr.message);
            }
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
            // Também tentar sem o 9 extra (celular BR): 55XX9XXXX -> 55XXXXXXXX
            if (telNormalizado.startsWith('55') && telNormalizado.length === 13) {
                const semNono = telNormalizado.slice(0, 4) + telNormalizado.slice(5);
                variantes.push(semNono);
                variantes.push(semNono.slice(2)); // sem 55
            }
            // E com o 9 extra adicionado
            if (telNormalizado.startsWith('55') && telNormalizado.length === 12) {
                const comNono = telNormalizado.slice(0, 4) + '9' + telNormalizado.slice(4);
                variantes.push(comNono);
                variantes.push(comNono.slice(2)); // sem 55
            }
            
            console.log('🔍 Variantes de telefone para busca:', variantes);
            
            let contatos = [];
            for (const variante of variantes) {
                if (contatos.length > 0) break;
                contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: variante });
            }
            
            // Se não encontrou, busca ampla por últimos 8 dígitos (pega qualquer formato)
            if (contatos.length === 0) {
                console.log('🔍 Busca exata falhou - tentando busca ampla por últimos 8 dígitos...');
                // Buscar TODOS os contatos para garantir que não crie duplicata
                let todosContatos = [];
                let skip = 0;
                const batchSize = 500;
                while (todosContatos.length < 10000) {
                    const batch = await base44.asServiceRole.entities.Contato.list('-created_date', batchSize, skip);
                    todosContatos = todosContatos.concat(batch);
                    if (batch.length < batchSize) break;
                    skip += batchSize;
                }
                console.log(`🔍 Total de contatos carregados para busca ampla: ${todosContatos.length}`);
                const ultimos8 = telNormalizado.slice(-8);
                contatos = todosContatos.filter(c => {
                    const tel = (c.telefone || '').replace(/\D/g, '');
                    return tel.length >= 8 && tel.slice(-8) === ultimos8;
                });
                if (contatos.length > 0) {
                    console.log(`✅ Encontrado por últimos 8 dígitos: ${contatos[0].nome} (tel salvo: ${contatos[0].telefone})`);
                    // Atualizar telefone do contato para o formato normalizado com 55
                    let telAtualizado = telNormalizado;
                    if (!telAtualizado.startsWith('55') && telAtualizado.length < 14) telAtualizado = '55' + telAtualizado;
                    await base44.asServiceRole.entities.Contato.update(contatos[0].id, {
                        telefone: telAtualizado
                    });
                    console.log(`📱 Telefone do contato atualizado de ${contatos[0].telefone} para ${telAtualizado}`);
                    contatos[0].telefone = telAtualizado;
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
                    historico_mensagens: historicoUnificado.slice(-200),
                    telefone: telefone // Garantir que o telefone está no formato mais recente
                });
                
                contatos = [principal];
                console.log(`✅ Contatos unificados no principal: ${principal.id}`);
            }
            
            if (contatos.length > 0) {
                let contato = contatos[0];
                
                // Se conversa estava finalizada OU passou muito tempo inativa, reativar em modo humano
                const HORAS_TIMEOUT = 2;
                const ultimaInteracao = new Date(contato.ultima_interacao || contato.created_date).getTime();
                const tempoInativo = Date.now() - ultimaInteracao;
                const expirouTimeout = tempoInativo > (HORAS_TIMEOUT * 60 * 60 * 1000);
                
                // Correção: Contatos criados manualmente estavam vindo com atendimento_humano=false por padrão
                const isNovoContatoManual = contato.atendimento_humano === false && (!contato.historico_mensagens || contato.historico_mensagens.length === 0);

                if (contato.conversa_finalizada || (contato.atendimento_humano === false && expirouTimeout) || isNovoContatoManual) {
                    // Reativar conversa: manter em modo IA para que Glória continue atendendo
                    console.log('🔄 [zapiWebhook] Reativando conversa em modo IA (finalizada, timeout ou novo manual)');
                    const historicoExistente = contato.historico_mensagens || [];
                    const separador = {
                        role: 'assistant',
                        content: contato.conversa_finalizada ? '── Conversa anterior finalizada ──' : (isNovoContatoManual ? '── Início de conversa ──' : '── Conversa expirada (timeout) ──'),
                        timestamp: agora,
                        sistema: true
                    };
                    const historicoComSeparador = historicoExistente.length > 0 
                        ? [...historicoExistente, separador] 
                        : [];
                    
                    await base44.asServiceRole.entities.Contato.update(contato.id, {
                        conversa_finalizada: false,
                        historico_mensagens: historicoComSeparador.slice(-200),
                        mensagens_pendentes: [],
                        ultimo_timestamp_pendente: null,
                        atendimento_humano: false,
                        atendente_atual: null,
                        atendente_id: null
                    });
                    // Recarregar contato atualizado
                    for (const variante of variantes) {
                        const resultados = await base44.asServiceRole.entities.Contato.filter({ telefone: variante });
                        if (resultados.length > 0) { contato = resultados[0]; break; }
                    }
                }
                
                // A IA só responde quando atendimento_humano === false (IA explicitamente ativada)
                // Se atendimento_humano é true ou undefined, fica em modo humano (aguardando atendimento)
                const estaEmModoHumano = contato.atendimento_humano !== false;
                
                if (estaEmModoHumano) {
                    // Modo HUMANO: salvar mensagem no histórico aqui
                    // 🔧 Re-fetch para reduzir race condition entre mensagens simultâneas
                    let contatoFresh = contato;
                    try {
                        const refetched = await base44.asServiceRole.entities.Contato.get(contato.id);
                        if (refetched) contatoFresh = refetched;
                    } catch (e) {}
                    
                    const historicoAtual = contatoFresh.historico_mensagens || [];
                    
                    // 🔧 Anti-duplicação: verificar messageId E conteúdo+timestamp recente
                    const conteudoNovo = mediaUrl ? `${textoMensagem}\n${mediaUrl}` : textoMensagem;
                    const jaExiste = (msgId && historicoAtual.some(m => m.messageId === msgId && m.role === 'user'))
                        || historicoAtual.slice(-5).some(m => m.role === 'user' && m.content === conteudoNovo && m.timestamp && (Date.now() - new Date(m.timestamp).getTime() < 10000));
                    
                    if (jaExiste) {
                        console.log('⏭️ [HUMANO] Mensagem já existe no histórico - ignorando duplicata:', msgId);
                        return new Response(JSON.stringify({ message: "Duplicata humano ignorada" }), { status: 200 });
                    }
                    
                    historicoAtual.push({
                        role: 'user',
                        content: conteudoNovo,
                        timestamp: agora,
                        mediaType: mediaType,
                        mediaUrl: mediaUrl,
                        messageId: msgId
                    });
                    await base44.asServiceRole.entities.Contato.update(contatoFresh.id, {
                        historico_mensagens: historicoAtual.slice(-200),
                        ultima_interacao: agora,
                        nome: contatoFresh.nome || senderName,
                        conversa_finalizada: false,
                        atendimento_humano: true
                    });
                    console.log('👤 Contato em atendimento HUMANO - mensagem salva no histórico');
                    return new Response(JSON.stringify({ message: "Atendimento humano", status: "salvo" }), { status: 200 });
                } else {
                    // Modo IA: DEBOUNCE - Acumular mensagens por 5 segundos antes de processar
                    console.log('🤖 Contato em modo IA - iniciando debounce...');
                    
                    // ANTI-DUPLICATA PERSISTENTE
                    const historicoContato = contato.historico_mensagens || [];
                    const msgJaNoHistorico = msgId && historicoContato.some(m => m.messageId === msgId);
                    if (msgJaNoHistorico) {
                        console.log('⏭️ MessageId já existe no histórico do contato - ignorando duplicata:', msgId);
                        return new Response(JSON.stringify({ message: "Duplicata ignorada (banco)" }), { status: 200 });
                    }
                    
                    // Salvar mensagem no buffer de pendentes
                    const conteudoMsg = mediaUrl ? `${textoMensagem}\n${mediaUrl}` : textoMensagem;
                    const mensagensPendentes = contato.mensagens_pendentes || [];
                    
                    // Verificar se esta mensagem já está no buffer
                    const jaNoBuffer = msgId && mensagensPendentes.some(m => m.messageId === msgId);
                    if (jaNoBuffer) {
                        console.log('⏭️ Mensagem já está no buffer de pendentes');
                        return new Response(JSON.stringify({ message: "Já no buffer" }), { status: 200 });
                    }
                    
                    mensagensPendentes.push({
                        texto: conteudoMsg,
                        timestamp: agora,
                        messageId: msgId,
                        mediaType: mediaType,
                        mediaUrl: mediaUrl
                    });
                    
                    // Salvar timestamp único desta instância para controle de debounce
                    const meuTimestamp = agora;
                    
                    // 🔧 CORREÇÃO: Salvar mensagem IMEDIATAMENTE no histórico
                    // Isso garante que a mensagem aparece no chat mesmo se o debounce/IA falhar
                    const historicoComNovaMsg = [...(contato.historico_mensagens || [])];
                    const jaNoHist = msgId && historicoComNovaMsg.some(m => m.messageId === msgId);
                    if (!jaNoHist) {
                        historicoComNovaMsg.push({
                            role: 'user',
                            content: mediaUrl ? `${textoMensagem}\n${mediaUrl}` : textoMensagem,
                            timestamp: agora,
                            mediaType: mediaType,
                            mediaUrl: mediaUrl,
                            messageId: msgId
                        });
                    }
                    
                    await base44.asServiceRole.entities.Contato.update(contato.id, {
                        mensagens_pendentes: mensagensPendentes,
                        ultimo_timestamp_pendente: meuTimestamp,
                        ultima_interacao: agora,
                        nome: contato.nome || senderName,
                        conversa_finalizada: false,
                        historico_mensagens: historicoComNovaMsg.slice(-200)
                    });
                    
                    // Se tem mídia, esperar mais tempo para dar chance do cliente digitar texto junto
                    const temMidiaNoBuffer = mensagensPendentes.some(m => m.mediaType && m.mediaType !== 'text');
                    const tempoDebounce = temMidiaNoBuffer ? 6000 : 4000; // Aumentado debounce padrão para 4s para evitar quebra de mensagens
                    console.log(`⏳ Mensagem adicionada ao buffer (${mensagensPendentes.length} pendentes). meuTimestamp=${meuTimestamp}. Aguardando ${tempoDebounce/1000}s...${temMidiaNoBuffer ? ' (mídia detectada, debounce estendido)' : ''}`);
                    
                    // Esperar para acumular mais mensagens (6s com mídia, 4s sem)
                    await new Promise(resolve => setTimeout(resolve, tempoDebounce));
                    
                    // Recarregar contato para ver se mais mensagens chegaram
                    let contatoAtualizado = null;
                    for (const variante of variantes) {
                        if (contatoAtualizado) break;
                        const resultados = await base44.asServiceRole.entities.Contato.filter({ telefone: variante });
                        if (resultados.length > 0) contatoAtualizado = resultados[0];
                    }
                    
                    if (!contatoAtualizado) {
                        console.log('⚠️ Contato não encontrado após delay');
                        return new Response(JSON.stringify({ message: "Contato não encontrado" }), { status: 200 });
                    }
                    
                    // Verificar se o ultimo_timestamp_pendente ainda é o MEU
                    // Se mudou, outra mensagem chegou depois e AQUELA instância vai processar
                    const timestampAtual = contatoAtualizado.ultimo_timestamp_pendente;
                    
                    if (timestampAtual !== meuTimestamp) {
                        console.log(`⏭️ Outra mensagem chegou depois (meu=${meuTimestamp}, atual=${timestampAtual}) - esta instância NÃO processa`);
                        return new Response(JSON.stringify({ message: "Delegado para próxima instância" }), { status: 200 });
                    }
                    
                    // Buffer vazio = outra instância já processou
                    const pendentesAtuais = contatoAtualizado.mensagens_pendentes || [];
                    if (pendentesAtuais.length === 0) {
                        console.log('⏭️ Buffer já foi processado por outra instância');
                        return new Response(JSON.stringify({ message: "Já processado" }), { status: 200 });
                    }
                    
                    // Esta é a última instância - processar TODAS as pendentes como uma só
                    console.log(`✅ Sou a última instância (${pendentesAtuais.length} msgs no buffer). Processando tudo...`);
                    
                    // Juntar todas as mensagens pendentes
                    // IMPORTANTE: Separar texto puro da URL de mídia para não perder mediaType/mediaUrl
                    const ultimaComMidia = [...pendentesAtuais].reverse().find(m => m.mediaUrl && m.mediaType && m.mediaType !== 'text');
                    // Construir texto combinado SEM incluir URLs de mídia (serão passadas separadamente)
                    const textosCombinados = pendentesAtuais.map(m => {
                      let txt = m.texto || '';
                      // Remover URL de mídia do texto para evitar duplicação
                      if (m.mediaUrl && txt.includes(m.mediaUrl)) {
                        txt = txt.replace(m.mediaUrl, '').trim();
                      }
                      return txt;
                    }).filter(t => t).join(' ');
                    
                    // Limpar buffer ANTES de processar
                    await base44.asServiceRole.entities.Contato.update(contatoAtualizado.id, {
                        mensagens_pendentes: [],
                        ultimo_timestamp_pendente: null
                    });
                    
                    // Enviar status de "digitando..." enquanto a IA processa
                    // Não aguardamos (await) para não atrasar o início do processamento da IA
                    enviarStatusDigitando(telefone, 10).catch(e => console.error(e));
                    
                    // Montar payload combinado
                    const payloadCombinado = {
                        ...payload,
                        text: { message: textosCombinados },
                        body: textosCombinados
                    };
                    
                    // Anti-duplicidade extra: verificar se a última mensagem do assistente no histórico é muito recente (< 5s)
                    // Isso evita que duas instâncias que passaram pelo debounce enviem respostas seguidas
                    const histAtualizado = contatoAtualizado.historico_mensagens || [];
                    const ultimaAssistente = [...histAtualizado].reverse().find(m => m.role === 'assistant');
                    if (ultimaAssistente && ultimaAssistente.timestamp) {
                        const tempoDesdeUltimaResposta = Date.now() - new Date(ultimaAssistente.timestamp).getTime();
                        if (tempoDesdeUltimaResposta < 5000) {
                            console.log(`🚫 Resposta muito recente detectada no webhook (${tempoDesdeUltimaResposta}ms). Abortando processamento para evitar duplicidade.`);
                            return new Response(JSON.stringify({ message: "Resposta recente detectada, abortando" }), { status: 200 });
                        }
                    }
                    if (ultimaComMidia?.mediaType === 'image') payloadCombinado.image = { imageUrl: ultimaComMidia.mediaUrl, caption: textosCombinados };
                    if (ultimaComMidia?.mediaType === 'document') payloadCombinado.document = { documentUrl: ultimaComMidia.mediaUrl };
                    if (ultimaComMidia?.mediaType === 'audio') payloadCombinado.audio = { audioUrl: ultimaComMidia.mediaUrl };
                    
                    // Processar via processarMensagemAgente (mesma lógica do webhookWhatsappChatbot)
                    try {
                        // Buscar ou criar paciente
                        let pacienteId = null;
                        try {
                            const pacientes = await base44.asServiceRole.entities.Paciente.filter({ telefone: telefone });
                            if (pacientes.length > 0) {
                                pacienteId = pacientes[0].id;
                            } else {
                                const novoPaciente = await base44.asServiceRole.entities.Paciente.create({
                                    nome: senderName,
                                    telefone: telefone,
                                    cpf: 'NÃO INFORMADO',
                                    observacoes: 'Criado via WhatsApp'
                                });
                                pacienteId = novoPaciente.id;
                            }
                        } catch (pacErr) {
                            console.error('⚠️ Erro paciente:', pacErr.message);
                        }

                        // Gerar um messageId único para mensagens combinadas do buffer
                        // para evitar que a anti-duplicata do processarMensagemAgente rejeite
                        const bufferMessageId = `buffer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        
                        const appId = Deno.env.get('BASE44_APP_ID');
                        const urlAgente = `https://base44.app/api/apps/${appId}/functions/processarMensagemAgente`;
                        
                        console.log('🚀 Chamando processarMensagemAgente via fetch para evitar erro 403...');
                        const respAgente = await fetch(urlAgente, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                phoneNumber: telefone,
                                messageText: textosCombinados,
                                senderName: senderName,
                                pacienteId: pacienteId,
                                mediaType: ultimaComMidia?.mediaType || 'text',
                                mediaUrl: ultimaComMidia?.mediaUrl || null,
                                messageId: bufferMessageId
                            })
                        });
                        
                        if (!respAgente.ok) {
                            throw new Error(`Erro na chamada ao Agente: ${respAgente.status} - ${await respAgente.text()}`);
                        }
                        
                        const resultadoData = await respAgente.json();
                        console.log('✅ processarMensagemAgente retornou:', JSON.stringify(resultadoData).substring(0, 200));
                        
                        const respostaIA = resultadoData?.resposta;
                        
                        if (respostaIA) {
                            // Enviar resposta via Z-API
                            console.log('📤 Enviando resposta IA via Z-API para:', telefone, '| resposta:', respostaIA.substring(0, 80));
                            const zapiResult = await enviarMensagemZapi(telefone, respostaIA);
                            console.log('✅ Resposta IA enviada via WhatsApp. Z-API result:', JSON.stringify(zapiResult));
                            
                            // Se houver arquivo para enviar (resultado de exame)
                            if (resultadoData?.arquivoParaEnviar) {
                                const arquivo = resultadoData.arquivoParaEnviar;
                                try {
                                    await enviarDocumentoZapi(telefone, arquivo.url, arquivo.nome);
                                    console.log('✅ Documento enviado:', arquivo.nome);
                                } catch (docErr) {
                                    console.error('❌ Erro ao enviar documento:', docErr.message);
                                }
                            }
                        }
                        
                        return new Response(JSON.stringify({ success: true, resposta: respostaIA }), { status: 200 });
                    } catch (invokeError) {
                        console.error('❌ Erro ao processar mensagem IA:', invokeError.message);
                        return new Response(JSON.stringify({ error: invokeError.message }), { status: 500 });
                    }
                }
            } else {
                // VERIFICAÇÃO EXTRA antes de criar: buscar por últimos 8 dígitos em TODOS os contatos
                console.log('🔍 Verificação extra antes de criar novo contato...');
                let todosParaVerificar = [];
                let skipV = 0;
                while (todosParaVerificar.length < 10000) {
                    const batchV = await base44.asServiceRole.entities.Contato.list('-created_date', 500, skipV);
                    todosParaVerificar = todosParaVerificar.concat(batchV);
                    if (batchV.length < 500) break;
                    skipV += 500;
                }
                const telBusca = telefone.replace(/\D/g, '');
                const ult8 = telBusca.slice(-8);
                const contatoExistente = todosParaVerificar.find(c => {
                    const tel = (c.telefone || '').replace(/\D/g, '');
                    return tel.length >= 8 && tel.slice(-8) === ult8;
                });
                
                if (contatoExistente) {
                    // Contato JÁ existe! Usar o existente ao invés de criar novo
                    console.log(`✅ Contato existente encontrado na verificação extra: ${contatoExistente.nome} (${contatoExistente.telefone}) - NÃO criando duplicata`);
                    let telAtualizado = telBusca;
                    if (!telAtualizado.startsWith('55') && telAtualizado.length < 14) telAtualizado = '55' + telAtualizado;
                    
                    // 🔧 Re-fetch para reduzir race condition
                    let cExFresh = contatoExistente;
                    try {
                        const refetched = await base44.asServiceRole.entities.Contato.get(contatoExistente.id);
                        if (refetched) cExFresh = refetched;
                    } catch (e) {}
                    
                    const historicoAtual = cExFresh.historico_mensagens || [];
                    const conteudoNovo = mediaUrl ? `${textoMensagem}\n${mediaUrl}` : textoMensagem;
                    
                    // 🔧 Anti-duplicação
                    const jaExiste = (msgId && historicoAtual.some(m => m.messageId === msgId && m.role === 'user'))
                        || historicoAtual.slice(-5).some(m => m.role === 'user' && m.content === conteudoNovo && m.timestamp && (Date.now() - new Date(m.timestamp).getTime() < 10000));
                    
                    if (!jaExiste) {
                        historicoAtual.push({
                            role: 'user',
                            content: conteudoNovo,
                            timestamp: agora,
                            mediaType: mediaType,
                            mediaUrl: mediaUrl,
                            messageId: msgId
                        });
                        await base44.asServiceRole.entities.Contato.update(cExFresh.id, {
                            historico_mensagens: historicoAtual.slice(-200),
                            ultima_interacao: agora,
                            telefone: telAtualizado,
                            nome: cExFresh.nome || senderName,
                            conversa_finalizada: false
                        });
                    } else {
                        console.log('⏭️ [Verif extra] Mensagem já existe - ignorando duplicata');
                    }
                    
                    // Se o contato estava em modo IA, precisamos enviar para a IA
                    if (contatoExistente.atendimento_humano === false) {
                        const bufferMessageId = `buffer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        const appId = Deno.env.get('BASE44_APP_ID');
                        const urlAgente = `https://base44.app/api/apps/${appId}/functions/processarMensagemAgente`;
                        await fetch(urlAgente, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                phoneNumber: telAtualizado,
                                messageText: textoMensagem,
                                senderName: senderName,
                                pacienteId: null,
                                mediaType: mediaType || 'text',
                                mediaUrl: mediaUrl || null,
                                messageId: bufferMessageId
                            })
                        });
                        return new Response(JSON.stringify({ message: "Contato existente encaminhado para IA", status: "ia" }), { status: 200 });
                    }
                    
                    return new Response(JSON.stringify({ message: "Contato existente atualizado (humano)", status: "humano" }), { status: 200 });
                }
                
                // Realmente novo contato - criar
                const historicoInicial = [{
                    role: 'user',
                    content: mediaUrl ? `${textoMensagem}\n${mediaUrl}` : textoMensagem,
                    timestamp: agora,
                    mediaType: mediaType,
                    mediaUrl: mediaUrl,
                    messageId: msgId
                }];

                // Garantir que telefone tenha prefixo 55 apenas para números de telefone reais (menores que 14 dígitos)
                let telefoneComPrefixo = telefone.replace(/\D/g, '');
                if (!telefoneComPrefixo.startsWith('55') && telefoneComPrefixo.length < 14) {
                    telefoneComPrefixo = '55' + telefoneComPrefixo;
                }

                await base44.asServiceRole.entities.Contato.create({
                    nome: senderName,
                    telefone: telefoneComPrefixo,
                    origem: 'WhatsApp',
                    status: 'Novo',
                    atendimento_humano: true,
                    atendente_atual: null,
                    atendente_id: null,
                    historico_mensagens: historicoInicial,
                    ultima_interacao: agora
                });

                console.log('👤 Novo contato criado em modo HUMANO');
                return new Response(JSON.stringify({ message: "Novo contato criado em modo IA", status: "ia" }), { status: 200 });
            }
        } catch (contatoError) {
            console.error('⚠️ Erro ao verificar/criar contato:', contatoError.message);
        }
        
        // Se chegou aqui sem retornar, algo inesperado aconteceu
        console.log('⚠️ Fluxo inesperado - retornando OK');
        return new Response(JSON.stringify({ message: "OK" }), { status: 200 });
    }
    
    console.log('✅ Confirmação de agendamento detectada (com lembrete recente)!');

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
            return matchPorId && a.data_agendamento >= hoje;
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
    
    // SMART CONFIRMATION: Se há múltiplos agendamentos, tentar identificar qual recebeu o lembrete mais recente
    // Buscar o último lembrete enviado para este telefone nos NotificationLogs
    let agendamentoParaConfirmar = agendamentosOrdenados[0]; // fallback: o mais próximo
    
    if (agendamentosOrdenados.length > 1) {
        console.log(`⚠️ ${agendamentosOrdenados.length} agendamentos encontrados - buscando lembrete mais recente...`);
        try {
            const logs = await base44.asServiceRole.entities.NotificationLog.list('-created_date', 50);
            
            // Filtrar logs de lembrete enviados para este telefone
            const logsDesteTelefone = logs.filter(log => {
                const telLog = (log.telefone_destino || '').replace(/\D/g, '');
                return telLog.slice(-8) === telefoneNormalizado.slice(-8) && 
                       log.agendamento_id &&
                       (log.mensagem_enviada || '').includes('lembr');
            });
            
            console.log(`📋 Lembretes encontrados para este telefone: ${logsDesteTelefone.length}`);
            
            if (logsDesteTelefone.length > 0) {
                // Pegar o lembrete mais recente
                const ultimoLembrete = logsDesteTelefone[0]; // já ordenado por -created_date
                const agendamentoDoLembrete = agendamentosOrdenados.find(a => a.id === ultimoLembrete.agendamento_id);
                
                if (agendamentoDoLembrete) {
                    agendamentoParaConfirmar = agendamentoDoLembrete;
                    console.log(`✅ Agendamento identificado pelo lembrete: ${agendamentoDoLembrete.paciente_nome} - ${agendamentoDoLembrete.data_agendamento} ${agendamentoDoLembrete.horario}`);
                } else {
                    console.log(`⚠️ Lembrete encontrado mas agendamento_id (${ultimoLembrete.agendamento_id}) não está entre os elegíveis`);
                }
            }
        } catch (logError) {
            console.warn('⚠️ Erro ao buscar logs de lembrete:', logError.message);
        }
    }
    
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

async function enviarStatusDigitando(telefone, tempoSegundos = 10) {
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    let telefoneFormatado = telefone.replace(/\D/g, '');
    if (telefoneFormatado.startsWith('55') && telefoneFormatado.length === 12) {
        telefoneFormatado = telefoneFormatado.slice(0, 4) + '9' + telefoneFormatado.slice(4);
    }
    
    console.log('⌨️ Enviando status "digitando..." para:', telefoneFormatado);
    
    try {
        const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/chats/presence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Client-Token': clientToken
            },
            body: JSON.stringify({
                phone: telefoneFormatado,
                presence: 'composing',
                delay: tempoSegundos
            })
        });
        const result = await response.json();
        return result;
    } catch (e) {
        console.error('⚠️ Erro ao enviar status digitando:', e.message);
        return null;
    }
}

async function enviarMensagemZapi(telefone, mensagem) {
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    let telefoneFormatado = telefone.replace(/\D/g, '');
    
    // Garantir que celular brasileiro tenha o 9: 55XX9XXXXXXXX (13 dígitos)
    // Se tem 12 dígitos (55 + DDD 2 dígitos + 8 dígitos), adicionar o 9 após DDD
    if (telefoneFormatado.startsWith('55') && telefoneFormatado.length === 12) {
        telefoneFormatado = telefoneFormatado.slice(0, 4) + '9' + telefoneFormatado.slice(4);
        console.log('📱 Número corrigido com 9:', telefoneFormatado);
    }
    
    console.log('📤 Enviando mensagem Z-API para:', telefoneFormatado);
    
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Client-Token': clientToken
        },
        body: JSON.stringify({
            phone: telefoneFormatado,
            message: mensagem,
            delayTyping: 3
        })
    });

    const result = await response.json();
    console.log('📨 Resposta Z-API:', JSON.stringify(result));
    return result;
}

async function enviarDocumentoZapi(telefone, documentUrl, fileName) {
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    const telefoneFormatado = telefone.replace(/\D/g, '');
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/${documentUrl.includes('.pdf') ? 'pdf' : 'doc'}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Client-Token': clientToken
        },
        body: JSON.stringify({
            phone: telefoneFormatado,
            document: documentUrl,
            fileName: fileName || 'Resultado_Exame.pdf'
        })
    });

    return response.json();
}