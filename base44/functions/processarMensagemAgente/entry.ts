import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let { phoneNumber, messageText, senderName, pacienteId, mediaType, mediaUrl, messageId } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText: (messageText || '').substring(0, 100), mediaType, mediaUrl: mediaUrl ? mediaUrl.substring(0, 80) : null, messageId });

    // DETECÇÃO DE MÍDIA EMBUTIDA NO TEXTO (BUFFER/DEBOUNCE perde mediaType/mediaUrl)
    if ((!mediaUrl || mediaType === 'text') && messageText) {
      const urlNoTexto = messageText.match(/(https?:\/\/[^\s]+)/i);
      if (urlNoTexto) {
        const u = urlNoTexto[1]; const limpaTxt = (tag) => { messageText = messageText.replace(urlNoTexto[0], '').replace(tag, '').trim(); mediaUrl = u; };
        if (/\[(?:á|a)udio/i.test(messageText)) { mediaType='audio'; limpaTxt(/\[(?:á|a)udio\s*(?:recebido)?\]/gi); messageText=messageText||'[Áudio recebido]'; }
        else if (/\[(?:i|I)magem/i.test(messageText) || /\.(jpg|jpeg|png|webp)/i.test(u)) { mediaType='image'; limpaTxt(/\[(?:i|I)magem\s*(?:recebida)?\]/gi); messageText=messageText||'[Imagem recebida]'; }
        else if (/\.ogg/i.test(u)) { mediaType='audio'; limpaTxt(/$/); messageText=messageText||'[Áudio recebido]'; }
        else if (/\.pdf/i.test(u)) { mediaType='document'; limpaTxt(/$/); messageText=messageText||'[Documento recebido]'; }
        if (mediaUrl) console.log(`📎 Mídia restaurada do buffer: type=${mediaType}, url=${mediaUrl.substring(0,80)}`);
      }
    }

    if (mediaType === 'audio' && mediaUrl) {
      let transcricaoSucesso = false;
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
    let contatosCheck = [];
    const contatoVerificado = await buscarContatoPorTelefone(phoneNumber);
    if (contatoVerificado) contatosCheck = [contatoVerificado];
    if (contatosCheck.length > 0 && contatosCheck[0].atendimento_humano !== false && !isBufferMessage) {
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
    if (isBufferMessage && contatosCheck.length > 0 && contatosCheck[0].atendimento_humano !== false) {
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
      let contatos = [];
      const cVerif = await buscarContatoPorTelefone(phoneNumber);
      if (cVerif) contatos = [cVerif];
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
        const cFresh = await buscarContatoPorTelefone(phoneNumber);
        if (cFresh) contatoFresh = cFresh;
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
      
      // Verificar se contato está em modo humano - NOVOS contatos começam em modo humano por padrão
      const estaEmModoHumano = !contatoFresh || contatoFresh.atendimento_humano !== false;
      
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
            atendimento_humano: true,
            ultima_mensagem: messageText,
            historico_mensagens: [userEntry],
            ultima_interacao: timestamp,
            total_mensagens: 1,
            conversa_finalizada: false
          });
          console.log('👤 Novo contato criado em modo HUMANO (automático)');
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

    const _hMFA=historicoConversa&&(/nome completo.*paciente|data de nascimento.*paciente|qual.*médico.*prefere|disponibilidades|agendar.*consulta/i.test(historicoConversa)||(/Dr\.\s+\w+/i.test(historicoConversa)&&/\d{2}:\d{2}/i.test(historicoConversa)&&/qual.*prefere|escolh|horário/i.test(historicoConversa)));
    const _tPV=historicoConversa&&/verificar|consultar|checar|status|confirma|está confirmado|meu agendamento/i.test(historicoConversa)&&!/agendar|marcar|nova consulta/i.test(historicoConversa)&&!_hMFA;
    const querVerificarAgendamento=!_hMFA&&((/verificar|consultar|checar|status|confirma|está confirmado|meu agendamento/i.test(messageText)&&!/cancelar|desmarcar|agendar|marcar|nova|novo/i.test(messageText))||(_tPV&&/(\d{1,2})\/(\d{1,2})\/(\d{4})|nascimento|me chamo/i.test(messageText)));

    const cancelamentoJaConcluidoNoHistorico=/Agendamento cancelado com sucesso|❌\s*\*Cancelado:/i.test(historicoConversa||'');
    const querCancelar=/cancelar|desmarcar|n[aã]o (vou|posso|irei)|remarcar|adiar|desistir/i.test(messageText)||(!cancelamentoJaConcluidoNoHistorico&&/cancelar|desmarcar|remarcar/i.test(historicoConversa||''));
    let infoCancelamento='';let agendamentoCancelado=false;

    if(querVerificarAgendamento){
      console.log('🔍 VERIFICAÇÃO agendamento...');
      const nm=messageText.match(/(?:nome[:\s]+|sou\s+o?\s*|me chamo\s+|é\s+)?([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+)/i);
      let nE=null;if(nm){let n=nm[1].trim().replace(/^(me chamo|sou|meu nome é|é)\s*/i,'');if(n.split(' ').length>=2)nE=n;}
      const dm=messageText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const dE=dm?`${dm[3]}-${String(dm[2]).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}`:null;
      if(nE&&dE){try{const rv=await base44.asServiceRole.functions.invoke('verificarAgendamento',{nome:nE,data_nascimento:dE});let rV='';
        if(rv.data?.sucesso&&rv.data?.agendamentos?.length>0){rV=`📋 *Seus agendamentos:*\n\n`;rv.data.agendamentos.forEach(ag=>{const se=ag.status==='Cancelado'?'❌':ag.status==='Agendado'?'📅':'✅';const st=ag.status==='Cancelado'?'CANCELADO':ag.status==='Agendado'?'Agendado':ag.status==='Confirmado'?'CONFIRMADO':ag.status;rV+=`${se} *${ag.data_formatada}* às *${ag.horario}*\n👨‍⚕️ ${ag.medico_nome} (${ag.especialidade})\n📌 *${st}*\n\n`;});const tc=rv.data.agendamentos.some(a=>a.status==='Confirmado'||a.status==='Agendado');if(tc)rV+='📍 Tristão Monteiro, 580 – Tramandaí/RS\n⏰ Chegue 10min antes!\n\n';rV+='Posso ajudar em mais algo?';}else{rV=`😔 Não encontramos agendamentos para *${nE}*.\nPosso agendar para você! 😊`;}
        try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:rV,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
        await liberarLock(base44,phoneNumber);return Response.json({success:true,resposta:rV,verificado:true,fluxo:'verificacao'});
      }catch(e){console.error('❌ Erro verificação:',e.message);}}else{
        const rPD=`Para verificar, preciso:\n📝 Nome completo\n📅 Data nascimento (DD/MM/AAAA)\n\nEx: "Antonio Thiago 19/04/1982"`;
        try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:rPD,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
        await liberarLock(base44,phoneNumber);return Response.json({success:true,resposta:rPD,fluxo:'verificacao'});}
    }

      if(querCancelar){console.log('❌ Cancelamento...');try{const hj=new Date().toISOString().split('T')[0];let aF=[];let nP='';let pacs=[];const tnC=phoneNumber.replace(/\D/g,'');const vC=[phoneNumber,tnC];if(tnC.startsWith('55')&&tnC.length>=12)vC.push(tnC.slice(2));if(!tnC.startsWith('55')&&tnC.length>=10)vC.push('55'+tnC);for(const v of vC){if(pacs.length>0)break;try{pacs=await base44.asServiceRole.entities.Paciente.filter({telefone:v});}catch(e){}}if(!pacs.length){try{const tp=await base44.asServiceRole.entities.Paciente.list('-created_date',500);const u8=tnC.slice(-8);pacs=tp.filter(p=>(p.telefone||'').replace(/\D/g,'').slice(-8)===u8);}catch(e){}}if(pacs.length>0){nP=pacs[0].nome;for(const p of pacs){const ag=await base44.asServiceRole.entities.Agendamento.filter({paciente_id:p.id});aF.push(...ag.filter(a=>a.data_agendamento>=hj && ['Agendado','Confirmado','Pago'].includes(a.status)));}const ids=new Set();aF=aF.filter(a=>{if(ids.has(a.id))return false;ids.add(a.id);return true;});}
        if(aF.length>0){const mds=await base44.asServiceRole.entities.Medico.list();const mm={};mds.forEach(m=>{mm[m.id]=m;});infoCancelamento=`\n\n📋 CANCELAMENTO - ${nP}:\n`;aF.forEach((ag,i)=>{const md=mm[ag.medico_id];const df=new Date(ag.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'});infoCancelamento+=`\n${i+1}. ${ag.tipo_servico} - ${df} às ${ag.horario}${md?` com ${md.nome}`:''}\n   ID: ${ag.id}`;});infoCancelamento+='\n\n⚠️ Pergunte QUAL cancelar e use sempre a DATA EXATA. NÃO use hoje/amanhã/ontem. É PROIBIDO dizer que cancelou com sucesso sem executar no sistema. Se o cliente pediu para REMARCAR, você DEVE primeiro cancelar a consulta atual e em seguida já perguntar para quando ele quer remarcar (ou já oferecer horários disponíveis).';
          // CORREÇÃO: Cancelamento imediato quando cliente já indica QUAL na primeira mensagem
          const _mlc=messageText.toLowerCase().trim();let _agIm=null;
          for(const ag of aF){const md=mm[ag.medico_id];if(md){const pn=md.nome.toLowerCase().split(' ').filter(p=>p.length>3&&!/^(dr\.?|dra\.?)$/i.test(p));if(pn.some(p=>_mlc.includes(p))){_agIm=ag.id;console.log(`✅[IMEDIATO] Médico "${md.nome}":${ag.id}`);break;}}}
          if(!_agIm){const _dm=messageText.match(/(\d{1,2})\/(\d{1,2})|dia\s*(\d{1,2})/i);if(_dm){const _d=_dm[1]||_dm[3],_m=_dm[2]||String(new Date().getMonth()+1),_dr=`${new Date().getFullYear()}-${String(_m).padStart(2,'0')}-${String(_d).padStart(2,'0')}`;const _c=aF.find(a=>a.data_agendamento===_dr);if(_c){_agIm=_c.id;}}}
          if(!_agIm){const _hm=messageText.match(/(?:às|as)?\s*(\d{1,2})[h:](\d{2})/i);if(_hm){const _hr=`${String(_hm[1]).padStart(2,'0')}:${_hm[2]}`;const _c=aF.find(a=>a.horario===_hr);if(_c){_agIm=_c.id;}}}
          if(!_agIm&&aF.length===1){_agIm=aF[0].id;console.log(`✅[IMEDIATO] Único agendamento:${aF[0].id}`);}
          if(_agIm){console.log('🔥[IMEDIATO] Cancelamento direto...');const _ac=aF.find(a=>a.id===_agIm);const _mc=_ac?mm[_ac.medico_id]:null;
            try{await base44.asServiceRole.entities.Agendamento.update(_agIm,{status:'Cancelado',observacoes:`Cancelado via WhatsApp em ${new Date().toLocaleString('pt-BR')}`});
            try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0)await base44.asServiceRole.entities.Contato.update(cs[0].id,{status:'Cancelou'});}catch(e){}
            const _df=_ac?new Date(_ac.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'}):'';
            try{await base44.asServiceRole.entities.Notification.create({type:'agendamento_cancelado',message:`❌ ${_ac?.paciente_nome||'Paciente'} cancelou ${_mc?.especialidade||''} com ${_mc?.nome||'Médico'} - ${_df} às ${_ac?.horario||''}`,data:{agendamento_id:_agIm,paciente_nome:_ac?.paciente_nome,medico_nome:_mc?.nome,cancelado_por:'WhatsApp - Glória'},is_read:false});}catch(e){}
            const _qr=/remarcar|adiar|mudar.*data/i.test(messageText);let _rc=`✅ Agendamento cancelado com sucesso!\n\n❌ *Cancelado:* ${_ac?.tipo_servico||'Consulta'} - ${_df} às ${_ac?.horario||''}${_mc?` com ${_mc.nome} (${_mc.especialidade||''})`:''}\n\n`;
            _rc+=_qr?`Para quando você gostaria de remarcar?${_mc?` Posso ver os próximos horários para ${_mc.especialidade||'essa consulta'}.`:''}`:`Se precisar de mais alguma coisa, estou à disposição! 😊`;
            try{const _ch=await buscarContatoPorTelefone(phoneNumber);if(_ch){const _h=_ch.historico_mensagens||[];const _t=new Date().toISOString();_h.push({role:'user',content:messageText,timestamp:_t,messageId},{role:'assistant',content:_rc,timestamp:_t});await base44.asServiceRole.entities.Contato.update(_ch.id,{historico_mensagens:_h.slice(-50),ultima_interacao:_t,ultima_mensagem:messageText,ultima_resposta:_rc});}}catch(e){}
            await liberarLock(base44,phoneNumber);return Response.json({success:true,resposta:_rc,cancelamento_executado:true});
            }catch(ce){console.error('❌[IMEDIATO] Erro:',ce.message);}
          }
        }else{infoCancelamento='\n\n❌ Sem agendamentos futuros p/ este telefone.';}
      }catch(e){console.error('⚠️ Erro cancelamento:',e.message);}}

    const executarCancelamento = async (agendamentoId) => {
      try {
        const ags = await base44.asServiceRole.entities.Agendamento.filter({ id: agendamentoId });
        const ag = Array.isArray(ags) ? ags[0] : null;
        if (!ag) return false;
        let medicoNome='Médico', medicoEsp='';
        try { const ms=await base44.asServiceRole.entities.Medico.filter({id:ag.medico_id}); if(ms.length>0){medicoNome=ms[0].nome;medicoEsp=ms[0].especialidade;} } catch(e){}
        const df=new Date(ag.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'});
        await base44.asServiceRole.entities.Agendamento.update(agendamentoId,{status:'Cancelado',observacoes:`Cancelado via WhatsApp em ${new Date().toLocaleString('pt-BR')}`});
        try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0)await base44.asServiceRole.entities.Contato.update(cs[0].id,{status:'Cancelou'});}catch(e){}
        try{await base44.asServiceRole.entities.Notification.create({type:'agendamento_cancelado',message:`❌ ${ag.paciente_nome||'Paciente'} cancelou ${medicoEsp} com ${medicoNome} - ${df} às ${ag.horario}`,data:{agendamento_id:agendamentoId,paciente_nome:ag.paciente_nome,medico_nome:medicoNome,especialidade:medicoEsp,data:ag.data_agendamento,horario:ag.horario,cancelado_por:'WhatsApp - Glória'},is_read:false});}catch(e){}
        return true;
      } catch(e) { return false; }
    };

    // Verificar se o cliente está tentando indicar qual agendamento cancelar
    // Pode ser: número (1, 2), nome do médico, data (19/01), ou confirmação
    // TAMBÉM detectar quando o assistente mostrou a lista de agendamentos e perguntou "Qual consulta você deseja cancelar?"
    const contextoCancel = !cancelamentoJaConcluidoNoHistorico && /cancelar|desmarcar|remarcar|qual.*cancelar|qual.*remarcar|gostaria de cancelar|gostaria de remarcar|qual\s*consulta.*deseja|deseja\s*cancelar|deseja\s*remarcar/i.test(historicoConversa || '');
    
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
            paciente_id: paciente.id
          });
          const futuros = agendamentos.filter(ag => ag.data_agendamento >= hoje && ['Agendado', 'Confirmado', 'Pago'].includes(ag.status));
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
        
        // 2. Verificar se cliente mencionou horário específico (13:15, 13h15, às 13:15, 10h, 10 horas)
        if (!agendamentoParaCancelar) {
          const horarioCompletoMatch = messageText.match(/(?:às|as)?\s*(\d{1,2})[h:](\d{2})/i);
          const horaCheiaMatch = messageText.match(/(?:às|as)?\s*(\d{1,2})\s*(?:h\b|horas?\b)/i) || messageText.match(/^(\d{1,2})$/);
          let horarioBuscado = null;
          if (horarioCompletoMatch) {
            horarioBuscado = `${String(horarioCompletoMatch[1]).padStart(2,'0')}:${horarioCompletoMatch[2]}`;
          } else if (horaCheiaMatch) {
            horarioBuscado = `${String(horaCheiaMatch[1]).padStart(2,'0')}:00`;
          }
          if (horarioBuscado) {
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
        
        // 4. Verificar se cliente mencionou data ou confirmou o agendamento já proposto
        if (!agendamentoParaCancelar) {
          const dataMatch = messageText.match(/(\d{1,2})\/(\d{1,2})|dia\s*(\d{1,2})/i);
          const dia = dataMatch?.[1] || dataMatch?.[3];
          const mes = dataMatch?.[2] || String(new Date().getMonth() + 1);
          let dataRef = dia ? `${new Date().getFullYear()}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}` : null;
          let horarioRef = null;
          if (!dataRef && /\b(sim|confirmo|ok|pode|prosseguir|isso|exato|quero cancelar|pode cancelar|sim quero cancelar|cancelar)\b/i.test(msgLower)) {
            const ultimaAssist = [...historicoMensagensRaw].reverse().find(m => m.role === 'assistant')?.content || '';
            const dm = ultimaAssist.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            const hm = ultimaAssist.match(/(?:às|as)\s*(\d{2}:\d{2})/i);
            if (/posso prosseguir com o cancelamento|você deseja cancelar/i.test(ultimaAssist.toLowerCase())) { dataRef = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null; horarioRef = hm?.[1] || null; }
          }
          if (dataRef) {
            const candidato = agendamentosFuturos.find(ag => ag.data_agendamento === dataRef && (!horarioRef || ag.horario === horarioRef));
            if (candidato) { agendamentoParaCancelar = candidato.id; console.log(`✅ Cancelamento identificado por data/contexto: ${candidato.id}`); }
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
          const cancelou = await executarCancelamento(agendamentoParaCancelar);
          if (cancelou) {
            agendamentoCancelado = true;
            const agCancelado = agendamentosFuturos.find(a => a.id === agendamentoParaCancelar);
            const medicoCanc = agCancelado ? medicosMap[agCancelado.medico_id] : null;
            const dataObjCanc = agCancelado ? new Date(agCancelado.data_agendamento + 'T12:00:00') : null;
            const dataFmtCanc = dataObjCanc ? dataObjCanc.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : '';
            const querRemarcar = /remarcar|adiar|mudar.*data|mudar.*hor[áa]rio/i.test(messageText) || /remarcar|adiar/i.test(historicoConversa || '');
            let respostaCancelamento = `✅ Agendamento cancelado com sucesso!\n\n❌ *Cancelado:* ${agCancelado?.tipo_servico || 'Consulta'} - ${dataFmtCanc} às ${agCancelado?.horario || ''}${medicoCanc ? ` com ${medicoCanc.nome} (${medicoCanc.especialidade || ''})` : ''}\n\n`;
            if (querRemarcar) {
                respostaCancelamento += `Para quando você gostaria de remarcar?`;
                if (medicoCanc) respostaCancelamento += ` Posso ver os próximos horários disponíveis para ${medicoCanc.especialidade || 'essa consulta'}.`;
            } else {
                respostaCancelamento += `Se precisar de mais alguma coisa, estou à disposição! 😊`;
            }
            try {
              const cCancelHist = await buscarContatoPorTelefone(phoneNumber);
              if (cCancelHist) {
                const historicoAtualCancel = cCancelHist.historico_mensagens || [];
                const timestampCancel = new Date().toISOString();
                historicoAtualCancel.push(
                  { role: 'user', content: messageText, timestamp: timestampCancel, messageId },
                  { role: 'assistant', content: respostaCancelamento, timestamp: timestampCancel }
                );
                await base44.asServiceRole.entities.Contato.update(cCancelHist.id, {
                  historico_mensagens: historicoAtualCancel.slice(-50),
                  ultima_interacao: timestampCancel,
                  ultima_mensagem: messageText,
                  ultima_resposta: respostaCancelamento
                });
              }
            } catch (e) {}
            await liberarLock(base44, phoneNumber);
            return Response.json({ success: true, resposta: respostaCancelamento, cancelamento_executado: true });
          } else {
            console.log('❌ Falha ao executar cancelamento'); await liberarLock(base44, phoneNumber); return Response.json({ success: true, resposta: 'Não consegui concluir o cancelamento no sistema agora. Por favor, tente novamente em instantes.', cancelamento_executado: false });
          }
        } else {
          console.log('⚠️ Não foi possível identificar qual agendamento cancelar');
          await liberarLock(base44, phoneNumber);
          return Response.json({
            success: true,
            resposta: agendamentosFuturos.length > 1
              ? 'Para cancelar corretamente, me responda com o número da opção, a data exata ou o horário exato da consulta.'
              : 'Para cancelar corretamente, me confirme a data exata ou o horário exato da consulta.',
            cancelamento_executado: false
          });
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

    let todosMedicosParaDeteccao = [], respostaQuemAtendeDia = null;
    try {
      const _raw = await Promise.race([base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 3000))]);
      todosMedicosParaDeteccao = _raw.filter(m => !/(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i.test(m.nome || ''));
    } catch (e) { console.warn('⚠️ Timeout médicos:', e.message); }
    const _pqad=/quem\s+(vai\s+)?atender|quem\s+atende|quais?\s+(m[eé]dicos?|profissionais?).*(atendem|atender)|qual\s+(m[eé]dico|profissional).*(atende|vai atender)/i.test(messageText||'')&&/segunda|terça|terca|quarta|quinta|sexta|s[áa]bado|domingo|hoje|amanh[ãa]/i.test(messageText||'');
    if(_pqad){const n=normalizarTexto(messageText||''),mapa=[['domingo',0,'domingo'],['segunda',1,'segunda-feira'],['terca',2,'terça-feira'],['terça',2,'terça-feira'],['quarta',3,'quarta-feira'],['quinta',4,'quinta-feira'],['sexta',5,'sexta-feira'],['sabado',6,'sábado'],['sábado',6,'sábado']];let dia=null,rot='';if(n.includes('amanha')){const d=new Date();d.setDate(d.getDate()+1);dia=d.getDay();rot='amanhã';}else if(n.includes('hoje')){dia=new Date().getDay();rot='hoje';}else{const ach=mapa.find(([t])=>n.includes(t));if(ach){dia=ach[1];rot=ach[2];}}if(dia!==null){const lista=todosMedicosParaDeteccao.filter(m=>(m.horarios_atendimento||[]).some(h=>!h.bloqueado&&!h.data_especifica&&Math.floor(h.dia_semana)===dia&&(h.recorrencia||'Toda Semana')!=='Apenas uma vez'));respostaQuemAtendeDia=lista.length?`Na ${rot}, temos estes profissionais com agenda cadastrada:\n\n${lista.map(m=>`• ${m.nome} (${m.especialidade||'Especialidade não informada'})`).join('\n')}`:`No momento, não há profissionais com agenda cadastrada para ${rot}.`;}}

    // ======= PASSO 1: Buscar ESPECIALIDADE na MENSAGEM do cliente =======
    for (const esp of especialidades) {
      if (msgLower.includes(normalizarTexto(esp))) { especialidadeDetectada = esp; console.log(`🎯 Especialidade detectada: ${esp}`); break; }
    }
    // Declarar variáveis de contexto ANTES de usá-las
    const ultimasRespostasAssistenteObj=historicoMensagensRaw.filter(m=>m.role==='assistant');
    const ultimaMsgAssistenteFull=ultimasRespostasAssistenteObj.length>0?ultimasRespostasAssistenteObj[ultimasRespostasAssistenteObj.length-1].content:'';
    const msgTrimLower = messageText.trim().toLowerCase();

    if(!especialidadeDetectada){for(const m of todosMedicosParaDeteccao){const pn=normalizarTexto(m.nome).split(' ').filter(p=>p.length>3&&!/^(dr\.?|dra\.?|de|da|do|dos|das)$/i.test(p));const pe=pn.filter(p=>msgLower.includes(p));if(pe.length>=2||pe.some(p=>p.length>=6)){medicoEspecificoDetectado=m;especialidadeDetectada=m.especialidade;console.log(`🎯 Médico específico: ${m.nome} (${m.especialidade})`);break;}}}
    // PASSO 2.5: Médico na última resp. do assistente + cliente confirmou com "sim"
    if(!especialidadeDetectada&&!medicoEspecificoDetectado&&ultimaMsgAssistenteFull){const uaN=normalizarTexto(ultimaMsgAssistenteFull);for(const m of todosMedicosParaDeteccao){const pn=normalizarTexto(m.nome).split(' ').filter(p=>p.length>3&&!/^(dr\.?|dra\.?|de|da|do|dos|das)$/i.test(p));const pe=pn.filter(p=>uaN.includes(p));if(pe.length>=2||pe.some(p=>p.length>=6)){if(/^(sim|s|ok|quero|pode|claro|bora|vamos|isso|yes|vou|gostaria|quero\s*sim|agendar)$/i.test(msgTrimLower)){medicoEspecificoDetectado=m;especialidadeDetectada=m.especialidade;console.log(`🎯 Médico confirmação: ${m.nome}`);break;}}}}
    if(!especialidadeDetectada&&!medicoEspecificoDetectado){const hcl=normalizarTexto((historicoConversa||'').split('\n').filter(l=>l.startsWith('CLIENTE:')).map(l=>l.replace('CLIENTE:','')).join(' '));for(const esp of especialidades){if(hcl.includes(normalizarTexto(esp))){especialidadeDetectada=esp;break;}}if(!especialidadeDetectada){for(const m of todosMedicosParaDeteccao){const pn=m.nome.toLowerCase().split(' ').filter(p=>p.length>3);if(pn.some(p=>historicoLower.includes(p))){medicoEspecificoDetectado=m;especialidadeDetectada=m.especialidade;break;}}}}

    if(ehPerguntaSobreCartao||respostaCurtaEmContextoCartao){especialidadeDetectada=null;medicoEspecificoDetectado=null;}
    const agendamentoRecenteConcluido=/Agendamento confirmado|Te aguardamos|Lembre-se de trazer documento/i.test(ultimaMsgAssistenteFull);
    
    if(agendamentoRecenteConcluido){const _mte=especialidades.some(e=>normalizarTexto(messageText).includes(normalizarTexto(e)));const _mtm=todosMedicosParaDeteccao.some(m=>m.nome.toLowerCase().split(' ').filter(p=>p.length>3).some(p=>msgLower.includes(p)));if(!_mte&&!_mtm){especialidadeDetectada=null;medicoEspecificoDetectado=null;}}
    const clienteRecusandoAgendar=/n[aã]o\s*(quero|preciso|desejo|vou|queria)?\s*(agendar|marcar|consulta)|n[aã]o\s*[,.]?\s*(obrigad|valeu|brigad)|deixa\s*(pra\s*l[aá]|quieto)|agora\s*n[aã]o|depois|sem\s*agendar/i.test(messageText);
    const historicoTemEspecialidadeCheck=historicoConversa&&/clínico|clinico|cardiolog|dermatolog|ginecolog|nutrici|psicolog|ortoped|urolog|geriatr|gastro|reumato|psiquiatr|fisioterap|oftalmolog|otorrino|pediatr|pneumolog|neurolog|quiroprax|massoterap|optometr|hidro|pilates|odontolog|dentist|endocrinolog|Dr\.|👨‍⚕️/i.test(historicoConversa);

    const ehPerguntaPreco = ehPerguntaPrecoEarly;
    const ehPerguntaInformativa = ehPerguntaInformativaEarly;
    const temEspecialidadeOuMedico = especialidadeDetectada || medicoEspecificoDetectado;
    const iaPerguntoSeQuerAgendar = /gostaria de agendar|quer agendar|deseja agendar|posso agendar|agendar.*\?|como posso te ajudar|qual especialidade|para qual especialidade|agendar uma consulta|gostaria de remarcar|quer remarcar|deseja remarcar/i.test(ultimaMsgAssistenteFull);
    const clienteConfirmouAgendar = iaPerguntoSeQuerAgendar && /^(sim|s|ok|quero|pode|claro|bora|vamos|isso|por favor|yes|vou|gostaria|please|quero\s*sim|sim\s*quero|com certeza|agendar|quero\s*agendar|sim\s*por\s*favor)$/i.test(msgTrimLower);
    const iaPerguntoComoAjudar = /qual especialidade|para qual especialidade/i.test(ultimaMsgAssistenteFull);
    const clienteRespondeuComEspecialidade = iaPerguntoComoAjudar && especialidadeDetectada && !ehPerguntaInformativa && !ehPerguntaSobreCartao;
    const iaPerguntoSeQuerAgendarConsulta = /gostaria de agendar|quer agendar|deseja agendar|posso agendar|agendar uma consulta com ele|agendar.*com|gostaria de remarcar|quer remarcar|deseja remarcar/i.test(ultimaMsgAssistenteFull);
    const perguntaVagaOuHorario = /quando\s*(tem|tem\s*vaga|tem\s*hor[áa]rio|posso|d[áa]\s*pra)|tem\s*(vaga|hor[áa]rio)|pr[óo]ximo\s*(hor[áa]rio|dia|vaga)|qual\s*(hor[áa]rio|dia|vaga)/i.test(messageText);
    const clientePerguntouSobreVagaAposOferta = iaPerguntoSeQuerAgendarConsulta && perguntaVagaOuHorario;
    const clienteEscolhendoHorario = /hoje|\d{1,2}[h:]?\s*(?:horas?)?|\d{1,2}:\d{2}|amanhã|segunda|terça|quarta|quinta|sexta|sábado/i.test(messageText);
    const clienteAceitouAgendar = iaPerguntoSeQuerAgendarConsulta && (/^(quero|sim|s|ok|pode|claro|bora|vamos|isso|por favor|yes|vou|gostaria|please|quero\s*sim|sim\s*quero|com certeza|agendar|quero\s*agendar|sim\s*por\s*favor)$/i.test(msgTrimLower) || perguntaVagaOuHorario || clienteEscolhendoHorario);
    const ehPerguntaDisponibilidadeMedico = temEspecialidadeOuMedico && (/vai\s+(atender|estar|vir)|atende\b|est[áa]\s+(atendendo|na)|quando\s+(atende|vai|ele|ela|o\s+dr)|que\s+dia|tem\s+(?:hor[áa]rio|vaga|agenda|atendimento)|pr[óo]xim[ao]\s+(dia|vez|atend)/i.test(messageText) || /(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|hoje|amanh[ãa]|semana\s+que\s+vem|pr[óo]xim[ao]).*(?:atend|consult|vai|estar)/i.test(messageText) || /(?:dr|doutor|doutora|dentista).*(?:vai|estar|atend|vem|vir)/i.test(messageText) || /que\s+dia.*(?:atend|consult|dentist)/i.test(messageText));
    const querAgendarMensagem = !clienteRecusandoAgendar && !ehPerguntaPreco && !ehPerguntaSobreCartao && !respostaCurtaEmContextoCartao && (/agendar|marcar|consulta|hor[áa]rio|dispon[íi]vel|vaga|atendimento/i.test(messageText) || clientePerguntouSobreVagaAposOferta || ehPerguntaDisponibilidadeMedico || clienteAceitouAgendar);
    const ultimasMensagensUsuarioObj = historicoMensagensRaw.filter(m => m.role === 'user');
    const ultimaMsgUsuarioFull = ultimasMensagensUsuarioObj.length > 0 ? ultimasMensagensUsuarioObj[ultimasMensagensUsuarioObj.length - 1].content : '';
    const jaEmFluxoAgendamento = !clienteRecusandoAgendar && !agendamentoRecenteConcluido && ultimaMsgUsuarioFull && /agendar|marcar|consulta|vamos agendar|seguir com o agendamento/i.test(ultimaMsgUsuarioFull);
    const querAgendar = !querCancelar && !agendamentoRecenteConcluido && !ehPerguntaSobreCartao && !respostaCurtaEmContextoCartao && (querAgendarMensagem || jaEmFluxoAgendamento || clienteConfirmouAgendar || clienteRespondeuComEspecialidade || clienteAceitouAgendar);
    
    // Se cliente está em fluxo de VERIFICAÇÃO, NÃO entrar em fluxo de AGENDAMENTO
    if (querVerificarAgendamento) {
      console.log('ℹ️ Cliente em fluxo de VERIFICAÇÃO - pulando lógica de agendamento');
    } else {
      // Cliente quer AGENDAR - processar normalmente
    
    const ecografiaNorm = normalizarTexto(especialidadeDetectada || '');
    const ehEcografia = ['ecografia', 'ecocardiograma', 'eco', 'ultrassom', 'ultrassonografia'].some(t => ecografiaNorm.includes(t));
    if (ehEcografia) {
      let medicosEcoTodos = [];
      try {
        const todosMedicosGeral = await base44.asServiceRole.entities.Medico.list();
        medicosEcoTodos = todosMedicosGeral.filter(m => {
          const espNorm = normalizarTexto(m.especialidade || '');
          const espsNorm = (m.especialidades || []).map(e => normalizarTexto(e));
          return espNorm.includes('ecocardiograma') || espNorm.includes('ecografia') || espsNorm.some(e => e.includes('ecocardiograma') || e.includes('ecografia'));
        });
      } catch (e) {}
      if (medicosEcoTodos.length > 0 && !medicosEcoTodos.some(m => m.status === 'Ativo')) {
        infoDisponibilidade = `\n\n⚠️ ECOGRAFIA/ECOCARDIOGRAMA - MÉDICO DE FÉRIAS: O profissional ${medicosEcoTodos.map(m => m.nome).join(', ')} está de FÉRIAS. Informe que a clínica FAZ ecografias, mas a agenda reabrirá em breve.`;
      }
    }
    
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
        /segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|hoje|amanh[ãa]/i.test(messageText) || /dr\.?\s*\w+/i.test(messageText) ||
        /^(sim|quero|ok|pode|claro|esse|essa|este|esta|o primeiro|a primeira|o segundo|a segunda|qualquer)\b/i.test(messageText.trim())
      ) && /Dr\.|👨‍⚕️|\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull);
      
      // Verificar se disponibilidades já foram mostradas (com horários reais no formato que usamos)
      // Padrões: "12/02: 13:15", "Dr. Altamiro" + "13:15", "quinta-feira, 12/02: 13:15"
      // TAMBÉM detectar quando o assistente mostrou lista de médicos com horários
      const jaShowouDisponibilidades = (
        /\d{2}\/\d{2}.*\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull) || 
        (/Dr\.\s+\w+/i.test(ultimaMsgAssistenteFull) && /\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull)) ||
        /Qual médico.*prefere|Qual horário.*prefere|qual.*você.*prefere/i.test(ultimaMsgAssistenteFull)
      );

      const isPerguntaNovaDisponibilidade = ehPerguntaDisponibilidadeMedico || /outr[oa] (dia|m[eê]s|semana|hor[áa]rio|m[eé]dico)/i.test(messageText) || /ele atende\b|ela atende\b/i.test(messageText);

      if (clienteEstaEscolhendoHorario || (jaShowouDisponibilidades && !isPerguntaNovaDisponibilidade)) {
        console.log('⏭️ Cliente está escolhendo/respondendo - NÃO rebuscando disponibilidades');
        infoDisponibilidade = `\n\n✅ DISPONIBILIDADES JÁ FORAM MOSTRADAS AO CLIENTE ANTERIORMENTE.
O cliente está ESCOLHENDO/RESPONDENDO. Ele disse: "${messageText}"

🚨 REGRAS ABSOLUTAS:
1. NÃO diga que não há horários! O cliente está respondendo à lista que você já apresentou.
2. NÃO diga "infelizmente não temos horários disponíveis" - você ACABOU de mostrar horários!
3. Se ele mencionou um médico e horário/data, REPITA usando EXATAMENTE o horário que VOCÊ ofereceu para aquele dia. Ex: se você ofereceu "Sexta 06/03: 10:00" e cliente disse "sexta dia 6", responda "Perfeito, horário escolhido: sexta dia 6 às 10:00". NUNCA use um horário que não foi oferecido!
4. DEPOIS peça: "Preciso do seu nome completo e data de nascimento (DD/MM/AAAA) para prosseguir no sistema."
5. O SISTEMA só cria o agendamento depois da validação real dos dados. NUNCA prometa que já agendou.
6. NÃO repita a lista de disponibilidades! O cliente JÁ viu a lista.
7. 🚨 NUNCA diga "sua presença está confirmada", "agendamento confirmado", "agendamento realizado" ou "te aguardamos" sem retorno real do sistema.
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

          const sinonimos={'clinico geral':['clinico geral','clinica geral','medico geral','check-up','checkup'],'nutricao':['nutricao','nutricionista','dieta','emagrecer'],'fisioterapia':['fisioterapia','fisioterapeuta','rpg','reabilitacao'],'psicologia':['psicologia','psicologo','psicologa','ansiedade','depressao'],'geriatria':['geriatria','geriatra','idoso','terceira idade'],'ortopedia':['ortopedia','ortopedista','fratura','coluna','joelho','traumatologia','traumatologista'],'ecocardiograma':['ecocardiograma','ecografia','eco','ultrassom','ultrassonografia'],'psiquiatria':['psiquiatria','psiquiatra'],'urologia':['urologia','urologista','prostata'],'cardiologia':['cardiologia','cardiologista','coracao','arritmia','hipertensao'],'dermatologia':['dermatologia','dermatologista','pele','acne'],'ginecologia':['ginecologia','ginecologista','preventivo','papanicolau'],'gastroenterologia':['gastroenterologia','gastro','gastroenterologista','estomago','refluxo'],'neurologia':['neurologia','neurologista','enxaqueca','convulsao','neuropediatra'],'oftalmologia':['oftalmologia','oftalmologista','catarata','glaucoma'],'otorrinolaringologia':['otorrinolaringologia','otorrino','sinusite','rinite'],'pediatria':['pediatria','pediatra','crianca'],'pneumologia':['pneumologia','pneumologista','asma','bronquite'],'reumatologia':['reumatologia','reumatologista','artrite','fibromialgia'],'odontologia':['odontologia','dentista','ortodontia'],'endocrinologia':['endocrinologia','endocrinologista','tireoide','diabetes'],'quiropraxia':['quiropraxia','quiropraxista'],'massoterapia':['massoterapia','massoterapeuta','drenagem linfatica'],'optometria':['optometria','optometrista'],'hidroginastica':['hidroginastica','hidroterapia','natacao','piscina'],'pilates':['pilates'],'psicopedagogia':['psicopedagogia','psicopedagoga'],'eletrocardiograma':['eletrocardiograma','ecg']};

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
        const diasAfrente = 30;
        const _hojeI = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        for (const medico of medicosParaBuscar) {
          const disponibilidadesMedico = [];
          for (let i = 0; i < diasAfrente; i++) {
            const dc = new Date(); dc.setDate(dc.getDate()+i);
            const df = dc.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            try {
              const slotRes = await Promise.race([base44.asServiceRole.functions.invoke('getAvailableSlots',{medico_id:medico.id,data:df}),new Promise((_,r)=>setTimeout(()=>r(new Error('T')),3000))]);
              const slots = slotRes?.data?.available_slots || [];
              // Filtrar horários passados se for hoje
              const slotsValidos = df===_hojeI ? slots.filter(h=>{const[hh,mm]=h.split(':').map(Number);const agora=new Date();const slotDate=new Date();slotDate.setHours(hh,mm,0,0);return slotDate>agora;}) : slots;
              if(slotsValidos.length>0){
                disponibilidadesMedico.push({data:df,data_formatada:dc.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'2-digit'}),horarios:slotsValidos.slice(0,5)});
                if(disponibilidadesMedico.length>=5) break;
              }
            } catch(e){ console.warn('⚠️ Slot err:',e.message); }
          }
          if(disponibilidadesMedico.length>0){
            disponibilidadesEncontradas.push({medico_id:medico.id,medico_nome:medico.nome,especialidade:medico.especialidade,disponibilidades:disponibilidadesMedico});
          }
        }

        if (disponibilidadesEncontradas.length > 0) {
        const _amD=new Date();_amD.setDate(_amD.getDate()+1);const _amI=_amD.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
        infoDisponibilidade = `\n\n📅 DISPONIBILIDADES ENCONTRADAS:\n🚨HOJE=${_hojeI} AMANHÃ=${_amI}. Se perguntam "amanhã?" e ${_amI} NÃO está abaixo→"NÃO há amanhã, próximo é [1º abaixo]".\n`;
        for(const medico of disponibilidadesEncontradas){infoDisponibilidade+=`\n👨‍⚕️ *${medico.medico_nome}* (${medico.especialidade}) [ID: ${medico.medico_id}]\n`;for(const d of medico.disponibilidades.slice(0,3)){if(!d.horarios?.length)continue;const mn=d.horarios.find(h=>parseInt(h.split(':')[0])<12);const td=d.horarios.find(h=>parseInt(h.split(':')[0])>=12);const ts=[mn?`Manhã: ${mn}`:null,td?`Tarde: ${td}`:null].filter(Boolean).join(' | ');infoDisponibilidade+=`   📅 ${d.data_formatada}: ${ts}\n`;}}
          infoDisponibilidade+=disponibilidadesEncontradas.length>1?'\n⚠️ Apresente médicos e PRÓXIMO horário de cada turno. Pergunte qual prefere.':'\n⚠️ Apresente PRÓXIMO horário de cada turno. Pergunte qual prefere.';
          infoDisponibilidade+='\n⚠️ Para confirmar: nome completo e data nascimento.';
          console.log('✅ Disponibilidades:', disponibilidadesEncontradas.length, 'médicos');
        } else if (medicosParaBuscar.length > 0) {
          // FALLBACK: getAvailableSlots retornou vazio - calcular disponibilidade diretamente dos horários de atendimento
          console.log('⚠️ getAvailableSlots vazio. Fallback direto...');
          const _nDs=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
          let _fbDisp=[];
          for(const med of medicosParaBuscar){const hc=med.horarios_atendimento||[];if(!hc.length)continue;const diasM=[];
            for(let i=0;i<30&&diasM.length<5;i++){const dc=new Date();dc.setDate(dc.getDate()+i);const df=dc.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});const ds=dc.getDay();
              const hEsp=hc.filter(h=>h.data_especifica===df&&!h.bloqueado);const hRec=hc.filter(h=>!h.data_especifica&&!h.bloqueado&&Math.floor(h.dia_semana)===ds);
              const hV=hEsp.length>0?hEsp:hRec;if(!hV.length)continue;
              const tc=med.tempo_consulta_minutos||30;let sl=0;for(const p of hV){const[ih,im]=p.horario_inicio.split(':').map(Number);const[fh,fm]=p.horario_fim.split(':').map(Number);sl+=Math.floor(((fh*60+fm)-(ih*60+im))/tc);}
              try{const ag=await Promise.race([base44.asServiceRole.entities.Agendamento.filter({medico_id:med.id,data_agendamento:df}),new Promise((_,r)=>setTimeout(()=>r(new Error('T')),2000))]);sl=Math.max(0,sl-ag.filter(a=>a.status!=='Cancelado').length);}catch(e){}
              if(sl>0){diasM.push({df,fmt:dc.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'2-digit'}),hi:hV[0].horario_inicio,hf:hV[0].horario_fim,sl});}
            }
            if(diasM.length>0)_fbDisp.push({id:med.id,nome:med.nome,esp:med.especialidade,dias:diasM});
          }
          if(_fbDisp.length>0){console.log('✅ Fallback:',_fbDisp.length,'médicos');const _am2=new Date();_am2.setDate(_am2.getDate()+1);const _amI2=_am2.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
            infoDisponibilidade=`\n\n📅 DISPONIBILIDADES ENCONTRADAS:\n🚨HOJE=${_hojeI} AMANHÃ=${_amI2}.\n`;
            for(const m of _fbDisp){infoDisponibilidade+=`\n👨‍⚕️ *${m.nome}* (${m.esp}) [ID: ${m.id}]\n`;for(const d of m.dias.slice(0,3)){infoDisponibilidade+=`   📅 ${d.fmt}: ${d.hi} às ${d.hf} (~${d.sl} vagas)\n`;}}
            infoDisponibilidade+=_fbDisp.length>1?'\n⚠️ Apresente médicos e próximos dias. Pergunte qual prefere.':'\n⚠️ Apresente próximos dias. Pergunte qual prefere.';
            infoDisponibilidade+='\n⚠️ Para confirmar: nome completo e data nascimento.';
          }else{
            infoDisponibilidade=`\n\n⚠️ HORÁRIOS ESGOTADOS para ${especialidadeDetectada||'esta especialidade'}.\n🚨 NÃO diga "todos os horários estão ocupados nos próximos 30 dias". Diga que os horários estão preenchidos e sugira ligar (51) 3661-5991 para encaixes. Seja POSITIVO.`;
          }
        } else if (medicosParaBuscar.length === 0 && especialidadeDetectada) {
          infoDisponibilidade = `\n\n❌ ESPECIALIDADE NÃO DISPONÍVEL: "${especialidadeDetectada}"\nNão temos profissionais de ${especialidadeDetectada} cadastrados. Informe ao cliente e sugira ligar 51 3661-5991.`;
        } else {
          infoDisponibilidade = '\n\n⚠️ Sem disponibilidades. Sugira ligar 51 3661-5991.';
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
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(messageText.trim()) ||
      /[A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+.*\d{1,2}\/\d{1,2}\/\d{4}/.test(messageText) ||
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
- 🚨🚨 REGRA ABSOLUTAMENTE CRÍTICA SOBRE HORÁRIOS: O horario extraído DEVE ser EXATAMENTE um dos horários listados pelo ASSISTENTE no histórico da conversa. Procure a mensagem onde o assistente mostrou disponibilidades (ex: "Segunda 2/03: 08:00", "Sexta 6/03: 10:00"). Se o cliente escolheu "sexta dia 6" e o horário oferecido para sexta dia 6 foi "10:00", extraia horario="10:00". NUNCA invente horário (como 14:00) que NÃO foi oferecido. Se não especificou horário, use o PRIMEIRO horário oferecido para o dia escolhido.

Retorne JSON.`;

        let extracao = { dados_completos: false, nome_paciente: null, data_nascimento: null, medico_nome: null, medico_id: null, data_agendamento: null, horario: null };
        try {
          const _extR = await Promise.race([fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${Deno.env.get('OPENAI_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:promptExtracao+'\n\nRetorne APENAS JSON válido.'}],max_tokens:500,temperature:0,response_format:{type:'json_object'}})}), new Promise((_,r)=>setTimeout(()=>r(new Error('Timeout')),15000))]);
          if (_extR.ok) { const _ed=await _extR.json(); try { extracao=JSON.parse(_ed.choices?.[0]?.message?.content||'{}'); } catch(e){} }
          else console.warn('⚠️ OpenAI extração HTTP:', _extR.status);
        } catch(_ee){ console.warn('⚠️ Erro extração OpenAI:', _ee.message); }

        console.log('📊 Extração de dados:', JSON.stringify(extracao));
        // VALIDAÇÃO: horário extraído deve ter sido oferecido no histórico
        if(extracao.horario&&extracao.data_agendamento&&historicoConversa&&!historicoConversa.includes(extracao.horario)){console.warn('⚠️ Horário NÃO oferecido:',extracao.horario);const dO=new Date(extracao.data_agendamento+'T12:00:00');const dN=String(dO.getDate()).padStart(2,'0');const mN=String(dO.getMonth()+1).padStart(2,'0');const hA=historicoMensagensRaw.filter(m=>m.role==='assistant').map(m=>m.content).join('\n');const rx=new RegExp(`(?:${dN}[/.]${mN}|dia\\s*${parseInt(dN)})[^\\n]*(\\d{2}:\\d{2})`,'gi');const mt=[...(hA.matchAll(rx))];if(mt.length>0){console.log(`🔧 Corrigindo ${extracao.horario}→${mt[0][1]}`);extracao.horario=mt[0][1];}}
        // Verificar quais dados faltam
            if (!extracao.nome_paciente) dadosFaltantes.push('nome completo');
            if (!extracao.data_nascimento) dadosFaltantes.push('data de nascimento');

        // Só adiciona médico/data/horário como faltantes se o cliente ainda não escolheu
        const jaEscolheuMedico = historicoConversa && /(Dr\.|👨‍⚕️|médico|doutor)/i.test(historicoConversa) && (extracao.medico_nome || extracao.medico_id);
        const jaEscolheuHorario = historicoConversa && /\d{1,2}[h:]|14:00|15:00|16:00|hora/i.test(historicoConversa) && extracao.horario;

        if (!extracao.medico_nome && !extracao.medico_id && !jaEscolheuMedico) dadosFaltantes.push('médico');
        if (!extracao.data_agendamento) dadosFaltantes.push('data da consulta');
        if (!extracao.horario && !jaEscolheuHorario) dadosFaltantes.push('horário');

        // VALIDAÇÃO: nome deve ter 2+ palavras, data nascimento formato DD/MM/YYYY
        const _nV=extracao.nome_paciente&&extracao.nome_paciente.trim().split(/\s+/).length>=2&&extracao.nome_paciente.trim().length>=5;
        const _dV=extracao.data_nascimento&&/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(extracao.data_nascimento.trim());
        if(!_nV||!_dV){console.log('⚠️ Dados paciente insuficientes:',{nome:extracao.nome_paciente,nV:_nV,dn:extracao.data_nascimento,dV:_dV});extracao.dados_completos=false;if(!_nV&&!dadosFaltantes.includes('nome completo'))dadosFaltantes.push('nome completo');if(!_dV&&!dadosFaltantes.includes('data de nascimento'))dadosFaltantes.push('data de nascimento');}
        const mensagemEhPerguntaNova=/\?|quanto custa|qual valor|pre[cç]o|valor da consulta|valor do exame|onde fica|endere[cç]o|telefone|conv[eê]nio|convenio/i.test(messageText||'');
        const assistentePediuConfirmacaoHorario=/você gostaria de agendar esse horário|gostaria de agendar esse horário|quer agendar esse horário|posso confirmar esse horário/i.test(ultimaMsgAssistenteFull||'');
        const assistentePediuDadosParaFinalizar=/nome completo|data de nascimento|dd\/mm\/aaaa|para finalizar|para confirmar|para prosseguir/i.test(ultimaMsgAssistenteFull||'');
        const clienteConfirmouOuEscolheu=/^(sim|s|ok|quero|pode|claro|isso|esse|essa|confirmo|pode ser|vamos|fechado|certo|correto)$/i.test((messageText||'').trim())||/\d{1,2}[:h]\d{2}|\d{1,2}\/\d{1,2}|segunda|ter[cç]a|quarta|quinta|sexta|s[áa]bado|amanh[ãa]|hoje/i.test(messageText||'');
        const clienteEnviouDadosPessoaisNaMensagem=/\d{1,2}\/\d{1,2}\/\d{4}/.test(messageText||'')&&/[A-Za-zÀ-ÿ]{2,}.*\d{1,2}\/\d{1,2}\/\d{4}/.test(messageText||'');
        const podeCriarAgendamentoAgora=!mensagemEhPerguntaNova&&((assistentePediuConfirmacaoHorario&&clienteConfirmouOuEscolheu)||(assistentePediuDadosParaFinalizar&&clienteEnviouDadosPessoaisNaMensagem));
        if (_nV && _dV && (extracao.medico_nome || extracao.medico_id) && extracao.data_agendamento && extracao.horario && podeCriarAgendamentoAgora) {
          
          console.log('✅ Todos os dados coletados e cliente confirmou, criando agendamento...');
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
              const _agEx = await Promise.race([
                base44.asServiceRole.entities.Agendamento.filter({
                  medico_id: medicoEncontrado.id,
                  data_agendamento: extracao.data_agendamento,
                  horario: extracao.horario
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Agendamentos')), 2000))
              ]);
              agendamentosExistentes = _agEx.filter(a => a.status !== 'Cancelado');
            } catch (e) {
              console.warn('⚠️ Timeout ao buscar agendamentos:', e.message);
            }

            // VALIDAÇÃO CRÍTICA: Verificar se médico REALMENTE atende neste dia/horário
            let horarioValidado=false;
            try{const dAO=new Date(extracao.data_agendamento+'T12:00:00');const dsA=dAO.getDay();const hAM=medicoEncontrado.horarios_atendimento||[];const dBl=hAM.some(h=>h.data_especifica===extracao.data_agendamento&&h.bloqueado);if(!dBl){const hDE=hAM.filter(h=>h.data_especifica===extracao.data_agendamento&&!h.bloqueado);const hDD=hDE.length>0?hDE:hAM.filter(h=>{if(h.bloqueado||h.data_especifica)return false;if(Math.floor(h.dia_semana)!==dsA)return false;const rc=h.recorrencia||'Toda Semana';if(rc==='Toda Semana')return true;if(rc==='Apenas uma vez')return false;const pm=new Date(dAO.getFullYear(),dAO.getMonth(),1);const sm=Math.ceil((dAO.getDate()+pm.getDay())/7);if(rc==='1ª e 3ª Semana do Mês')return sm===1||sm===3;if(rc==='2ª e 4ª Semana do Mês')return sm===2||sm===4;if(rc.includes('1ª'))return sm===1;if(rc.includes('2ª'))return sm===2;if(rc.includes('3ª'))return sm===3;if(rc.includes('4ª'))return sm===4;return false;});if(hDD.length>0){const tcM=medicoEncontrado.tempo_consulta_minutos||30;const[hR,mR]=extracao.horario.split(':').map(Number);const mnR=hR*60+mR;for(const p of hDD){const[ih,im]=p.horario_inicio.split(':').map(Number);const[fh,fm]=p.horario_fim.split(':').map(Number);for(let m=ih*60+im;m+tcM<=fh*60+fm;m+=tcM){if(m===mnR){horarioValidado=true;break;}}if(horarioValidado)break;}}}}catch(vE){console.error('⚠️ Validação:',vE.message);}
            if(!horarioValidado){console.log('🚫 BLOQUEADO: Horário não disponível');mensagemAgendamento=`😔 O horário ${extracao.horario} em ${new Date(extracao.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR')} não está disponível na agenda do(a) ${medicoEncontrado.nome}. Vou buscar os próximos horários disponíveis!`;dadosFaltantes.push('horário válido');}
            else if (agendamentosExistentes.length === 0) {
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
            } else if(agendamentosExistentes.length > 0) {
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
    if(estaConfirmando&&historicoConversa&&/Para confirmar o agendamento|data de nascimento|nome completo/i.test(historicoConversa)){console.log('✅ Cliente confirmando dados');}
    if(agendamentoCriado){
      console.log('🎉 Retornando confirmação de agendamento');
      try{const c=await buscarContatoPorTelefone(phoneNumber);const ts=new Date().toISOString();if(c){const h=c.historico_mensagens||[];h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:mensagemAgendamento,timestamp:ts});await base44.asServiceRole.entities.Contato.update(c.id,{ultima_mensagem:messageText,ultima_resposta:mensagemAgendamento,historico_mensagens:h.slice(-50),ultima_interacao:ts,total_mensagens:(c.total_mensagens||0)+2,agendamentos_realizados:(c.agendamentos_realizados||0)+1,processando_ia_lock:null});}}catch(e){console.error('⚠️ Erro:',e.message);}
      await liberarLock(base44,phoneNumber);
      return Response.json({success:true,resposta:mensagemAgendamento,conversationId:null,agendamento_criado:true});
    }

    if(mensagemAgendamento && !agendamentoCriado){
      console.log('🛑 Bloqueando resposta fictícia e retornando status real do sistema');
      try{const c=await buscarContatoPorTelefone(phoneNumber);const ts=new Date().toISOString();if(c){const h=c.historico_mensagens||[];h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:mensagemAgendamento,timestamp:ts});await base44.asServiceRole.entities.Contato.update(c.id,{ultima_mensagem:messageText,ultima_resposta:mensagemAgendamento,historico_mensagens:h.slice(-50),ultima_interacao:ts,total_mensagens:(c.total_mensagens||0)+2,processando_ia_lock:null});}}catch(e){console.error('⚠️ Erro:',e.message);}
      await liberarLock(base44,phoneNumber);
      return Response.json({success:true,resposta:mensagemAgendamento,conversationId:null,agendamento_criado:false});
    }

    console.log('🤖 Chamando LLM...');
    const agoraBrasilia = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const horaNumero = parseInt(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
    const dataAtualCompleta = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dataAtualISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    // Calcular dia da semana REAL pelo código (0=Dom, 6=Sáb) para evitar alucinação do LLM
    const diaSemanaHoje = new Date().toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    const diaSemanaNum = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(diaSemanaHoje);
    const clinicaAbertaHoje = diaSemanaNum >= 1 && diaSemanaNum <= 5; // Seg-Sex
    const diasSemPt = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
    const statusClinicaHoje = clinicaAbertaHoje
      ? `🏥 A CLÍNICA ESTÁ ABERTA HOJE (${diasSemPt[diaSemanaNum]}), das 08:00 às 19:00. NÃO diga que está fechada!`
      : `🚫 A CLÍNICA ESTÁ FECHADA HOJE (${diasSemPt[diaSemanaNum]}). Funciona segunda a sexta, 08:00 às 19:00.`;
    console.log('📅 Status clínica:', statusClinicaHoje);
    let saudacaoHorario = 'Bom-dia';
    if (horaNumero >= 12 && horaNumero < 18) saudacaoHorario = 'Boa-tarde';
    else if (horaNumero >= 18 || horaNumero < 5) saudacaoHorario = 'Boa-noite';
    const ehPrimeiraMensagem = ehPrimeiraMensagemDefinitiva;
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

          infoProcedimentosExames += `\n🚨 REGRAS: Consulte lista acima ANTES de responder. NÃO invente preços. Para exames de sangue, a clínica faz coleta diária, não precisa agendar.`;
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar procedimentos/exames:', e.message);
      }
    }

    let instrucoesMidia = '';
    if (mediaType === 'image') {
      instrucoesMidia = `\n\n📷 IMAGEM RECEBIDA: O texto da imagem foi extraído via OCR e está no conteúdo da mensagem. LISTE APENAS exames do texto extraído. PROIBIDO inventar. Cruze com tabela de preços. Calcule TOTAL. Mostre Particular E Cartão Mais Vida.\n⚠️ REGRA DOPPLER: "Doppler" NÃO é um exame separado! É um complemento. Ex: "Ecocardiograma" + "Doppler" = UM ÚNICO exame "Ecocardiograma com Doppler". "Ecografia" + "Doppler" = "Ecografia com Doppler". NUNCA liste Doppler como item separado.`;
    } else if (mediaType === 'document') {
      instrucoesMidia = `\n\n📄 DOCUMENTO: LISTE APENAS exames do texto extraído. NÃO invente. Nome ESPECÍFICO+preço INDIVIDUAL. Calcule TOTAL. Mostre Particular E Cartão Mais Vida.\n⚠️ REGRA DOPPLER: "Doppler" NÃO é um exame separado! É um complemento. Ex: "Ecocardiograma" + "Doppler" = UM ÚNICO exame "Ecocardiograma com Doppler". NUNCA liste Doppler como item separado.`;
    } else if (mediaType === 'audio') {
      instrucoesMidia = `\n\n🎤 ÁUDIO: OUÇA e RESPONDA ao conteúdo. Se não entender: "Poderia digitar?"`;
    } else if (mediaType === 'video') {
      instrucoesMidia = `\n\n🎥 VÍDEO: Analise e confirme recebimento.`;
    }
    
    // Preparar histórico para o prompt - formato estruturado para o LLM entender melhor o contexto
    let historicoParaPrompt = '';
    let contextoPreviousConversation = '';
    let infoAgendamentosCliente = '';
    try {
      const tn = phoneNumber.replace(/\D/g, ''); const u8 = tn.slice(-8);
      const tPacs = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
      const pF = tPacs.filter(p => (p.telefone || '').replace(/\D/g, '').slice(-8) === u8);
      if (pF.length > 0) {
        const pIds = pF.map(p => p.id); const hj = new Date().toISOString().split('T')[0];
        const tAgs = await base44.asServiceRole.entities.Agendamento.filter({data_agendamento: {$gte: hj}});
        const aC = tAgs.filter(a => pIds.includes(a.paciente_id) && ['Agendado', 'Confirmado', 'Pago'].includes(a.status));
        if (aC.length > 0) {
          const mds = await base44.asServiceRole.entities.Medico.list(); const mM = {}; mds.forEach(m => { mM[m.id] = m; });
          infoAgendamentosCliente = `\n\n📅 AGENDAMENTOS FUTUROS DESTE CLIENTE NO SISTEMA:\n`;
          aC.forEach(ag => { const md = mM[ag.medico_id]; const dF = new Date(ag.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR'); infoAgendamentosCliente += `- ${ag.tipo_servico} com ${md ? md.nome : 'Médico'} em ${dF} às ${ag.horario} (Status: ${ag.status})\n`; });
          infoAgendamentosCliente += `\n🚨 REGRA CRÍTICA: Se o cliente perguntar sobre seu agendamento, confirmar o horário, ou disser que está chegando, USE ESTES DADOS REAIS. Se o cliente disser um horário diferente do que está no sistema, CORRIJA-O educadamente informando o horário real que consta no sistema. NUNCA concorde com um horário errado!`;
        } else {
          infoAgendamentosCliente = `\n\n📅 AGENDAMENTOS FUTUROS DESTE CLIENTE NO SISTEMA:\nNenhum agendamento futuro encontrado. Se o cliente disser que tem consulta, informe que não consta no sistema e pergunte se deseja agendar.`;
        }
      }
    } catch (e) {}

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
      // Gerar lista de médicos ativos para incluir no prompt (evitar alucinações)
      let listaMedicosAtivosParaPrompt = '';
      try {
        const medicosAtivosPrompt = todosMedicosParaDeteccao.length > 0 
          ? todosMedicosParaDeteccao 
          : await Promise.race([
              base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }),
              new Promise((_, r) => setTimeout(() => r(new Error('T')), 3000))
            ]).then(ms => ms.filter(m => !/(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i.test(m.nome || '')));
        listaMedicosAtivosParaPrompt = medicosAtivosPrompt.map(m => 
          `- ${m.nome} (${m.especialidade}${m.especialidades?.length > 0 ? ' / ' + m.especialidades.join(', ') : ''})`
        ).join('\n');
      } catch (e) {
        console.warn('⚠️ Erro ao gerar lista médicos para prompt:', e.message);
      }

      const promptResult = await base44.asServiceRole.functions.invoke('gerarPromptChat', {
        promptSistema: config.prompt_sistema,
        informacoesInstitucionais: config.informacoes_institucionais || '',
        dataAtualCompleta, dataAtualISO, horaAtual, saudacaoHorario,
        historicoConversa, historicoParaPrompt, ehPrimeiraMensagem, senderName,
        dadosFaltantes, infoDisponibilidade, infoProcedimentosExames,
        instrucoesMidia, infoCancelamento, infoResultadoExame, infoAgendamentosCliente
      });
      promptCompleto = promptResult.data.prompt;
      
      // INJETAR LISTA DE MÉDICOS ATIVOS NO PROMPT (evitar alucinações de médicos inexistentes)
      if (listaMedicosAtivosParaPrompt) {
        promptCompleto += `\n\n🚨🚨🚨 REGRA ABSOLUTAMENTE CRÍTICA - LISTA DE MÉDICOS DA CLÍNICA 🚨🚨🚨
        
Os ÚNICOS médicos e profissionais que trabalham nesta clínica são os listados abaixo.
NUNCA mencione, ofereça ou agende com médicos que NÃO estejam nesta lista.
Se um nome de médico aparecer no histórico da conversa mas NÃO estiver na lista abaixo, esse médico NÃO faz mais parte da clínica.

📋 MÉDICOS ATIVOS CADASTRADOS NO SISTEMA:
${listaMedicosAtivosParaPrompt}

⛔ PROIBIDO:
- Inventar nomes de médicos que não estão na lista acima
- Mencionar médicos que saíram da clínica (ex: se alguém aparece no histórico mas não está na lista, NÃO o mencione)
- Agendar com profissionais inexistentes
- Se o cliente perguntar por um médico que NÃO está na lista, diga que esse profissional não faz mais parte da equipe e ofereça os médicos disponíveis da mesma especialidade`;
      }
    } catch (e) {
      console.warn('⚠️ Erro ao gerar prompt:', e.message);
      promptCompleto = config.prompt_sistema;
    }
    // Injetar status de funcionamento da clínica calculado pelo CÓDIGO (não pelo LLM)
    promptCompleto += `\n\n🚨🚨 REGRA ABSOLUTA - STATUS DA CLÍNICA HOJE (calculado pelo sistema, NÃO pela IA):\n${statusClinicaHoje}\n⚠️ NUNCA contradiga esta informação. Se o sistema diz que está ABERTA, ela está ABERTA. Se diz FECHADA, está FECHADA. Não tente adivinhar o dia da semana - CONFIE nesta informação.`;
    promptCompleto += `\n\n🚨🚨 REGRA ABSOLUTA SOBRE CONFIRMAÇÃO DE AGENDAMENTO 🚨🚨\nVocê NUNCA pode dizer que agendou, confirmou, realizou ou concluiu um agendamento por conta própria.\nSe o sistema não retornou uma confirmação real, responda apenas com o próximo passo necessário ou com a indisponibilidade real.\nSão PROIBIDAS frases como: "agendamento confirmado", "agendamento realizado com sucesso", "te esperamos", "te aguardamos", "vou finalizar o agendamento agora".\nSe ainda faltar qualquer validação do sistema, diga somente o que falta ou informe que o horário não está disponível.`;

    const modeloLLM = config.modelo_llm || 'gpt-4o';
    let llmResponse = null;
    if (respostaQuemAtendeDia) {
      llmResponse = respostaQuemAtendeDia;
    } else if (arquivoParaEnviar) {
      llmResponse = "Encontrei seu resultado! Enviando o arquivo PDF agora mesmo. 📄";
    } else {
      try {
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        const messages = [{ role: 'system', content: promptCompleto }];
        if (historicoMensagensRaw && historicoMensagensRaw.length > 0) {
          historicoMensagensRaw.forEach(m => {
            if (m.role && m.content) {
              let cleanContent = m.content;
              if (m.mediaUrl) cleanContent = cleanContent.replace(m.mediaUrl, '').trim();
              messages.push({ role: m.role, content: cleanContent });
            }
          });
        }
        let cleanMessageText = messageText || '(sem texto)';
        if (mediaUrl) cleanMessageText = cleanMessageText.replace(mediaUrl, '').trim();
        let userContent = [{ type: 'text', text: cleanMessageText || '(sem texto)' }];
        if (mediaUrl && mediaType === 'image') {
          // OTIMIZADO: Enviar imagem DIRETAMENTE ao LLM principal (1 chamada ao invés de 2)
          // gpt-4o-mini suporta vision - elimina etapa OCR separada que levava 10-15s extras
          console.log('📷 Imagem será analisada diretamente pelo LLM principal (sem OCR separado)');
          userContent.push({type:'image_url',image_url:{url:mediaUrl,detail:'low'}});
          userContent[0].text+=`\n\n🚨 ANALISE A IMAGEM ANEXADA. Leia TODO o texto visível (nomes de exames, médico, CRM, datas). LISTE APENAS os exames que aparecem na imagem. PROIBIDO inventar. Cruze com a tabela de preços. Calcule TOTAL Particular E Cartão Mais Vida. Se não conseguir ler, peça foto mais nítida.\n⚠️ "Doppler" NÃO é exame separado! É complemento (ex: "Ecocardiograma + Doppler" = 1 exame "Ecocardiograma com Doppler"). NUNCA liste Doppler como item separado.`;
        } else if (mediaUrl && mediaType === 'document') {
          try {
            const eR = await base44.asServiceRole.functions.invoke('extractPdfText', { fileUrl: mediaUrl });
            if(eR?.data?.text){userContent[0].text+=`\n\n🚨 CONTEÚDO DO PDF 🚨\n${eR.data.text}\n\n🚨 REGRAS: 1.LISTE APENAS exames acima. 2.PROIBIDO inventar. 3.Cruze com tabela. 4.NÃO pergunte se quer agendar coleta. 5."Doppler" NÃO é exame separado! É complemento (ex: "Ecocardiograma + Doppler" = 1 exame). NUNCA liste Doppler como item separado.`;}
            else{userContent[0].text+=`\n\n⚠️ PDF ilegível. Peça foto nítida.`;}
          } catch(e){userContent[0].text+=`\n\n⚠️ PDF ilegível. Peça foto nítida.`;}
        }
        messages.push({ role: 'user', content: userContent });
        // Para imagens, usar gpt-4o-mini com vision (rápido e suporta imagem)
        const body = { model: modeloLLM, messages, max_tokens: 1000, temperature: config.temperatura || 0.7 };
        const openaiResp = await Promise.race([
          fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }),
          new Promise((_, r) => setTimeout(() => r(new Error('Timeout OpenAI 45s')), 45000))
        ]);
        if (openaiResp.ok) {
          const data = await openaiResp.json();
          llmResponse = data.choices?.[0]?.message?.content || null;
        } else {
          console.error('❌ Erro HTTP OpenAI:', openaiResp.status, await openaiResp.text());
        }
      } catch (e) {
        console.error('❌ Erro ao chamar OpenAI:', e.message);
      }
    }
    

    const _tcm=(messageText+' '+(historicoConversa||'')).toLowerCase();
    const motivoIdentificado=_tcm.includes('cancelar')||_tcm.includes('desmarcar')?'Cancelamento':_tcm.includes('resultado')||_tcm.includes('laudo')?'Resultado de Exames':_tcm.includes('orçamento')||_tcm.includes('orcamento')||_tcm.includes('quanto custa')?'Orçamento':_tcm.includes('cartão')||_tcm.includes('mais vida')?'Cartão Mais Vida':_tcm.includes('turma')||_tcm.includes('hidrogin')||_tcm.includes('pilates')||_tcm.includes('natac')||_tcm.includes('nataç')?'Turmas':_tcm.includes('procedimento')?'Procedimentos':_tcm.includes('agendar')||_tcm.includes('marcar')||_tcm.includes('consulta')?'Agendamento':null;

    // Salvar conversa no histórico (user + assistant juntos para evitar duplicação)
    try {
      const cFinal = await buscarContatoPorTelefone(phoneNumber);
      const timestamp = new Date().toISOString();

      if (cFinal) {
        const contato = cFinal;
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

        // TURMAS: Se o cliente perguntou sobre pilates/hidroginástica/natação, mover para pipeline "Turmas"
        if (motivoIdentificado === 'Turmas') {
          updateData.status = 'Turmas';
          console.log('🏊 Contato movido para pipeline Turmas');
        }

        await base44.asServiceRole.entities.Contato.update(contato.id, updateData);
        console.log('✅ Contato atualizado:', contato.id.substring(0, 8));
      } else {
        let tCP = phoneNumber.replace(/\D/g, '');
        if (!tCP.startsWith('55')) tCP = '55' + tCP;
        const novoContatoData = {
          nome: senderName, telefone: tCP, paciente_id: pacienteId,
          ultima_mensagem: messageText, ultima_resposta: llmResponse,
          historico_mensagens: [
            { role: 'user', content: messageText, timestamp, messageId },
            { role: 'assistant', content: llmResponse, timestamp }
          ],
          ultima_interacao: timestamp, total_mensagens: 2,
          origem: 'WhatsApp', status: 'Novo', atendimento_humano: true
        };

        // Adicionar motivo se identificado
        if (motivoIdentificado) {
          novoContatoData.interesses = [motivoIdentificado];
        }

        // TURMAS: Se o cliente perguntou sobre pilates/hidroginástica/natação, criar já com status "Turmas"
        if (motivoIdentificado === 'Turmas') {
          novoContatoData.status = 'Turmas';
          console.log('🏊 Novo contato criado no pipeline Turmas');
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
        const cEnv = await buscarContatoPorTelefone(phoneNumber);
        if (cEnv) {
          const contato = cEnv;
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