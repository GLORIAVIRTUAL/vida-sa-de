import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let { phoneNumber, messageText, senderName, pacienteId, mediaType, mediaUrl, messageId } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText: (messageText || '').substring(0, 100), mediaType, mediaUrl: mediaUrl ? mediaUrl.substring(0, 80) : null, messageId });

    // ============ DETECÇÃO DE ÁUDIO EMBUTIDO NO TEXTO (BUFFER/DEBOUNCE) ============
    // Quando mensagens passam pelo debounce, a URL do áudio é concatenada no messageText
    // e mediaType/mediaUrl ficam como "text"/null. Precisamos detectar e restaurar.
    if ((!mediaUrl || mediaType === 'text') && messageText) {
      // Detectar se o texto contém indicador de áudio + uma URL
      const temIndicadorAudio = /\[(?:á|a)udio\s*(?:recebido)?\]/i.test(messageText);
      // Capturar QUALQUER URL no texto (ogg, backblaze, supabase, base44, etc.)
      const urlNoTexto = messageText.match(/(https?:\/\/[^\s]+)/i);
      
      if (temIndicadorAudio && urlNoTexto) {
        // Se tem [Áudio recebido] + URL, é áudio do buffer
        mediaType = 'audio';
        mediaUrl = urlNoTexto[1];
        messageText = messageText.replace(urlNoTexto[0], '').replace(/\[(?:á|a)udio\s*(?:recebido)?\]/gi, '').trim();
        if (!messageText) messageText = '[Áudio recebido]';
        console.log('🎤 Áudio detectado no texto (indicador+URL):', mediaUrl.substring(0, 80));
      } else if (urlNoTexto && /\.ogg/i.test(urlNoTexto[1])) {
        mediaType = 'audio'; mediaUrl = urlNoTexto[1];
        messageText = messageText.replace(urlNoTexto[0], '').trim() || '[Áudio recebido]';
      } else if (urlNoTexto && /\.pdf/i.test(urlNoTexto[1])) {
        mediaType = 'document'; mediaUrl = urlNoTexto[1];
        messageText = messageText.replace(urlNoTexto[0], '').trim() || '[Documento recebido]';
        console.log('📄 PDF restaurado do texto buffer:', mediaUrl.substring(0, 80));
      }
    }

    // ============ TRANSCRIÇÃO DE ÁUDIO VIA WHISPER (OpenAI) ============
    // Áudios do WhatsApp (OGG/opus) são transcritos usando a API Whisper da OpenAI.
    // Whisper suporta .ogg nativamente e é muito mais preciso que InvokeLLM para áudio.
    if (mediaType === 'audio' && mediaUrl) {
      console.log('🎤 Áudio detectado - iniciando transcrição via Whisper...');
      console.log('🔗 URL do áudio recebida:', mediaUrl);
      
      let transcricaoSucesso = false;
      
      // PASSO 1: Baixar o áudio
      let audioBlob = null;
      
      try {
        console.log('📥 Baixando áudio de:', mediaUrl.substring(0, 100));
        const audioResp = await fetch(mediaUrl, { redirect: 'follow' });
        const contentType = audioResp.headers.get('content-type') || '';
        console.log('📥 Download: status=', audioResp.status, 'content-type=', contentType);
        
        if (audioResp.ok) {
          audioBlob = await audioResp.blob();
          console.log('📥 Blob: size=', audioBlob.size, 'type=', audioBlob.type);
          
          // Ler primeiros bytes para verificar formato real (magic bytes)
          if (audioBlob.size > 4) {
            const headerBytes = new Uint8Array(await audioBlob.slice(0, 4).arrayBuffer());
            const hex = Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('📥 Magic bytes (hex):', hex);
            // OGG: 4f676753 = "OggS"
            // MP3: fff3 ou fff2 ou 4944 (ID3)
            // WAV: 52494646 = "RIFF"
            // WEBM: 1a45dfa3
            if (hex.startsWith('4f676753')) console.log('📥 Formato real: OGG ✅');
            else if (hex.startsWith('fff') || hex.startsWith('4944')) console.log('📥 Formato real: MP3');
            else if (hex.startsWith('52494646')) console.log('📥 Formato real: WAV');
            else if (hex.startsWith('1a45dfa3')) console.log('📥 Formato real: WEBM');
            else console.log('📥 Formato real: desconhecido');
          }
          
          if (audioBlob.size === 0) {
            console.warn('⚠️ Blob com tamanho 0');
            audioBlob = null;
          }
        }
      } catch (dlErr) {
        console.warn('⚠️ Erro download:', dlErr.message);
      }
      
      if (audioBlob && audioBlob.size > 0) {
        // PASSO 2: Enviar para Whisper API
        // IMPORTANTE: Whisper é SENSÍVEL ao content-type e extensão do arquivo.
        // Áudios do WhatsApp são SEMPRE OGG/Opus. Forçar extensão .ogg e tipo audio/ogg.
        // Se o storage salvou com content-type errado (ex: image/png, application/octet-stream),
        // isso NÃO importa - o que importa é o que enviamos ao Whisper.
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiKey) {
          console.warn('⚠️ OPENAI_API_KEY não configurada - não é possível transcrever');
        } else {
          // Para áudios do WhatsApp, SEMPRE usar .ogg (formato nativo)
          // Só usar outro formato se a URL explicitamente indicar outro tipo
          let audioExt = 'ogg';
          let audioMime = 'audio/ogg';
          const urlLower = (mediaUrl || '').toLowerCase();
          
          if (urlLower.includes('.mp3')) { audioExt = 'mp3'; audioMime = 'audio/mpeg'; }
          else if (urlLower.includes('.mp4') || urlLower.includes('.m4a')) { audioExt = 'mp4'; audioMime = 'audio/mp4'; }
          else if (urlLower.includes('.wav')) { audioExt = 'wav'; audioMime = 'audio/wav'; }
          else if (urlLower.includes('.webm')) { audioExt = 'webm'; audioMime = 'audio/webm'; }
          // Padrão: .ogg (WhatsApp sempre envia OGG/Opus)
          
          console.log(`🎤 Enviando para Whisper: ext=${audioExt}, mime=${audioMime}, size=${audioBlob.size}`);
          
          for (let tentativa = 1; tentativa <= 2 && !transcricaoSucesso; tentativa++) {
            try {
              console.log(`🎤 Whisper tentativa ${tentativa}...`);
              
              // CRÍTICO: Criar novo blob com tipo MIME correto antes de criar o File
              // Isso garante que o FormData envie o content-type correto ao Whisper
              const blobCorrigido = new Blob([audioBlob], { type: audioMime });
              const audioFile = new File([blobCorrigido], `audio.${audioExt}`, { type: audioMime });
              
              console.log(`🎤 File criado: name=${audioFile.name}, type=${audioFile.type}, size=${audioFile.size}`);
              
              const formData = new FormData();
              formData.append('file', audioFile);
              formData.append('model', 'whisper-1');
              formData.append('language', 'pt');
              formData.append('response_format', 'text');
              
              const whisperResp = await Promise.race([
                fetch('https://api.openai.com/v1/audio/transcriptions', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${openaiKey}` },
                  body: formData
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Whisper 30s')), 30000))
              ]);
              
              console.log('🎤 Whisper response status:', whisperResp.status);
              
              if (whisperResp.ok) {
                const textoTranscrito = await whisperResp.text();
                console.log('🎤 Whisper raw response:', textoTranscrito.substring(0, 300));
                
                const textoLimpo = textoTranscrito.trim().replace(/^["']|["']$/g, '').trim();
                
                if (textoLimpo.length > 0 && textoLimpo.length < 5000) {
                  messageText = textoLimpo;
                  transcricaoSucesso = true;
                  console.log('✅ Whisper transcreveu com sucesso (tentativa ' + tentativa + '):', textoLimpo.substring(0, 150));
                } else {
                  console.log('⚠️ Whisper retornou texto vazio ou muito longo, length:', textoLimpo.length);
                }
              } else {
                const errBody = await whisperResp.text();
                console.warn(`⚠️ Whisper erro HTTP ${whisperResp.status} (tentativa ${tentativa}):`, errBody.substring(0, 300));
                
                // Se erro 400 com extensão .ogg, tentar com .mp3 na segunda tentativa
                if (whisperResp.status === 400 && tentativa === 1 && audioExt === 'ogg') {
                  console.log('🔄 Tentando com extensão .mp3 na próxima tentativa...');
                  audioExt = 'mp3';
                  audioMime = 'audio/mpeg';
                }
              }
            } catch (whisperErr) {
              console.warn(`⚠️ Whisper exceção tentativa ${tentativa}:`, whisperErr.message);
            }
          }
        }
      } else {
        console.warn('⚠️ Não foi possível baixar o áudio');
      }
      
      // FALLBACK: Se Whisper falhou, não há fallback disponível via InvokeLLM
      if (!transcricaoSucesso && mediaUrl) {
        console.log('⚠️ Whisper falhou - sem fallback disponível. Mantendo texto padrão.');
      }
      
      if (!transcricaoSucesso) {
        console.log('❌ Todas as tentativas de transcrição falharam');
        // Manter messageText como "[Áudio recebido]" - o LLM principal vai pedir para digitar
      }
    }
    
    // ============ ANTI-DUPLICATA COM LOCK DISTRIBUÍDO ============
    // Problema: zapiWebhook e webhookWhatsappChatbot AMBOS chamam esta função para a mesma mensagem.
    // Solução: Usar campo 'processando_ia_lock' no contato como mutex distribuído.
    
    const isBufferMessage = messageId && messageId.startsWith('buffer_');
    
    // Helper: buscar contato por telefone (com variantes)
    async function buscarContatoPorTelefone(tel) {
      const telNorm = tel.replace(/\D/g, '');
      const vars = [tel, telNorm];
      if (telNorm.startsWith('55') && telNorm.length >= 12) vars.push(telNorm.slice(2));
      if (!telNorm.startsWith('55') && telNorm.length >= 10) vars.push('55' + telNorm);
      for (const v of vars) {
        const r = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
        if (r.length > 0) return r[0];
      }
      return null;
    }
    
    // PASSO 1: Verificar se messageId já foi processado + adquirir lock
    if (!isBufferMessage && messageId) {
      try {
        const contatoVerif = await buscarContatoPorTelefone(phoneNumber);
        if (contatoVerif) {
          const historicoVerif = contatoVerif.historico_mensagens || [];
          
          // Se messageId já tem resposta do assistant no histórico = já processado
          const jaProcessado = historicoVerif.some((m, idx) => {
            if (m.messageId !== messageId || m.role !== 'user') return false;
            return historicoVerif.slice(idx + 1).some(r => r.role === 'assistant');
          });
          if (jaProcessado) {
            console.log('⏭️ MessageId já processado com resposta - duplicata:', messageId);
            return Response.json({ success: true, status: 'duplicata_ignorada', resposta: null });
          }
          
          // PASSO 2: LOCK DISTRIBUÍDO - Verificar se outra instância já está processando
          const lockAtual = contatoVerif.processando_ia_lock || null;
          const agora = Date.now();
          
          if (lockAtual) {
            const lockTimestamp = new Date(lockAtual).getTime();
            const lockIdadeMs = agora - lockTimestamp;
            
            // Se lock tem menos de 45 segundos = outra instância está processando
            if (lockIdadeMs < 45000) {
              console.log(`🔒 Lock ativo (${Math.round(lockIdadeMs/1000)}s) - outra instância processando. Abortando.`);
              return Response.json({ success: true, status: 'lock_ativo', resposta: null });
            }
            // Se lock tem mais de 45s = expirou (instância anterior falhou)
            console.log(`🔓 Lock expirado (${Math.round(lockIdadeMs/1000)}s) - assumindo processamento`);
          }
          
          // PASSO 3: Adquirir lock com ID único (inclui random para desempate)
          const meuLock = new Date().toISOString() + '_' + Math.random().toString(36).slice(2, 8);
          await base44.asServiceRole.entities.Contato.update(contatoVerif.id, {
            processando_ia_lock: meuLock
          });
          
          // Espera mais longa para detectar race condition entre webhooks concorrentes
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Re-verificar se NOSSO lock ainda está ativo (outra instância pode ter sobrescrito)
          const contatoRecheck = await buscarContatoPorTelefone(phoneNumber);
          if (contatoRecheck && contatoRecheck.processando_ia_lock !== meuLock) {
            console.log('🔒 Lock foi sobrescrito por outra instância - abortando');
            return Response.json({ success: true, status: 'lock_perdido', resposta: null });
          }
          
          // PASSO 4: Segunda verificação - checar novamente se messageId foi processado durante a espera
          if (contatoRecheck) {
            const histRecheck = contatoRecheck.historico_mensagens || [];
            const jaProcessadoAgora = histRecheck.some((m, idx) => {
              if (m.messageId !== messageId || m.role !== 'user') return false;
              return histRecheck.slice(idx + 1).some(r => r.role === 'assistant');
            });
            if (jaProcessadoAgora) {
              console.log('⏭️ MessageId processado durante espera do lock - abortando:', messageId);
              await liberarLock(base44, phoneNumber);
              return Response.json({ success: true, status: 'duplicata_pos_lock', resposta: null });
            }
          }
          
          console.log('🔓 Lock adquirido com sucesso:', meuLock.slice(0, 30));
        }
      } catch (e) {
        console.log('⚠️ Erro verificação duplicata/lock:', e.message);
      }
    } else if (isBufferMessage) {
      console.log('🔄 Mensagem do buffer - lock simplificado');
      try {
        const contatoVerif = await buscarContatoPorTelefone(phoneNumber);
        if (contatoVerif) {
          const lockAtual = contatoVerif.processando_ia_lock || null;
          const agora = Date.now();
          if (lockAtual) {
            const lockIdadeMs = agora - new Date(lockAtual.split('_')[0]).getTime();
            if (lockIdadeMs < 45000) {
              console.log(`🔒 Buffer: Lock ativo (${Math.round(lockIdadeMs/1000)}s) - abortando`);
              return Response.json({ success: true, status: 'lock_ativo_buffer', resposta: null });
            }
          }
          const meuLockBuffer = new Date().toISOString() + '_buf_' + Math.random().toString(36).slice(2, 8);
          await base44.asServiceRole.entities.Contato.update(contatoVerif.id, {
            processando_ia_lock: meuLockBuffer
          });
        }
      } catch (e) {
        console.log('⚠️ Erro lock buffer:', e.message);
      }
    }
    
    // ANTI-DUPLICATA PÓS-AGENDAMENTO: Se a última resposta do assistente é uma confirmação de agendamento
    // e a mensagem do cliente é a mesma que gerou essa confirmação, ignorar (é reprocessamento do outro webhook)
    try {
      const contatoPostAg = await buscarContatoPorTelefone(phoneNumber);
      if (contatoPostAg) {
        const hist = contatoPostAg.historico_mensagens || [];
        if (hist.length >= 2) {
          const ultimaMsg = hist[hist.length - 1];
          const penultimaMsg = hist[hist.length - 2];
          // Se a última é uma confirmação de agendamento do assistant e a penúltima é do user com o mesmo conteúdo
          if (ultimaMsg.role === 'assistant' && /Agendamento confirmado|Te aguardamos/i.test(ultimaMsg.content) &&
              penultimaMsg.role === 'user') {
            const conteudoAtual = (mediaUrl ? `${messageText}\n${mediaUrl}` : messageText).trim();
            const conteudoAnterior = (penultimaMsg.content || '').trim();
            if (conteudoAtual === conteudoAnterior || messageText.trim() === conteudoAnterior) {
              console.log('⏭️ Mensagem duplicada pós-agendamento - ignorando reprocessamento');
              await liberarLock(base44, phoneNumber);
              return Response.json({ success: true, status: 'duplicata_pos_agendamento', resposta: null });
            }
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Erro verificação pós-agendamento:', e.message);
    }

    // Verificar se o contato está em atendimento humano
    // EXCEÇÃO: Mensagens vindas do buffer (messageId começa com "buffer_") já foram validadas
    // pelo webhook chamador — o contato estava em modo IA quando entrou no debounce.
    // Outra instância (ex: webhookWhatsappChatbot) pode ter revertido para humano durante o delay.
    const contatosCheck = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
    if (contatosCheck.length > 0 && contatosCheck[0].atendimento_humano && !isBufferMessage) {
      console.log('⚠️ Contato em atendimento humano - ignorando IA');
      
      // Apenas salvar a mensagem no histórico sem responder com IA
      const contato = contatosCheck[0];
      const historicoAtual = contato.historico_mensagens || [];
      const timestamp = new Date().toISOString();
      
      const userMsg = { role: 'user', content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText, timestamp };
      if (mediaType && mediaType !== 'text') userMsg.mediaType = mediaType;
      if (mediaUrl) userMsg.mediaUrl = mediaUrl;
      historicoAtual.push(userMsg);
      
      await base44.asServiceRole.entities.Contato.update(contato.id, {
        ultima_mensagem: messageText,
        historico_mensagens: historicoAtual.slice(-50),
        ultima_interacao: timestamp,
        total_mensagens: (contato.total_mensagens || 0) + 1,
        status: 'Lead',
        conversa_finalizada: false,
        processando_ia_lock: null // Liberar lock
      });
      
      return Response.json({ 
        success: true, 
        resposta: null,
        atendimento_humano: true,
        message: 'Mensagem salva - atendimento humano ativo'
      });
    }
    
    // Se é mensagem de buffer mas contato foi revertido para humano, RESPEITAR modo humano
    // Não forçar modo IA - só mudar para IA manualmente
    if (isBufferMessage && contatosCheck.length > 0 && contatosCheck[0].atendimento_humano) {
      console.log('👤 Buffer: contato está em modo humano - respeitando. NÃO processando IA.');
      await liberarLock(base44, phoneNumber);
      return Response.json({ 
        success: true, 
        resposta: null,
        atendimento_humano: true,
        message: 'Buffer ignorado - atendimento humano ativo'
      });
    }
    
    // Buscar configuração do chatbot (com timeout)
    let config;
    try {
      const configs = await Promise.race([
        base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ChatbotConfig')), 5000))
      ]);
      config = configs[0];
    } catch (e) {
      console.error('⚠️ Erro ao buscar ChatbotConfig:', e.message);
      config = null;
    }
    
    if (!config) {
      console.log('❌ ChatbotConfig não encontrado');
      return Response.json({ 
        success: true, 
        resposta: 'Olá! Estou com dificuldades técnicas. Por favor, entre em contato pelo WhatsApp.',
        conversationId: null
      });
    }
    
    console.log('✅ Config encontrada:', config.nome, '| Modelo LLM:', config.modelo_llm);
    
    let conversaFinalizada = false;
    if (contatosCheck.length > 0 && contatosCheck[0].conversa_finalizada) {
      conversaFinalizada = true;
      console.log('📝 Conversa finalizada - limpando histórico');
      await base44.asServiceRole.entities.Contato.update(contatosCheck[0].id, { conversa_finalizada: false, historico_mensagens: [], ultima_mensagem: null, ultima_resposta: null });
    }
    
    // Buscar histórico de conversa - CARREGAR MAIS MENSAGENS para contexto rico
    let historicoConversa = '';
    let historicoMensagensRaw = []; // Guardar mensagens brutas para contexto do LLM
    let contatoHistorico = null; // Referência ao contato para uso posterior
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      if (contatos.length > 0) {
        contatoHistorico = contatos[0];
        // Se a conversa foi finalizada ou histórico está vazio, tratar como primeira mensagem
        if (conversaFinalizada || !contatos[0].historico_mensagens || contatos[0].historico_mensagens.length === 0) {
          console.log('🗑️ Histórico vazio ou conversa finalizada - tratando como PRIMEIRA MENSAGEM');
          historicoConversa = '';
          historicoMensagensRaw = [];
        } else {
          // Carregar últimas 20 mensagens para contexto mais rico
          const ultimas = contatos[0].historico_mensagens.slice(-20);
          historicoMensagensRaw = ultimas;
          historicoConversa = ultimas.map(m => `${m.role === 'user' ? 'CLIENTE' : 'ASSISTENTE'}: ${m.content}`).join('\n');
        }
      }
    } catch (e) {
      console.log('⚠️ Não foi possível buscar histórico');
    }

    // ===== DETECÇÃO DEFINITIVA DE PRIMEIRA MENSAGEM (logo após carregar histórico) =====
    // REGRA ROBUSTA: Verificar se o assistente já respondeu nesta conversa
    // Recarregar contato fresh para evitar race conditions entre instâncias paralelas
    let contatoFresh = contatoHistorico;
    if (contatoHistorico) {
      try {
        const freshList = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
        if (freshList.length > 0) contatoFresh = freshList[0];
      } catch (e) {}
    }
    const historicoMsgs = contatoFresh ? (contatoFresh.historico_mensagens || []) : [];
    const assistenteJaRespondeu = historicoMsgs.some(m => m.role === 'assistant');
    // Primeira mensagem se: assistente nunca respondeu (contato novo ou sem resposta)
    // OU conversa foi finalizada e histórico foi limpo
    const ehPrimeiraMensagemDefinitiva = !assistenteJaRespondeu || (conversaFinalizada && historicoMensagensRaw.length === 0);
    
    console.log('🔍 Primeira mensagem definitiva:', ehPrimeiraMensagemDefinitiva, 
      '| assistenteJaRespondeu:', assistenteJaRespondeu, 
      '| conversaFinalizada:', conversaFinalizada,
      '| historicoMsgs:', historicoMsgs.length);
    
    // Se é primeira mensagem, verificar se está em modo humano
    if (ehPrimeiraMensagemDefinitiva) {
      const timestamp = new Date().toISOString();
      const userEntry = { role: 'user', content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText, timestamp, messageId };
      if (mediaType && mediaType !== 'text') userEntry.mediaType = mediaType;
      if (mediaUrl) userEntry.mediaUrl = mediaUrl;
      
      // Verificar se contato está em modo humano (só humano se explicitamente true)
      const estaEmModoHumano = contatoFresh && contatoFresh.atendimento_humano === true;
      
      if (estaEmModoHumano) {
        // MODO HUMANO: Apenas salvar mensagem, NÃO enviar saudação da IA
        console.log('👤 PRIMEIRA MENSAGEM em modo HUMANO - apenas salvando, sem resposta IA');
        
        if (contatoFresh) {
          const hist = contatoFresh.historico_mensagens || [];
          hist.push(userEntry);
          await base44.asServiceRole.entities.Contato.update(contatoFresh.id, {
            ultima_mensagem: messageText,
            historico_mensagens: hist.slice(-50),
            ultima_interacao: timestamp,
            total_mensagens: (contatoFresh.total_mensagens || 0) + 1,
            conversa_finalizada: false,
            processando_ia_lock: null
          });
        } else {
          // Contato novo - criar em modo HUMANO sem resposta IA
          let telefoneComPrefixo = phoneNumber.replace(/\D/g, '');
          if (!telefoneComPrefixo.startsWith('55')) {
            telefoneComPrefixo = '55' + telefoneComPrefixo;
          }
          await base44.asServiceRole.entities.Contato.create({
            nome: senderName,
            telefone: telefoneComPrefixo,
            paciente_id: pacienteId,
            origem: 'WhatsApp',
            status: 'Novo',
            atendimento_humano: false,
            ultima_mensagem: messageText,
            historico_mensagens: [userEntry],
            ultima_interacao: timestamp,
            total_mensagens: 1,
            conversa_finalizada: false
          });
          console.log('🤖 Novo contato criado em modo IA (automático)');
        }
        
        return Response.json({ 
          success: true, 
          resposta: null,
          atendimento_humano: true,
          message: 'Primeira mensagem salva - atendimento humano ativo'
        });
      }
      
      // MODO IA: Primeira mensagem - NÃO retornar saudação fixa genérica.
      // Em vez disso, salvar a mensagem do user no histórico e DEIXAR O FLUXO CONTINUAR
      // para que o LLM processe a mensagem com contexto completo (disponibilidades, preços, etc.)
      // Isso permite que a Glória responda ao que o cliente perguntou na primeira mensagem.
      
      console.log('🤖 PRIMEIRA MENSAGEM em modo IA - deixando LLM processar com contexto completo');
      
      if (contatoFresh) {
        const hist = contatoFresh.historico_mensagens || [];
        // Só adicionar se ainda não está no histórico
        const jaExisteUser = messageId && hist.some(m => m.messageId === messageId && m.role === 'user');
        if (!jaExisteUser) {
          hist.push(userEntry);
        }
        await base44.asServiceRole.entities.Contato.update(contatoFresh.id, {
          ultima_mensagem: messageText,
          historico_mensagens: hist.slice(-50),
          ultima_interacao: timestamp,
          conversa_finalizada: false
        });
      }
      
      // NÃO retornar aqui - deixar o fluxo continuar para o LLM processar
      // O LLM vai gerar uma resposta contextualizada que inclui saudação + resposta à pergunta
    }

    // Verificar se cliente quer verificar status do agendamento
    // FLUXO SEPARADO: VERIFICAÇÃO é completamente diferente de AGENDAMENTO
    // IMPORTANTE: Se o histórico mostra que o assistente está pedindo nome/data de nascimento para AGENDAR,
    // NÃO confundir com fluxo de verificação!
    const historicoMostraFluxoAgendamento = historicoConversa && (
      /nome completo.*paciente|data de nascimento.*paciente|qual.*médico.*prefere|horário.*prefere|disponibilidades|agendar.*consulta|qual especialidade.*agendar/i.test(historicoConversa) ||
      // Assistente mostrou horários de médicos
      (/Dr\.\s+\w+/i.test(historicoConversa) && /\d{2}:\d{2}/i.test(historicoConversa) && /qual.*prefere|escolh|horário/i.test(historicoConversa))
    );
    
    const temPedidoVerificacaoNoHistorico = historicoConversa && 
      /verificar|consultar|checar|status|confirma|está confirmado|foi confirmado|meu agendamento/i.test(historicoConversa) &&
      !/agendar|marcar|nova consulta|qual especialidade/i.test(historicoConversa) &&
      !historicoMostraFluxoAgendamento;

    const querVerificarAgendamento = 
      // Se estamos claramente em fluxo de agendamento, NÃO entrar em verificação
      !historicoMostraFluxoAgendamento && (
        // Cliente está pedindo para verificar agora
        (/verificar|consultar|checar|status|confirma|está confirmado|foi confirmado|meu agendamento/i.test(messageText) && 
         !/cancelar|desmarcar|agendar|marcar|nova|novo/i.test(messageText)) ||
        // OU: já pediu verificação antes e agora está enviando dados (nome/data)
        (temPedidoVerificacaoNoHistorico && /(\d{1,2})\/(\d{1,2})\/(\d{4})|nascimento|nascido|me chamo/i.test(messageText))
      );

    // Verificar se cliente quer cancelar agendamento
    const querCancelar = /cancelar|desmarcar|n[aã]o (vou|posso|irei)|remarcar|adiar|desistir/i.test(messageText) ||
                        /cancelar|desmarcar/i.test(historicoConversa || '');
    let infoCancelamento = '';
    let agendamentoCancelado = false;

    // ========== FLUXO DE VERIFICAÇÃO (SEPARADO) ==========
    if (querVerificarAgendamento) {
      console.log('🔍 Cliente quer VERIFICAR agendamento (fluxo separado)...');

      // Extrair nome e data de nascimento da conversa
      let nomeExtraido = null;
      let dataNascimentoExtraida = null;

      // Buscar nome na mensagem - múltiplos formatos
      const nomeMatch = messageText.match(/(?:nome[:\s]+|sou\s+o?\s*|me chamo\s+|é\s+)?([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+)/i);
      if (nomeMatch) {
        // Limpar nome - remover palavras comuns que não fazem parte do nome
        let nome = nomeMatch[1].trim();
        nome = nome.replace(/^(me chamo|sou|meu nome é|é)\s*/i, '');
        if (nome.split(' ').length >= 2) { // Nome deve ter pelo menos 2 partes
          nomeExtraido = nome;
        }
      }

      // Buscar data de nascimento
      const dataMatch = messageText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dataMatch) {
        dataNascimentoExtraida = `${dataMatch[3]}-${String(dataMatch[2]).padStart(2,'0')}-${String(dataMatch[1]).padStart(2,'0')}`;
      }

      console.log('📋 Dados extraídos para VERIFICAÇÃO:', { nomeExtraido, dataNascimentoExtraida });

      if (nomeExtraido && dataNascimentoExtraida) {
        // Chamar função de verificação
        try {
          const resultadoVerificacao = await base44.asServiceRole.functions.invoke('verificarAgendamento', {
            nome: nomeExtraido,
            data_nascimento: dataNascimentoExtraida
          });

          console.log('✅ Verificação realizada:', resultadoVerificacao.data);

          let respostaVerificacao = '';

          if (resultadoVerificacao.data?.sucesso && resultadoVerificacao.data?.agendamentos?.length > 0) {
            // Formatar resposta com agendamentos - MOSTRAR STATUS REAL
            respostaVerificacao = `📋 *Encontramos seus agendamentos:*\n\n`;

            resultadoVerificacao.data.agendamentos.forEach((ag, idx) => {
              // Emoji diferente por status
              let statusEmoji = '✅';
              let statusTexto = ag.status;
              if (ag.status === 'Cancelado') {
                statusEmoji = '❌';
                statusTexto = 'CANCELADO';
              } else if (ag.status === 'Agendado') {
                statusEmoji = '📅';
                statusTexto = 'Agendado (aguardando confirmação)';
              } else if (ag.status === 'Confirmado') {
                statusEmoji = '✅';
                statusTexto = 'CONFIRMADO';
              } else if (ag.status === 'Finalizado') {
                statusEmoji = '✔️';
                statusTexto = 'Finalizado';
              }

              respostaVerificacao += `${statusEmoji} *${ag.data_formatada}* às *${ag.horario}*\n`;
              respostaVerificacao += `👨‍⚕️ ${ag.medico_nome} (${ag.especialidade})\n`;
              respostaVerificacao += `🏥 ${ag.tipo_servico}\n`;
              respostaVerificacao += `📌 Status: *${statusTexto}*\n`;
              if (ag.observacoes) respostaVerificacao += `📝 ${ag.observacoes}\n`;
              respostaVerificacao += '\n';
            });

            // Mensagem final baseada nos status
            const temConfirmado = resultadoVerificacao.data.agendamentos.some(a => a.status === 'Confirmado' || a.status === 'Agendado');
            if (temConfirmado) {
              respostaVerificacao += '📍 *Endereço:* Tristão Monteiro, 580 – Zona Nova, Tramandaí/RS\n';
              respostaVerificacao += '⏰ Lembre-se de chegar 10 minutos antes!\n\nPosso ajudar em mais alguma coisa?';
            } else {
              respostaVerificacao += 'Posso ajudar em mais alguma coisa?';
            }
          } else {
            respostaVerificacao = `😔 Não encontramos agendamentos para *${nomeExtraido}* com data de nascimento *${dataMatch[1]}/${dataMatch[2]}/${dataMatch[3]}*.\n\nVerifique se os dados estão corretos ou, se preferir, posso agendar uma consulta para você! 😊`;
          }

          // Salvar no histórico
          try {
            const contatosCheck = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
            if (contatosCheck.length > 0) {
              const historicoAtual = contatosCheck[0].historico_mensagens || [];
              const timestamp = new Date().toISOString();

              historicoAtual.push(
                { role: 'user', content: messageText, timestamp },
                { role: 'assistant', content: respostaVerificacao, timestamp }
              );

              await base44.asServiceRole.entities.Contato.update(contatosCheck[0].id, {
                historico_mensagens: historicoAtual.slice(-50),
                ultima_interacao: timestamp
              });
            }
          } catch (e) {
            console.log('⚠️ Erro ao salvar histórico:', e.message);
          }

          // RETORNO IMEDIATO - NÃO CONTINUA PARA AGENDAMENTO
          await liberarLock(base44, phoneNumber);
          return Response.json({ 
            success: true, 
            resposta: respostaVerificacao,
            verificado: true,
            fluxo: 'verificacao'
          });

        } catch (e) {
          console.error('❌ Erro ao verificar agendamento:', e.message);
        }
      } else {
        // Pedir dados faltantes - RETORNO IMEDIATO
        const respostaPedirDados = `Para verificar seu agendamento, preciso:\n\n📝 Seu nome completo\n📅 Sua data de nascimento (DD/MM/AAAA)\n\nEx: "Antonio Thiago Cavalcanti Alves 19/04/1982"`;

        // Salvar no histórico
        try {
          const contatosCheck = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
          if (contatosCheck.length > 0) {
            const historicoAtual = contatosCheck[0].historico_mensagens || [];
            const timestamp = new Date().toISOString();

            historicoAtual.push(
              { role: 'user', content: messageText, timestamp },
              { role: 'assistant', content: respostaPedirDados, timestamp }
            );

            await base44.asServiceRole.entities.Contato.update(contatosCheck[0].id, {
              historico_mensagens: historicoAtual.slice(-50),
              ultima_interacao: timestamp
            });
          }
        } catch (e) {
          console.log('⚠️ Erro ao salvar histórico:', e.message);
        }

        await liberarLock(base44, phoneNumber);
        return Response.json({ 
          success: true, 
          resposta: respostaPedirDados,
          fluxo: 'verificacao'
        });
      }
    } // FIM VERIFICAÇÃO

      if (querCancelar) {
      console.log('❌ Cliente quer cancelar agendamento...');

      // Buscar agendamentos APENAS do paciente vinculado ao telefone que está conversando
      // NUNCA buscar agendamentos de outros pacientes por nome parcial
      try {
        const hoje = new Date().toISOString().split('T')[0];
        let agendamentosFuturos = [];
        let nomePaciente = '';
        
        // Buscar paciente pelo telefone (com múltiplas variantes)
        let pacientes = [];
        const telNormCancel = phoneNumber.replace(/\D/g, '');
        const variantesCancel = [phoneNumber, telNormCancel];
        if (telNormCancel.startsWith('55') && telNormCancel.length >= 12) variantesCancel.push(telNormCancel.slice(2));
        if (!telNormCancel.startsWith('55') && telNormCancel.length >= 10) variantesCancel.push('55' + telNormCancel);
        
        for (const variante of variantesCancel) {
          if (pacientes.length > 0) break;
          try {
            pacientes = await base44.asServiceRole.entities.Paciente.filter({ telefone: variante });
          } catch (e) {}
        }
        
        // Fallback: buscar por últimos 8 dígitos
        if (pacientes.length === 0) {
          try {
            const todosPacientesCancel = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
            const ultimos8Cancel = telNormCancel.slice(-8);
            pacientes = todosPacientesCancel.filter(p => {
              const tel = (p.telefone || '').replace(/\D/g, '');
              return tel.length >= 8 && tel.slice(-8) === ultimos8Cancel;
            });
          } catch (e) {
            console.warn('⚠️ Erro busca ampla pacientes:', e.message);
          }
        }
        
        console.log(`🔍 Pacientes vinculados ao telefone ${phoneNumber}: ${pacientes.length}`, pacientes.map(p => `${p.nome} (${p.id})`));
        
        if (pacientes.length > 0) {
          // Coletar IDs de TODOS os pacientes vinculados a este telefone
          const pacienteIds = pacientes.map(p => p.id);
          nomePaciente = pacientes[0].nome;
          
          // Buscar agendamentos APENAS desses pacientes (por paciente_id)
          for (const paciente of pacientes) {
            const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
              paciente_id: paciente.id,
              status: { $in: ['Agendado', 'Confirmado', 'Pago'] }
            });
            const futuros = agendamentos.filter(ag => ag.data_agendamento >= hoje);
            agendamentosFuturos.push(...futuros);
          }
          
          // Remover duplicatas
          const idsVistos = new Set();
          agendamentosFuturos = agendamentosFuturos.filter(ag => {
            if (idsVistos.has(ag.id)) return false;
            idsVistos.add(ag.id);
            return true;
          });
          
          console.log(`📋 Agendamentos futuros do paciente: ${agendamentosFuturos.length}`);
        }

        if (agendamentosFuturos.length > 0) {
          // Buscar médicos para mostrar nomes
          const medicos = await base44.asServiceRole.entities.Medico.list();
          const medicosMap = {};
          medicos.forEach(m => { medicosMap[m.id] = m; });

          infoCancelamento = `\n\n📋 AGENDAMENTOS ENCONTRADOS PARA CANCELAMENTO:
    O paciente ${nomePaciente || 'vinculado a este telefone'} tem os seguintes agendamentos:\n`;

          agendamentosFuturos.forEach((ag, idx) => {
            const medico = medicosMap[ag.medico_id];
            const dataObj = new Date(ag.data_agendamento + 'T12:00:00');
            const dataFormatada = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

            infoCancelamento += `\n${idx + 1}. ${ag.tipo_servico} - ${dataFormatada} às ${ag.horario}`;
            if (medico) infoCancelamento += ` com ${medico.nome} (${medico.especialidade})`;
            infoCancelamento += `\n   ID: ${ag.id}`;
          });

          infoCancelamento += `\n\n⚠️ INSTRUÇÕES PARA CANCELAMENTO:
    1. MOSTRE a lista acima ao cliente e pergunte QUAL deseja cancelar
    2. Quando o cliente confirmar (pelo número, nome do médico ou data), CANCELE IMEDIATAMENTE
    3. NÃO peça nome do paciente - já temos os dados
    4. NÃO peça motivo - apenas confirme e cancele
    5. Após o cliente indicar qual, informe que foi cancelado com sucesso`;
        } else {
          infoCancelamento = `\n\n❌ NENHUM AGENDAMENTO FUTURO ENCONTRADO
    Não encontramos agendamentos futuros para este telefone.
    Peça ao cliente para confirmar se o agendamento foi feito com este número de telefone.`;
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar agendamentos:', e.message);
      }
    }

    const executarCancelamento = async (agendamentoId) => {
      try {
        const todosAg = await base44.asServiceRole.entities.Agendamento.list();
        const ag = todosAg.find(a => a.id === agendamentoId);
        if (!ag) { console.log('❌ Agendamento não encontrado'); return false; }
        let medicoNome='Médico', medicoEsp='';
        try { const ms=await base44.asServiceRole.entities.Medico.filter({id:ag.medico_id}); if(ms.length>0){medicoNome=ms[0].nome;medicoEsp=ms[0].especialidade;} } catch(e){}
        const df=new Date(ag.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'});
        await base44.asServiceRole.entities.Agendamento.update(agendamentoId,{status:'Cancelado',observacoes:`Cancelado via WhatsApp em ${new Date().toLocaleString('pt-BR')}`});
        try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0)await base44.asServiceRole.entities.Contato.update(cs[0].id,{status:'Cancelou'});}catch(e){}
        try{await base44.asServiceRole.entities.Notification.create({type:'agendamento_cancelado',message:`❌ ${ag.paciente_nome||'Paciente'} cancelou ${medicoEsp} com ${medicoNome} - ${df} às ${ag.horario}`,data:{agendamento_id:agendamentoId,paciente_nome:ag.paciente_nome,medico_nome:medicoNome,especialidade:medicoEsp,data:ag.data_agendamento,horario:ag.horario,cancelado_por:'WhatsApp - Glória'},is_read:false});}catch(e){}
        console.log('✅ Cancelado:', agendamentoId); return true;
      } catch(e) { console.error('❌ Erro cancelar:', e.message); return false; }
    };

    // Verificar se o cliente está tentando indicar qual agendamento cancelar
    // Pode ser: número (1, 2), nome do médico, data (19/01), ou confirmação
    // TAMBÉM detectar quando o assistente mostrou a lista de agendamentos e perguntou "Qual consulta você deseja cancelar?"
    const contextoCancel = /cancelar|desmarcar|qual.*cancelar|gostaria de cancelar|qual\s*consulta.*deseja|deseja\s*cancelar/i.test(historicoConversa || '');
    
    if (contextoCancel && historicoConversa) {
      console.log('🔍 Contexto de cancelamento detectado, analisando resposta do cliente...');
      console.log('📝 Mensagem do cliente:', messageText);
      
      // Buscar agendamentos futuros do paciente vinculado ao telefone
      // IMPORTANTE: Normalizar telefone e buscar com múltiplas variantes (como no bloco querCancelar)
      const hoje = new Date().toISOString().split('T')[0];
      
      // Normalizar telefone para busca
      const telNorm = phoneNumber.replace(/\D/g, '');
      const variantes = [phoneNumber, telNorm];
      if (telNorm.startsWith('55') && telNorm.length >= 12) {
        variantes.push(telNorm.slice(2)); // sem código país
      }
      if (!telNorm.startsWith('55') && telNorm.length >= 10) {
        variantes.push('55' + telNorm); // com código país
      }
      
      let pacientes = [];
      for (const variante of variantes) {
        if (pacientes.length > 0) break;
        try {
          pacientes = await base44.asServiceRole.entities.Paciente.filter({ telefone: variante });
        } catch (e) {}
      }
      
      // Se não encontrou, buscar por últimos 8 dígitos
      if (pacientes.length === 0) {
        try {
          const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
          const ultimos8 = telNorm.slice(-8);
          pacientes = todosPacientes.filter(p => {
            const tel = (p.telefone || '').replace(/\D/g, '');
            return tel.slice(-8) === ultimos8;
          });
        } catch (e) {
          console.warn('⚠️ Erro busca ampla pacientes:', e.message);
        }
      }
      
      console.log(`🔍 Pacientes encontrados para cancelamento: ${pacientes.length}`, pacientes.map(p => p.nome));
      
      let agendamentosFuturos = [];
      
      if (pacientes.length > 0) {
        // Buscar agendamentos de TODOS os pacientes encontrados
        for (const paciente of pacientes) {
          const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            paciente_id: paciente.id,
            status: { $in: ['Agendado', 'Pago'] }
          });
          const futuros = agendamentos.filter(ag => ag.data_agendamento >= hoje);
          agendamentosFuturos.push(...futuros);
        }
        // Remover duplicatas
        const idsVistos = new Set();
        agendamentosFuturos = agendamentosFuturos.filter(ag => {
          if (idsVistos.has(ag.id)) return false;
          idsVistos.add(ag.id);
          return true;
        });
        console.log(`📋 Encontrados ${agendamentosFuturos.length} agendamentos futuros`);
      }
      
      if (agendamentosFuturos.length > 0) {
        // Buscar médicos
        const medicos = await base44.asServiceRole.entities.Medico.list();
        const medicosMap = {};
        medicos.forEach(m => { medicosMap[m.id] = m; });
        
        const msgLower = messageText.toLowerCase().trim();
        let agendamentoParaCancelar = null;
        
        console.log('🔍 Analisando resposta para cancelamento:', msgLower, '| Agendamentos:', agendamentosFuturos.length);
        
        // 1. Verificar se cliente disse número (1, 2, 3...) - aceita formatos: "2", "2.", "2. 13:15", "opção 2"
        const numeroMatch = messageText.match(/^(?:op[çc][aã]o\s*)?(\d)\s*[.\-,:]?\s*/i);
        if (numeroMatch) {
          const num = parseInt(numeroMatch[1]);
          if (num > 0 && num <= agendamentosFuturos.length) {
            agendamentoParaCancelar = agendamentosFuturos[num - 1].id;
            console.log(`✅ Cliente escolheu opção ${num}: ${agendamentoParaCancelar}`);
          }
        }
        
        // 2. Verificar se cliente mencionou horário específico (13:15, 13h15, às 13:15)
        if (!agendamentoParaCancelar) {
          const horarioMatch = messageText.match(/(\d{1,2})[h:](\d{2})/);
          if (horarioMatch) {
            const horarioBuscado = `${String(horarioMatch[1]).padStart(2,'0')}:${horarioMatch[2]}`;
            for (const ag of agendamentosFuturos) {
              if (ag.horario === horarioBuscado) {
                agendamentoParaCancelar = ag.id;
                console.log(`✅ Cliente mencionou horário ${horarioBuscado}: ${ag.id}`);
                break;
              }
            }
          }
        }
        
        // 3. Verificar se cliente mencionou nome do médico (douglas, rovani, etc)
        if (!agendamentoParaCancelar) {
          for (const ag of agendamentosFuturos) {
            const medico = medicosMap[ag.medico_id];
            if (medico) {
              const nomeMedicoLower = medico.nome.toLowerCase();
              const partesNome = nomeMedicoLower.split(' ').filter(p => p.length > 3);
              for (const parte of partesNome) {
                if (msgLower.includes(parte)) {
                  agendamentoParaCancelar = ag.id;
                  console.log(`✅ Cliente mencionou médico "${parte}": ${ag.id}`);
                  break;
                }
              }
            }
            if (agendamentoParaCancelar) break;
          }
        }
        
        // 4. Verificar se cliente mencionou data (19/01, dia 19, 12/02)
        if (!agendamentoParaCancelar) {
          const dataMatch = messageText.match(/(\d{1,2})\/(\d{1,2})|dia\s*(\d{1,2})/i);
          if (dataMatch) {
            const dia = dataMatch[1] || dataMatch[3];
            const mes = dataMatch[2] || String(new Date().getMonth() + 1);
            const dataFormatada = `${new Date().getFullYear()}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
            
            for (const ag of agendamentosFuturos) {
              if (ag.data_agendamento === dataFormatada) {
                agendamentoParaCancelar = ag.id;
                console.log(`✅ Cliente mencionou data ${dataFormatada}: ${ag.id}`);
                break;
              }
            }
          }
        }
        
        // 5. Se só tem um agendamento e cliente confirmou
        if (!agendamentoParaCancelar && agendamentosFuturos.length === 1) {
          const confirmacao = /^(sim|s|ok|isso|confirmo|pode|certo|correto|cancela|1|essa|esse|essa\s*mesm[ao]|esse\s*mesm[ao]|é\s*essa|é\s*esse|exato|exatamente|isso\s*mesmo|pode\s*cancelar|quero\s*cancelar)$/i.test(msgLower);
          if (confirmacao) {
            agendamentoParaCancelar = agendamentosFuturos[0].id;
            console.log('✅ Cliente confirmou único agendamento:', agendamentoParaCancelar);
          }
        }
        
        // 6. Se cliente disse algo genérico de confirmação referindo-se ao agendamento mostrado
        // Ex: "essa mesmo", "pode ser", "é essa", "a primeira", "a do dr. X"
        if (!agendamentoParaCancelar) {
          const confirmacaoGenerica = /essa|esse|mesm[ao]|pode\s*ser|isso|é\s*ess[ae]|a\s*primeira|quero\s*cancelar|pode\s*cancelar|exato|exatamente/i.test(msgLower);
          if (confirmacaoGenerica && agendamentosFuturos.length === 1) {
            agendamentoParaCancelar = agendamentosFuturos[0].id;
            console.log('✅ Cliente confirmou com expressão genérica (único agendamento):', agendamentoParaCancelar);
          } else if (confirmacaoGenerica && agendamentosFuturos.length > 1) {
            // Tentar identificar pelo último agendamento mencionado no histórico
            // Verificar se o assistente listou agendamentos e o cliente está se referindo ao primeiro (ou único mostrado)
            const historicoMostrouLista = /1\.\s+.*cancelar|seguinte.*agendamento|tem\s+os?\s+seguint/i.test(historicoConversa || '');
            if (historicoMostrouLista) {
              // Se disse "essa" sem especificar e tem contexto, pegar o primeiro da lista
              agendamentoParaCancelar = agendamentosFuturos[0].id;
              console.log('✅ Cliente confirmou primeiro agendamento da lista:', agendamentoParaCancelar);
            }
          }
        }
        
        // Executar cancelamento se encontrou qual
        if (agendamentoParaCancelar) {
          console.log('🎯 EXECUTANDO cancelamento do agendamento:', agendamentoParaCancelar);
          const cancelou = await executarCancelamento(agendamentoParaCancelar);
          if (cancelou) {
            agendamentoCancelado = true;
            console.log('✅ CANCELAMENTO EXECUTADO COM SUCESSO!');
            
            // Buscar dados do agendamento cancelado para resposta
            const agCancelado = agendamentosFuturos.find(a => a.id === agendamentoParaCancelar);
            const medicoCanc = agCancelado ? medicosMap[agCancelado.medico_id] : null;
            const dataObjCanc = agCancelado ? new Date(agCancelado.data_agendamento + 'T12:00:00') : null;
            const dataFmtCanc = dataObjCanc ? dataObjCanc.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : '';
            
            const respostaCancelamento = `✅ Agendamento cancelado com sucesso!\n\n❌ *Cancelado:* ${agCancelado?.tipo_servico || 'Consulta'} - ${dataFmtCanc} às ${agCancelado?.horario || ''}${medicoCanc ? ` com ${medicoCanc.nome} (${medicoCanc.especialidade || ''})` : ''}\n\nSe precisar de mais alguma coisa, estou à disposição! 😊`;
            
            // Salvar no histórico e retornar IMEDIATAMENTE
            try {
              const contatosCancelHist = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
              if (contatosCancelHist.length > 0) {
                const contatoCancel = contatosCancelHist[0];
                const historicoAtualCancel = contatoCancel.historico_mensagens || [];
                const timestampCancel = new Date().toISOString();
                historicoAtualCancel.push(
                  { role: 'user', content: messageText, timestamp: timestampCancel, messageId },
                  { role: 'assistant', content: respostaCancelamento, timestamp: timestampCancel }
                );
                await base44.asServiceRole.entities.Contato.update(contatoCancel.id, {
                  historico_mensagens: historicoAtualCancel.slice(-50),
                  ultima_interacao: timestampCancel,
                  ultima_mensagem: messageText,
                  ultima_resposta: respostaCancelamento
                });
              }
            } catch (e) {
              console.error('⚠️ Erro ao salvar histórico cancelamento:', e.message);
            }
            
            await liberarLock(base44, phoneNumber);
            return Response.json({ 
              success: true, 
              resposta: respostaCancelamento,
              cancelamento_executado: true
            });
          } else {
            console.log('❌ Falha ao executar cancelamento');
          }
        } else {
          console.log('⚠️ Não foi possível identificar qual agendamento cancelar');
        }
      }
    }

    const _hjER=/encontrei o resultado|PDF está sendo enviado|arquivo PDF/i.test(historicoConversa||'');
    const _hfR=/seu nome completo|seu cpf|para localizar.*resultado/i.test(historicoConversa||'');
    const querResultado=!_hjER&&(/resultado|laudo|exame pronto|meu exame|buscar exame|retirar exame|pegar exame/i.test(messageText)||(_hfR&&(/\d{3}/.test(messageText)||/[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/.test(messageText))));
    let infoResultadoExame='';let arquivoParaEnviar=null;
    if(querResultado){
      console.log('📄 Cliente quer resultado de exame...');
      const cpfM=messageText.match(/(\d{11}|\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})/);
      let cpf=cpfM?cpfM[0].replace(/\D/g,''):null;
      if(!cpf&&historicoConversa){const h=historicoConversa.match(/(\d{11}|\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})/);if(h)cpf=h[0].replace(/\D/g,'');}
      if(cpf&&cpf.length===11){
        try{const rs=await Promise.race([base44.asServiceRole.entities.ResultadoExame.list(),new Promise((_,r)=>setTimeout(()=>r(new Error('T')),4000))]);const f=rs.filter(r=>(r.paciente_cpf||'').replace(/\D/g,'')===cpf);if(f.length>0){const rc=f.sort((a,b)=>new Date(b.created_date)-new Date(a.created_date))[0];arquivoParaEnviar={url:rc.arquivo_url,nome:rc.nome_arquivo||'Resultado_Exame.pdf',paciente:rc.paciente_nome,descricao:rc.descricao,data:rc.data_exame};infoResultadoExame=`\n\n✅ RESULTADO ENCONTRADO! ${rc.paciente_nome}|${rc.descricao||'Resultado'}|${rc.nome_arquivo}\n📎 PDF SERÁ ENVIADO. Diga "Encontrei! Enviando o PDF agora! 📄"`;}else{infoResultadoExame=`\n\n⏳ RESULTADO NÃO DISPONÍVEL p/ CPF ${cpf}. Informe e sugira ligar (51)3661-5991.`;}}catch(e){infoResultadoExame='\n\n⚠️ Erro ao buscar resultado. Peça desculpas.';}
      }else{infoResultadoExame='\n\n📋 RESULTADO DE EXAME: Peça nome completo + CPF (apenas números). NÃO tente sem CPF.';}
    }

    let infoDisponibilidade = '';
    const especialidades = ['Cardiologia','Cardiologista','Arritmia','Hipertensão','Hipertensao','Clínico Geral','Clinico Geral','Clínico','Clinico','Check-up','Checkup','Dermatologia','Dermatologista','Dermato','Endocrinologia','Endocrinologista','Tireoide','Tireóide','Diabetes','Ginecologia','Ginecologista','Gineco','Preventivo','Papanicolau','Nutrição','Nutricao','Nutricionista','Psicologia','Psicólogo','Psicologo','Psicóloga','Psicologa','Ortopedia','Ortopedista','Traumatologia','Traumatologista','Urologia','Urologista','Próstata','Prostata','Geriatria','Geriatra','Gastroenterologia','Gastro','Gastroenterologista','Reumatologia','Reumatologista','Reumatismo','Fibromialgia','Psiquiatria','Psiquiatra','Fisioterapia','Fisioterapeuta','Ecografia','Ecocardiograma','Ultrassom','Ultrassonografia','Oftalmologia','Oftalmologista','Oftalmo','Catarata','Glaucoma','Otorrinolaringologia','Otorrino','Otorrinolaringologista','Sinusite','Rinite','Pediatria','Pediatra','Pneumologia','Pneumologista','Asma','Bronquite','Neurologia','Neurologista','Enxaqueca','Convulsão','Convulsao','Neuropediatria','Quiropraxia','Quiropraxista','Massoterapia','Massoterapeuta','Drenagem Linfática','Drenagem Linfatica','Optometria','Optometrista','Hidroginástica','Hidroginastica','Hidroterapia','Pilates','Natação','Natacao','Psicopedagoga','Psicopedagogia','Psicopedagogo','Odontologia','Odontologista','Dentista','Ortodontia','Implantodontia','Eletrocardiograma','ECG'];

    const normalizarTexto = (texto) => {
      return (texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    };

    // Detectar conversa sobre Cartão Mais Vida / planos / benefícios (declarar ANTES de usar)
    const ehPerguntaPrecoEarly = /quanto\s*custa|qual\s*o?\s*(valor|pre[çc]o)|pre[çc]o\s*(da|do|de)|valor\s*(da|do|de)|custa\s*quanto/i.test(messageText);
    // IMPORTANTE: Perguntas como "ai tem cardiologista?" são informativas MAS devemos buscar disponibilidades
    // para poder responder se temos ou não. A flag ehPerguntaInformativa controla se mostramos horários ou
    // apenas respondemos "sim, temos" - mas em ambos os casos precisamos buscar os médicos.
    const ehPerguntaInformativaEarly = /^(a[ií]\s+)?(voc[êe]s\s+)?(faz(em)?|tem|t[êe]m|realiza[m]?|oferece[m]?|atende[m]?|existe|trabalha[m]?\s+com)\s+/i.test(messageText) ||
      /faz(em)?\s+.+\?/i.test(messageText) ||
      /tem\s+.+\?/i.test(messageText) ||
      /^a[ií]\s+faz\b/i.test(messageText) ||
      /^a[ií]\s+tem\b/i.test(messageText);
    const ehPerguntaSobreCartao = /cart[aã]o\s*mais\s*(vida|sa[uú]de)|mais\s*vida|mais\s*sa[uú]de|planos?\s*(do|da|de)?\s*cart|benef[ií]cios?\s*(do|da)?\s*cart|cart[aã]o\s*da\s*cl[ií]nica|informa[çc][oõ]es?\s*sobre\s*o?\s*cart|planos?\s*(e\s*benef)?/i.test(messageText) ||
      (/plano|benef[ií]cio|cart[aã]o/i.test(messageText) && /cart[aã]o\s*mais|mais\s*vida|mais\s*sa[uú]de/i.test(historicoConversa || ''));
    const ehContextoCartaoNoHistorico = /cart[aã]o\s*mais\s*(vida|sa[uú]de)|mais\s*vida|planos?\s*(do|da)?\s*cart|benef[ií]cios/i.test(historicoConversa || '');
    const respostaCurtaEmContextoCartao = ehContextoCartaoNoHistorico && 
      /^(planos?|quais|sim|ok|benefícios?|beneficios?|valores?|como\s*funciona|me\s*fala|conta\s*mais|explica|detalh|informa)/i.test(messageText.trim());

    let especialidadeDetectada = null;
    let medicoEspecificoDetectado = null;
    const msgLower = normalizarTexto(messageText);
    const historicoLower = normalizarTexto(historicoConversa || '');

    // IMPORTANTE: Primeiro buscar ESPECIALIDADE na MENSAGEM, depois médico na mensagem, depois histórico
    // Isso evita que um médico do histórico sobrescreva a especialidade que o cliente pediu AGORA

    // Carregar médicos ativos (com timeout) - excluir fictícios
    let todosMedicosParaDeteccao = [];
    try {
      const _raw = await Promise.race([base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 3000))]);
      todosMedicosParaDeteccao = _raw.filter(m => !/(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i.test(m.nome || ''));
    } catch (e) { console.warn('⚠️ Timeout médicos:', e.message); }

    // ======= PASSO 1: Buscar ESPECIALIDADE na MENSAGEM do cliente =======
    for (const esp of especialidades) {
      if (msgLower.includes(normalizarTexto(esp))) { especialidadeDetectada = esp; console.log(`🎯 Especialidade detectada: ${esp}`); break; }
    }
    // PASSO 2: Se NÃO detectou especialidade, buscar MÉDICO ESPECÍFICO na mensagem
    // Match com normalização de acentos e palavras significativas (>3 chars)
    if (!especialidadeDetectada) {
      for (const medico of todosMedicosParaDeteccao) {
        const partesNome = normalizarTexto(medico.nome).split(' ').filter(p => p.length > 3 && !/^(dr\.?|dra\.?|de|da|do|dos|das)$/i.test(p));
        if (partesNome.some(p => msgLower.includes(p))) {
          medicoEspecificoDetectado = medico; especialidadeDetectada = medico.especialidade;
          console.log(`🎯 Médico específico: ${medico.nome} (${medico.especialidade})`); break;
        }
      }
    }
    // PASSO 3: Se nada na mensagem, buscar no HISTÓRICO
    if (!especialidadeDetectada && !medicoEspecificoDetectado) {
      const historicoClienteLower = normalizarTexto((historicoConversa || '').split('\n').filter(l => l.startsWith('CLIENTE:')).map(l => l.replace('CLIENTE:', '')).join(' '));
      for (const esp of especialidades) {
        if (historicoClienteLower.includes(normalizarTexto(esp))) { especialidadeDetectada = esp; console.log(`🎯 Esp. histórico: ${esp}`); break; }
      }
      if (!especialidadeDetectada) {
        for (const medico of todosMedicosParaDeteccao) {
          const partesNome = medico.nome.toLowerCase().split(' ').filter(p => p.length > 3);
          if (partesNome.some(p => historicoLower.includes(p))) {
            medicoEspecificoDetectado = medico; especialidadeDetectada = medico.especialidade;
            console.log(`🎯 Médico histórico: ${medico.nome}`); break;
          }
        }
      }
    }

    // Se conversa é sobre Cartão Mais Vida, limpar detecção de especialidade para não entrar em fluxo de agendamento
    if (ehPerguntaSobreCartao || respostaCurtaEmContextoCartao) {
      console.log('💳 Conversa sobre Cartão Mais Vida - resetando detecção de especialidade/médico');
      especialidadeDetectada = null;
      medicoEspecificoDetectado = null;
    }

    // ===== AGORA avaliar querAgendar (especialidadeDetectada já está definida) =====

    // REGRA ANTI-LOOP: Se acabou de concluir um agendamento no histórico recente, NÃO entrar em fluxo de agendamento novamente
    // Detectar se a última resposta do assistente é uma confirmação de agendamento
    // IMPORTANTE: Verificar APENAS a última mensagem do assistente, não o histórico inteiro
    const ultimasRespostasAssistenteObj = historicoMensagensRaw.filter(m => m.role === 'assistant');
    const ultimaMsgAssistenteFull = ultimasRespostasAssistenteObj.length > 0 ? ultimasRespostasAssistenteObj[ultimasRespostasAssistenteObj.length - 1].content : '';
    const agendamentoRecenteConcluido = /Agendamento confirmado|Te aguardamos|Lembre-se de trazer documento/i.test(ultimaMsgAssistenteFull);
    
    if (agendamentoRecenteConcluido) {
      console.log('✅ Agendamento recém concluído detectado no histórico - resetando detecção de especialidade/médico do histórico');
      // Se a mensagem atual NÃO menciona explicitamente uma nova especialidade/médico, limpar a detecção vinda do histórico
      const mensagemAtualTemEspecialidade = especialidades.some(esp => normalizarTexto(messageText).includes(normalizarTexto(esp)));
      const mensagemAtualTemMedico = todosMedicosParaDeteccao.some(m => {
        const partesNome = m.nome.toLowerCase().split(' ').filter(p => p.length > 3);
        return partesNome.some(p => msgLower.includes(p));
      });
      
      if (!mensagemAtualTemEspecialidade && !mensagemAtualTemMedico) {
        // Limpar detecção que veio do histórico (da conversa anterior de agendamento)
        especialidadeDetectada = null;
        medicoEspecificoDetectado = null;
        console.log('🔄 Especialidade/médico resetados - veio do histórico do agendamento concluído');
      }
    }

    // REGRA ANTI-LOOP: Se o cliente está RECUSANDO agendar, NÃO entrar em fluxo de agendamento
    const clienteRecusandoAgendar = /n[aã]o\s*(quero|preciso|desejo|vou|queria)?\s*(agendar|marcar|consulta)|n[aã]o\s*[,.]?\s*(obrigad|valeu|brigad)|deixa\s*(pra\s*l[aá]|quieto)|agora\s*n[aã]o|depois|sem\s*agendar/i.test(messageText);

    // Detectar se o histórico já tem uma especialidade mencionada
    const historicoTemEspecialidadeCheck = historicoConversa && /clínico|clinico|cardiolog|dermatolog|ginecolog|nutrici|psicolog|ortoped|urolog|geriatr|gastro|reumato|psiquiatr|fisioterap|oftalmolog|otorrino|pediatr|pneumolog|neurolog|quiroprax|massoterap|optometr|hidro|pilates|odontolog|dentist|endocrinolog|Dr\.|👨‍⚕️/i.test(historicoConversa);

    const ehPerguntaPreco = ehPerguntaPrecoEarly;
    const ehPerguntaInformativa = ehPerguntaInformativaEarly;
    const temEspecialidadeOuMedico = especialidadeDetectada || medicoEspecificoDetectado;
    const iaPerguntoSeQuerAgendar = /gostaria de agendar|quer agendar|deseja agendar|posso agendar|agendar.*\?|como posso te ajudar|qual especialidade|para qual especialidade/i.test(ultimaMsgAssistenteFull);
    const msgTrimLower = messageText.trim().toLowerCase();
    const clienteConfirmouAgendar = iaPerguntoSeQuerAgendar && /^(sim|s|ok|quero|pode|claro|bora|vamos|isso|por favor|yes|vou|gostaria|please)$/.test(msgTrimLower);
    const iaPerguntoComoAjudar = /qual especialidade|para qual especialidade/i.test(ultimaMsgAssistenteFull);
    const clienteRespondeuComEspecialidade = iaPerguntoComoAjudar && especialidadeDetectada && !ehPerguntaInformativa && !ehPerguntaSobreCartao;
    const iaPerguntoSeQuerAgendarConsulta = /gostaria de agendar|quer agendar|deseja agendar|posso agendar/i.test(ultimaMsgAssistenteFull);
    const perguntaVagaOuHorario = /quando\s*(tem|tem\s*vaga|tem\s*hor[áa]rio|posso|d[áa]\s*pra)|tem\s*(vaga|hor[áa]rio)|pr[óo]ximo\s*(hor[áa]rio|dia|vaga)|qual\s*(hor[áa]rio|dia|vaga)/i.test(messageText);
    const clientePerguntouSobreVagaAposOferta = iaPerguntoSeQuerAgendarConsulta && perguntaVagaOuHorario;
    // Perguntas sobre disponibilidade do médico (ex: "que dia dr altamiro vai estar ai?", "quando o doutor atende?")
    const ehPerguntaDisponibilidadeMedico = temEspecialidadeOuMedico && (/vai\s+(atender|estar|vir)|atende\b|est[áa]\s+(atendendo|na)|quando\s+(atende|vai|ele|ela|o\s+dr)|que\s+dia|tem\s+(?:hor[áa]rio|vaga|agenda)|pr[óo]xim[ao]\s+(dia|vez|atend)/i.test(messageText) || /(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|hoje|amanh[ãa]|semana\s+que\s+vem|pr[óo]xim[ao]).*(?:atend|consult|vai|estar)/i.test(messageText) || /(?:dr|doutor|doutora).*(?:vai|estar|atend|vem|vir)/i.test(messageText));
    const querAgendarMensagem = !clienteRecusandoAgendar && !ehPerguntaPreco && !ehPerguntaSobreCartao && !respostaCurtaEmContextoCartao && (/agendar|marcar|consulta|hor[áa]rio|dispon[íi]vel|vaga/i.test(messageText) || clientePerguntouSobreVagaAposOferta || ehPerguntaDisponibilidadeMedico);
    const clienteAceitouAgendar = iaPerguntoSeQuerAgendarConsulta && (/^(quero|sim|s|ok|pode|claro|bora|vamos|isso|por favor|yes|vou|gostaria|please|quero\s*sim|sim\s*quero)$/.test(msgTrimLower) || perguntaVagaOuHorario);
    const ultimasMensagensUsuarioObj = historicoMensagensRaw.filter(m => m.role === 'user');
    const ultimaMsgUsuarioFull = ultimasMensagensUsuarioObj.length > 0 ? ultimasMensagensUsuarioObj[ultimasMensagensUsuarioObj.length - 1].content : '';
    const jaEmFluxoAgendamento = !clienteRecusandoAgendar && !agendamentoRecenteConcluido && ultimaMsgUsuarioFull && /agendar|marcar|consulta|vamos agendar|seguir com o agendamento/i.test(ultimaMsgUsuarioFull);
    const querAgendar = !querCancelar && !agendamentoRecenteConcluido && !ehPerguntaSobreCartao && !respostaCurtaEmContextoCartao && (querAgendarMensagem || jaEmFluxoAgendamento || clienteConfirmouAgendar || clienteRespondeuComEspecialidade || clienteAceitouAgendar);
    
    // Se cliente está em fluxo de VERIFICAÇÃO, NÃO entrar em fluxo de AGENDAMENTO
    if (querVerificarAgendamento) {
      console.log('ℹ️ Cliente em fluxo de VERIFICAÇÃO - pulando lógica de agendamento');
    } else {
      // Cliente quer AGENDAR - processar normalmente
    
    // Verificar se cliente pergunta sobre ecografia/ecocardiograma e médico está de férias/inativo
    // NOTA: Esta verificação precisa rodar ANTES da declaração de medicosParaBuscar
    const ecografiaNorm = normalizarTexto(especialidadeDetectada || '');
    const ehEcografia = ['ecografia', 'ecocardiograma', 'eco', 'ultrassom', 'ultrassonografia'].some(t => ecografiaNorm.includes(t));
    
    if (ehEcografia) {
      // Buscar TODOS os médicos de ecografia (ativos e inativos) para verificar status
      let medicosEcoTodos = [];
      try {
        const todosMedicosGeral = await base44.asServiceRole.entities.Medico.list();
        medicosEcoTodos = todosMedicosGeral.filter(m => {
          const espNorm = normalizarTexto(m.especialidade || '');
          const espsNorm = (m.especialidades || []).map(e => normalizarTexto(e));
          return espNorm.includes('ecocardiograma') || espNorm.includes('ecografia') || 
                 espsNorm.some(e => e.includes('ecocardiograma') || e.includes('ecografia'));
        });
      } catch (e) { console.warn('⚠️ Erro busca médicos eco:', e.message); }
      
      // Se NENHUM médico de ecografia está ativo, informar que está de férias
      const temMedicoEcoAtivo = medicosEcoTodos.some(m => m.status === 'Ativo');
      if (medicosEcoTodos.length > 0 && !temMedicoEcoAtivo) {
        const nomesMedicos = medicosEcoTodos.map(m => m.nome).join(', ');
        console.log('⚠️ Médicos de ecografia encontrados mas TODOS inativos/férias:', nomesMedicos);
        infoDisponibilidade = `\n\n⚠️ ECOGRAFIA/ECOCARDIOGRAMA - MÉDICO DE FÉRIAS:
O profissional responsável pelas ecografias é o ${nomesMedicos}, que está atualmente de FÉRIAS.

Informe ao cliente que:
1. SIM, a clínica realiza ecografias (diversos tipos: abdominal, tireoide, obstétrica, mamária, pélvica, ecocardiograma, próstata, articulação, etc.)
2. O Dr. Douglas Filipe Bianchi está de FÉRIAS no momento
3. Em breve a agenda será reaberta para agendamentos de ecografia
4. Sugira que entre em contato pelo telefone (51) 3661-5991 ou mande mensagem novamente em alguns dias para verificar a nova agenda
5. Se o cliente quiser saber os TIPOS e VALORES das ecografias, consulte a lista de procedimentos abaixo e informe normalmente
6. NÃO diga que a clínica não faz ecografia - ela FAZ! Apenas o médico está temporariamente de férias`;
      }
    }
    
    const clienteEscolhendoHorario = /hoje|\d{1,2}[h:]?\s*(?:horas?)?|\d{1,2}:\d{2}|amanhã|segunda|terça|quarta|quinta|sexta|sábado/i.test(messageText);
    const deveBuscarDisponibilidades = (querAgendar || ehPerguntaDisponibilidadeMedico || (ehPerguntaInformativa && temEspecialidadeOuMedico)) && (temEspecialidadeOuMedico || 
      (clienteConfirmouAgendar && historicoTemEspecialidadeCheck) ||
      (jaEmFluxoAgendamento && temEspecialidadeOuMedico) ||
      (jaEmFluxoAgendamento && clienteEscolhendoHorario && /Dr\.|👨‍⚕️|médico.*horário/i.test(historicoConversa)));

    console.log('📋 Detecção agendamento:', { querAgendar, ehPerguntaDisponibilidadeMedico, especialidadeDetectada, medicoEspecificoDetectado: !!medicoEspecificoDetectado, deveBuscarDisponibilidades });
    
    if (deveBuscarDisponibilidades) {
      // Verificar se já mostramos disponibilidades recentemente
      const historico = historicoConversa || '';
      
      // Verificar se o cliente está ESCOLHENDO um horário/médico específico
      // Neste caso, NÃO precisamos buscar novamente - o fluxo de extração cuidará disso
      // Padrões: "dia 12: 13:15", "sexta dia 13: 8:30", "13:15", "dia 12", "segunda", "Dr. Altamiro", "quero", "sim"
      const clienteEstaEscolhendoHorario = !(ehPerguntaDisponibilidadeMedico && !/agendar|marcar/i.test(messageText)) && (
        /dia\s*\d{1,2}/i.test(messageText) || /\d{1,2}[:/h]\d{2}/i.test(messageText) || /\d{1,2}\/\d{1,2}/i.test(messageText) ||
        /segunda|terça|terca|quarta|quinta|sexta|sábado|sabado/i.test(messageText) || /dr\.?\s*\w+/i.test(messageText) ||
        /^(sim|quero|ok|pode|claro|esse|essa|este|esta|o primeiro|a primeira|o segundo|a segunda)\s*/i.test(messageText.trim())
      ) && /Dr\.|👨‍⚕️|\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull);
      
      // Verificar se disponibilidades já foram mostradas (com horários reais no formato que usamos)
      // Padrões: "12/02: 13:15", "Dr. Altamiro" + "13:15", "quinta-feira, 12/02: 13:15"
      // TAMBÉM detectar quando o assistente mostrou lista de médicos com horários
      const jaShowouDisponibilidades = (
        /\d{2}\/\d{2}.*\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull) || 
        (/Dr\.\s+\w+/i.test(ultimaMsgAssistenteFull) && /\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull)) ||
        /Qual médico.*prefere|Qual horário.*prefere|qual.*você.*prefere/i.test(ultimaMsgAssistenteFull)
      );

      if (clienteEstaEscolhendoHorario || jaShowouDisponibilidades) {
        console.log('⏭️ Cliente está escolhendo/respondendo - NÃO rebuscando disponibilidades');
        infoDisponibilidade = `\n\n✅ DISPONIBILIDADES JÁ FORAM MOSTRADAS AO CLIENTE ANTERIORMENTE.
O cliente está ESCOLHENDO/RESPONDENDO. Ele disse: "${messageText}"

🚨 REGRAS ABSOLUTAS:
1. NÃO diga que não há horários! O cliente está respondendo à lista que você já apresentou.
2. NÃO diga "infelizmente não temos horários disponíveis" - você ACABOU de mostrar horários!
3. Se ele mencionou um médico e horário/data, CONFIRME a escolha dele dizendo "Ótimo! Vou agendar com [médico] no dia [data] às [horário]."
4. DEPOIS peça: "Preciso do seu nome completo e data de nascimento (DD/MM/AAAA) para finalizar."
5. O SISTEMA vai criar o agendamento automaticamente quando tiver todos os dados.
6. NÃO repita a lista de disponibilidades! O cliente JÁ viu a lista.
7. 🚨 NUNCA diga "sua presença está confirmada" ou "agendamento confirmado" - APENAS o sistema pode confirmar!
8. Se o cliente disse "sim" após você perguntar "Você gostaria de confirmar o horário?", isso significa que ele QUER aquele horário. NÃO mostre horários novamente, PEÇA nome e data de nascimento.

⚠️ IMPORTANTE: O cliente está se referindo aos horários que VOCÊ mostrou na mensagem anterior. Consulte o HISTÓRICO para ver quais horários foram oferecidos e confirme a escolha do cliente.`;
        } else if (!querVerificarAgendamento) {
          console.log('📅 Cliente quer agendar - buscando disponibilidades...');

      try {
        // Buscar médicos e disponibilidades diretamente
         let medicosParaBuscar = [];

         // Se detectou médico específico, usar apenas ele
         if (medicoEspecificoDetectado) {
           medicosParaBuscar = [medicoEspecificoDetectado];
           console.log(`🎯 Usando médico específico: ${medicoEspecificoDetectado.nome}`);
         } else {
           // Buscar todos os médicos ativos (excluir fictícios)
            let todosMedicos = [];
            try {
              const _rawM = await Promise.race([base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 3000))]);
              todosMedicos = _rawM.filter(m => !/(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i.test(m.nome || ''));
            } catch (e) { todosMedicos = []; }
        
          if (especialidadeDetectada) {
          const especialidadeLower = especialidadeDetectada.toLowerCase();

          // Mapeamento de sinônimos para especialidades (TUDO NORMALIZADO - sem acentos)
          // IMPORTANTE: NÃO usar termos muito genéricos que podem causar confusão
          const sinonimos = {
            'clinico geral': ['clinico geral', 'clinica geral', 'medico geral', 'consulta geral', 'check-up', 'checkup'],
            'nutricao': ['nutricao', 'nutricionista', 'dieta', 'emagrecer', 'alimentacao'],
            'fisioterapia': ['fisioterapia', 'fisioterapeuta', 'rpg', 'reabilitacao'],
            'psicologia': ['psicologia', 'psicologo', 'psicologa', 'terapeuta', 'ansiedade', 'depressao'],
            'geriatria': ['geriatria', 'geriatra', 'idoso', 'idosos', 'terceira idade'],
            'ortopedia': ['ortopedia', 'ortopedista', 'fratura', 'coluna', 'joelho', 'ombro', 'articulacao', 'traumatologia', 'traumatologista'],
            'ecocardiograma': ['ecocardiograma', 'eco cardiaco', 'ultrassom cardiaco', 'ecografia', 'eco', 'ultrassom', 'ultrassonografia', 'ecografico', 'eco transtorácica', 'eco transtoracica', 'ecografia abdominal', 'ecografia tireoide', 'ecografia pelvica', 'ecografia obstetrica', 'ecografia mamaria', 'ecografia prostata', 'ecografia cervical', 'ecografia transvaginal', 'ecografia vascular'],
            'psiquiatria': ['psiquiatria', 'psiquiatra', 'remedio controlado'],
            'urologia': ['urologia', 'urologista', 'prostata', 'bexiga'],
            'cardiologia': ['cardiologia', 'cardiologista', 'coracao', 'arritmia', 'hipertensao'],
            'dermatologia': ['dermatologia', 'dermatologista', 'pele', 'acne', 'manchas'],
            'ginecologia': ['ginecologia', 'ginecologista', 'preventivo', 'papanicolau', 'utero', 'ovario'],
            'gastroenterologia': ['gastroenterologia', 'gastro', 'gastroenterologista', 'estomago', 'intestino', 'figado', 'azia', 'refluxo'],
            'neurologia': ['neurologia', 'neurologista', 'cerebro', 'enxaqueca', 'convulsao', 'neuropediatra'],
            'oftalmologia': ['oftalmologia', 'oftalmologista', 'olho', 'olhos', 'vista', 'visao', 'catarata', 'glaucoma'],
            'otorrinolaringologia': ['otorrinolaringologia', 'otorrino', 'otorrinolaringologista', 'ouvido', 'nariz', 'garganta', 'sinusite', 'rinite'],
            'pediatria': ['pediatria', 'pediatra', 'crianca', 'criancas', 'bebe', 'infantil'],
            'pneumologia': ['pneumologia', 'pneumologista', 'pulmao', 'asma', 'bronquite'],
            'reumatologia': ['reumatologia', 'reumatologista', 'reumatismo', 'artrite', 'artrose', 'fibromialgia'],
            'odontologia': ['odontologia', 'odontologista', 'dentista', 'dente', 'dentes', 'ortodontia', 'implante dentario', 'carie'],
            'endocrinologia': ['endocrinologia', 'endocrinologista', 'tireoide', 'diabetes', 'hormonio'],
            'quiropraxia': ['quiropraxia', 'quiropraxista', 'ajuste vertebral'],
            'massoterapia': ['massoterapia', 'massoterapeuta', 'massagem terapeutica', 'drenagem linfatica'],
            'optometria': ['optometria', 'optometrista', 'grau ocular', 'lente de contato'],
            'hidroginastica': ['hidroginastica', 'hidroterapia', 'natacao', 'piscina', 'aula experimental hidro'],
            'pilates': ['pilates', 'pilates aparelhos', 'pilates solo'],
            'psicopedagogia': ['psicopedagogia', 'psicopedagoga', 'psicopedagogo', 'aprendizagem', 'dificuldade escolar'],
            'eletrocardiograma': ['eletrocardiograma', 'ecg']
          };

          // Encontrar termos relacionados (usando texto normalizado)
          const especialidadeNorm = normalizarTexto(especialidadeLower);
          let termosRelacionados = [especialidadeNorm];
          for (const [key, valores] of Object.entries(sinonimos)) {
            const valoresNorm = valores.map(v => normalizarTexto(v));
            const keyNorm = normalizarTexto(key);
            if (valoresNorm.some(v => especialidadeNorm.includes(v) || v.includes(especialidadeNorm)) ||
                keyNorm.includes(especialidadeNorm) || especialidadeNorm.includes(keyNorm)) {
              termosRelacionados = [...termosRelacionados, keyNorm, ...valoresNorm];
            }
          }
          // Remover duplicatas
          termosRelacionados = [...new Set(termosRelacionados)];

          medicosParaBuscar = todosMedicos.filter(m => {
            // Verifica no campo principal 'especialidade' (NORMALIZADO)
            const espPrincipal = normalizarTexto(m.especialidade || '');

            // Match EXATO ou muito próximo - evitar falsos positivos
            const matchPrincipal = termosRelacionados.some(t => {
              const tNorm = normalizarTexto(t);
              // Match exato ou contém o termo completo (mínimo 5 chars para evitar "odonto" matchando "clínico")
              if (tNorm.length >= 5) {
                return espPrincipal.includes(tNorm) || tNorm.includes(espPrincipal);
              }
              // Para termos curtos, exigir match exato
              return espPrincipal === tNorm;
            });

            // Verifica no array 'especialidades' (NORMALIZADO)
            const matchArray = m.especialidades?.some(e => {
              const eLower = normalizarTexto(e);
              return termosRelacionados.some(t => {
                const tNorm = normalizarTexto(t);
                if (tNorm.length >= 5) {
                  return eLower.includes(tNorm) || tNorm.includes(eLower);
                }
                return eLower === tNorm;
              });
            });

            // NÃO verificar no nome do médico - isso causa falsos positivos
            return matchPrincipal || matchArray;
          });
          console.log(`🔍 Buscando por ${especialidadeDetectada} (termos: ${termosRelacionados.slice(0,5).join(', ')}): encontrados ${medicosParaBuscar.length} médicos`);

          // Se não encontrou nenhum médico para a especialidade, NÃO usar todos os médicos
          if (medicosParaBuscar.length === 0) {
            console.log(`❌ Nenhum médico encontrado para especialidade: ${especialidadeDetectada}`);
            // Verificar se é um PROCEDIMENTO ou EXAME (ex: ecografia, eletrocardiograma)
            // Se sim, NÃO dizer que não tem - o LLM vai encontrar na base de procedimentos/exames
            const espNormCheck = normalizarTexto(especialidadeDetectada);
            let existeComoProcedimentoOuExame = false;
            try {
              const [procsCheck, examesCheck] = await Promise.all([
                Promise.race([
                  base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' }),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                ]).catch(() => []),
                Promise.race([
                  base44.asServiceRole.entities.Exame.filter({ status: 'Ativo' }),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                ]).catch(() => [])
              ]);
              existeComoProcedimentoOuExame = procsCheck.some(p => normalizarTexto(p.nome).includes(espNormCheck) || espNormCheck.includes(normalizarTexto(p.nome))) ||
                examesCheck.some(e => normalizarTexto(e.nome).includes(espNormCheck) || espNormCheck.includes(normalizarTexto(e.nome)));
              if (existeComoProcedimentoOuExame) {
                console.log(`✅ "${especialidadeDetectada}" existe como procedimento/exame - NÃO reportar como indisponível`);
                // Limpar especialidadeDetectada para que não entre no bloco "ESPECIALIDADE NÃO DISPONÍVEL"
                especialidadeDetectada = null;
              }
            } catch (e) {
              console.warn('⚠️ Erro ao verificar procedimentos/exames:', e.message);
            }
          }
          } else {
              // NÃO usar todos os médicos sem especialidade - a IA deve perguntar primeiro
              // Isso evita que o sistema busque aleatoriamente quando o cliente não especificou
              console.log('ℹ️ Nenhuma especialidade detectada - NÃO buscando disponibilidades. IA deve perguntar ao cliente.');
              medicosParaBuscar = [];
            }
          }

        const disponibilidadesEncontradas = [];
        const diasAfrente = 15;
        const diasSemanaMap = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

        // SEMPRE mostrar TODOS os médicos da especialidade escolhida (sem limite)
        const limitemedicos = medicosParaBuscar.length;

        // CORREÇÃO FUSO HORÁRIO: Usar UTC para gerar datas consistentes
        const hojeUTC = new Date();
        const offsetBrasil = -3 * 60; // UTC-3
        const agoraBrasil = new Date(hojeUTC.getTime() + (offsetBrasil + hojeUTC.getTimezoneOffset()) * 60000);

        for (const medico of medicosParaBuscar.slice(0, limitemedicos)) {
          const horariosAtendimento = medico.horarios_atendimento || [];
          if (horariosAtendimento.length === 0) continue;

          const disponibilidadesMedico = [];

          for (let i = 0; i < diasAfrente; i++) {
            // CORREÇÃO: Usar data baseada no fuso de Brasil (UTC-3) para evitar erros de dia da semana
            const dataConsulta = new Date(agoraBrasil);
            dataConsulta.setDate(dataConsulta.getDate() + i);
            
            const ano = dataConsulta.getFullYear();
            const mes = String(dataConsulta.getMonth() + 1).padStart(2, '0');
            const dia = String(dataConsulta.getDate()).padStart(2, '0');
            const dataFormatada = `${ano}-${mes}-${dia}`;
            const diaSemana = dataConsulta.getDay();

            // Verificar se há horários com data específica para este dia
            const horariosDataEspecifica = horariosAtendimento.filter(h => h.data_especifica === dataFormatada);
            
            // Verificar se a data está BLOQUEADA (feriado/clínica fechada)
            const dataBloqueada = horariosDataEspecifica.some(h => h.bloqueado === true);
            if (dataBloqueada) continue; // Pular dia bloqueado
            
            // Se houver horários com data específica, usar eles; senão, usar horários recorrentes
            // IMPORTANTE: converter dia_semana para inteiro pois pode vir como float (3.0)
            // Também verificar recorrência do horário
            const horariosDoDia = horariosDataEspecifica.length > 0 
              ? horariosDataEspecifica.filter(h => !h.bloqueado)
              : horariosAtendimento.filter(h => {
                  if (h.bloqueado) return false;
                  if (h.data_especifica) return false;
                  if (Math.floor(h.dia_semana) !== diaSemana) return false;
                  
                  // Verificar recorrência
                  const recorrencia = h.recorrencia || 'Toda Semana';
                  if (recorrencia === 'Toda Semana') return true;
                  if (recorrencia === 'Apenas uma vez') return false;
                  
                  // Calcular semana do mês
                  const primeiroDiaMes = new Date(dataConsulta.getFullYear(), dataConsulta.getMonth(), 1);
                  const semanaMes = Math.ceil((dataConsulta.getDate() + primeiroDiaMes.getDay()) / 7);
                  
                  if (recorrencia === '1ª e 3ª Semana do Mês') return semanaMes === 1 || semanaMes === 3;
                  if (recorrencia === '2ª e 4ª Semana do Mês') return semanaMes === 2 || semanaMes === 4;
                  if (recorrencia === 'Apenas 1ª Semana do Mês') return semanaMes === 1;
                  if (recorrencia === 'Apenas 2ª Semana do Mês') return semanaMes === 2;
                  if (recorrencia === 'Apenas 3ª Semana do Mês') return semanaMes === 3;
                  if (recorrencia === 'Apenas 4ª Semana do Mês') return semanaMes === 4;
                  return true;
                });

            if (horariosDoDia.length === 0) continue;

                    let agendamentosExistentes = [];
            try { agendamentosExistentes = await Promise.race([base44.asServiceRole.entities.Agendamento.filter({medico_id:medico.id,data_agendamento:dataFormatada,status:{$ne:'Cancelado'}}),new Promise((_,r)=>setTimeout(()=>r(new Error('Timeout')),2000))]); } catch(e){}
            const horariosOcupados=agendamentosExistentes.map(ag=>ag.horario);const horariosDisponiveis=[];const tempoConsulta=medico.tempo_consulta_minutos||30;
            for(const periodo of horariosDoDia){const [ih,im]=periodo.horario_inicio.split(':').map(Number);const [fh,fm]=periodo.horario_fim.split(':').map(Number);for(let m=ih*60+im;m<fh*60+fm;m+=tempoConsulta){const hs=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;const hdt=new Date(`${dataFormatada}T${hs}:00`);if(!(dataConsulta.toDateString()===new Date().toDateString()&&hdt<new Date())&&!horariosOcupados.includes(hs))horariosDisponiveis.push(hs);}}

            if (horariosDisponiveis.length > 0) {
              disponibilidadesMedico.push({
                data: dataFormatada,
                data_formatada: dataConsulta.toLocaleDateString('pt-BR', { 
                  weekday: 'long', 
                  day: '2-digit', 
                  month: '2-digit'
                }),
                horarios: horariosDisponiveis.sort().slice(0, 5)
              });

              if (disponibilidadesMedico.length >= 5) break;
            }
          }

          if (disponibilidadesMedico.length > 0) {
            disponibilidadesEncontradas.push({
              medico_id: medico.id,
              medico_nome: medico.nome,
              especialidade: medico.especialidade,
              disponibilidades: disponibilidadesMedico
            });
          }
        }

        if (disponibilidadesEncontradas.length > 0) {
        infoDisponibilidade = '\n\n📅 DISPONIBILIDADES ENCONTRADAS:\n';
        for (const medico of disponibilidadesEncontradas) {
          infoDisponibilidade += `\n👨‍⚕️ *${medico.medico_nome}* (${medico.especialidade}) [ID: ${medico.medico_id}]\n`;
          for (const d of medico.disponibilidades.slice(0, 3)) {
            if (!d.horarios?.length) continue;
            const manha = d.horarios.find(h => parseInt(h.split(':')[0]) < 12);
            const tarde = d.horarios.find(h => parseInt(h.split(':')[0]) >= 12);
            const turnosStr = [manha ? `Manhã: ${manha}` : null, tarde ? `Tarde: ${tarde}` : null].filter(Boolean).join(' | ');
            infoDisponibilidade += `   📅 ${d.data_formatada}: ${turnosStr}\n`;
          }
        }
          infoDisponibilidade += disponibilidadesEncontradas.length > 1
            ? '\n⚠️ Apresente os médicos e o PRÓXIMO horário disponível de cada turno. Pergunte qual prefere.'
            : '\n⚠️ Apresente o PRÓXIMO horário disponível de cada turno. Pergunte qual prefere.';
          infoDisponibilidade += '\n⚠️ Para confirmar: preciso nome completo e data de nascimento.';
          console.log('✅ Disponibilidades:', disponibilidadesEncontradas.length, 'médicos');
        } else if (medicosParaBuscar.length > 0) {
          console.log('⚠️ Buscando horários além dos 15 dias iniciais (até 60 dias)...');
          const disponibilidadesEstendidas = [];
          for (const medico of medicosParaBuscar.slice(0, 5)) {
            const horariosAtend = medico.horarios_atendimento || [];
            if (!horariosAtend.length) continue;
            let pDisp = null;
            for (let i = 0; i < 60 && !pDisp; i++) {
              const dc = new Date(); dc.setHours(0,0,0,0); dc.setDate(dc.getDate()+i);
              const df = dc.toISOString().split('T')[0]; const ds = dc.getDay();
              if (horariosAtend.some(h => h.data_especifica === df && h.bloqueado)) continue;
              const hdd = horariosAtend.filter(h => { if(h.bloqueado) return false; if(h.data_especifica===df) return true; if(h.data_especifica) return false; if(Math.floor(h.dia_semana)!==ds) return false; const r=h.recorrencia||'Toda Semana'; if(r==='Toda Semana') return true; const pm=new Date(dc.getFullYear(),dc.getMonth(),1); const sm=Math.ceil((dc.getDate()+pm.getDay())/7); if(r==='1ª e 3ª Semana do Mês') return sm===1||sm===3; if(r==='2ª e 4ª Semana do Mês') return sm===2||sm===4; if(r.includes('1ª')) return sm===1; if(r.includes('2ª')) return sm===2; if(r.includes('3ª')) return sm===3; if(r.includes('4ª')) return sm===4; return false; });
              if(!hdd.length) continue;
              let agEx=[]; try { agEx = await base44.asServiceRole.entities.Agendamento.filter({medico_id:medico.id, data_agendamento:df, status:{$ne:'Cancelado'}}); } catch(e){}
              const occ = agEx.map(a=>a.horario); const tc = medico.tempo_consulta_minutos||30;
              for(const p of hdd){ const [ih,im]=p.horario_inicio.split(':').map(Number); const [fh,fm]=p.horario_fim.split(':').map(Number); for(let m=ih*60+im; m<fh*60+fm; m+=tc){ const hs=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; if(new Date(`${df}T${hs}:00`)>new Date() && !occ.includes(hs)){ pDisp={data:df,data_formatada:dc.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'}),horario:hs}; break; } } if(pDisp)break; }
            }
            if(pDisp) disponibilidadesEstendidas.push({medico_id:medico.id,medico_nome:medico.nome,especialidade:medico.especialidade,primeira_disponibilidade:pDisp});
          }
          if (disponibilidadesEstendidas.length > 0) {
            infoDisponibilidade = '\n\n📅 DISPONIBILIDADES ENCONTRADAS (próximos 60 dias):\n';
            for (const m of disponibilidadesEstendidas) { infoDisponibilidade += `\n👨‍⚕️ ${m.medico_nome} (${m.especialidade}) [ID: ${m.medico_id}]\n   • Primeiro horário: ${m.primeira_disponibilidade.data_formatada} às ${m.primeira_disponibilidade.horario}\n`; }
            infoDisponibilidade += '\n⚠️ Para confirmar agendamento, preciso: nome completo e data de nascimento.';
          } else {
            const diasMap=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
            let infoM=''; medicosParaBuscar.slice(0,3).forEach(m=>{ const h=m.horarios_atendimento||[]; if(h.length) infoM+=`\n   - ${m.nome}: ${[...new Set(h.map(x=>diasMap[Math.floor(x.dia_semana)]))].join(', ')}`; });
            infoDisponibilidade = `\n\n⚠️ AGENDA LOTADA: Profissionais de ${especialidadeDetectada} com todos horários ocupados (60 dias).${infoM}\nSugira ligar 51 3661-5991 para lista de espera.`;
          }
        } else if (medicosParaBuscar.length === 0 && especialidadeDetectada) {
          infoDisponibilidade = `\n\n❌ ESPECIALIDADE NÃO DISPONÍVEL: "${especialidadeDetectada}"\nNão temos profissionais de ${especialidadeDetectada} cadastrados. Informe ao cliente e sugira ligar 51 3661-5991.`;
        } else {
          let espCH=[]; medicosParaBuscar.forEach(m=>{ if(m.horarios_atendimento?.length) espCH.push(`${m.nome} (${m.especialidade})`); });
          infoDisponibilidade = espCH.length > 0 ? `\n\n⚠️ Médicos sem horários disponíveis: ${espCH.join(', ')}` : '\n\n⚠️ Sem disponibilidades. Sugira ligar 51 3661-5991.';
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar disponibilidades:', e.message);
      }
      }
      } // fim do if deveBuscarDisponibilidades
      } // FIM BLOCO DE AGENDAMENTO

    // Verificar no histórico se já temos médico, data e horário escolhidos
    let agendamentoCriado = false;
    let mensagemAgendamento = '';
    let dadosFaltantes = [];
    
    // Verificar se o cliente está no fluxo de agendamento COM dados suficientes
    // Precisa ter especialidade/médico identificado no histórico para ser "em fluxo"
    // NOTA: historicoTemEspecialidade é definido mais acima no bloco de detecção de agendamento
    const historicoTemEspecialidadeLocal = historicoConversa && /clínico|clinico|cardiolog|dermatolog|ginecolog|nutrici|psicolog|ortoped|urolog|geriatr|gastro|reumato|psiquiatr|fisioterap|oftalmolog|otorrino|pediatr|pneumolog|neurolog|quiroprax|massoterap|optometr|hidro|pilates|odontolog|dentist|endocrinolog|Dr\.|👨‍⚕️/i.test(historicoConversa);
    
    // Verificar se o assistente está pedindo dados do paciente (nome ou data de nascimento)
    const assistentePediuDadosPaciente = historicoConversa && /nome completo|data de nascimento|DD\/MM\/AAAA|nome do paciente/i.test(historicoConversa);
    
    // Verificar se o cliente está fornecendo dados pessoais (nome ou data de nascimento) no contexto de agendamento
    const clienteFornecendoDadosPessoais = assistentePediuDadosPaciente && (
      // Data de nascimento no formato DD/MM/AAAA
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(messageText.trim()) ||
      // Nome seguido de data (ex: "Antonio thiago cavalcanti 19/04/1982")
      /[A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+.*\d{1,2}\/\d{1,2}\/\d{4}/.test(messageText) ||
      // Apenas nome (2+ palavras, sem números exceto possível data)
      (/^[A-Za-zÀ-ÿ\s]+$/.test(messageText.trim()) && messageText.trim().split(/\s+/).length >= 2)
    );
    
    const _soPerguntandoDisp = ehPerguntaDisponibilidadeMedico && !clienteFornecendoDadosPessoais && !/agendar|marcar/i.test(messageText);
    const estaEmFluxoAgendamento = !agendamentoRecenteConcluido && !_soPerguntandoDisp && (
      (querAgendar && historicoTemEspecialidadeLocal && !ehPerguntaDisponibilidadeMedico) || 
      (historicoConversa && /horário|data|nascimento|doutor|dr\./i.test(historicoConversa) && historicoTemEspecialidadeLocal && !ehPerguntaPreco && !_soPerguntandoDisp) ||
      clienteFornecendoDadosPessoais
    );
    const clienteEscolhendoHorarioAgora = !_soPerguntandoDisp && /pode ser|quero|às?\s*\d|hoje|\d{1,2}[h:]|horário/i.test(messageText) && historicoTemEspecialidadeLocal;
    if ((estaEmFluxoAgendamento || clienteEscolhendoHorarioAgora) && !clienteRecusandoAgendar) {
          console.log('📝 Verificando dados para agendamento...', { estaEmFluxoAgendamento, clienteEscolhendoHorarioAgora });
      
      try {
        // Usar LLM para extrair dados do agendamento do histórico + mensagem atual
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1;
        const diaAtual = hoje.getDate();
        const dataHojeFormatada = hoje.toLocaleDateString('pt-BR', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        
        // Buscar médicos disponíveis para incluir na extração
        let medicosDisponiveis = '';
        try {
          const medicosAtivos = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
          medicosDisponiveis = medicosAtivos.map(m => `- ${m.nome} (${m.especialidade}) [ID: ${m.id}]`).join('\n');
        } catch (e) {
          console.log('⚠️ Erro ao buscar médicos para extração');
        }

        const promptExtracao = `Você é inteligentíssimo em extrair dados de agendamento. Analise MUITO BEM o histórico E a última mensagem.

        ⚠️ REGRAS CRÍTICAS DE INTERPRETAÇÃO:
        1. Se cliente diz "João, 14 horas" = escolheu MÉDICO (João) E HORÁRIO (14:00)
        2. Se cliente diz "14 horas" ou "14h" ou "às 14" = está confirmando o HORÁRIO que foi oferecido
        3. Se cliente diz "segunda" ou "21/01" = está escolhendo a DATA
        4. Se cliente diz nome próprio em contexto de agendamento = é o NOME DO MÉDICO ou NOME DO PACIENTE (use contexto!)
        5. Se está no fluxo de agendamento (histórico menciona médicos/horários), interprete SEMPRE para preencher dados faltantes
        6. ⚠️ CRÍTICO: Se cliente envia "Nome Completo DD/MM/AAAA" (ex: "Antonio thiago cavalcanti 19/04/1982"), extraia:
           - nome_paciente = "Antonio Thiago Cavalcanti" (tudo antes da data, capitalize corretamente)
           - data_nascimento = "19/04/1982" (a data no final)

        HISTÓRICO DA CONVERSA:
        ${historicoConversa || '(sem histórico)'}

        ÚLTIMA MENSAGEM DO CLIENTE:
        ${messageText}

⚠️ DATA ATUAL: ${dataHojeFormatada} (${hoje.toISOString().split('T')[0]})

📋 MÉDICOS CADASTRADOS NO SISTEMA:
${medicosDisponiveis}

EXTRAIA OS DADOS QUE CONSEGUIR ENCONTRAR:
1. nome_paciente: nome completo (ex: "Antonio Thiago Cavalcanti Alves") - se vier junto com data, separe!
2. data_nascimento: formato DD/MM/YYYY (ex: "19/04/1982") - pode vir no final da mensagem junto com nome
3. medico_nome: nome EXATO do médico escolhido da lista acima (ex: "Dr. João Inocencio Rodrigues Gonçalves")
4. medico_id: ID do médico escolhido da lista acima (se encontrar)
5. data_agendamento: formato YYYY-MM-DD (converta "14/01" para "${anoAtual}-01-14", "hoje" para "${hoje.toISOString().split('T')[0]}")
6. horario: formato HH:MM (converta "17:30", "17h30", "às 17:30" para "17:30")

REGRAS CRÍTICAS:
- Se o cliente disse "hoje", use ${hoje.toISOString().split('T')[0]}
- Se disse apenas dia/mês (14/01), adicione ano ${anoAtual}
- Marque cada campo como null se NÃO encontrar
- dados_completos = true APENAS se TODOS os 6 campos forem preenchidos
- IMPORTANTE: Use o nome EXATO do médico que foi OFERECIDO no histórico da conversa
- Se o assistente ofereceu "Dr. Douglas Filipe Bianchi", use EXATAMENTE esse nome
- NÃO confunda médicos diferentes - verifique qual médico foi mencionado na conversa
- ⚠️ MUITO IMPORTANTE: Se o cliente enviou nome e data de nascimento juntos (ex: "Antonio thiago 19/04/1982"), EXTRAIA AMBOS! O nome é tudo antes da data, a data de nascimento é a data no formato DD/MM/AAAA.

Retorne JSON.`;

        let extracao = { dados_completos: false, nome_paciente: null, data_nascimento: null, medico_nome: null, medico_id: null, data_agendamento: null, horario: null };
        try {
          const _extR = await Promise.race([fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${Deno.env.get('OPENAI_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:promptExtracao+'\n\nRetorne APENAS JSON válido.'}],max_tokens:500,temperature:0,response_format:{type:'json_object'}})}), new Promise((_,r)=>setTimeout(()=>r(new Error('Timeout')),15000))]);
          if (_extR.ok) { const _ed=await _extR.json(); try { extracao=JSON.parse(_ed.choices?.[0]?.message?.content||'{}'); } catch(e){} }
          else console.warn('⚠️ OpenAI extração HTTP:', _extR.status);
        } catch(_ee){ console.warn('⚠️ Erro extração OpenAI:', _ee.message); }

        console.log('📊 Extração de dados:', JSON.stringify(extracao));

        // Verificar quais dados faltam
            if (!extracao.nome_paciente) dadosFaltantes.push('nome completo');
            if (!extracao.data_nascimento) dadosFaltantes.push('data de nascimento');

        // Só adiciona médico/data/horário como faltantes se o cliente ainda não escolheu
        const jaEscolheuMedico = historicoConversa && /(Dr\.|👨‍⚕️|médico|doutor)/i.test(historicoConversa) && (extracao.medico_nome || extracao.medico_id);
        const jaEscolheuHorario = historicoConversa && /\d{1,2}[h:]|14:00|15:00|16:00|hora/i.test(historicoConversa) && extracao.horario;

        if (!extracao.medico_nome && !extracao.medico_id && !jaEscolheuMedico) dadosFaltantes.push('médico');
        if (!extracao.data_agendamento) dadosFaltantes.push('data da consulta');
        if (!extracao.horario && !jaEscolheuHorario) dadosFaltantes.push('horário');

        // Se temos TODOS os dados, criar agendamento IMEDIATAMENTE
        if (extracao.dados_completos && extracao.nome_paciente && extracao.data_nascimento && 
            (extracao.medico_nome || extracao.medico_id) && extracao.data_agendamento && extracao.horario) {
          
          console.log('✅ Todos os dados coletados, criando agendamento...');
          console.log('📋 Médico extraído:', extracao.medico_nome, '| ID:', extracao.medico_id);
          
          // Buscar médico - primeiro por ID se disponível, depois por nome (com timeout)
          let medicos = [];
          try {
            medicos = await Promise.race([
              base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Medicos')), 3000))
            ]);
          } catch (e) {
            console.warn('⚠️ Timeout ao buscar médicos:', e.message);
          }
          let medicoEncontrado = null;
          
          // Tentar primeiro pelo ID (mais preciso)
          if (extracao.medico_id) {
            medicoEncontrado = medicos.find(m => m.id === extracao.medico_id);
          }
          
          // Se não encontrou pelo ID, buscar pelo nome (mais flexível)
          if (!medicoEncontrado && extracao.medico_nome) {
            const nomeExtraidoLower = extracao.medico_nome.toLowerCase();
            
            // Primeiro tenta match exato
            medicoEncontrado = medicos.find(m => 
              m.nome.toLowerCase() === nomeExtraidoLower
            );
            
            // Se não encontrou, tenta match parcial mas mais rigoroso
            if (!medicoEncontrado) {
              medicoEncontrado = medicos.find(m => {
                const nomeMedicoLower = m.nome.toLowerCase();
                // Verifica se o nome extraído contém o nome completo do médico ou vice-versa
                return nomeMedicoLower.includes(nomeExtraidoLower) || 
                       nomeExtraidoLower.includes(nomeMedicoLower) ||
                       // Verifica também partes significativas do nome (mais de 2 palavras coincidindo)
                       nomeExtraidoLower.split(' ').filter(p => p.length > 2 && nomeMedicoLower.includes(p)).length >= 2;
              });
            }
          }
          
          console.log('🔍 Médico encontrado:', medicoEncontrado?.nome || 'NÃO ENCONTRADO');

          if (medicoEncontrado) {
            // Converter data de nascimento para formato ISO
            let dataNascimentoISO = null;
            if (extracao.data_nascimento) {
              const partes = extracao.data_nascimento.split('/');
              if (partes.length === 3) {
                dataNascimentoISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
              }
            }

            // Buscar ou criar paciente - busca por telefone OU por nome + data nascimento
            let paciente = null;
            
            // Primeiro tenta buscar por telefone
            let pacientesExistentes = await base44.asServiceRole.entities.Paciente.filter({ telefone: phoneNumber });
            
            // Se não encontrou por telefone, busca por nome + data de nascimento
            if (pacientesExistentes.length === 0 && extracao.nome_paciente && dataNascimentoISO) {
              console.log('🔍 Buscando paciente por nome e data de nascimento...');
              const todosPacientes = await base44.asServiceRole.entities.Paciente.list();
              const nomeLower = extracao.nome_paciente.toLowerCase().trim();
              
              pacientesExistentes = todosPacientes.filter(p => {
                const nomeMatch = p.nome && p.nome.toLowerCase().trim() === nomeLower;
                const dataNascMatch = p.data_nascimento === dataNascimentoISO;
                return nomeMatch && dataNascMatch;
              });
              
              if (pacientesExistentes.length > 0) {
                console.log('✅ Paciente encontrado por nome + data nascimento:', pacientesExistentes[0].nome);
              }
            }
            
            if (pacientesExistentes.length > 0) {
              paciente = pacientesExistentes[0];
              // Atualizar dados do paciente (incluindo telefone se não tinha)
              const updateData = {
                nome: extracao.nome_paciente,
                data_nascimento: dataNascimentoISO
              };
              if (!paciente.telefone || paciente.telefone === '') {
                updateData.telefone = phoneNumber;
              }
              await base44.asServiceRole.entities.Paciente.update(paciente.id, updateData);
              console.log('✅ Paciente existente atualizado:', paciente.id);
            } else {
              // Criar novo paciente
              console.log('🆕 Criando novo paciente:', extracao.nome_paciente);
              paciente = await base44.asServiceRole.entities.Paciente.create({
                nome: extracao.nome_paciente,
                telefone: phoneNumber,
                cpf: 'NÃO INFORMADO',
                data_nascimento: dataNascimentoISO,
                observacoes: 'Criado via WhatsApp pela Glória'
              });
              console.log('✅ Novo paciente criado:', paciente.id);
            }

            // Verificar se horário ainda está disponível (com timeout)
            let agendamentosExistentes = [];
            try {
              agendamentosExistentes = await Promise.race([
                base44.asServiceRole.entities.Agendamento.filter({
                  medico_id: medicoEncontrado.id,
                  data_agendamento: extracao.data_agendamento,
                  horario: extracao.horario,
                  status: { $ne: 'Cancelado' }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Agendamentos')), 2000))
              ]);
            } catch (e) {
              console.warn('⚠️ Timeout ao buscar agendamentos:', e.message);
            }

            if (agendamentosExistentes.length === 0) {
              // Buscar categoria "Particular" e valor da consulta
              let categoriaParticularId = null;
              let valorConsulta = 0;
              try {
                const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({ 
                  nome: 'Particular',
                  status: 'Ativo'
                });
                if (categorias.length > 0) {
                  categoriaParticularId = categorias[0].id;
                  
                  // Buscar valor da consulta na tabela de preços (com timeout)
                  // Procurar procedimento de consulta da especialidade do médico
                  try {
                    const [tabelaPrecos, procedimentos] = await Promise.all([
                      Promise.race([
                        base44.asServiceRole.entities.TabelaPreco.filter({ categoria_id: categoriaParticularId }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout TabelaPrecos')), 2000))
                      ]).catch(() => []),
                      Promise.race([
                        base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Procedimentos')), 2000))
                      ]).catch(() => [])
                    ]);
                    
                    // Buscar procedimento de consulta para a especialidade do médico
                    const especialidadeMedico = (medicoEncontrado.especialidade || '').toLowerCase();
                    let procedimentoConsulta = procedimentos.find(p => {
                      const nomeLower = (p.nome || '').toLowerCase();
                      const espLower = (p.especialidade || '').toLowerCase();
                      return (nomeLower.includes('consulta') || nomeLower.includes(especialidadeMedico)) &&
                             (espLower.includes(especialidadeMedico) || especialidadeMedico.includes(espLower));
                    });
                    
                    // Se não encontrou específico, buscar consulta genérica ou clínico geral
                    if (!procedimentoConsulta) {
                      procedimentoConsulta = procedimentos.find(p => {
                        const nomeLower = (p.nome || '').toLowerCase();
                        return nomeLower.includes('consulta') && (nomeLower.includes('clínico') || nomeLower.includes('clinico') || nomeLower.includes('geral'));
                      });
                    }
                    
                    if (procedimentoConsulta) {
                      const preco = tabelaPrecos.find(tp => tp.procedimento_id === procedimentoConsulta.id);
                      if (preco) {
                        valorConsulta = preco.valor || 0;
                        console.log(`💰 Valor da consulta encontrado: R$ ${valorConsulta}`);
                      }
                    }
                  } catch (precoError) {
                    console.log('⚠️ Erro ao buscar valor da consulta:', precoError.message);
                  }
                }
              } catch (e) {
                console.log('⚠️ Erro ao buscar categoria Particular:', e.message);
              }
              
              // Criar agendamento com valor
              const novoAgendamento = await base44.asServiceRole.entities.Agendamento.create({
                paciente_id: paciente.id,
                paciente_nome: extracao.nome_paciente,
                medico_id: medicoEncontrado.id,
                data_agendamento: extracao.data_agendamento,
                horario: extracao.horario,
                tipo_servico: 'Consulta',
                status: 'Agendado',
                categoria_preco_id: categoriaParticularId,
                valor_total: valorConsulta,
                valor_final: valorConsulta,
                observacoes: 'Agendado pela Glória',
                agendado_por: 'Glória',
                agendado_por_tipo: 'chatbot'
              });

              console.log('✅ AGENDAMENTO CRIADO:', novoAgendamento.id);

              // Criar notificação para a equipe
              try {
                const dataObjNotif = new Date(extracao.data_agendamento + 'T12:00:00');
                const dataFormatadaNotif = dataObjNotif.toLocaleDateString('pt-BR');

                await base44.asServiceRole.entities.Notification.create({
                  type: 'novo_agendamento',
                  message: `🆕 ${extracao.nome_paciente} - ${medicoEncontrado.especialidade} com ${medicoEncontrado.nome} em ${dataFormatadaNotif} às ${extracao.horario}`,
                  data: {
                    agendamento_id: novoAgendamento.id,
                    paciente_nome: extracao.nome_paciente,
                    medico_nome: medicoEncontrado.nome,
                    especialidade: medicoEncontrado.especialidade,
                    data: extracao.data_agendamento,
                    horario: extracao.horario,
                    agendado_por: 'Glória',
                    agendado_por_tipo: 'chatbot'
                  },
                  is_read: false
                });
              } catch (notifError) {
                console.error('⚠️ Erro ao criar notificação:', notifError.message);
              }

              agendamentoCriado = true;
              
              // Formatar data para exibição
              const dataObj = new Date(extracao.data_agendamento + 'T12:00:00');
              const dataFormatada = dataObj.toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                day: '2-digit', 
                month: '2-digit',
                year: 'numeric'
              });
              
              mensagemAgendamento = `✅ Agendamento confirmado!\n\n📋 Resumo:\n• Paciente: ${extracao.nome_paciente}\n• Médico: ${medicoEncontrado.nome} (${medicoEncontrado.especialidade})\n• Data: ${dataFormatada}\n• Horário: ${extracao.horario}\n\n📍 Endereço: Tristão Monteiro, 580 – Zona Nova, Tramandaí/RS\n\n⚠️ Lembre-se de trazer documento original com foto.\n\nTe aguardamos! 😊`;
            } else {
              console.log('⚠️ Horário já ocupado');
              mensagemAgendamento = `😔 Poxa, esse horário acabou de ser preenchido. Vou verificar outras opções disponíveis para você!`;
            }
          } else {
            console.log('⚠️ Médico não encontrado:', extracao.medico_nome);
          }
        } else if (dadosFaltantes.length > 0 && dadosFaltantes.length < 5) {
          // Tem alguns dados mas faltam outros - informar ao LLM quais dados faltam
          console.log('📋 Dados faltantes para agendamento:', dadosFaltantes.join(', '));
        }
      } catch (extracaoError) {
        console.error('⚠️ Erro na extração:', extracaoError.message);
      }
    }

    const estaConfirmando = /^(sim|s|ok|certo|correto|confirmo|pode|isso|claro|beleza|tudo bem|confirm|yes)$/i.test(messageText.trim());
    if (estaConfirmando && historicoConversa && /Para confirmar o agendamento|data de nascimento|nome completo/i.test(historicoConversa)) {
      console.log('✅ Cliente confirmando dados');
    }

    // Se agendamento foi criado, retornar mensagem de confirmação
    if (agendamentoCriado) {
      console.log('🎉 Retornando confirmação de agendamento');
      
      // Salvar no histórico
      try {
        const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
        const timestamp = new Date().toISOString();
        
        if (contatos.length > 0) {
          const contato = contatos[0];
          const historicoAtual = contato.historico_mensagens || [];
          historicoAtual.push(
            { role: 'user', content: messageText, timestamp },
            { role: 'assistant', content: mensagemAgendamento, timestamp }
          );
          
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            ultima_mensagem: messageText,
            ultima_resposta: mensagemAgendamento,
            historico_mensagens: historicoAtual.slice(-50),
            ultima_interacao: timestamp,
            total_mensagens: (contato.total_mensagens || 0) + 2,
            agendamentos_realizados: (contato.agendamentos_realizados || 0) + 1,
            processando_ia_lock: null // Liberar lock
          });
        }
      } catch (e) {
        console.error('⚠️ Erro ao salvar histórico:', e.message);
      }
      
      await liberarLock(base44, phoneNumber);
      return Response.json({ 
        success: true, 
        resposta: mensagemAgendamento,
        conversationId: null,
        agendamento_criado: true
      });
    }

    // Usar InvokeLLM diretamente para gerar resposta
    console.log('🤖 Chamando LLM...');

    // Obter horário atual no fuso de Brasília (America/Sao_Paulo)
    const agoraBrasilia = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const horaNumero = parseInt(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));

    // Data completa formatada para o prompt
    const dataAtualCompleta = new Date().toLocaleDateString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const dataAtualISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // formato YYYY-MM-DD

    let saudacaoHorario = 'Bom-dia';
    if (horaNumero >= 12 && horaNumero < 18) {
      saudacaoHorario = 'Boa-tarde';
    } else if (horaNumero >= 18 || horaNumero < 5) {
      saudacaoHorario = 'Boa-noite';
    }

    // Primeira mensagem agora NÃO retorna imediatamente - passa pelo LLM para resposta contextualizada.
    // Usamos ehPrimeiraMensagemDefinitiva que já foi calculado acima.
    const ehPrimeiraMensagem = ehPrimeiraMensagemDefinitiva;

    // NOTA: Detecção de primeira mensagem agora é feita no início da função (antes dos fluxos).
    // Este bloco foi removido para evitar duplicação.

    // Buscar procedimentos e exames disponíveis - SEMPRE carregar para que a IA tenha informações atualizadas
    let infoProcedimentosExames = '';
    
    // SEMPRE carregar a lista completa de procedimentos e exames para que a IA possa responder sobre qualquer serviço
    {
      console.log('📋 Carregando lista COMPLETA de procedimentos e exames...');

      try {
        // Carregamento paralelo com timeout
        const [procedimentos, exames, tabelaPrecos] = await Promise.all([
          Promise.race([
            base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Procedimentos')), 3000))
          ]).catch(e => {
            console.warn('⚠️ Erro procedimentos:', e.message);
            return [];
          }),
          Promise.race([
            base44.asServiceRole.entities.Exame.filter({ status: 'Ativo' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Exames')), 3000))
          ]).catch(e => {
            console.warn('⚠️ Erro exames:', e.message);
            return [];
          }),
          Promise.race([
            base44.asServiceRole.entities.TabelaPreco.list(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout TabelaPrecos')), 3000))
          ]).catch(e => {
            console.warn('⚠️ Erro tabela preços:', e.message);
            return [];
          })
        ]);

        // Buscar todas as categorias de preço para mostrar múltiplos valores
        let categoriasPreco = [];
        try {
          categoriasPreco = await Promise.race([
            base44.asServiceRole.entities.CategoriaPreco.filter({ status: 'Ativo' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout CategoriaPreco')), 2000))
          ]);
        } catch (e) {
          console.warn('⚠️ Erro categorias:', e.message);
        }
        const categoriasMap = {};
        categoriasPreco.forEach(c => { categoriasMap[c.id] = c.nome; });

      if (procedimentos.length > 0 || exames.length > 0) {
          infoProcedimentosExames = `\n\n📋 BASE DE DADOS - PROCEDIMENTOS E EXAMES COM PREÇOS:\n`;

          if (procedimentos.length > 0) {
            infoProcedimentosExames += '\n🏥 PROCEDIMENTOS DISPONÍVEIS:\n';
            for (const proc of procedimentos) {
              // Buscar TODOS os preços deste procedimento em todas as categorias
              const precosDeste = tabelaPrecos.filter(tp => tp.procedimento_id === proc.id && tp.valor > 0);
              let valoresStr = '';
              if (precosDeste.length > 0) {
                const partes = precosDeste.map(tp => {
                  const catNome = categoriasMap[tp.categoria_id] || 'Outro';
                  return `${catNome}: R$ ${tp.valor.toFixed(2)}`;
                });
                valoresStr = partes.join(' | ');
              } else {
                valoresStr = 'Consultar';
              }
              infoProcedimentosExames += `• ${proc.nome}${proc.especialidade ? ` (${proc.especialidade})` : ''} - ${valoresStr}\n`;
            }
          }

          if (exames.length > 0) {
            infoProcedimentosExames += '\n🔬 EXAMES DISPONÍVEIS:\n';
            for (const exame of exames) {
              // Exames têm valor_particular e valor_convenio diretamente
              const valores = [];
              if (exame.valor_particular) valores.push(`Particular: R$ ${exame.valor_particular.toFixed(2)}`);
              if (exame.valor_convenio) valores.push(`Convênio/Cartão: R$ ${exame.valor_convenio.toFixed(2)}`);
              const valoresStr = valores.length > 0 ? valores.join(' | ') : 'Consultar';
              infoProcedimentosExames += `• ${exame.nome}${exame.tipo ? ` (${exame.tipo})` : ''} - ${valoresStr}\n`;
            }
          }

          infoProcedimentosExames += `\n🚨🚨🚨 REGRAS ABSOLUTAS PARA USO DA BASE DE DADOS 🚨🚨🚨

    📌 REGRAS DE USO DA BASE DE DADOS:
    1. CONSULTE a lista acima ANTES de dizer "não realizamos". Se está na lista = SIM, oferecemos!
    2. BUSCA FLEXÍVEL: "biópsia"="BIOPSIA", "eco"="ECOCARDIOGRAMA". Sinônimos contam!
    3. Informe TODOS os preços (Particular E Cartão Mais Vida).
    4. Se NÃO está na lista = diga que precisa verificar e sugira ligar (51) 3661-5991.
    5. Exames de sangue: a clínica FAZ coleta todos os dias! Nunca diga que não faz.
    6. NUNCA invente preços. Esta lista é atualizada em tempo real.
    
    🚨 NÃO PEÇA NOME/CPF PARA DAR ORÇAMENTO!
    Quando o cliente enviar uma requisição (imagem ou PDF), você DEVE:
    1. Ler o texto extraído da imagem/documento (seja fiel a ele).
    2. Se o texto estiver vazio ou ilegível, PEÇA para o cliente digitar os exames ou mandar uma foto melhor. NUNCA invente exames!
    3. Se houver exames, monte o orçamento DIRETO, sem pedir dados pessoais.

    📋 FORMATO: 📋*ORÇAMENTO* ✅Realizamos: •[exame]-R$XX ❌Não realizamos: •[exame] 💰TOTAL:R$XX 📍Tristão Monteiro,580-Tramandaí (51)3661-5991. Coleta seg-sáb 7h-10h jejum.
    ⚠️ Nunca invente preços. Calcule total. Não peça dados pessoais p/orçamento. Coleta NÃO é agendada. Liste cada exame individual. Eco=FAZ SIM. RX/Ressonância/Tomografia=parceiro. Fidelidade à requisição (AST=TGO,ALT=TGP).`;
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar procedimentos/exames:', e.message);
      }
    }

    let instrucoesMidia = '';
    if (mediaType === 'image' || mediaType === 'document') {
      instrucoesMidia = `\n\n${mediaType === 'image' ? '📷 IMAGEM' : '📄 DOCUMENTO'} RECEBIDA:\n1.LEIA requisição LINHA POR LINHA\n2.LISTE APENAS exames da requisição-NÃO invente!\n3.Se não extraiu texto,peça foto melhor\n4.~17 exames=~17 itens\n5.NÃO agrupe em "Exame Laboratorial"\n6.Nome ESPECÍFICO+preço INDIVIDUAL\n7.AST/ALT=TGO/TGP separados\n8.Colesterol total e frações=Total,HDL,LDL,VLDL\n9.Calcule VALOR TOTAL\n10.Mostre Particular E Cartão Mais Vida\n11.NÃO peça dados pessoais p/ orçamento\n12.Resultado/laudo: descreva info`;
    } else if (mediaType === 'audio') {
      instrucoesMidia = `\n\n🎤 ÁUDIO: OUÇA e RESPONDA ao conteúdo. NÃO responda "[Áudio recebido]". Se não entender: "Poderia digitar sua mensagem?" Trate como texto normal.`;
    } else if (mediaType === 'video') {
      instrucoesMidia = `\n\n🎥 VÍDEO: Analise e confirme recebimento.`;
    }
    
    // Preparar histórico para o prompt - formato estruturado para o LLM entender melhor o contexto
    let historicoParaPrompt = '';
    let contextoPreviousConversation = '';

    if (conversaFinalizada && historicoConversa) {
      contextoPreviousConversation = `\n\n📜 CONTEXTO: Esta é uma NOVA CONVERSA. A conversa anterior foi finalizada pelo atendente.
    Se o cliente mencionar algo da conversa anterior, você pode consultar o histórico abaixo para contexto, 
    mas trate esta interação como uma NOVA conversa - cumprimente novamente e foque no novo assunto.

    HISTÓRICO DA CONVERSA ANTERIOR (apenas para referência se necessário):
    ${historicoConversa}
    ---`;
      historicoParaPrompt = '(nova conversa - conversa anterior foi finalizada)';
    } else if (historicoMensagensRaw.length > 0) {
      // Formato estruturado com timestamps para o LLM entender a sequência temporal
      historicoParaPrompt = historicoMensagensRaw.map(m => {
        const role = m.role === 'user' ? '👤 CLIENTE' : '🤖 GLÓRIA';
        const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const media = m.mediaType && m.mediaType !== 'text' ? ` [${m.mediaType.toUpperCase()}]` : '';
        return `${role}${time ? ` (${time})` : ''}${media}: ${m.content}`;
      }).join('\n');
    } else {
      historicoParaPrompt = '(primeira mensagem - sem histórico)';
    }

    let promptCompleto = '';
    try {
      const promptResult = await base44.asServiceRole.functions.invoke('gerarPromptChat', {
        promptSistema: config.prompt_sistema,
        informacoesInstitucionais: config.informacoes_institucionais || '',
        dataAtualCompleta, dataAtualISO, horaAtual, saudacaoHorario,
        historicoConversa, historicoParaPrompt, ehPrimeiraMensagem, senderName,
        dadosFaltantes, infoDisponibilidade, infoProcedimentosExames,
        instrucoesMidia, infoCancelamento, infoResultadoExame
      });
      promptCompleto = promptResult.data.prompt;
    } catch (e) {
      console.warn('⚠️ Erro ao gerar prompt:', e.message);
      promptCompleto = config.prompt_sistema;
    }

    // Chamar OpenAI diretamente via função auxiliar chamarOpenAI
    const modeloLLM = config.modelo_llm || 'gpt-4o';
    console.log('🤖 Chamando OpenAI via chamarOpenAI. Modelo:', modeloLLM, '| mediaType:', mediaType);
    let llmResponse = null;
    try {
      const openaiResult = await Promise.race([
        base44.asServiceRole.functions.invoke('chamarOpenAI', {
          prompt: promptCompleto,
          messageText: messageText || '',
          mediaType: mediaType || 'text',
          mediaUrl: (mediaType === 'image' || mediaType === 'document') ? mediaUrl : null,
          modelo: modeloLLM,
          temperatura: config.temperatura || 0.7
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout chamarOpenAI 70s')), 70000))
      ]);
      llmResponse = openaiResult?.data?.resposta || null;
      console.log('✅ OpenAI respondeu. Tokens:', openaiResult?.data?.tokens?.total_tokens);
    } catch (e) {
      console.error('❌ Erro ao chamar OpenAI:', e.message);
      llmResponse = null;
    }
    

    // Identificar motivo do contato
    let motivoIdentificado = null;
    const msgLowerMotivo = messageText.toLowerCase();
    const historicoLowerMotivo = (historicoConversa || '').toLowerCase();
    const textoCompletoMotivo = msgLowerMotivo + ' ' + historicoLowerMotivo;

    if (textoCompletoMotivo.includes('cancelar') || textoCompletoMotivo.includes('desmarcar') || textoCompletoMotivo.includes('cancelamento')) {
      motivoIdentificado = 'Cancelamento';
    } else if (textoCompletoMotivo.includes('resultado') || textoCompletoMotivo.includes('laudo') || textoCompletoMotivo.includes('exame pronto')) {
      motivoIdentificado = 'Resultado de Exames';
    } else if (textoCompletoMotivo.includes('orçamento') || textoCompletoMotivo.includes('orcamento') || textoCompletoMotivo.includes('quanto custa') || textoCompletoMotivo.includes('preço') || textoCompletoMotivo.includes('valor')) {
      motivoIdentificado = 'Orçamento';
    } else if (textoCompletoMotivo.includes('cartão') || textoCompletoMotivo.includes('cartao') || textoCompletoMotivo.includes('mais vida')) {
      motivoIdentificado = 'Cartão Mais Vida';
    } else if (textoCompletoMotivo.includes('turma') || textoCompletoMotivo.includes('hidrogin') || textoCompletoMotivo.includes('pilates') || textoCompletoMotivo.includes('natação') || textoCompletoMotivo.includes('natacao')) {
      motivoIdentificado = 'Turmas';
    } else if (textoCompletoMotivo.includes('procedimento')) {
      motivoIdentificado = 'Procedimentos';
    } else if (textoCompletoMotivo.includes('agendar') || textoCompletoMotivo.includes('marcar') || textoCompletoMotivo.includes('consulta') || textoCompletoMotivo.includes('horário') || textoCompletoMotivo.includes('horario') || textoCompletoMotivo.includes('disponível') || textoCompletoMotivo.includes('disponivel')) {
      motivoIdentificado = 'Agendamento';
    }

    console.log('🏷️ Motivo identificado:', motivoIdentificado);

    // Salvar conversa no histórico (user + assistant juntos para evitar duplicação)
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      const timestamp = new Date().toISOString();

      if (contatos.length > 0) {
        const contato = contatos[0];
        const historicoAtual = contato.historico_mensagens || [];

        // Verificar duplicatas - orçamentos e outras mensagens repetidas
        const historicoCompleto = historicoAtual.filter(m => m.role === 'assistant');
        const ultimasRespostasAssistente = historicoCompleto.slice(-5);

        // Deduplicação: respostas idênticas ou orçamento duplicado
        const ultimaResposta = ultimasRespostasAssistente[ultimasRespostasAssistente.length - 1];
        const respostaIdentica = ultimaResposta?.content && llmResponse && ultimaResposta.content.trim() === (llmResponse||'').trim();
        const jaEnviouMsgOrcamento = ultimasRespostasAssistente.some(m => m.content && /já enviei o orçamento/i.test(m.content));
        if (respostaIdentica || (jaEnviouMsgOrcamento && llmResponse && /já enviei o orçamento/i.test(llmResponse))) {
          console.log('⚠️ Resposta duplicada bloqueada');
          await liberarLock(base44, phoneNumber);
          return Response.json({ success: true, resposta: null, duplicado: true });
        }

        // Incluir URL da mídia no conteúdo se houver
        let conteudoUsuario = messageText;
        if (mediaUrl) {
          conteudoUsuario = `${messageText}\n${mediaUrl}`;
        }

        // ANTI-DUPLICATA: Verificar se a mensagem do user já está no histórico
        const userMsgJaExiste = messageId && historicoAtual.some(m => m.messageId === messageId && m.role === 'user');
        
        if (!userMsgJaExiste) {
          // Adicionar mensagem do user + resposta do assistant juntas
          historicoAtual.push(
            { role: 'user', content: conteudoUsuario, timestamp, messageId, mediaType, mediaUrl }
          );
        }
        
        // Sempre adicionar a resposta do assistant
        historicoAtual.push(
          { role: 'assistant', content: llmResponse, timestamp }
        );
        
        // Manter apenas as últimas 50 mensagens
        const historicoLimitado = historicoAtual.slice(-50);
        
        // Se a conversa estava finalizada, limpar o histórico antigo e começar do zero
        let historicoParaSalvar = historicoLimitado;
        if (conversaFinalizada) {
          console.log('🔄 Limpando histórico antigo - nova conversa');
          historicoParaSalvar = [
            { role: 'user', content: messageText, timestamp, messageId },
            { role: 'assistant', content: llmResponse, timestamp }
          ];
        }
        
        const updateData = {
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse,
          historico_mensagens: historicoParaSalvar,
          ultima_interacao: timestamp,
          total_mensagens: conversaFinalizada ? 2 : (contato.total_mensagens || 0) + 2,
          status: contato.conversa_finalizada ? 'Lead' : contato.status,
          conversa_finalizada: false // Reativa conversa se cliente mandou mensagem
        };

        // Adicionar motivo se identificado
        if (motivoIdentificado) {
          const interessesAtuais = contato.interesses || [];
          if (!interessesAtuais.includes(motivoIdentificado)) {
            updateData.interesses = [...interessesAtuais, motivoIdentificado];
          }
        }

        await base44.asServiceRole.entities.Contato.update(contato.id, updateData);
        console.log('✅ Contato atualizado:', contato.id.substring(0, 8));
      } else {
        // Criar novo contato
        const novoContatoData = {
          nome: senderName,
          telefone: phoneNumber,
          paciente_id: pacienteId,
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse,
          historico_mensagens: [
            { role: 'user', content: messageText, timestamp, messageId },
            { role: 'assistant', content: llmResponse, timestamp }
          ],
          ultima_interacao: timestamp,
          total_mensagens: 2,
          origem: 'WhatsApp',
          status: 'Novo'
        };

        // Adicionar motivo se identificado
        if (motivoIdentificado) {
          novoContatoData.interesses = [motivoIdentificado];
        }

        await base44.asServiceRole.entities.Contato.create(novoContatoData);
        console.log('✅ Novo contato criado');
      }
    } catch (e) {
      console.error('⚠️ Erro ao salvar histórico:', e.message);
    }
    
    // Se tem arquivo para enviar, adicionar ao histórico como mensagem separada
    if (arquivoParaEnviar && arquivoParaEnviar.url) {
      try {
        const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
        if (contatos.length > 0) {
          const contato = contatos[0];
          const historicoAtual = contato.historico_mensagens || [];
          const timestamp = new Date().toISOString();
          
          // Adicionar mensagem do arquivo enviado
          historicoAtual.push({
            role: 'assistant',
            content: `📄 ${arquivoParaEnviar.nome}: ${arquivoParaEnviar.url}`,
            timestamp,
            mediaType: 'document',
            mediaUrl: arquivoParaEnviar.url
          });
          
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            historico_mensagens: historicoAtual.slice(-50)
          });
          console.log('✅ Arquivo adicionado ao histórico:', arquivoParaEnviar.nome);
        }
      } catch (e) {
        console.error('⚠️ Erro ao salvar arquivo no histórico:', e.message);
      }
    }

    // Liberar lock antes de retornar
    await liberarLock(base44, phoneNumber);

    return Response.json({ 
      success: true, 
      resposta: llmResponse,
      conversationId: null,
      arquivoParaEnviar: arquivoParaEnviar
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    // Tentar liberar lock mesmo em caso de erro (phoneNumber pode ter sido extraído antes do erro)
    try {
      if (typeof phoneNumber !== 'undefined' && phoneNumber) {
        await liberarLock(base44, phoneNumber);
      }
    } catch (e) { /* ignore */ }
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

// Função auxiliar para liberar lock (busca contato com variantes de telefone)
async function liberarLock(base44, phoneNumber) {
  try {
    const telNorm = phoneNumber.replace(/\D/g, '');
    const vars = [phoneNumber, telNorm];
    if (telNorm.startsWith('55') && telNorm.length >= 12) vars.push(telNorm.slice(2));
    if (!telNorm.startsWith('55') && telNorm.length >= 10) vars.push('55' + telNorm);
    
    for (const v of vars) {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
      if (contatos.length > 0 && contatos[0].processando_ia_lock) {
        await base44.asServiceRole.entities.Contato.update(contatos[0].id, {
          processando_ia_lock: null
        });
        console.log('🔓 Lock liberado');
        return;
      }
    }
  } catch (e) {
    console.warn('⚠️ Erro ao liberar lock:', e.message);
  }
}