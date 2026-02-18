import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Lock em memória para evitar processamento paralelo do mesmo messageId
const processingLock = new Map();
const LOCK_TTL_MS = 120000; // 2 minutos

// Lock para evitar envio duplicado de documentos (resultado de exame)
const documentSentLock = new Map();
const DOC_LOCK_TTL_MS = 300000; // 5 minutos

function acquireLock(messageId) {
  // Limpar locks antigos
  const now = Date.now();
  for (const [key, ts] of processingLock.entries()) {
    if (now - ts > LOCK_TTL_MS) processingLock.delete(key);
  }
  if (processingLock.has(messageId)) return false;
  processingLock.set(messageId, now);
  return true;
}

function releaseLock(messageId) {
  processingLock.delete(messageId);
}

Deno.serve(async (req) => {
  // Verificação do webhook (GET) - mantido para compatibilidade
  if (req.method === 'GET') {
    return new Response('OK', { status: 200 });
  }

  // Processamento de mensagens (POST) - Agora via Z-API
  const base44 = createClientFromRequest(req);
  
  try {
    const body = await req.json();
    console.log('📨 Z-API Webhook Chatbot recebido');

    // === FORMATO Z-API ===
    // Ignorar mensagens enviadas pelo próprio bot (fromMe=true) ou de grupos
    if (body.fromMe === true || body.isGroup === true) {
      console.log('ℹ️ Mensagem própria ou de grupo - ignorando');
      return Response.json({ success: true });
    }

    // Extrair dados do formato Z-API
    const phoneNumber = body.phone || body.from;
    const messageId = body.messageId || body.id;
    const senderName = body.senderName || body.pushName || body.chatName || 'Usuário';
    
    // LOCK: Garantir que apenas UMA instância processa cada messageId
    if (messageId && !acquireLock(messageId)) {
      console.log('🔒 MessageId já está sendo processado por outra instância:', messageId);
      return Response.json({ success: true, status: 'locked' });
    }
    
    // ANTI-DUPLICATA PERSISTENTE: Verificar se esta mensagem já foi processada no histórico do contato
    // Isso protege contra chamadas de múltiplos webhooks (zapiWebhook + webhookWhatsappChatbot)
    try {
      const telCheck = phoneNumber.replace(/\D/g, '');
      const variantesCheck = [phoneNumber, telCheck];
      if (telCheck.startsWith('55') && telCheck.length >= 12) variantesCheck.push(telCheck.slice(2));
      
      for (const v of variantesCheck) {
        const contatosCheck = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
        if (contatosCheck.length > 0) {
          const hist = contatosCheck[0].historico_mensagens || [];
          // Se já existe uma RESPOSTA (assistant) para esta mensagem no histórico, já foi processada
          const userMsgIdx = hist.findIndex(m => m.messageId === messageId && m.role === 'user');
          if (userMsgIdx >= 0 && hist.slice(userMsgIdx + 1).some(m => m.role === 'assistant')) {
            console.log('⏭️ MessageId já tem resposta no histórico - duplicata entre webhooks:', messageId);
            if (messageId) releaseLock(messageId);
            return Response.json({ success: true, status: 'ja_respondida' });
          }
          break;
        }
      }
    } catch (checkErr) {
      console.warn('⚠️ Erro na verificação anti-duplicata persistente:', checkErr.message);
    }
    
    // Verificar se tem mensagem válida
    const temMensagem = body.text?.message || body.body || body.message || 
                        body.image || body.document || body.audio || body.video || body.sticker;
    
    if (!phoneNumber || !temMensagem) {
      console.log('ℹ️ Sem mensagem válida para processar');
      return Response.json({ success: true });
    }
    
    // Processar diferentes tipos de mídia - FORMATO Z-API (ANTES da verificação de duplicatas)
    let messageText = '';
    let mediaUrl = null;
    let mediaType = 'text';
    
    // Texto simples
    if (body.text?.message) {
      messageText = body.text.message;
      mediaType = 'text';
    } else if (body.body) {
      messageText = body.body;
      mediaType = 'text';
    } else if (body.message && typeof body.message === 'string') {
      messageText = body.message;
      mediaType = 'text';
    }
    // Imagem
    else if (body.image) {
      mediaType = 'image';
      messageText = body.image.caption || '[Imagem recebida]';
      mediaUrl = body.image.imageUrl || body.image.url;
    }
    // Documento
    else if (body.document) {
      mediaType = 'document';
      messageText = `[Documento: ${body.document.fileName || 'arquivo'}]`;
      mediaUrl = body.document.documentUrl || body.document.url;
    }
    // Áudio
    else if (body.audio) {
      mediaType = 'audio';
      messageText = '[Áudio recebido]';
      mediaUrl = body.audio.audioUrl || body.audio.url;
    }
    // Vídeo
    else if (body.video) {
      mediaType = 'video';
      messageText = body.video.caption || '[Vídeo recebido]';
      mediaUrl = body.video.videoUrl || body.video.url;
    }
    // Sticker
    else if (body.sticker) {
      mediaType = 'sticker';
      messageText = '[Sticker/Figurinha recebida]';
      mediaUrl = body.sticker.stickerUrl || body.sticker.url;
    }
    // Localização
    else if (body.location) {
      mediaType = 'location';
      messageText = `[Localização: ${body.location.latitude}, ${body.location.longitude}]`;
    }

    console.log('💬 Mensagem Z-API:', { phoneNumber, senderName, messageText, mediaType, mediaUrl });

    // Se tem mídia com URL, fazer upload permanente no storage do Base44
    // Fazer UMA VEZ aqui para que a mesma URL permanente seja usada em todos os fluxos
    let mediaUrlPermanente = mediaUrl;
    if (mediaUrl && mediaType !== 'text' && mediaType !== 'location') {
      try {
        console.log('📥 Baixando mídia do Z-API para upload permanente...');
        const mediaResponse = await fetch(mediaUrl);
        if (mediaResponse.ok) {
          const blob = await mediaResponse.blob();
          const extMap = { image: 'jpg', document: 'pdf', audio: 'ogg', video: 'mp4', sticker: 'webp' };
          const ext = extMap[mediaType] || 'bin';
          const mimeMap = { image: 'image/jpeg', document: 'application/pdf', audio: 'audio/ogg', video: 'video/mp4', sticker: 'image/webp' };
          const mimeType = mimeMap[mediaType] || blob.type;
          const fileName = `whatsapp_${messageId || Date.now()}.${ext}`;
          const file = new File([blob], fileName, { type: mimeType });
          
          const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          if (uploadResult?.file_url) {
            console.log('✅ Mídia salva permanentemente:', uploadResult.file_url);
            mediaUrlPermanente = uploadResult.file_url;
          }
        } else {
          console.warn('⚠️ Não foi possível baixar mídia do Z-API:', mediaResponse.status);
        }
      } catch (uploadErr) {
        console.warn('⚠️ Erro ao salvar mídia permanentemente:', uploadErr.message);
      }
      // Usar a URL permanente daqui em diante
      mediaUrl = mediaUrlPermanente;
    }

    // Normalizar telefone uma vez para reutilizar
    const telNorm = phoneNumber.replace(/\D/g, '');
    const variantes = [phoneNumber, telNorm];
    if (telNorm.startsWith('55') && telNorm.length >= 12) variantes.push(telNorm.slice(2));
    if (!telNorm.startsWith('55') && telNorm.length >= 10) variantes.push('55' + telNorm);
    
    // Função auxiliar para buscar contato
    async function buscarContato() {
      for (const v of variantes) {
        const results = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
        if (results.length > 0) return results[0];
      }
      // Busca ampla como fallback
      const todos = await base44.asServiceRole.entities.Contato.list('-created_date', 200);
      const ultimos8 = telNorm.slice(-8);
      return todos.find(c => (c.telefone || '').replace(/\D/g, '').slice(-8) === ultimos8) || null;
    }

    const DEBOUNCE_SECONDS = 3;
    const agora = new Date().toISOString();
    
    // Anti-duplicata extra para mídia: verificar se já recebemos mídia deste telefone nos últimos 10s
    if (mediaType !== 'text') {
      const mediaLockKey = `media_${telNorm}_${mediaType}`;
      const now = Date.now();
      // Limpar locks antigos
      for (const [key, ts] of processingLock.entries()) {
        if (key.startsWith('media_') && now - ts > 10000) processingLock.delete(key);
      }
      if (processingLock.has(mediaLockKey)) {
        console.log('🔒 Mídia duplicada detectada (mesmo tipo/telefone em <10s) - ignorando');
        if (messageId) releaseLock(messageId);
        return Response.json({ success: true, status: 'media_duplicata' });
      }
      processingLock.set(mediaLockKey, now);
    }
    
    try {
      let contato = await buscarContato();
      
      if (contato) {
        // Reativar conversa se estava finalizada
        if (contato.conversa_finalizada) {
          console.log('🔄 Reativando conversa finalizada - PRESERVANDO histórico antigo');

          // Adicionar marcador de separação no histórico para indicar nova conversa
          const historicoExistente = contato.historico_mensagens || [];
          const separador = {
            role: 'assistant',
            content: '── Conversa anterior finalizada ──',
            timestamp: agora,
            sistema: true
          };
          const historicoComSeparador = historicoExistente.length > 0 
            ? [...historicoExistente, separador] 
            : [];

          // Iniciar nova conversa em modo HUMANO
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            conversa_finalizada: false,
            historico_mensagens: historicoComSeparador.slice(-200),
            mensagens_pendentes: [],
            ultimo_timestamp_pendente: null,
            atendimento_humano: true,
            atendente_atual: null,
            atendente_id: null
          });
          contato = await buscarContato();
        }
        
        // Se está em atendimento humano (padrão: humano, só IA se explicitamente false)
        if (contato.atendimento_humano !== false) {
          // Salvar mensagem no histórico SEM alterar o modo de atendimento
          const historicoAtual = contato.historico_mensagens || [];
          const msgObj = {
            role: 'user',
            content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText,
            timestamp: agora,
            messageId
          };
          if (mediaType && mediaType !== 'text') msgObj.mediaType = mediaType;
          if (mediaUrl) msgObj.mediaUrl = mediaUrl;
          historicoAtual.push(msgObj);
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            historico_mensagens: historicoAtual.slice(-200),
            ultima_interacao: agora,
            nome: contato.nome || senderName
          });
          console.log('👤 Contato em atendimento humano - mensagem salva');
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'atendimento_humano' });
        }
        
        // MODO IA: Verificar se o zapiWebhook já está processando via buffer/debounce
        // Se mensagens_pendentes não está vazio OU ultimo_timestamp_pendente está definido,
        // o zapiWebhook já está no debounce - NÃO processar aqui para evitar duplicata
        const temBufferAtivo = (contato.mensagens_pendentes?.length > 0) || contato.ultimo_timestamp_pendente;
        if (temBufferAtivo) {
          console.log('⏭️ zapiWebhook já tem buffer ativo - delegando processamento. NÃO alterando modo de atendimento.');
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'delegado_zapiWebhook' });
        }
        
        // MODO IA: DEBOUNCE - Acumular mensagens por 5 segundos antes de processar
        const historicoAtual = contato.historico_mensagens || [];
        
        // Verificar se esta mensagem já está no histórico (outra instância já salvou)
        if (messageId && historicoAtual.some(m => m.messageId === messageId && m.role === 'user')) {
          console.log('⏭️ Mensagem já está no histórico:', messageId);
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'ja_no_historico' });
        }
        
        // Salvar mensagem no buffer de pendentes para debounce
        const mensagensPendentes = contato.mensagens_pendentes || [];
        const jaNoBuffer = messageId && mensagensPendentes.some(m => m.messageId === messageId);
        if (jaNoBuffer) {
          console.log('⏭️ Mensagem já está no buffer de pendentes');
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'ja_no_buffer' });
        }
        
        const conteudoMsg = mediaUrl ? `${messageText}\n${mediaUrl}` : messageText;
        mensagensPendentes.push({
          texto: conteudoMsg,
          timestamp: agora,
          messageId: messageId,
          mediaType: mediaType,
          mediaUrl: mediaUrl
        });
        
        const meuTimestamp = agora;
        
        await base44.asServiceRole.entities.Contato.update(contato.id, {
          mensagens_pendentes: mensagensPendentes,
          ultimo_timestamp_pendente: meuTimestamp,
          ultima_interacao: agora,
          conversa_finalizada: false,
          nome: contato.nome || senderName
        });
        
        console.log(`⏳ Mensagem adicionada ao buffer (${mensagensPendentes.length} pendentes). meuTimestamp=${meuTimestamp}. Aguardando 5s debounce...`);
        
        // Esperar 5 segundos para acumular mais mensagens
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Recarregar contato para ver se mais mensagens chegaram durante o delay
        const contatoAtualizado = await buscarContato();
        if (!contatoAtualizado) {
          console.log('⚠️ Contato não encontrado após delay');
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'contato_nao_encontrado' });
        }
        
        // Verificar se o ultimo_timestamp_pendente ainda é o MEU
        const timestampAtual = contatoAtualizado.ultimo_timestamp_pendente;
        
        if (timestampAtual !== meuTimestamp) {
          console.log(`⏭️ Outra mensagem chegou depois (meu=${meuTimestamp}, atual=${timestampAtual}) - esta instância NÃO processa`);
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'delegado_proxima' });
        }
        
        // Buffer vazio = outra instância já processou
        const pendentesAtuais = contatoAtualizado.mensagens_pendentes || [];
        if (pendentesAtuais.length === 0) {
          console.log('⏭️ Buffer já foi processado por outra instância');
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'ja_processado' });
        }
        
        // Esta é a última instância - processar TODAS as pendentes como uma só
        console.log(`✅ Sou a última instância (${pendentesAtuais.length} msgs no buffer). Processando tudo junto...`);
        
        // Juntar todas as mensagens pendentes em uma só
        messageText = pendentesAtuais.map(m => m.texto).join(' ');
        
        // Pegar a mídia da última mensagem que tem mídia (se houver)
        const ultimaComMidia = [...pendentesAtuais].reverse().find(m => m.mediaUrl);
        if (ultimaComMidia) {
          mediaType = ultimaComMidia.mediaType;
          mediaUrl = ultimaComMidia.mediaUrl;
        }
        
        // Limpar buffer ANTES de processar (evitar reprocessamento)
        await base44.asServiceRole.entities.Contato.update(contatoAtualizado.id, {
          mensagens_pendentes: [],
          ultimo_timestamp_pendente: null
        });
        
      } else {
        // Novo contato - criar em modo IA (automático)
        const msgObj = {
          role: 'user',
          content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText,
          timestamp: agora,
          messageId
        };
        if (mediaType && mediaType !== 'text') msgObj.mediaType = mediaType;
        if (mediaUrl) msgObj.mediaUrl = mediaUrl;

        // Garantir que telefone tenha prefixo 55
        let telefoneComPrefixo = phoneNumber.replace(/\D/g, '');
        if (!telefoneComPrefixo.startsWith('55')) {
          telefoneComPrefixo = '55' + telefoneComPrefixo;
        }

        await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: telefoneComPrefixo,
          origem: 'WhatsApp',
          status: 'Novo',
          atendimento_humano: true,
          historico_mensagens: [msgObj],
          mensagens_pendentes: [],
          ultima_interacao: agora
        });
        console.log('👤 Novo contato criado em modo HUMANO - aguardando atendente...');
        return Response.json({ success: true, status: 'novo_contato_humano' });
      }
    } catch (e) {
      console.log('⚠️ Erro no processamento:', e.message);
      if (messageId) releaseLock(messageId);
      return Response.json({ success: true, status: 'erro_processamento' });
    }

    // Texto a processar é simplesmente a mensagem recebida
    const textoParaProcessar = messageText;
    console.log('📨 Texto final para processar:', textoParaProcessar?.substring(0, 100));

    // Buscar ou criar paciente
    let pacienteId = null;
    try {
      const pacientes = await base44.asServiceRole.entities.Paciente.filter({ telefone: phoneNumber });
      if (pacientes && pacientes.length > 0) {
        pacienteId = pacientes[0].id;
        console.log('✅ Paciente:', pacienteId.substring(0, 8));
      } else {
        const novoPaciente = await base44.asServiceRole.entities.Paciente.create({
          nome: senderName,
          telefone: phoneNumber,
          cpf: 'NÃO INFORMADO',
          observacoes: 'Criado via WhatsApp'
        });
        pacienteId = novoPaciente.id;
        console.log('✅ Novo paciente:', pacienteId.substring(0, 8));
      }
    } catch (error) {
      console.error('❌ Erro paciente:', error.message);
    }

    // Chamar função intermediária com autenticação correta
    console.log('📞 Chamando função processarMensagemAgente...');
    let resultado;
    try {
      resultado = await base44.asServiceRole.functions.invoke('processarMensagemAgente', {
        phoneNumber,
        messageText: textoParaProcessar,
        senderName,
        pacienteId,
        mediaType,
        mediaUrl,
        messageId
      });
      console.log('✅ processarMensagemAgente retornou:', JSON.stringify(resultado.data).substring(0, 200));
    } catch (invokeError) {
      console.error('❌ Erro ao chamar processarMensagemAgente:', invokeError.message);
      return Response.json({ success: false, error: invokeError.message }, { status: 500 });
    }

    if (resultado.data?.duplicata || resultado.data?.status === 'duplicata_ignorada') {
      console.log('⏭️ Resposta duplicada detectada - não enviando');
      if (messageId) releaseLock(messageId);
      return Response.json({ success: true, status: 'duplicata_ignorada' });
    }
    
    const respostaIA = resultado.data?.resposta;
    console.log('📝 Resposta da IA recebida:', respostaIA ? respostaIA.substring(0, 100) + '...' : 'NULL');
    
    if (respostaIA) {
      console.log('📤 Enviando resposta via Z-API para:', phoneNumber);
      try {
        await enviarWhatsApp(phoneNumber, respostaIA);
        console.log('✅ WhatsApp texto enviado com sucesso');
      } catch (whatsappError) {
        console.error('❌ ERRO ao enviar WhatsApp:', whatsappError.message);
      }
      
      // Se houver arquivo para enviar (resultado de exame)
      if (resultado.data?.arquivoParaEnviar) {
        const arquivo = resultado.data.arquivoParaEnviar;
        const docKey = `${phoneNumber}_${arquivo.url}`;
        
        // Limpar locks de documentos antigos
        const nowDoc = Date.now();
        for (const [key, ts] of documentSentLock.entries()) {
          if (nowDoc - ts > DOC_LOCK_TTL_MS) documentSentLock.delete(key);
        }
        
        // Verificar se já enviamos este documento para este telefone recentemente
        if (documentSentLock.has(docKey)) {
          console.log('⏭️ Documento já enviado recentemente para este telefone - ignorando duplicata');
        } else {
          documentSentLock.set(docKey, nowDoc);
          console.log('📎 Arquivo para enviar detectado:', JSON.stringify(arquivo));
          
          try {
            await enviarWhatsAppDocumento(phoneNumber, arquivo.url, arquivo.nome);
            console.log('✅ Documento enviado com sucesso!');
          } catch (docError) {
            console.error('❌ Erro ao enviar documento:', docError.message);
            documentSentLock.delete(docKey); // Liberar lock se falhou
          }
        }
      }
      
      if (messageId) releaseLock(messageId);
      return Response.json({ success: true, resposta: respostaIA });
    } else {
      console.log('⚠️ Sem resposta da IA:', JSON.stringify(resultado.data));
      if (messageId) releaseLock(messageId);
      return Response.json({ success: true, status: 'sem_resposta' });
    }

  } catch (error) {
    console.error('❌ Erro:', error);
    if (messageId) releaseLock(messageId);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Enviar mensagem via Z-API
async function enviarWhatsApp(phoneNumber, mensagem) {
  console.log('📤 Iniciando envio WhatsApp via Z-API para:', phoneNumber);
  console.log('💬 Mensagem:', mensagem.substring(0, 100));
  
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
  const token = Deno.env.get('ZAPI_TOKEN');
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  console.log('🔑 Configuração Z-API:');
  console.log('   - instanceId:', instanceId ? instanceId.substring(0, 10) + '...' : '❌ MISSING');
  console.log('   - token:', token ? token.substring(0, 10) + '...' : '❌ MISSING');
  console.log('   - clientToken:', clientToken ? clientToken.substring(0, 10) + '...' : '❌ MISSING');

  if (!instanceId || !token) {
    console.error('❌ ERRO CRÍTICO: Z-API não configurado!');
    throw new Error('Z-API não configurado');
  }

  const telefoneFormatado = phoneNumber.replace(/\D/g, '');
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  console.log('🔗 URL:', url);

  const requestBody = {
    phone: telefoneFormatado,
    message: mensagem
  };

  console.log('📋 Request body:', JSON.stringify(requestBody));

  const headers = {
    'Content-Type': 'application/json'
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }
  console.log('📋 Headers:', JSON.stringify(headers));

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  const result = await response.json();
  
  console.log('📊 Response status:', response.status);
  console.log('📊 Response body:', JSON.stringify(result));

  if (!response.ok) {
    console.error('❌ Erro Z-API:', result);
    throw new Error(`Erro Z-API: ${JSON.stringify(result)}`);
  } else {
    console.log('✅ WhatsApp Z-API enviado com sucesso!');
  }
}

// Enviar documento via Z-API
async function enviarWhatsAppDocumento(phoneNumber, documentUrl, fileName) {
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
  const token = Deno.env.get('ZAPI_TOKEN');
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  if (!instanceId || !token) {
    console.warn('⚠️ Z-API não configurado');
    return;
  }

  const telefoneFormatado = phoneNumber.replace(/\D/g, '');
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/${documentUrl.includes('.pdf') ? 'pdf' : 'doc'}`;

  const headers = {
    'Content-Type': 'application/json'
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      phone: telefoneFormatado,
      document: documentUrl,
      fileName: fileName || 'Resultado_Exame.pdf'
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Erro envio documento Z-API:', result);
  } else {
    console.log('✅ Documento Z-API enviado:', result);
  }
}