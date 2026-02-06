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

    // Verificar se esta mensagem já foi processada (evitar duplicatas)
    try {
      const telNorm = phoneNumber.replace(/\D/g, '');
      const variantes = [phoneNumber, telNorm];
      if (telNorm.startsWith('55') && telNorm.length >= 12) variantes.push(telNorm.slice(2));
      if (!telNorm.startsWith('55') && telNorm.length >= 10) variantes.push('55' + telNorm);
      
      let contatos = [];
      for (const v of variantes) {
        if (contatos.length > 0) break;
        contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
      }
      
      if (contatos.length === 0) {
        const todos = await base44.asServiceRole.entities.Contato.list('-created_date', 500);
        const ultimos8 = telNorm.slice(-8);
        contatos = todos.filter(c => (c.telefone || '').replace(/\D/g, '').slice(-8) === ultimos8);
      }
      
      if (contatos.length > 1) {
        console.log(`⚠️ ${contatos.length} contatos duplicados para ${phoneNumber} - unificando...`);
        contatos.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        const principal = contatos[0];
        let hist = [...(principal.historico_mensagens || [])];
        for (let i = 1; i < contatos.length; i++) {
          for (const msg of (contatos[i].historico_mensagens || [])) {
            if (!hist.some(m => m.timestamp === msg.timestamp && m.content === msg.content)) hist.push(msg);
          }
          try { await base44.asServiceRole.entities.Contato.delete(contatos[i].id); } catch(e) {}
        }
        hist.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
        await base44.asServiceRole.entities.Contato.update(principal.id, {
          historico_mensagens: hist.slice(-100),
          telefone: phoneNumber
        });
        contatos = [principal];
      }
      
      if (contatos.length > 0) {
        const contato = contatos[0];
        const historicoMensagens = contato.historico_mensagens || [];
        const mensagensPendentes = contato.mensagens_pendentes || [];
        
        const jaProcessadaHistorico = messageId && historicoMensagens.some(m => m.messageId === messageId);
        const jaProcessadaPendente = messageId && mensagensPendentes.some(m => m.messageId === messageId);
        
        const agora10sAtras = new Date(Date.now() - 10000).toISOString();
        const jaProcessadaConteudo = historicoMensagens.some(m => 
          m.role === 'user' && 
          m.content === (messageText || '') && 
          m.timestamp > agora10sAtras
        );
        
        if (jaProcessadaHistorico || jaProcessadaPendente || jaProcessadaConteudo) {
          console.log('⏭️ Mensagem já processada. Ignorando duplicata:', messageId);
          return Response.json({ success: true, status: 'duplicata_ignorada' });
        }
      }
    } catch (e) {
      console.log('⚠️ Erro ao verificar duplicata:', e.message);
    }

    // Sistema de acumulação de mensagens (debounce de 2 segundos)
    // Armazena a mensagem e aguarda para ver se o cliente envia mais
    const DEBOUNCE_SECONDS = 2;
    const agora = new Date().toISOString();
    
    try {
      // Buscar contato com normalização de telefone (mesma lógica da dedup acima)
      const telNormDebounce = phoneNumber.replace(/\D/g, '');
      const variantesDebounce = [phoneNumber, telNormDebounce];
      if (telNormDebounce.startsWith('55') && telNormDebounce.length >= 12) variantesDebounce.push(telNormDebounce.slice(2));
      if (!telNormDebounce.startsWith('55') && telNormDebounce.length >= 10) variantesDebounce.push('55' + telNormDebounce);
      
      let contatos = [];
      for (const v of variantesDebounce) {
        if (contatos.length > 0) break;
        contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
      }
      
      // Busca ampla se não encontrou
      if (contatos.length === 0) {
        const todosDebounce = await base44.asServiceRole.entities.Contato.list('-created_date', 200);
        const ultimos8Debounce = telNormDebounce.slice(-8);
        contatos = todosDebounce.filter(c => (c.telefone || '').replace(/\D/g, '').slice(-8) === ultimos8Debounce);
      }
      
      if (contatos.length > 0) {
        const contato = contatos[0];
        
        // Reativar conversa se estava finalizada - LIMPAR HISTÓRICO E INICIAR EM MODO IA
         if (contato.conversa_finalizada) {
           console.log('🔄 Reativando conversa finalizada - limpando histórico e ativando modo IA');
           const updateResult = await base44.asServiceRole.entities.Contato.update(contato.id, {
             conversa_finalizada: false,
             historico_mensagens: [], // Limpa todo o histórico
             mensagens_pendentes: [],
             ultima_mensagem: null,
             ultima_resposta: null,
             ultimo_timestamp_pendente: null,
             atendimento_humano: false, // IA atende primeiro, humano assume se necessário
             atendente_atual: null,
             atendente_id: null
           });
           console.log('✅ Conversa reativada em modo IA');
           // Recarregar contato após limpeza
           let contatoLimpo = null;
           for (const v of variantesDebounce) {
             const results = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
             if (results.length > 0) { contatoLimpo = results[0]; break; }
           }
           if (contatoLimpo) {
             contato.historico_mensagens = contatoLimpo.historico_mensagens || [];
             contato.mensagens_pendentes = contatoLimpo.mensagens_pendentes || [];
             contato.conversa_finalizada = false;
             contato.atendimento_humano = false;
           }
           // NÃO sair aqui - continuar para processar pela IA
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
          // Salvar mensagens de texto normais no histórico (modo humano E modo IA)
          const historicoAtual = contato.historico_mensagens || [];
          historicoAtual.push({
            role: 'user',
            content: messageText,
            timestamp: agora,
            messageId: messageId
          });
          updateData.historico_mensagens = historicoAtual.slice(-50);
          updateData.ultima_interacao = agora;
          console.log('💾 Mensagem salva no histórico (modo:', contato.atendimento_humano ? 'humano' : 'IA', ')');
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
        
        // Aguardar para ver se chegam mais mensagens (debounce)
        console.log(`⏳ Aguardando ${DEBOUNCE_SECONDS}s para acumular mensagens...`);
        await new Promise(resolve => setTimeout(resolve, DEBOUNCE_SECONDS * 1000));
        
        // Recarregar contato para pegar todas as mensagens acumuladas
        let contatoAtualizado = null;
        for (const v of variantesDebounce) {
          const results = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
          if (results.length > 0) { contatoAtualizado = results[0]; break; }
        }
        if (!contatoAtualizado) {
          const todosReload = await base44.asServiceRole.entities.Contato.list('-created_date', 200);
          const u8Reload = telNormDebounce.slice(-8);
          contatoAtualizado = todosReload.find(c => (c.telefone || '').replace(/\D/g, '').slice(-8) === u8Reload);
        }
        
        // Verificar se já foi processado (mensagens_pendentes vazias = outra chamada já processou)
        if (!contatoAtualizado || !contatoAtualizado.mensagens_pendentes || contatoAtualizado.mensagens_pendentes.length === 0) {
          console.log('⏭️ Mensagens já foram processadas por outra chamada. Saindo...');
          return Response.json({ success: true, status: 'ja_processado' });
        }
        
        // LOCK ATÔMICO: Tentar obter o lock limpando as pendentes
        // Apenas a PRIMEIRA chamada que conseguir limpar as pendentes vai processar
        const todasMensagens = [...contatoAtualizado.mensagens_pendentes];
        
        try {
          await base44.asServiceRole.entities.Contato.update(contatoAtualizado.id, {
            mensagens_pendentes: [],
            ultimo_timestamp_pendente: null
          });
        } catch (e) {
          console.log('⚠️ Erro ao obter lock - outra chamada provavelmente processou:', e.message);
          return Response.json({ success: true, status: 'delegado' });
        }
        
        // Verificar se NOSSA mensagem está entre as pendentes (senão outra chamada limpou antes)
        const nossaMsgEstaPresente = todasMensagens.some(m => m.messageId === messageId);
        if (!nossaMsgEstaPresente) {
          console.log('⏭️ Nossa mensagem não está nas pendentes - outra chamada já processou. Saindo...');
          return Response.json({ success: true, status: 'ja_processado' });
        }
        
        console.log(`🔒 Lock obtido! Processando ${todasMensagens.length} mensagens acumuladas`)
        
        // Juntar todas as mensagens pendentes em uma só - MANTER ÚLTIMA MÍDIA
        const ultimaMidia = [...todasMensagens].reverse().find(m => m.mediaUrl);
        if (ultimaMidia) {
          mediaUrl = ultimaMidia.mediaUrl;
          mediaType = ultimaMidia.mediaType;
          console.log(`📎 Usando última mídia encontrada: ${mediaType} - ${mediaUrl}`);
        }
        
        // Se houver apenas mídia sem texto, usar a descrição da mídia como texto
        let mensagemCompleta = todasMensagens.map(m => m.texto).join('\n');
        if (!mensagemCompleta.trim() && ultimaMidia) {
          console.log('📄 Apenas mídia sem texto - usando descrição da mídia');
          mensagemCompleta = ultimaMidia.texto;
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
        
        // Pendentes já foram limpas no lock atômico acima

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
        // Novo contato - criar com histórico e em modo IA para atendimento automático
        const historicoInicial = [{
          role: 'user',
          content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText,
          timestamp: agora,
          mediaType: mediaType,
          mediaUrl: mediaUrl,
          messageId: messageId
        }];

        const novoContato = await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: phoneNumber,
          origem: 'WhatsApp',
          status: 'Novo',
          atendimento_humano: false, // Novo contato começa com IA atendendo
          atendente_atual: null,
          atendente_id: null,
          historico_mensagens: historicoInicial,
          mensagens_pendentes: [],
          ultima_interacao: agora
        });

        console.log('🤖 Novo contato criado em modo IA - processando pela IA');
        // NÃO sair aqui - continuar para processar pela IA
        var mensagemFinal = messageText;
      }
    } catch (e) {
      console.log('⚠️ Erro no debounce:', e.message);
      // Em caso de erro, NÃO processar IA - apenas logar
      console.log('👤 Erro no processamento - não enviando para IA');
      return Response.json({ success: true, status: 'erro_debounce' });
    }

    // VERIFICAÇÃO FINAL: Se chegou aqui, verificar novamente se está em modo humano
    // (pode ter sido alterado durante o debounce)
    try {
      let contatoFinal = null;
      for (const v of variantesDebounce) {
        const results = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
        if (results.length > 0) { contatoFinal = results[0]; break; }
      }
      if (contatoFinal && contatoFinal.atendimento_humano !== false) {
        console.log('👤 Verificação final: contato em modo HUMANO - não processando IA');
        return Response.json({ success: true, status: 'atendimento_humano' });
      }
    } catch (e) {
      console.log('⚠️ Erro na verificação final:', e.message);
    }

    // Usar mensagemFinal em vez de messageText daqui em diante
    const textoParaProcessar = typeof mensagemFinal !== 'undefined' ? mensagemFinal : messageText;
    console.log('📨 Texto final para processar (modo IA ativo):', textoParaProcessar.substring(0, 100));

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
      // Anti-duplicata: verificar se a última resposta do assistente no histórico é idêntica
      try {
        const telCheck = phoneNumber.replace(/\D/g, '');
        const varCheck = [phoneNumber, telCheck];
        if (telCheck.startsWith('55') && telCheck.length >= 12) varCheck.push(telCheck.slice(2));
        if (!telCheck.startsWith('55') && telCheck.length >= 10) varCheck.push('55' + telCheck);
        
        let contatoCheck = null;
        for (const v of varCheck) {
          const res = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
          if (res.length > 0) { contatoCheck = res[0]; break; }
        }
        
        if (contatoCheck) {
          const hist = contatoCheck.historico_mensagens || [];
          const ultimasRespostas = hist.filter(m => m.role === 'assistant').slice(-1);
          if (ultimasRespostas.length > 0 && ultimasRespostas[0].content === respostaIA) {
            console.log('⏭️ Resposta IDÊNTICA à última enviada - NÃO enviando duplicata');
            return Response.json({ success: true, status: 'duplicata_resposta' });
          }
        }
      } catch (e) {
        console.log('⚠️ Erro na verificação anti-duplicata de resposta:', e.message);
      }
      
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