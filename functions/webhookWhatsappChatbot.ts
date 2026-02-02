import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // Verificação do webhook (GET) - mantido para compatibilidade
  if (req.method === 'GET') {
    return new Response('OK', { status: 200 });
  }

  // Processamento de mensagens (POST) - Agora via Z-API
  const base44 = createClientFromRequest(req);
  
  try {
    const body = await req.json();
    console.log('📨 Z-API Webhook Chatbot recebido:', JSON.stringify(body, null, 2));

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
    
    // Verificar se tem mensagem válida
    const temMensagem = body.text?.message || body.body || body.message || 
                        body.image || body.document || body.audio || body.video || body.sticker;
    
    if (!phoneNumber || !temMensagem) {
      console.log('ℹ️ Sem mensagem válida para processar');
      return Response.json({ success: true });
    }
    
    // Verificar se esta mensagem já foi processada (evitar duplicatas)
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      if (contatos.length > 0) {
        const contato = contatos[0];
        const historicoMensagens = contato.historico_mensagens || [];
        const mensagensPendentes = contato.mensagens_pendentes || [];
        
        // Verificar duplicata por messageId no histórico
        const jaProcessadaHistorico = historicoMensagens.some(m => m.messageId === messageId);
        
        // Verificar duplicata por messageId nas pendentes
        const jaProcessadaPendente = mensagensPendentes.some(m => m.messageId === messageId);
        
        if (jaProcessadaHistorico || jaProcessadaPendente) {
          console.log('⏭️ Mensagem já processada. Ignorando duplicata:', messageId);
          return Response.json({ success: true, status: 'duplicata_ignorada' });
        }
      }
    } catch (e) {
      console.log('⚠️ Erro ao verificar duplicata:', e.message);
    }
    
    // Processar diferentes tipos de mídia - FORMATO Z-API
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

    // Sistema de acumulação de mensagens (debounce de 5 segundos)
    // Armazena a mensagem e aguarda para ver se o cliente envia mais
    const DEBOUNCE_SECONDS = 5;
    const agora = new Date().toISOString();
    
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      
      if (contatos.length > 0) {
        const contato = contatos[0];
        
        // Reativar conversa se estava finalizada - LIMPAR HISTÓRICO COMPLETAMENTE
        if (contato.conversa_finalizada) {
          console.log('🔄 Reativando conversa finalizada - limpando histórico COMPLETO');
          // Limpar histórico COMPLETAMENTE para começar do zero (nova conversa)
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            conversa_finalizada: false,
            historico_mensagens: [], // Limpa todo o histórico
            mensagens_pendentes: [],
            ultima_mensagem: null,
            ultima_resposta: null,
            ultimo_timestamp_pendente: null
          });
          // Recarregar contato após limpeza para garantir que está atualizado
          const contatoLimpo = (await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber }))[0];
          if (contatoLimpo) {
            contato.historico_mensagens = [];
            contato.mensagens_pendentes = [];
          }
        }
        
        // Verificar se há mensagem pendente (não processada)
        const mensagensPendentes = contato.mensagens_pendentes || [];
        const ultimoTimestamp = contato.ultimo_timestamp_pendente;
        
        // Adicionar nova mensagem ao buffer (com mídia se houver) - incluindo messageId para evitar duplicatas
        mensagensPendentes.push({
          texto: messageText,
          timestamp: agora,
          mediaType: mediaType,
          mediaUrl: mediaUrl,
          messageId: messageId
        });
        
        // Atualizar contato com mensagem pendente
        // Se tiver mídia, salvar também no histórico imediatamente para visualização
        let updateData = {
          mensagens_pendentes: mensagensPendentes,
          ultimo_timestamp_pendente: agora,
          conversa_finalizada: false,
          status: contato.conversa_finalizada ? 'Lead' : contato.status,
          nome: contato.nome || senderName
        };
        
        // SEMPRE salvar mídia direto no histórico para visualização (especialmente em modo humano)
        if (mediaUrl && (mediaType === 'image' || mediaType === 'document' || mediaType === 'audio' || mediaType === 'video')) {
          const historicoAtual = contato.historico_mensagens || [];
          historicoAtual.push({
            role: 'user',
            content: `${messageText}\n${mediaUrl}`,
            timestamp: agora,
            mediaType: mediaType,
            mediaUrl: mediaUrl,
            messageId: messageId
          });
          updateData.historico_mensagens = historicoAtual.slice(-50);
          updateData.ultima_interacao = agora;
          console.log('💾 Mídia salva diretamente no histórico:', mediaUrl);
        } else if (!mediaUrl && messageText) {
          // Também salvar mensagens de texto normais quando em modo humano
          if (contato.atendimento_humano) {
            const historicoAtual = contato.historico_mensagens || [];
            historicoAtual.push({
              role: 'user',
              content: messageText,
              timestamp: agora,
              messageId: messageId
            });
            updateData.historico_mensagens = historicoAtual.slice(-50);
            updateData.ultima_interacao = agora;
            console.log('💾 Mensagem salva no histórico (modo humano)');
          }
        }
        
        await base44.asServiceRole.entities.Contato.update(contato.id, updateData);
        
        // Se está em atendimento humano, não processar pela IA - apenas salvar e sair
        if (contato.atendimento_humano) {
          console.log('👤 Contato em atendimento humano - mensagem salva, não processando IA');
          return Response.json({ success: true, status: 'atendimento_humano' });
        }
        
        // Se já havia mensagens pendentes, verificar se passou tempo suficiente
        if (ultimoTimestamp) {
          const ultimaData = new Date(ultimoTimestamp);
          const agoraData = new Date(agora);
          const diferencaSegundos = (agoraData - ultimaData) / 1000;
          
          // Se a última mensagem foi há menos de 5 segundos, apenas acumular e sair
          if (diferencaSegundos < DEBOUNCE_SECONDS) {
            console.log(`⏳ Acumulando mensagem (${diferencaSegundos.toFixed(1)}s desde última). Total pendentes: ${mensagensPendentes.length}`);
            return Response.json({ success: true, status: 'acumulando' });
          }
        }
        
        // Marcar que ESTA chamada vai processar (usando lock otimista)
        const meuLockId = `${messageId}_${Date.now()}`;
        
        try {
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            ultimo_timestamp_pendente: meuLockId
          });
        } catch (e) {
          console.log('⚠️ Erro ao obter lock:', e.message);
        }
        
        // Aguardar 5 segundos para ver se chegam mais mensagens
        console.log(`⏳ Aguardando ${DEBOUNCE_SECONDS}s para acumular mensagens...`);
        await new Promise(resolve => setTimeout(resolve, DEBOUNCE_SECONDS * 1000));
        
        // Recarregar contato para pegar todas as mensagens acumuladas
        const contatoAtualizado = (await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber }))[0];
        const todasMensagens = contatoAtualizado?.mensagens_pendentes || [];
        
        // LOCK: Verificar se ESTA chamada tem o lock para processar
        if (contatoAtualizado?.ultimo_timestamp_pendente !== meuLockId) {
          console.log('⏭️ Outra chamada obteve o lock. Saindo...');
          return Response.json({ success: true, status: 'delegado' });
        }
        
        // Verificar se já foi processado (mensagens_pendentes vazias = já processou)
        if (contatoAtualizado?.mensagens_pendentes?.length === 0) {
          console.log('⏭️ Mensagens já foram processadas por outra chamada. Saindo...');
          return Response.json({ success: true, status: 'ja_processado' });
        }
        
        // Juntar todas as mensagens pendentes em uma só - MANTER ÚLTIMA MÍDIA
        const mensagemCompleta = todasMensagens.map(m => m.texto).join('\n');
        // Pegar a última mídia se houver (para requisições com múltiplas mensagens de texto)
        const ultimaMidia = [...todasMensagens].reverse().find(m => m.mediaUrl);
        if (ultimaMidia) {
          mediaUrl = ultimaMidia.mediaUrl;
          mediaType = ultimaMidia.mediaType;
          console.log(`📎 Usando última mídia encontrada: ${mediaType} - ${mediaUrl}`);
        }
        console.log(`📝 Processando ${todasMensagens.length} mensagens acumuladas`);
        
        // Salvar mídia no histórico com URL
        if (mediaUrl) {
          const historicoAtual = contatoAtualizado?.historico_mensagens || [];
          const mensagemComMidia = mediaType === 'image' 
            ? `[Imagem recebida]\n${mediaUrl}` 
            : mediaType === 'document' 
              ? `[Documento recebido]\n${mediaUrl}`
              : mediaType === 'audio'
                ? `[Áudio recebido]\n${mediaUrl}`
                : mensagemCompleta;
          
          // A mídia será salva no histórico pela função processarMensagemAgente
          console.log(`💾 Mídia será salva no histórico: ${mediaUrl}`);
        }
        
        // Limpar mensagens pendentes
        await base44.asServiceRole.entities.Contato.update(contatoAtualizado.id, {
          mensagens_pendentes: [],
          ultimo_timestamp_pendente: null
        });

        // Detectar se a última mensagem do assistente é duplicada (para evitar loops)
        const historicoAtual = contatoAtualizado?.historico_mensagens || [];
        const ultimasMensagensAssistente = historicoAtual.filter(m => m.role === 'assistant').slice(-2);

        if (ultimasMensagensAssistente.length >= 2 && 
            ultimasMensagensAssistente[0]?.content === ultimasMensagensAssistente[1]?.content) {
          console.log('⚠️ Última mensagem do assistente é duplicada! Pulando processamento para evitar loop.');
          return Response.json({ success: true, status: 'duplicata_ignorada' });
        }

        // Continuar com a mensagem completa
        var mensagemFinal = mensagemCompleta;
        
      } else {
        // Novo contato - criar com mensagem pendente (com mídia se houver) e aguardar
        const meuLockIdNovo = `${messageId}_${Date.now()}`;
        
        await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: phoneNumber,
          origem: 'WhatsApp',
          status: 'Novo',
          mensagens_pendentes: [{ texto: messageText, timestamp: agora, mediaType: mediaType, mediaUrl: mediaUrl, messageId: messageId }],
          ultimo_timestamp_pendente: meuLockIdNovo
        });
        
        // Aguardar debounce
        console.log(`⏳ Novo contato. Aguardando ${DEBOUNCE_SECONDS}s...`);
        await new Promise(resolve => setTimeout(resolve, DEBOUNCE_SECONDS * 1000));
        
        // Recarregar
        const contatoCriado = (await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber }))[0];
        const todasMensagens = contatoCriado?.mensagens_pendentes || [];
        
        // LOCK: Verificar se ESTA chamada tem o lock
        if (contatoCriado?.ultimo_timestamp_pendente !== meuLockIdNovo) {
          console.log('⏭️ Outra chamada obteve o lock (novo contato). Saindo...');
          return Response.json({ success: true, status: 'delegado' });
        }
        
        // Verificar se já foi processado
        if (contatoCriado?.mensagens_pendentes?.length === 0) {
          console.log('⏭️ Mensagens já foram processadas por outra chamada. Saindo...');
          return Response.json({ success: true, status: 'ja_processado' });
        }
        
        const mensagemCompleta = todasMensagens.map(m => m.texto).join('\n');
        // Pegar a última mídia se houver para novo contato
        const ultimaMidiaNovoContato = [...todasMensagens].reverse().find(m => m.mediaUrl);
        if (ultimaMidiaNovoContato) {
          mediaUrl = ultimaMidiaNovoContato.mediaUrl;
          mediaType = ultimaMidiaNovoContato.mediaType;
          console.log(`📎 Novo contato - usando mídia: ${mediaType} - ${mediaUrl}`);
        }
        console.log(`📝 Processando ${todasMensagens.length} mensagens acumuladas (novo contato)`);
        
        await base44.asServiceRole.entities.Contato.update(contatoCriado.id, {
          mensagens_pendentes: [],
          ultimo_timestamp_pendente: null
        });
        
        var mensagemFinal = mensagemCompleta;
      }
    } catch (e) {
      console.log('⚠️ Erro no debounce:', e.message);
      var mensagemFinal = messageText; // Fallback para mensagem original
    }

    // Usar mensagemFinal em vez de messageText daqui em diante
    const textoParaProcessar = typeof mensagemFinal !== 'undefined' ? mensagemFinal : messageText;
    console.log('📨 Texto final para processar:', textoParaProcessar.substring(0, 100));

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
        // Não lançar erro - apenas logar e continuar
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
      
      return Response.json({ success: true, resposta: respostaIA });
    } else {
      // Não enviar mensagem de fallback - só logar
      console.log('⚠️ Sem resposta da IA:', JSON.stringify(resultado.data));
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