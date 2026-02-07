import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Lock em memória para evitar processamento paralelo do mesmo messageId
const processingLock = new Map();
const LOCK_TTL_MS = 120000; // 2 minutos

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
    
    try {
      let contato = await buscarContato();
      
      if (contato) {
        // Reativar conversa se estava finalizada
        if (contato.conversa_finalizada) {
          console.log('🔄 Reativando conversa finalizada');
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            conversa_finalizada: false,
            historico_mensagens: [],
            mensagens_pendentes: [],
            ultima_mensagem: null,
            ultima_resposta: null,
            ultimo_timestamp_pendente: null,
            atendimento_humano: false,
            atendente_atual: null,
            atendente_id: null
          });
          contato = await buscarContato();
        }
        
        // Se está em atendimento humano, salvar e sair
        if (contato.atendimento_humano) {
          const historicoAtual = contato.historico_mensagens || [];
          historicoAtual.push({
            role: 'user',
            content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText,
            timestamp: agora,
            mediaType, mediaUrl, messageId
          });
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            historico_mensagens: historicoAtual.slice(-50),
            ultima_interacao: agora,
            nome: contato.nome || senderName
          });
          console.log('👤 Contato em atendimento humano - mensagem salva');
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'atendimento_humano' });
        }
        
        // MODO IA: Salvar mensagem no histórico
        const historicoAtual = contato.historico_mensagens || [];
        
        // Verificar se esta mensagem já está no histórico (outra instância já salvou)
        if (messageId && historicoAtual.some(m => m.messageId === messageId && m.role === 'user')) {
          console.log('⏭️ Mensagem já está no histórico:', messageId);
          if (messageId) releaseLock(messageId);
          return Response.json({ success: true, status: 'ja_no_historico' });
        }
        
        historicoAtual.push({
          role: 'user',
          content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText,
          timestamp: agora, mediaType, mediaUrl, messageId
        });
        
        await base44.asServiceRole.entities.Contato.update(contato.id, {
          historico_mensagens: historicoAtual.slice(-50),
          ultima_interacao: agora,
          conversa_finalizada: false,
          nome: contato.nome || senderName
        });
        
      } else {
        // Novo contato - criar em modo IA
        await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: phoneNumber,
          origem: 'WhatsApp',
          status: 'Novo',
          atendimento_humano: false,
          historico_mensagens: [{
            role: 'user',
            content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText,
            timestamp: agora, mediaType, mediaUrl, messageId
          }],
          mensagens_pendentes: [],
          ultima_interacao: agora
        });
        console.log('🤖 Novo contato criado em modo IA');
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
        console.log('📎 Arquivo para enviar detectado:', JSON.stringify(arquivo));
        
        try {
          await enviarWhatsAppDocumento(phoneNumber, arquivo.url, arquivo.nome);
          console.log('✅ Documento enviado com sucesso!');
        } catch (docError) {
          console.error('❌ Erro ao enviar documento:', docError.message);
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