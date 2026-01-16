import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // Verificação do webhook (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get('META_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verificado');
      return new Response(challenge, { status: 200 });
    }

    return new Response('Forbidden', { status: 403 });
  }

  // Processamento de mensagens (POST)
  const base44 = createClientFromRequest(req);
  
  try {
    const body = await req.json();
    console.log('📨 Webhook recebido:', JSON.stringify(body, null, 2));

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    // Ignorar se não for mensagem
    if (!messages || messages.length === 0) {
      console.log('ℹ️ Sem mensagens para processar');
      return Response.json({ success: true });
    }

    const message = messages[0];
    const messageId = message.id;
    const phoneNumber = message.from;
    const senderName = value?.contacts?.[0]?.profile?.name || 'Usuário';
    
    // Verificar se esta mensagem já foi processada (evitar duplicatas)
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      if (contatos.length > 0) {
        const historicoMensagens = contatos[0].historico_mensagens || [];
        const jaProcessada = historicoMensagens.some(m => m.messageId === messageId);
        
        if (jaProcessada) {
          console.log('⏭️ Mensagem já processada. Ignorando duplicata:', messageId);
          return Response.json({ success: true, status: 'duplicata_ignorada' });
        }
      }
    } catch (e) {
      console.log('⚠️ Erro ao verificar duplicata:', e.message);
    }
    
    // Processar diferentes tipos de mídia
    let messageText = '';
    let mediaUrl = null;
    let mediaType = 'text';
    let mediaId = null;
    
    if (message.text?.body) {
      messageText = message.text.body;
      mediaType = 'text';
    } else if (message.image) {
      mediaType = 'image';
      mediaId = message.image.id;
      messageText = message.image.caption || '[Imagem recebida]';
    } else if (message.document) {
      mediaType = 'document';
      mediaId = message.document.id;
      messageText = `[Documento: ${message.document.filename || 'arquivo'}]`;
    } else if (message.audio) {
      mediaType = 'audio';
      mediaId = message.audio.id;
      messageText = '[Áudio recebido]';
    } else if (message.video) {
      mediaType = 'video';
      mediaId = message.video.id;
      messageText = message.video.caption || '[Vídeo recebido]';
    } else if (message.sticker) {
      mediaType = 'sticker';
      messageText = '[Sticker/Figurinha recebida]';
    } else if (message.location) {
      mediaType = 'location';
      messageText = `[Localização: ${message.location.latitude}, ${message.location.longitude}]`;
    }
    
    // Baixar mídia se houver mediaId
    if (mediaId) {
      try {
        const accessToken = Deno.env.get('META_ACCESS_TOKEN');
        
        // Obter URL da mídia
        const mediaInfoResponse = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const mediaInfo = await mediaInfoResponse.json();
        
        if (mediaInfo.url) {
          // Baixar o arquivo
          const mediaDownload = await fetch(mediaInfo.url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (mediaDownload.ok) {
            const mediaBlob = await mediaDownload.blob();
            const fileName = `whatsapp_${mediaType}_${Date.now()}.${mediaInfo.mime_type?.split('/')[1] || 'bin'}`;
            const file = new File([mediaBlob], fileName, { type: mediaInfo.mime_type });
            
            // Upload para o Base44
            const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
            mediaUrl = uploadResult.file_url;
            console.log('📁 Mídia salva:', mediaUrl);
          }
        }
      } catch (mediaError) {
        console.error('⚠️ Erro ao processar mídia:', mediaError.message);
      }
    }

    if (!phoneNumber) {
      console.log('⚠️ Mensagem inválida');
      return Response.json({ success: true });
    }

    console.log('💬 Mensagem:', { phoneNumber, senderName, messageText, mediaType, mediaUrl });

    // Sistema de acumulação de mensagens (debounce de 5 segundos)
    // Armazena a mensagem e aguarda para ver se o cliente envia mais
    const DEBOUNCE_SECONDS = 5;
    const agora = new Date().toISOString();
    
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      
      if (contatos.length > 0) {
        const contato = contatos[0];
        
        // Reativar conversa se estava finalizada - LIMPAR HISTÓRICO
        if (contato.conversa_finalizada) {
          console.log('🔄 Reativando conversa finalizada - limpando histórico');
          // Limpar histórico para começar do zero
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            conversa_finalizada: false,
            historico_mensagens: [],
            mensagens_pendentes: []
          });
        }
        
        // Verificar se há mensagem pendente (não processada)
        const mensagensPendentes = contato.mensagens_pendentes || [];
        const ultimoTimestamp = contato.ultimo_timestamp_pendente;
        
        // Adicionar nova mensagem ao buffer (com mídia se houver)
        mensagensPendentes.push({
          texto: messageText,
          timestamp: agora,
          mediaType: mediaType,
          mediaUrl: mediaUrl
        });
        
        // Atualizar contato com mensagem pendente
        await base44.asServiceRole.entities.Contato.update(contato.id, {
          mensagens_pendentes: mensagensPendentes,
          ultimo_timestamp_pendente: agora,
          conversa_finalizada: false,
          status: contato.conversa_finalizada ? 'Lead' : contato.status,
          nome: contato.nome || senderName
        });
        
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
        
        // Aguardar 5 segundos para ver se chegam mais mensagens
        console.log(`⏳ Aguardando ${DEBOUNCE_SECONDS}s para acumular mensagens...`);
        await new Promise(resolve => setTimeout(resolve, DEBOUNCE_SECONDS * 1000));
        
        // Recarregar contato para pegar todas as mensagens acumuladas
        const contatoAtualizado = (await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber }))[0];
        const todasMensagens = contatoAtualizado?.mensagens_pendentes || [];
        
        // Verificar se esta chamada é a mais recente (evitar duplicatas)
        if (contatoAtualizado?.ultimo_timestamp_pendente !== agora && todasMensagens.length > mensagensPendentes.length) {
          console.log('⏭️ Outra mensagem mais recente vai processar. Saindo...');
          return Response.json({ success: true, status: 'delegado' });
        }
        
        // Juntar todas as mensagens pendentes em uma só - MANTER ÚLTIMA MÍDIA
        const mensagemCompleta = todasMensagens.map(m => m.texto).join('\n');
        // Pegar a última mídia se houver (para requisições com múltiplas mensagens de texto)
        const ultimaMidia = todasMensagens.reverse().find(m => m.mediaUrl);
        if (ultimaMidia) {
          mediaUrl = ultimaMidia.mediaUrl;
          mediaType = ultimaMidia.mediaType;
          console.log(`📎 Usando última mídia encontrada: ${mediaType}`);
        }
        console.log(`📝 Processando ${todasMensagens.length} mensagens acumuladas`);
        
        // Limpar mensagens pendentes
        await base44.asServiceRole.entities.Contato.update(contatoAtualizado.id, {
          mensagens_pendentes: [],
          ultimo_timestamp_pendente: null
        });
        
        // Continuar com a mensagem completa
        var mensagemFinal = mensagemCompleta;
        
      } else {
        // Novo contato - criar com mensagem pendente (com mídia se houver) e aguardar
        await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: phoneNumber,
          origem: 'WhatsApp',
          status: 'Novo',
          mensagens_pendentes: [{ texto: messageText, timestamp: agora, mediaType: mediaType, mediaUrl: mediaUrl }],
          ultimo_timestamp_pendente: agora
        });
        
        // Aguardar debounce
        console.log(`⏳ Novo contato. Aguardando ${DEBOUNCE_SECONDS}s...`);
        await new Promise(resolve => setTimeout(resolve, DEBOUNCE_SECONDS * 1000));
        
        // Recarregar
        const contatoCriado = (await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber }))[0];
        const todasMensagens = contatoCriado?.mensagens_pendentes || [];
        
        if (contatoCriado?.ultimo_timestamp_pendente !== agora && todasMensagens.length > 1) {
          console.log('⏭️ Outra mensagem mais recente vai processar. Saindo...');
          return Response.json({ success: true, status: 'delegado' });
        }
        
        const mensagemCompleta = todasMensagens.map(m => m.texto).join('\n');
        // Pegar a última mídia se houver para novo contato
        const ultimaMidiaNovoContato = todasMensagens.reverse().find(m => m.mediaUrl);
        if (ultimaMidiaNovoContato) {
          mediaUrl = ultimaMidiaNovoContato.mediaUrl;
          mediaType = ultimaMidiaNovoContato.mediaType;
          console.log(`📎 Novo contato - usando mídia: ${mediaType}`);
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
    const resultado = await base44.asServiceRole.functions.invoke('processarMensagemAgente', {
      phoneNumber,
      messageText: textoParaProcessar,
      senderName,
      pacienteId,
      mediaType,
      mediaUrl,
      messageId
    });

    if (resultado.data?.duplicata) {
      console.log('⏭️ Resposta duplicada detectada - não enviando');
      return Response.json({ success: true, status: 'duplicata_ignorada' });
    }
    
    if (resultado.data?.resposta) {
      await enviarWhatsApp(phoneNumber, resultado.data.resposta);
      console.log('✅ WhatsApp texto enviado');
      
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
    } else {
      // Não enviar mensagem de fallback - só logar
      console.log('⚠️ Sem resposta da IA - não enviando fallback para evitar spam');
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function enviarWhatsApp(phoneNumber, mensagem) {
  const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
  const accessToken = Deno.env.get('META_ACCESS_TOKEN');

  if (!phoneNumberId || !accessToken) {
    console.warn('⚠️ WhatsApp não configurado');
    return;
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: { body: mensagem }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Erro WhatsApp:', result);
  } else {
    console.log('✅ WhatsApp enviado:', result);
  }
}

async function enviarWhatsAppDocumento(phoneNumber, documentUrl, fileName) {
  const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
  const accessToken = Deno.env.get('META_ACCESS_TOKEN');

  if (!phoneNumberId || !accessToken) {
    console.warn('⚠️ WhatsApp não configurado');
    return;
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'document',
      document: {
        link: documentUrl,
        filename: fileName || 'Resultado_Exame.pdf'
      }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Erro envio documento WhatsApp:', result);
  } else {
    console.log('✅ Documento WhatsApp enviado:', result);
  }
}