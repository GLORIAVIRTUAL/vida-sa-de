import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let { phoneNumber, messageText, senderName, pacienteId, mediaType, mediaUrl, messageId } = await req.json();
    console.log('📨 Processando:', { phoneNumber, messageText: (messageText || '').substring(0, 100), mediaType, mediaUrl: mediaUrl ? mediaUrl.substring(0, 80) : null, messageId });

    if ((!mediaUrl || mediaType === 'text') && messageText) {
      const urlNoTexto = messageText.match(/(https?:\/\/[^\s]+)/i);
      if (urlNoTexto) {
        const u = urlNoTexto[1]; const limpaTxt = (tag) => { messageText = messageText.replace(urlNoTexto[0], '').replace(tag, '').trim(); mediaUrl = u; };
        if (/\[(?:á|a)udio/i.test(messageText)) { mediaType='audio'; limpaTxt(/\[(?:á|a)udio\s*(?:recebido)?\]/gi); messageText=messageText||'[Áudio recebido]'; }
        else if (/\[(?:i|I)magem/i.test(messageText) || /\.(jpg|jpeg|png|webp)/i.test(u) || (/\/files\//i.test(u) && /\[(?:i|I)magem/i.test(messageText))) { mediaType='image'; limpaTxt(/\[(?:i|I)magem\s*(?:recebida)?\]/gi); messageText=messageText||'[Imagem recebida]'; }
        else if (/\.ogg/i.test(u)) { mediaType='audio'; limpaTxt(/$/); messageText=messageText||'[Áudio recebido]'; }
        else if (/\.pdf/i.test(u)) { mediaType='document'; limpaTxt(/$/); messageText=messageText||'[Documento recebido]'; }
        else if (/\/files\//i.test(u) && !/\.pdf/i.test(u)) { mediaType='image'; limpaTxt(/\[.*?\]/gi); messageText=messageText||'[Imagem recebida]'; }
      }
    }

    if (mediaType === 'audio' && mediaUrl) {
      let transcricaoSucesso = false;
      let audioBlob = null;
      try {
        const audioResp = await fetch(mediaUrl, { redirect: 'follow' });
        if (audioResp.ok) {
          audioBlob = await audioResp.blob();
          if (audioBlob.size === 0) audioBlob = null;
        }
      } catch (dlErr) {}
      
      if (audioBlob && audioBlob.size > 0) {
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (openaiKey) {
          let audioExt = 'ogg';
          let audioMime = 'audio/ogg';
          const urlLower = (mediaUrl || '').toLowerCase();
          if (urlLower.includes('.mp3')) { audioExt = 'mp3'; audioMime = 'audio/mpeg'; }
          else if (urlLower.includes('.mp4') || urlLower.includes('.m4a')) { audioExt = 'mp4'; audioMime = 'audio/mp4'; }
          else if (urlLower.includes('.wav')) { audioExt = 'wav'; audioMime = 'audio/wav'; }
          else if (urlLower.includes('.webm')) { audioExt = 'webm'; audioMime = 'audio/webm'; }
          
          for (let tentativa = 1; tentativa <= 2 && !transcricaoSucesso; tentativa++) {
            try {
              const blobCorrigido = new Blob([audioBlob], { type: audioMime });
              const audioFile = new File([blobCorrigido], `audio.${audioExt}`, { type: audioMime });
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
              
              if (whisperResp.ok) {
                const textoTranscrito = await whisperResp.text();
                const textoLimpo = textoTranscrito.trim().replace(/^["']|["']$/g, '').trim();
                if (textoLimpo.length > 0 && textoLimpo.length < 5000) {
                  messageText = textoLimpo;
                  transcricaoSucesso = true;
                }
              } else {
                if (whisperResp.status === 400 && tentativa === 1 && audioExt === 'ogg') {
                  audioExt = 'mp3';
                  audioMime = 'audio/mpeg';
                }
              }
            } catch (whisperErr) {}
          }
        }
      }
    }
    
    const isBufferMessage = messageId && messageId.startsWith('buffer_');
    let lockName = null;
    
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
    
    if (!isBufferMessage && messageId) {
      try {
        const contatoVerif = await buscarContatoPorTelefone(phoneNumber);
        if (contatoVerif) {
          const historicoVerif = contatoVerif.historico_mensagens || [];
          const jaProcessado = historicoVerif.some((m, idx) => {
            if (m.messageId !== messageId || m.role !== 'user') return false;
            return historicoVerif.slice(idx + 1).some(r => r.role === 'assistant');
          });
          if (jaProcessado) return Response.json({ success: true, status: 'duplicata_ignorada', resposta: null });
          
          const lockAtual = contatoVerif.processando_ia_lock || null;
          const agora = Date.now();
          
          // Verificar lock existente
          if (lockAtual) {
            const lockTimestamp = new Date(lockAtual.split('_')[0]).getTime(); // Suporta formato ISO_random
            const lockIdadeMs = agora - lockTimestamp;
            // Aumentar tempo de validade do lock para evitar sobreposição em processamentos lentos (LLM)
            if (lockIdadeMs < 60000) { 
              console.log(`🔒 Lock ativo detectado (${lockIdadeMs}ms). Bloqueando duplicata.`);
              return Response.json({ success: true, status: 'lock_ativo', resposta: null });
            }
          }
          
          // Criar novo lock
          lockName = new Date().toISOString() + '_' + Math.random().toString(36).slice(2, 8);
          await base44.asServiceRole.entities.Contato.update(contatoVerif.id, { processando_ia_lock: lockName });
          
          // Espera maior para garantir propagação e evitar race condition
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Re-verificar se o lock ainda é nosso
          const contatoRecheck = await buscarContatoPorTelefone(phoneNumber);
          if (contatoRecheck && contatoRecheck.processando_ia_lock !== lockName) {
            console.log('🔒 Lock perdido para outra instância. Abortando.');
            return Response.json({ success: true, status: 'lock_perdido', resposta: null });
          }
          
          // Anti-duplicidade de mensagem do usuário: se a mensagem que estamos processando já foi inserida no histórico
          // por outra instância que acabou de rodar, abortar
          if (contatoRecheck && contatoRecheck.historico_mensagens) {
             const ultimasUser = contatoRecheck.historico_mensagens.filter(m => m.role === 'user');
             if (ultimasUser.length > 0) {
                 const ultimaUser = ultimasUser[ultimasUser.length - 1];
                 // Se o messageId for igual OU o texto for igual e enviado nos últimos 5 segundos
                 const ehMesmaMensagem = (messageId && ultimaUser.messageId === messageId) || 
                                         (ultimaUser.content === messageText && 
                                          ultimaUser.timestamp && 
                                          (Date.now() - new Date(ultimaUser.timestamp).getTime() < 5000));
                 
                 // E se já tem uma resposta do assistente DEPOIS dessa mensagem do usuário
                 const indexUltimaUser = contatoRecheck.historico_mensagens.lastIndexOf(ultimaUser);
                 const jaRespondida = contatoRecheck.historico_mensagens.slice(indexUltimaUser + 1).some(m => m.role === 'assistant');
                 
                 if (ehMesmaMensagem && jaRespondida) {
                     console.log('🚫 Mensagem do usuário já processada e respondida por outra instância. Abortando.');
                     await liberarLock(base44, phoneNumber, lockName);
                     return Response.json({ success: true, status: 'ja_processado', resposta: null });
                 }
             }
          }
          
          // Verificação extra: se a última mensagem do assistente é muito recente (< 10s), abortar
          if (contatoRecheck && contatoRecheck.historico_mensagens && contatoRecheck.historico_mensagens.length > 0) {
             const ultimas = contatoRecheck.historico_mensagens;
             const ultimaAssistente = [...ultimas].reverse().find(m => m.role === 'assistant');
             if (ultimaAssistente && ultimaAssistente.timestamp) {
               const tempoDesdeUltimaResposta = agora - new Date(ultimaAssistente.timestamp).getTime();
               if (tempoDesdeUltimaResposta < 10000) {
                 console.log(`🚫 Resposta muito recente detectada (${tempoDesdeUltimaResposta}ms). Evitando duplicidade.`);
                 await liberarLock(base44, phoneNumber, lockName);
                 return Response.json({ success: true, status: 'resposta_recente', resposta: null });
               }
             }
          }
          
          if (contatoRecheck) {
            const histRecheck = contatoRecheck.historico_mensagens || [];
            const jaProcessadoAgora = histRecheck.some((m, idx) => {
              if (m.messageId !== messageId || m.role !== 'user') return false;
              return histRecheck.slice(idx + 1).some(r => r.role === 'assistant');
            });
            if (jaProcessadoAgora) {
              await liberarLock(base44, phoneNumber, lockName);
              return Response.json({ success: true, status: 'duplicata_pos_lock', resposta: null });
            }
          }
        }
      } catch (e) {}
    } else if (isBufferMessage) {
      try {
        // Tentar adquirir lock com retries (espera até 12s)
        let lockAdquirido = false;
        for (let i = 0; i < 6; i++) {
          const contatoVerif = await buscarContatoPorTelefone(phoneNumber);
          if (!contatoVerif) break;
          
          const lockAtual = contatoVerif.processando_ia_lock || null;
          const agora = Date.now();
          
          if (lockAtual) {
            const lockIdadeMs = agora - new Date(lockAtual.split('_')[0]).getTime();
            // Se lock for recente (< 25s), esperar. Se for antigo, assumir que travou e sobrescrever.
            if (lockIdadeMs < 25000) {
              console.log(`⏳ Lock ativo (${lockIdadeMs}ms). Esperando... (tentativa ${i+1}/6)`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            } else {
              console.log(`🔓 Lock expirado (${lockIdadeMs}ms). Sobrescrevendo.`);
            }
          }
          
          lockName = new Date().toISOString() + '_buf_' + Math.random().toString(36).slice(2, 8);
          await base44.asServiceRole.entities.Contato.update(contatoVerif.id, { processando_ia_lock: lockName });
          // Pequena pausa para garantir propagação e verificar se não houve race condition
          await new Promise(resolve => setTimeout(resolve, 500));
          const contatoCheck = await buscarContatoPorTelefone(phoneNumber);
          if (contatoCheck && contatoCheck.processando_ia_lock === lockName) {
            lockAdquirido = true;
            break;
          }
        }
        
        if (!lockAdquirido) {
           console.log('❌ Não foi possível adquirir lock após retries. Mensagem pode ser perdida ou processada concorrentemente.');
           return Response.json({ success: true, status: 'lock_timeout', resposta: null });
        }
        
        // APÓS ADQUIRIR O LOCK, verificar se a mensagem já foi processada recentemente
        const contatoPosLock = await buscarContatoPorTelefone(phoneNumber);
        if (contatoPosLock && contatoPosLock.historico_mensagens) {
            const ultimasUser = contatoPosLock.historico_mensagens.filter(m => m.role === 'user');
            if (ultimasUser.length > 0) {
                const ultimaUser = ultimasUser[ultimasUser.length - 1];
                // Se o texto for igual e enviado nos últimos 20 segundos
                if (ultimaUser.content === messageText && ultimaUser.timestamp && (Date.now() - new Date(ultimaUser.timestamp).getTime() < 20000)) {
                    console.log('🚫 Mensagem de buffer duplicada detectada após lock. Abortando.');
                    await liberarLock(base44, phoneNumber, lockName);
                    return Response.json({ success: true, status: 'ja_processado', resposta: null });
                }
            }
            
            // Verificação extra: se a última mensagem do assistente é muito recente (< 10s), abortar
            const ultimaAssistente = [...contatoPosLock.historico_mensagens].reverse().find(m => m.role === 'assistant');
            if (ultimaAssistente && ultimaAssistente.timestamp) {
               const tempoDesdeUltimaResposta = Date.now() - new Date(ultimaAssistente.timestamp).getTime();
               if (tempoDesdeUltimaResposta < 10000) {
                 console.log(`🚫 Resposta muito recente detectada no buffer (${tempoDesdeUltimaResposta}ms). Evitando duplicidade.`);
                 await liberarLock(base44, phoneNumber, lockName);
                 return Response.json({ success: true, status: 'resposta_recente', resposta: null });
               }
            }
        }
      } catch (e) {
        console.error('Erro no lock buffer:', e);
      }
    }
    
    try {
      const contatoPostAg = await buscarContatoPorTelefone(phoneNumber);
      if (contatoPostAg) {
        const hist = contatoPostAg.historico_mensagens || [];
        if (hist.length >= 2) {
          const ultimaMsg = hist[hist.length - 1];
          const penultimaMsg = hist[hist.length - 2];
          if (ultimaMsg.role === 'assistant' && /Agendamento confirmado|Te aguardamos/i.test(ultimaMsg.content) && penultimaMsg.role === 'user') {
            const conteudoAtual = (mediaUrl ? `${messageText}\n${mediaUrl}` : messageText).trim();
            const conteudoAnterior = (penultimaMsg.content || '').trim();
            if (conteudoAtual === conteudoAnterior || messageText.trim() === conteudoAnterior) {
              await liberarLock(base44, phoneNumber, lockName);
              return Response.json({ success: true, status: 'duplicata_pos_agendamento', resposta: null });
            }
          }
        }
      }
    } catch (e) {}

    let contatosCheck = [];
    const contatoVerificado = await buscarContatoPorTelefone(phoneNumber);
    if (contatoVerificado) contatosCheck = [contatoVerificado];
    if (contatosCheck.length > 0 && contatosCheck[0].atendimento_humano === true && !!(contatosCheck[0].atendente_atual || contatosCheck[0].atendente_id) && !isBufferMessage) {
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
        processando_ia_lock: null
      });
      return Response.json({ success: true, resposta: null, atendimento_humano: true, message: 'Mensagem salva - atendimento humano ativo' });
    }
    
    if (isBufferMessage && contatosCheck.length > 0 && contatosCheck[0].atendimento_humano === true && !!(contatosCheck[0].atendente_atual || contatosCheck[0].atendente_id)) {
      await liberarLock(base44, phoneNumber, lockName);
      return Response.json({ success: true, resposta: null, atendimento_humano: true, message: 'Buffer ignorado - atendimento humano ativo' });
    }
    
    let config;
    try {
      const configs = await Promise.race([
        base44.asServiceRole.entities.ChatbotConfig.list(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ChatbotConfig')), 5000))
      ]);
      config = configs.find(c => c.ativo === true);
      
      // Permitir testes apenas para o Thiago Cavalcanti (ignorando se está inativo)
      const telLimpo = phoneNumber.replace(/\D/g, '');
      if (!config && (telLimpo.includes('87988020504') || telLimpo.includes('878988020504') || telLimpo.includes('8788020504'))) {
        config = configs[0];
      }
    } catch (e) { config = null; }
    
    if (!config) {
      try {
        const cVerif = await buscarContatoPorTelefone(phoneNumber);
        const timestamp = new Date().toISOString();
        if (cVerif) {
          const historicoAtual = cVerif.historico_mensagens || [];
          const userMsgJaExiste = messageId && historicoAtual.some(m => m.messageId === messageId && m.role === 'user');
          if (!userMsgJaExiste) {
            historicoAtual.push({ role: 'user', content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText, timestamp, messageId, mediaType, mediaUrl });
            await base44.asServiceRole.entities.Contato.update(cVerif.id, {
              ultima_mensagem: messageText,
              historico_mensagens: historicoAtual.slice(-50),
              ultima_interacao: timestamp,
              total_mensagens: (cVerif.total_mensagens || 0) + 1,
              processando_ia_lock: null
            });
          }
        } else {
          let telefoneComPrefixo = phoneNumber.replace(/\D/g, '');
          if (!telefoneComPrefixo.startsWith('55')) telefoneComPrefixo = '55' + telefoneComPrefixo;
          await base44.asServiceRole.entities.Contato.create({
            nome: senderName, telefone: telefoneComPrefixo, paciente_id: pacienteId, origem: 'WhatsApp', status: 'Novo', atendimento_humano: false, ultima_mensagem: messageText, historico_mensagens: [{ role: 'user', content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText, timestamp, messageId, mediaType, mediaUrl }], ultima_interacao: timestamp, total_mensagens: 1, conversa_finalizada: false
          });
        }
      } catch (e) { console.error('Erro ao salvar msg sem config:', e); }
      await liberarLock(base44, phoneNumber, lockName);
      return Response.json({ success: true, resposta: null, conversationId: null, message: 'Chatbot desativado, mensagem salva' });
    }
    
    let conversaFinalizada = false;
    if (contatosCheck.length > 0 && contatosCheck[0].conversa_finalizada) {
      conversaFinalizada = true;
      await base44.asServiceRole.entities.Contato.update(contatosCheck[0].id, { conversa_finalizada: false, historico_mensagens: [], ultima_mensagem: null, ultima_resposta: null });
    }
    
    let historicoConversa = '';
    let historicoMensagensRaw = [];
    let contatoHistorico = null;
    try {
      let contatos = [];
      const cVerif = await buscarContatoPorTelefone(phoneNumber);
      if (cVerif) contatos = [cVerif];
      if (contatos.length > 0) {
        contatoHistorico = contatos[0];
        if (conversaFinalizada || !contatos[0].historico_mensagens || contatos[0].historico_mensagens.length === 0) {
          historicoConversa = '';
          historicoMensagensRaw = [];
        } else {
          const ultimas = contatos[0].historico_mensagens.slice(-20);
          historicoMensagensRaw = ultimas;
          historicoConversa = ultimas.map(m => `${m.role === 'user' ? 'CLIENTE' : 'ASSISTENTE'}: ${m.content}`).join('\n');
        }
      }
    } catch (e) {}

    let contatoFresh = contatoHistorico;
    if (contatoHistorico) {
      try {
        const cFresh = await buscarContatoPorTelefone(phoneNumber);
        if (cFresh) contatoFresh = cFresh;
      } catch (e) {}
    }
    const historicoMsgs = contatoFresh ? (contatoFresh.historico_mensagens || []) : [];
    const assistenteJaRespondeu = historicoMsgs.some(m => m.role === 'assistant');
    const ehPrimeiraMensagemDefinitiva = !assistenteJaRespondeu || (conversaFinalizada && historicoMensagensRaw.length === 0);
    
    if (ehPrimeiraMensagemDefinitiva) {
      const timestamp = new Date().toISOString();
      const userEntry = { role: 'user', content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText, timestamp, messageId };
      if (mediaType && mediaType !== 'text') userEntry.mediaType = mediaType;
      if (mediaUrl) userEntry.mediaUrl = mediaUrl;
      
      const estaEmModoHumano = contatoFresh ? contatoFresh.atendimento_humano === true && !!(contatoFresh.atendente_atual || contatoFresh.atendente_id) : false;
      
      if (estaEmModoHumano) {
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
          let telefoneComPrefixo = phoneNumber.replace(/\D/g, '');
          if (!telefoneComPrefixo.startsWith('55')) telefoneComPrefixo = '55' + telefoneComPrefixo;
          await base44.asServiceRole.entities.Contato.create({
            nome: senderName, telefone: telefoneComPrefixo, paciente_id: pacienteId, origem: 'WhatsApp', status: 'Novo', atendimento_humano: false, ultima_mensagem: messageText, historico_mensagens: [userEntry], ultima_interacao: timestamp, total_mensagens: 1, conversa_finalizada: false
          });
        }
        return Response.json({ success: true, resposta: null, atendimento_humano: true, message: 'Primeira mensagem salva - atendimento humano ativo' });
      }
      
      if (contatoFresh) {
        const hist = contatoFresh.historico_mensagens || [];
        const jaExisteUser = messageId && hist.some(m => m.messageId === messageId && m.role === 'user');
        if (!jaExisteUser) hist.push(userEntry);
        await base44.asServiceRole.entities.Contato.update(contatoFresh.id, { ultima_mensagem: messageText, historico_mensagens: hist.slice(-50), ultima_interacao: timestamp, conversa_finalizada: false });
      }
    }

    const _hMFA=historicoConversa&&(/nome completo.*paciente|data de nascimento.*paciente|qual.*médico.*prefere|disponibilidades|agendar.*consulta/i.test(historicoConversa)||(/Dr\.\s+\w+/i.test(historicoConversa)&&/\d{2}:\d{2}/i.test(historicoConversa)&&/qual.*prefere|escolh|horário/i.test(historicoConversa)));
    const querVerificarAgendamento = (!_hMFA && (/verificar|consultar|checar|status|confirma|está confirmado|meu agendamento/i.test(messageText) && !/cancelar|desmarcar|\bagendar\b|\bmarcar\b|nova|novo/i.test(messageText)));

    const cancelamentoJaConcluidoNoHistorico=/Agendamento cancelado com sucesso|❌\s*\*Cancelado:/i.test(historicoConversa||'');
    const querCancelar=/cancelar|desmarcar|n[aã]o (vou|posso|irei)|remarcar|adiar|desistir/i.test(messageText)||(!cancelamentoJaConcluidoNoHistorico&&/cancelar|desmarcar|remarcar/i.test(historicoConversa||''));
    let infoCancelamento='';let agendamentoCancelado=false;

      const nTV = (telefone) => { const t = (telefone||'').replace(/\D/g,''); const l = [telefone,t].filter(Boolean); if(t.startsWith('55')&&t.length>=12) l.push(t.slice(2)); if(!t.startsWith('55')&&t.length>=10) l.push('55'+t); return [...new Set(l)]; };
      const buscarPacientesPorTelefone = async (telefone) => { for(const v of nTV(telefone)){try{const e=await base44.asServiceRole.entities.Paciente.filter({telefone:v});if(e.length>0)return e;}catch(e){}}try{const tp=await base44.asServiceRole.entities.Paciente.list('-created_date',500);const u8=(telefone||'').replace(/\D/g,'').slice(-8);return tp.filter(p=>((p.telefone||'').replace(/\D/g,'').slice(-8)===u8));}catch(e){return [];}};
      const listarAgendamentosFuturosPorTelefone = async (telefone) => { const hoje=new Date().toISOString().split('T')[0];const pacs=await buscarPacientesPorTelefone(telefone);let ags=[];for(const p of pacs){const pa=await base44.asServiceRole.entities.Agendamento.filter({paciente_id:p.id});ags.push(...pa.filter(a=>a.data_agendamento>=hoje&&['Agendado','Confirmado','Pago'].includes(a.status)));}const ids=new Set();return {pacientes:pacs,agendamentos:ags.filter(a=>{if(ids.has(a.id))return false;ids.add(a.id);return true;})}; };

    if(querVerificarAgendamento){
      try{
        const {agendamentos} = await listarAgendamentosFuturosPorTelefone(phoneNumber);
        let rV='';
        if(agendamentos.length>0){
          rV=`📋 *Encontrei os seguintes agendamentos para o seu número:*\n\n`;const mdsMap={};try{const mds=await base44.asServiceRole.entities.Medico.list();mds.forEach(m=>{mdsMap[m.id]=m;});}catch(e){}
          agendamentos.sort((a,b)=>a.data_agendamento.localeCompare(b.data_agendamento)).forEach(ag=>{const md=mdsMap[ag.medico_id];const dF=new Date(ag.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});const se=ag.status==='Cancelado'?'❌':ag.status==='Agendado'?'📅':'✅';const st=ag.status==='Cancelado'?'CANCELADO':ag.status==='Agendado'?'Agendado':ag.status==='Confirmado'?'CONFIRMADO':ag.status;rV+=`${se} *${dF}* às *${ag.horario}*\n👨‍⚕️ ${md?md.nome:'Médico'} (${md?md.especialidade:'Especialidade'})\n📌 *${st}*\n\n`;});
          if(agendamentos.some(a=>a.status==='Confirmado'||a.status==='Agendado')) rV+='📍 Tristão Monteiro, 580 – Tramandaí/RS\n⏰ Chegue 10min antes!\n\n';rV+='Posso ajudar em mais algo?';
        }else rV=`😔 Não encontrei agendamentos futuros cadastrados para este número de telefone.\nPosso agendar para você! 😊`;
        try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:rV,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
        await liberarLock(base44, phoneNumber, lockName);return Response.json({success:true,resposta:rV,verificado:true,fluxo:'verificacao'});
      }catch(e){console.error(e);}
    }

      const formatarListaRemarcacao = async (agendamentos) => {
        const medicosMap = {}; (await base44.asServiceRole.entities.Medico.list()).forEach(m => { medicosMap[m.id] = m; });
        let texto = 'Encontrei estes agendamentos no seu número:\n\n';
        agendamentos.forEach((ag, idx) => {
          const m = medicosMap[ag.medico_id]; const dF = new Date(ag.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
          texto += `${idx + 1}. ${ag.tipo_servico || 'Consulta'} - ${dF} às ${ag.horario}${m ? ` com ${m.nome}` : ''}\n`;
        }); return { texto: texto + '\nMe diga o número da opção que você quer remarcar.', medicosMap };
      };
      const executarCancelamento = async (agendamentoId) => {
        try {
          const ags = await base44.asServiceRole.entities.Agendamento.filter({ id: agendamentoId }); const ag = Array.isArray(ags) ? ags[0] : null; if (!ag) return null;
          let medicoNome = 'Médico', medicoEsp = '';
          try { const ms = await base44.asServiceRole.entities.Medico.filter({ id: ag.medico_id }); if (ms.length > 0) { medicoNome = ms[0].nome; medicoEsp = ms[0].especialidade; } } catch (e) {}
          const df = new Date(ag.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
          await base44.asServiceRole.entities.Agendamento.update(agendamentoId, { status: 'Cancelado', observacoes: `Cancelado via remarcação no WhatsApp em ${new Date().toLocaleString('pt-BR')}` });
          try { await base44.asServiceRole.entities.Notification.create({ type: 'agendamento_cancelado', message: `🔄 ${ag.paciente_nome || 'Paciente'} remarcou ${medicoEsp} com ${medicoNome} - ${df} às ${ag.horario}`, data: { agendamento_id: agendamentoId, paciente_nome: ag.paciente_nome, medico_nome: medicoNome, especialidade: medicoEsp, data: ag.data_agendamento, horario: ag.horario, cancelado_por: 'WhatsApp - Glória (remarcação)' }, is_read: false }); } catch (e) {}
          return ag;
        } catch (e) { return null; }
      };
      const buscarPrimeiroHorarioDisponivel = async (medicoId, ignorarData = null, diasLimite = 45) => {
        const hISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); const hSP = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        for (let i = 0; i < diasLimite; i++) {
          const dc = new Date(); dc.setDate(dc.getDate() + i); const dISO = dc.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
          if (ignorarData && dISO === ignorarData) continue;
          try {
            const sr = await base44.asServiceRole.functions.invoke('getAvailableSlots', { medico_id: medicoId, data: dISO });
            const sv = dISO === hISO ? (sr?.data?.available_slots || []).filter(h => h > hSP) : (sr?.data?.available_slots || []);
            if (sv.length > 0) return { data_agendamento: dISO, horario: sv[0] };
          } catch (e) {}
        } return null;
      };

      const escolherAgendamentoParaRemarcar = (messageText, agendamentos, medicosMap) => {
        const texto = (messageText || '').toLowerCase().trim();
        const numeroMatch = texto.match(/^(?:op[çc][aã]o\s*)?(\d{1,2})\b/i);
        if (numeroMatch) {
          const indice = parseInt(numeroMatch[1], 10) - 1;
          if (indice >= 0 && indice < agendamentos.length) return agendamentos[indice];
        }

        const confirmacaoGenerica = /^(essa|esse|essa\s*mesma|esse\s*mesmo|a\s*primeira|o\s*primeiro|pode\s*ser\s*essa|pode\s*ser\s*esse|sim|isso|exato|correto)$/i.test(texto);
        if (confirmacaoGenerica && agendamentos.length === 1) return agendamentos[0];

        for (const ag of agendamentos) {
          if (texto.includes((ag.horario || '').toLowerCase())) return ag;
          const medico = medicosMap[ag.medico_id];
          if (medico) {
            const nomeCompleto = medico.nome.toLowerCase();
            const partes = nomeCompleto.split(' ').filter(p => p.length > 2);
            if (texto.includes(nomeCompleto) || partes.some(p => texto.includes(p))) return ag;
          }
          const dataBR = new Date(ag.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR');
          if (texto.includes(dataBR)) return ag;
          const dia = ag.data_agendamento.split('-')[2];
          const mes = ag.data_agendamento.split('-')[1];
          if (texto.includes(`${dia}/${mes}`) || texto.includes(`dia ${parseInt(dia, 10)}`)) return ag;
        }
        return null;
      };

      const historicoAssistenteTexto = historicoMensagensRaw.filter(m => m.role === 'assistant').map(m => m.content || '').join('\n');
      const ultimaMsgAssistenteFullRemarcacao = historicoMensagensRaw.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
      const remarcacaoRecenteConcluida = /Remarcação concluída/i.test(ultimaMsgAssistenteFullRemarcacao);
      const querMudarDeAssuntoRemarcacao = /quanto\s*custa|qual\s*o?\s*(valor|pre[çc]o)|resultado|laudo|exame pronto|endere[çc]o|localiza[çc][aã]o|cart[aã]o\s*mais|onde\s*fica/i.test(messageText || '');
      
      const fluxoRemarcacaoAtivo = !remarcacaoRecenteConcluida && !querMudarDeAssuntoRemarcacao && (
        /remarcar|reagendar|mudar.*consulta|mudar.*data|mudar.*hor[áa]rio|trocar.*consulta|trocar.*data|trocar.*hor[áa]rio/i.test(messageText || '') || 
        /Me diga o número da opção que você quer remarcar|Você aceita remarcar para|Encontrei estes agendamentos no seu número/i.test(ultimaMsgAssistenteFullRemarcacao || '')
      );

      if (fluxoRemarcacaoAtivo) {
        const { pacientes, agendamentos } = await listarAgendamentosFuturosPorTelefone(phoneNumber);
        if (agendamentos.length === 0) {
          const respostaSemAgendamento = 'Não encontrei consultas futuras cadastradas para este número de telefone.';
          try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:respostaSemAgendamento,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
          await liberarLock(base44, phoneNumber, lockName);
          return Response.json({ success: true, resposta: respostaSemAgendamento, remarcacao_executada: false });
        }

        const { texto: listaTexto, medicosMap } = await formatarListaRemarcacao(agendamentos);
        const agendamentoEscolhido = escolherAgendamentoParaRemarcar(messageText, agendamentos, medicosMap);

        const ultimaAssistente = historicoMensagensRaw.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
        const aguardandoAceiteNovaData = /Você aceita remarcar para/i.test(ultimaAssistente);
        const clienteAceitouNovaData = /sim|s|aceito|pode ser|ok|certo|confirmo|fechado|isso|perfeito|essa|esse|essa\s*mesma|quero|marcar/i.test((messageText || '').trim());

        if (aguardandoAceiteNovaData) {
          if (!clienteAceitouNovaData) {
            const respostaNaoAceitou = 'Entendi. Como esse horário não ficou bom, por favor, me diga para qual dia ou turno você prefere, ou ligue para a recepção no (51) 3661-5991 para vermos outras opções na agenda.';
            try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:respostaNaoAceitou,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
            await liberarLock(base44, phoneNumber, lockName);
            return Response.json({ success: true, resposta: respostaNaoAceitou, remarcacao_executada: false });
          }

          const matchConfirmacao = ultimaAssistente.match(/\[REMARCACAO\|agendamento:([^|]+)\|medico:([^|]+)\|data:(\d{4}-\d{2}-\d{2})\|horario:(\d{2}:\d{2})\|paciente:([^\]]+)\]/);
          if (matchConfirmacao) {
            const [, agendamentoOriginalId, medicoId, novaData, novoHorario, pacienteId] = matchConfirmacao;
            const agOriginal = agendamentos.find(a => a.id === agendamentoOriginalId);
            if (!agOriginal) {
              try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:listaTexto,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
              await liberarLock(base44, phoneNumber, lockName);
              return Response.json({ success: true, resposta: listaTexto, remarcacao_executada: false });
            }
            const cancelado = await executarCancelamento(agendamentoOriginalId);
            if (!cancelado) {
              const erroCancel = 'Não consegui cancelar o agendamento antigo no sistema agora. Tente novamente em instantes.';
              try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:erroCancel,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
              await liberarLock(base44, phoneNumber, lockName);
              return Response.json({ success: true, resposta: erroCancel, remarcacao_executada: false });
            }

            const paciente = pacientes.find(p => p.id === pacienteId) || pacientes[0];
            let categoriaParticularId = agOriginal.categoria_preco_id || null;
            if (!categoriaParticularId) {
              try {
                const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({ nome: 'Particular', status: 'Ativo' });
                if (categorias.length > 0) categoriaParticularId = categorias[0].id;
              } catch (e) {}
            }

            const novoAgendamento = await base44.asServiceRole.entities.Agendamento.create({
              paciente_id: paciente?.id || agOriginal.paciente_id,
              paciente_nome: paciente?.nome || agOriginal.paciente_nome,
              medico_id: medicoId,
              data_agendamento: novaData,
              horario: novoHorario,
              tipo_servico: agOriginal.tipo_servico || 'Consulta',
              duracao_minutos: agOriginal.duracao_minutos,
              categoria_preco_id: categoriaParticularId,
              status: 'Agendado',
              valor_total: agOriginal.valor_total || 0,
              valor_final: agOriginal.valor_final || agOriginal.valor_total || 0,
              observacoes: 'Remarcado pela Glória via WhatsApp',
              agendado_por: 'Glória',
              agendado_por_tipo: 'chatbot'
            });

            try {
              const medico = medicosMap[medicoId] || (await base44.asServiceRole.entities.Medico.filter({ id: medicoId }))[0];
              await base44.asServiceRole.entities.Notification.create({
                type: 'novo_agendamento',
                message: `🔄 ${paciente?.nome || agOriginal.paciente_nome} remarcou consulta com ${medico?.nome || 'Médico'} para ${new Date(novaData + 'T12:00:00').toLocaleDateString('pt-BR')} às ${novoHorario}`,
                data: { agendamento_id: novoAgendamento.id, paciente_nome: paciente?.nome || agOriginal.paciente_nome, medico_nome: medico?.nome, data: novaData, horario: novoHorario, origem: 'remarcação_whatsapp' },
                is_read: false
              });
            } catch (e) {}

            const dataFormatada = new Date(novaData + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
            const respostaFinal = `✅ Remarcação concluída no sistema!\n\nNovo agendamento: ${dataFormatada} às ${novoHorario}.`;
            try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:respostaFinal,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
            await liberarLock(base44, phoneNumber, lockName);
            return Response.json({ success: true, resposta: respostaFinal, remarcacao_executada: true, agendamento_criado: true });
          }
        }

        if (!agendamentoEscolhido) {
          const respostaNaoEntendidaRemarcacao = agendamentos.length === 1
            ? `${listaTexto}\n\nSe você quer essa consulta, pode responder “1” ou “essa mesma”.`
            : `${listaTexto}\n\nMe responda com o número da consulta que você quer remarcar.`;
          try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:respostaNaoEntendidaRemarcacao,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
          await liberarLock(base44, phoneNumber, lockName);
          return Response.json({ success: true, resposta: respostaNaoEntendidaRemarcacao, remarcacao_executada: false });
        }

        const proximoHorario = await buscarPrimeiroHorarioDisponivel(agendamentoEscolhido.medico_id, agendamentoEscolhido.data_agendamento);
        if (!proximoHorario) {
          const errDisp = 'Encontrei a consulta, mas não achei um próximo horário disponível para esse mesmo profissional agora.';
          try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:errDisp,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
          await liberarLock(base44, phoneNumber, lockName);
          return Response.json({ success: true, resposta: errDisp, remarcacao_executada: false });
        }

        const medicoEscolhido = medicosMap[agendamentoEscolhido.medico_id];
        const dataAtualFmt = new Date(agendamentoEscolhido.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        const novaDataFmt = new Date(proximoHorario.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        const pacienteBase = pacientes.find(p => p.id === agendamentoEscolhido.paciente_id) || pacientes[0];
        const tagInterna = `[REMARCACAO|agendamento:${agendamentoEscolhido.id}|medico:${agendamentoEscolhido.medico_id}|data:${proximoHorario.data_agendamento}|horario:${proximoHorario.horario}|paciente:${pacienteBase?.id || agendamentoEscolhido.paciente_id}]`;
        const respostaOfertaLimpa = `Encontrei sua consulta de ${dataAtualFmt} às ${agendamentoEscolhido.horario}${medicoEscolhido ? ` com ${medicoEscolhido.nome}` : ''}.\n\nA próxima data disponível é ${novaDataFmt} às ${proximoHorario.horario}.\n\nVocê aceita remarcar para esse horário?`;
        const respostaOfertaParaHistorico = `${respostaOfertaLimpa}\n${tagInterna}`;
        try{const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber});if(cs.length>0){const h=cs[0].historico_mensagens||[];const ts=new Date().toISOString();h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:respostaOfertaParaHistorico,timestamp:ts});await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts});}}catch(e){}
        await liberarLock(base44, phoneNumber, lockName);
        return Response.json({ success: true, resposta: respostaOfertaLimpa, remarcacao_executada: false });
      }

      const ultMsgAss = ultimaMsgAssistenteFullRemarcacao || '';
      if (!cancelamentoJaConcluidoNoHistorico && !querMudarDeAssuntoRemarcacao && !fluxoRemarcacaoAtivo && (/cancelar|desmarcar|desistir/i.test(messageText) && !/remarcar|reagendar|mudar.*data|mudar.*hor[áa]rio/i.test(messageText) || /cancelamento da consulta/i.test(ultMsgAss) || /número da opção que você quer cancelar/i.test(ultMsgAss))) {
        const { pacientes, agendamentos } = await listarAgendamentosFuturosPorTelefone(phoneNumber);
        const medicosMap = {}; (await base44.asServiceRole.entities.Medico.list()).forEach(m => { medicosMap[m.id] = m; });
        let resp = '', cancExe = false;
        if (agendamentos.length === 0) resp = 'Não encontrei consultas futuras cadastradas para este número de telefone que possam ser canceladas.';
        else {
          let lista = 'Encontrei estes agendamentos no seu número:\n\n';
          agendamentos.forEach((ag, idx) => lista += `${idx+1}. ${ag.tipo_servico || 'Consulta'} - ${new Date(ag.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR')} às ${ag.horario}${medicosMap[ag.medico_id]?` com ${medicosMap[ag.medico_id].nome}`:''}\n`);
          const escolhido = escolherAgendamentoParaRemarcar(messageText, agendamentos, medicosMap);
          const txt = (messageText || '').trim().toLowerCase();
          if (/cancelamento da consulta/i.test(ultMsgAss)) {
             if (/n[aã]o/i.test(txt) && !/sim|ok|certo|confirmo|quero|cancelar/i.test(txt)) resp = 'Tudo bem, o cancelamento não foi realizado. A consulta segue agendada. Posso ajudar em algo mais?';
             else if (/sim|s|ok|certo|confirmo|quero|cancelar/i.test(txt)) {
                 const m = ultMsgAss.match(/\[CANCELAMENTO\|agendamento:([^\]]+)\]/);
                 if (m && await executarCancelamento(m[1])) { resp = `✅ Agendamento cancelado com sucesso no sistema!\n\nPosso ajudar em algo mais?`; cancExe = true; }
             }
          }
          if (!resp) {
              if (!escolhido && /cancelar|desmarcar/i.test(txt)) {
                  if (!/Encontrei estes agendamentos/i.test(ultMsgAss)) {
                      if (agendamentos.length === 1) {
                          const ag = agendamentos[0]; const med = medicosMap[ag.medico_id];
                          resp = `Encontrei uma consulta de ${ag.tipo_servico || 'Consulta'} - ${new Date(ag.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR')} às ${ag.horario}${med?` com ${med.nome}`:''}.\n\nVocê confirma o cancelamento da consulta?\n[CANCELAMENTO|agendamento:${ag.id}]`;
                      } else resp = `${lista}\nMe responda com o número da opção que você quer cancelar.`;
                  } else resp = `Me responda com o número da opção que você quer cancelar, ou "não" para manter as consultas.`;
              } else if (escolhido) {
                  const med = medicosMap[escolhido.medico_id];
                  resp = `Você confirma o cancelamento da consulta de ${escolhido.tipo_servico || 'Consulta'} - ${new Date(escolhido.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR')} às ${escolhido.horario}${med?` com ${med.nome}`:''}?\n[CANCELAMENTO|agendamento:${escolhido.id}]`;
              }
          }
        }
        if (resp) {
            try { const cs=await base44.asServiceRole.entities.Contato.filter({telefone:phoneNumber}); if(cs.length>0){ const h=cs[0].historico_mensagens||[]; const ts=new Date().toISOString(); h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:resp,timestamp:ts}); await base44.asServiceRole.entities.Contato.update(cs[0].id,{historico_mensagens:h.slice(-50),ultima_interacao:ts}); } } catch(e){}
            await liberarLock(base44, phoneNumber, lockName);
            return Response.json({ success: true, resposta: resp.split('\n[')[0], cancelamento_executado: cancExe });
        }
      }

    const _hjER=/encontrei o resultado|PDF está sendo enviado|arquivo PDF/i.test(historicoConversa||'');
    const _hfR=/(RESULTADO DE EXAME|para localizar.*resultado)/i.test(historicoConversa||'');
    const _ehSobreAgendamento = /agendar|marcar|consulta|hor[áa]rio|remarcar|cancelar|desmarcar/i.test(messageText);
    const querResultado=!_hjER&&!_ehSobreAgendamento&&(/resultado|laudo|exame pronto|meu exame|buscar exame|retirar exame|pegar exame/i.test(messageText)||(_hfR&&(/\d{3}/.test(messageText)||/[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/.test(messageText))));
    let infoResultadoExame='';let arquivoParaEnviar=null;
    if(querResultado){
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
      return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };

    const ehPerguntaPrecoEarly = /quanto\s*custa|qual\s*o?\s*(valor|pre[çc]o)|pre[çc]o\s*(da|do|de)|valor\s*(da|do|de)|custa\s*quanto/i.test(messageText);
    const ehPerguntaInformativaEarly = /^(a[ií]\s+)?(voc[êe]s\s+)?(faz(em)?|tem|t[êe]m|realiza[m]?|oferece[m]?|atende[m]?|existe|trabalha[m]?\s+com)\s+/i.test(messageText) || /faz(em)?\s+.+\?/i.test(messageText) || /tem\s+.+\?/i.test(messageText) || /^a[ií]\s+faz\b/i.test(messageText) || /^a[ií]\s+tem\b/i.test(messageText);
    const ehPerguntaSobreCartao = /cart[aã]o\s*mais\s*(vida|sa[uú]de)|mais\s*vida|mais\s*sa[uú]de|planos?\s*(do|da|de)?\s*cart|benef[ií]cios?\s*(do|da)?\s*cart|cart[aã]o\s*da\s*cl[ií]nica|informa[çc][oõ]es?\s*sobre\s*o?\s*cart|planos?\s*(e\s*benef)?/i.test(messageText) || (/plano|benef[ií]cio|cart[aã]o/i.test(messageText) && /cart[aã]o\s*mais|mais\s*vida|mais\s*sa[uú]de/i.test(historicoConversa || ''));
    const ehContextoCartaoNoHistorico = /cart[aã]o\s*mais\s*(vida|sa[uú]de)|mais\s*vida|planos?\s*(do|da)?\s*cart|benef[ií]cios/i.test(historicoConversa || '');
    const respostaCurtaEmContextoCartao = ehContextoCartaoNoHistorico && /^(planos?|quais|sim|ok|benefícios?|beneficios?|valores?|como\s*funciona|me\s*fala|conta\s*mais|explica|detalh|informa)/i.test(messageText.trim());

    let especialidadeDetectada = null;
    let medicoEspecificoDetectado = null;
    const msgLower = normalizarTexto(messageText);
    const historicoLower = normalizarTexto(historicoConversa || '');

    let todosMedicosParaDeteccao = [], respostaQuemAtendeDia = null;
    try {
      const _raw = await Promise.race([base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 3000))]);
      todosMedicosParaDeteccao = _raw.filter(m => !/(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i.test(m.nome || ''));
    } catch (e) {}
    const _pqad=(/(quem|que)\s+(vai\s+)?(atender|estar)|quem\s+atende|quais?\s+(m[eé]dicos?|profissionais?).*(atendem|atender)|qual\s+(m[eé]dico|profissional).*(atende|vai atender)/i.test(messageText||'')||/vai\s+ter\s+(m[eé]dicos?|profissionais?|atendimento)/i.test(messageText||'')||/(ter[aá]|tem)\s+(m[eé]dicos?|profissionais?|atendimento)\s+(amanh[ãa]|hoje|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)/i.test(messageText||'')||/(m[eé]dicos?|profissionais?)\s+(atendendo|que\s+atendem|dispon[ií]veis?)\s+(amanh[ãa]|hoje|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)/i.test(messageText||''))&&/segunda|ter[çc]a|terca|quarta|quinta|sexta|s[áa]bado|domingo|hoje|amanh[ãa]/i.test(messageText||'');
    if(_pqad){
      try {
        // Chamando getDoctorsAgendaByDate via fetch para evitar erro 403
        const appId = Deno.env.get('BASE44_APP_ID');
        const url = `https://base44.app/api/apps/${appId}/functions/getDoctorsAgendaByDate`;
        const agendaResp = await Promise.race([
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queryText: messageText })
          }),
          new Promise((_, r) => setTimeout(() => r(new Error('Timeout agenda real')), 12000))
        ]);
        const agendaData = agendaResp.ok ? await agendaResp.json() : null;
        console.log('🔍 agendaData:', JSON.stringify(agendaData).substring(0, 200));
        if (agendaData?.doctors?.length > 0) {
          const dataFmt = new Date(`${agendaData.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
          const bookedDoctors = agendaData.doctors.filter(d => d.total_agendamentos > 0);
          const allWithSlots = agendaData.doctors.filter(d => d.total_horarios_disponiveis > 0);
          
          let resp = `Para ${agendaData.reference_label || dataFmt}, `;
          
          if (bookedDoctors.length > 0) {
            resp += `os profissionais com atendimentos confirmados são:\n${bookedDoctors.map(m => `• ${m.nome} (${m.especialidade || 'Especialidade não informada'})`).join('\n')}\n\n`;
          } else {
            resp += `ainda não há pacientes agendados. `;
          }
          
          if (allWithSlots.length > 0) {
            if (bookedDoctors.length > 0) resp += `Temos horários disponíveis para agendamento com:\n`;
            else resp += `Mas temos horários disponíveis para agendamento com:\n`;
            
            resp += `${allWithSlots.map((m) => `• ${m.nome} (${m.especialidade || 'Especialidade não informada'}) — ${m.agenda_do_dia.map((p) => `${p.inicio} às ${p.fim}`).join(' | ')}`).join('\n')}\n\nCom qual especialidade você gostaria de agendar?`;
          } else if (bookedDoctors.length > 0) {
            resp += `Todos os profissionais que atendem neste dia já estão com a agenda lotada.`;
          }
          
          respostaQuemAtendeDia = resp;
        } else if (agendaData?.date) {
          respostaQuemAtendeDia = `No momento, não há profissionais com agenda cadastrada para ${agendaData.reference_label || agendaData.date}.`;
        }
      } catch (e) {
        console.log('❌ Erro no _pqad:', e.message);
      }
    }

    for (const esp of especialidades) {
      if (msgLower.includes(normalizarTexto(esp))) { especialidadeDetectada = esp; break; }
    }
    const ultimasRespostasAssistenteObj=historicoMensagensRaw.filter(m=>m.role==='assistant');
    const ultimaMsgAssistenteFull=ultimasRespostasAssistenteObj.length>0?ultimasRespostasAssistenteObj[ultimasRespostasAssistenteObj.length-1].content:'';
    const msgTrimLower = messageText.trim().toLowerCase();

    if(!especialidadeDetectada){for(const m of todosMedicosParaDeteccao){const pn=normalizarTexto(m.nome).split(' ').filter(p=>p.length>3&&!/^(dr\.?|dra\.?|de|da|do|dos|das)$/i.test(p));const pe=pn.filter(p=>msgLower.includes(p));if(pe.length>=2||pe.some(p=>p.length>=6)){medicoEspecificoDetectado=m;especialidadeDetectada=m.especialidade;break;}}}
    if(!especialidadeDetectada&&!medicoEspecificoDetectado&&ultimaMsgAssistenteFull){const uaN=normalizarTexto(ultimaMsgAssistenteFull);for(const m of todosMedicosParaDeteccao){const pn=normalizarTexto(m.nome).split(' ').filter(p=>p.length>3&&!/^(dr\.?|dra\.?|de|da|do|dos|das)$/i.test(p));const pe=pn.filter(p=>uaN.includes(p));if(pe.length>=2||pe.some(p=>p.length>=6)){if(/^(sim|s|ok|quero|pode|claro|bora|vamos|isso|yes|vou|gostaria|quero\s*sim|agendar)$/i.test(msgTrimLower)){medicoEspecificoDetectado=m;especialidadeDetectada=m.especialidade;break;}}}}
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
    const perguntaSobreClinica = (/cl[ií]nica|funcionamento|voc[êe]s\s+abrem|voc[êe]s\s+funcionam/i.test(messageText) && /abert[oa]|fechad[oa]|funciona|abre|fecha|hor[áa]rio/i.test(messageText)) || /que\s+horas\s+abre|que\s+horas\s+fecha/i.test(messageText);
    const ehPerguntaDisponibilidadeMedico = !perguntaSobreClinica && temEspecialidadeOuMedico && (/vai\s+(atender|estar|vir)|atende\b|est[áa]\s+(atendendo|na)|quando\s+(atende|vai|ele|ela|o\s+dr)|que\s+dia|tem\s+(?:hor[áa]rio|vaga|agenda|atendimento)|pr[óo]xim[ao]\s+(dia|vez|atend)/i.test(messageText) || /(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|hoje|amanh[ãa]|semana\s+que\s+vem|pr[óo]xim[ao]).*(?:atend|consult|vai|estar)/i.test(messageText) || /(?:dr|doutor|doutora|dentista).*(?:vai|estar|atend|vem|vir)/i.test(messageText) || /que\s+dia.*(?:atend|consult|dentist)/i.test(messageText));
    const querAgendarMensagem = !clienteRecusandoAgendar && !ehPerguntaPreco && !ehPerguntaSobreCartao && !respostaCurtaEmContextoCartao && !perguntaSobreClinica && (/agendar|marcar|consulta|hor[áa]rio|dispon[íi]vel|vaga|atendimento/i.test(messageText) || clientePerguntouSobreVagaAposOferta || ehPerguntaDisponibilidadeMedico || clienteAceitouAgendar);
    const ultimasMensagensUsuarioObj = historicoMensagensRaw.filter(m => m.role === 'user');
    const ultimaMsgUsuarioFull = ultimasMensagensUsuarioObj.length > 0 ? ultimasMensagensUsuarioObj[ultimasMensagensUsuarioObj.length - 1].content : '';
    const jaEmFluxoAgendamento = !clienteRecusandoAgendar && !agendamentoRecenteConcluido && ultimaMsgUsuarioFull && /agendar|marcar|consulta|vamos agendar|seguir com o agendamento/i.test(ultimaMsgUsuarioFull);
    const querAgendar = !querCancelar && !agendamentoRecenteConcluido && !ehPerguntaSobreCartao && !respostaCurtaEmContextoCartao && (querAgendarMensagem || jaEmFluxoAgendamento || clienteConfirmouAgendar || clienteRespondeuComEspecialidade || clienteAceitouAgendar);
    
    if (!querVerificarAgendamento) {
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

    if (querAgendar && !temEspecialidadeOuMedico && !deveBuscarDisponibilidades) {
      infoDisponibilidade = `\n\n⚠️ O cliente quer agendar, mas NÃO informou a especialidade ou médico.
🚨 REGRA CRÍTICA: PERGUNTE para qual especialidade ou médico o cliente deseja agendar ANTES de confirmar ou negar qualquer horário. NÃO invente horários nem diga que não há vagas. Diga algo como: "Para qual especialidade você gostaria de agendar?"`;
    } else if (deveBuscarDisponibilidades) {
      const historico = historicoConversa || '';
      const clienteEstaEscolhendoHorario = !(ehPerguntaDisponibilidadeMedico && !/agendar|marcar/i.test(messageText)) && (
        /dia\s*\d{1,2}/i.test(messageText) || /\d{1,2}[:/h]\d{2}/i.test(messageText) || /\d{1,2}\/\d{1,2}/i.test(messageText) ||
        /segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|hoje|amanh[ãa]/i.test(messageText) || /dr\.?\s*\w+/i.test(messageText) ||
        /^(sim|quero|ok|pode|claro|esse|essa|este|esta|o primeiro|a primeira|o segundo|a segunda|qualquer)\b/i.test(messageText.trim())
      ) && /Dr\.|👨‍⚕️|\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull);
      
      // Verificar se o último contexto é de cancelamento/remarcação (NÃO deve considerar como disponibilidades já mostradas)
      const ultimoContextoEhCancelamento = /cancelado com sucesso|❌\s*\*Cancelado:|gostaria de remarcar|para quando.*remarcar/i.test(ultimaMsgAssistenteFull);

      const jaShowouDisponibilidades = !ultimoContextoEhCancelamento && (
        /\d{2}\/\d{2}.*\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull) || 
        (/Dr\.\s+\w+/i.test(ultimaMsgAssistenteFull) && /\d{2}:\d{2}/i.test(ultimaMsgAssistenteFull)) ||
        /Qual médico.*prefere|Qual horário.*prefere|qual.*você.*prefere/i.test(ultimaMsgAssistenteFull)
      );

      const isPerguntaNovaDisponibilidade = ehPerguntaDisponibilidadeMedico || /outr[oa] (dia|m[eê]s|semana|hor[áa]rio|m[eé]dico)/i.test(messageText) || /ele atende\b|ela atende\b/i.test(messageText);

      if (clienteEstaEscolhendoHorario || (jaShowouDisponibilidades && !isPerguntaNovaDisponibilidade)) {
        infoDisponibilidade = `\n\n✅ DISPONIBILIDADES JÁ FORAM MOSTRADAS AO CLIENTE ANTERIORMENTE.
O cliente está ESCOLHENDO/RESPONDENDO. Ele disse: "${messageText}"

🚨 REGRAS ABSOLUTAS:
1. NÃO diga que não há horários! O cliente está respondendo à lista que você já apresentou.
2. NÃO diga "infelizmente não temos horários disponíveis" - você ACABOU de mostrar horários!
3. Se ele mencionou um médico e horário/data, REPITA usando EXATAMENTE o horário que VOCÊ ofereceu para aquele dia. Ex: se você ofereceu "Sexta 06/03: 10:00" e cliente disse "sexta dia 6", responda "Perfeito, horário escolhido: sexta dia 6 às 10:00". NUNCA use um horário que não foi oferecido!
4. DEPOIS peça: "Preciso do seu nome completo e CPF (apenas números) para prosseguir no sistema."
5. O SISTEMA só cria o agendamento depois da validação real dos dados. NUNCA prometa que já agendou.
6. NÃO repita a lista de disponibilidades! O cliente JÁ viu a lista.
7. 🚨 NUNCA diga "sua presença está confirmada", "agendamento confirmado", "agendamento realizado" ou "te aguardamos" sem retorno real do sistema.
8. Se o cliente disse "sim" após você perguntar "Você gostaria de confirmar o horário?", isso significa que ele QUER aquele horário. NÃO mostre horários novamente, PEÇA nome completo e CPF.

⚠️ IMPORTANTE: O cliente está se referindo aos horários que VOCÊ mostrou na mensagem anterior. Consulte o HISTÓRICO para ver quais horários foram oferecidos e confirme a escolha do cliente.`;
        } else if (!querVerificarAgendamento) {
      try {
         let medicosParaBuscar = [];
         if (medicoEspecificoDetectado) {
           medicosParaBuscar = [medicoEspecificoDetectado];
         } else {
            let todosMedicos = [];
            try {
              const _rawM = await Promise.race([base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 3000))]);
              todosMedicos = _rawM.filter(m => !/(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i.test(m.nome || ''));
            } catch (e) { todosMedicos = []; }
        
          if (especialidadeDetectada) {
          const especialidadeLower = especialidadeDetectada.toLowerCase();

          const sinonimos={'clinico geral':['clinico geral','clinica geral','medico geral','check-up','checkup'],'nutricao':['nutricao','nutricionista','dieta','emagrecer'],'fisioterapia':['fisioterapia','fisioterapeuta','rpg','reabilitacao'],'psicologia':['psicologia','psicologo','psicologa','ansiedade','depressao'],'geriatria':['geriatria','geriatra','idoso','terceira idade'],'ortopedia':['ortopedia','ortopedista','fratura','coluna','joelho','traumatologia','traumatologista'],'ecocardiograma':['ecocardiograma','ecografia','eco','ultrassom','ultrassonografia'],'psiquiatria':['psiquiatria','psiquiatra'],'urologia':['urologia','urologista','prostata'],'cardiologia':['cardiologia','cardiologista','coracao','arritmia','hipertensao'],'dermatologia':['dermatologia','dermatologista','pele','acne'],'ginecologia':['ginecologia','ginecologista','preventivo','papanicolau'],'gastroenterologia':['gastroenterologia','gastro','gastroenterologista','estomago','refluxo'],'neurologia':['neurologia','neurologista','enxaqueca','convulsao','neuropediatra'],'oftalmologia':['oftalmologia','oftalmologista','catarata','glaucoma'],'otorrinolaringologia':['otorrinolaringologia','otorrino','sinusite','rinite'],'pediatria':['pediatria','pediatra','crianca'],'pneumologia':['pneumologia','pneumologista','asma','bronquite'],'reumatologia':['reumatologia','reumatologista','artrite','fibromialgia'],'odontologia':['odontologia','dentista','ortodontia'],'endocrinologia':['endocrinologia','endocrinologista','tireoide','diabetes'],'quiropraxia':['quiropraxia','quiropraxista'],'massoterapia':['massoterapia','massoterapeuta','drenagem linfatica'],'optometria':['optometria','optometrista'],'hidroginastica':['hidroginastica','hidroterapia','natacao','piscina'],'pilates':['pilates'],'psicopedagogia':['psicopedagogia','psicopedagoga'],'eletrocardiograma':['eletrocardiograma','ecg']};

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
          termosRelacionados = [...new Set(termosRelacionados)];

          medicosParaBuscar = todosMedicos.filter(m => {
            const espPrincipal = normalizarTexto(m.especialidade || '');
            const matchPrincipal = termosRelacionados.some(t => {
              const tNorm = normalizarTexto(t);
              if (tNorm.length >= 5) return espPrincipal.includes(tNorm) || tNorm.includes(espPrincipal);
              return espPrincipal === tNorm;
            });
            const matchArray = m.especialidades?.some(e => {
              const eLower = normalizarTexto(e);
              return termosRelacionados.some(t => {
                const tNorm = normalizarTexto(t);
                if (tNorm.length >= 5) return eLower.includes(tNorm) || tNorm.includes(eLower);
                return eLower === tNorm;
              });
            });
            return matchPrincipal || matchArray;
          });

          if (medicosParaBuscar.length === 0) {
            const espNormCheck = normalizarTexto(especialidadeDetectada);
            let existeComoProcedimentoOuExame = false;
            try {
              const [procsCheck, examesCheck] = await Promise.all([
                Promise.race([base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' }), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))]).catch(() => []),
                Promise.race([base44.asServiceRole.entities.Exame.filter({ status: 'Ativo' }), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))]).catch(() => [])
              ]);
              existeComoProcedimentoOuExame = procsCheck.some(p => normalizarTexto(p.nome).includes(espNormCheck) || espNormCheck.includes(normalizarTexto(p.nome))) ||
                examesCheck.some(e => normalizarTexto(e.nome).includes(espNormCheck) || espNormCheck.includes(normalizarTexto(e.nome)));
              if (existeComoProcedimentoOuExame) especialidadeDetectada = null;
            } catch (e) {}
          }
          } else { medicosParaBuscar = []; }
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
              const slotsValidos = df===_hojeI ? slots.filter(h=>{
                const horaAtualSP = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
                return h > horaAtualSP;
              }) : slots;
              if(slotsValidos.length>0){
                // Pegar apenas o PRIMEIRO horário disponível (real do sistema)
                disponibilidadesMedico.push({data:df,data_formatada:dc.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'2-digit'}),horarios:[slotsValidos[0]]});
                if(disponibilidadesMedico.length>=5) break;
              }
            } catch(e){}
          }
          if(disponibilidadesMedico.length>0) disponibilidadesEncontradas.push({medico_id:medico.id,medico_nome:medico.nome,especialidade:medico.especialidade,disponibilidades:disponibilidadesMedico});
        }

        if (disponibilidadesEncontradas.length > 0) {
        const _amD=new Date();_amD.setDate(_amD.getDate()+1);const _amI=_amD.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
        infoDisponibilidade = `\n\n📅 DISPONIBILIDADES ENCONTRADAS (Primeiro horário livre de cada dia):\n🚨HOJE=${_hojeI} AMANHÃ=${_amI}.\n`;
        for(const medico of disponibilidadesEncontradas){
          infoDisponibilidade+=`\n👨‍⚕️ *${medico.medico_nome}* (${medico.especialidade}) [ID: ${medico.medico_id}]\n`;
          for(const d of medico.disponibilidades.slice(0,3)){
            if(!d.horarios?.length)continue;
            infoDisponibilidade+=`   📅 ${d.data_formatada}: ${d.horarios[0]}\n`;
          }
        }
          infoDisponibilidade+=disponibilidadesEncontradas.length>1?'\n⚠️ Apresente os médicos e o PRIMEIRO horário disponível de cada dia. Pergunte qual prefere.':'\n⚠️ Apresente o PRIMEIRO horário disponível de cada dia listado. Pergunte se esse horário fica bom.';
          infoDisponibilidade+='\n⚠️ Para confirmar: nome completo e CPF (apenas números).';
        } else if (medicosParaBuscar.length > 0) {
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
          if(_fbDisp.length>0){const _am2=new Date();_am2.setDate(_am2.getDate()+1);const _amI2=_am2.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
            infoDisponibilidade=`\n\n📅 DISPONIBILIDADES ENCONTRADAS:\n🚨HOJE=${_hojeI} AMANHÃ=${_amI2}.\n`;
            for(const m of _fbDisp){infoDisponibilidade+=`\n👨‍⚕️ *${m.nome}* (${m.esp}) [ID: ${m.id}]\n`;for(const d of m.dias.slice(0,3)){infoDisponibilidade+=`   📅 ${d.fmt}: ${d.hi} às ${d.hf} (~${d.sl} vagas)\n`;}}
            infoDisponibilidade+=_fbDisp.length>1?'\n⚠️ Apresente médicos e próximos dias. Pergunte qual prefere.':'\n⚠️ Apresente próximos dias. Pergunte qual prefere.';
            infoDisponibilidade+='\n⚠️ Para confirmar: nome completo e CPF (apenas números).';
          }else{
            infoDisponibilidade=`\n\n⚠️ HORÁRIOS ESGOTADOS para ${especialidadeDetectada||'esta especialidade'}.\n🚨 NÃO diga "todos os horários estão ocupados nos próximos 30 dias". Diga que os horários estão preenchidos e sugira ligar (51) 3661-5991 para encaixes. Seja POSITIVO.`;
          }
        } else if (medicosParaBuscar.length === 0 && especialidadeDetectada) {
          infoDisponibilidade = `\n\n❌ ESPECIALIDADE NÃO DISPONÍVEL: "${especialidadeDetectada}"\nNão temos profissionais de ${especialidadeDetectada} cadastrados. Informe ao cliente e sugira ligar 51 3661-5991.`;
        } else {
          infoDisponibilidade = '\n\n⚠️ Sem disponibilidades. Sugira ligar 51 3661-5991.';
        }
      } catch (e) {}
      }
      }
      }

    let agendamentoCriado = false;
    let mensagemAgendamento = '';
    let dadosFaltantes = [];
    
    const historicoTemEspecialidadeLocal = historicoConversa && /clínico|clinico|cardiolog|dermatolog|ginecolog|nutrici|psicolog|ortoped|urolog|geriatr|gastro|reumato|psiquiatr|fisioterap|oftalmolog|otorrino|pediatr|pneumolog|neurolog|quiroprax|massoterap|optometr|hidro|pilates|odontolog|dentist|endocrinolog|Dr\.|👨‍⚕️/i.test(historicoConversa);
    const assistentePediuDadosPaciente = historicoConversa && /nome completo|cpf|data de nascimento|DD\/MM\/AAAA|nome do paciente/i.test(historicoConversa);
    const clienteFornecendoDadosPessoais = assistentePediuDadosPaciente && (/^\d{11}$/.test(messageText.trim().replace(/\D/g,'')) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(messageText.trim()) || /[A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+.*\d{3}/.test(messageText) || (/^[A-Za-zÀ-ÿ\s]+$/.test(messageText.trim()) && messageText.trim().split(/\s+/).length >= 2));
    
    const _soPerguntandoDisp = ehPerguntaDisponibilidadeMedico && !clienteFornecendoDadosPessoais && !/agendar|marcar/i.test(messageText);
    const estaEmFluxoAgendamento = !agendamentoRecenteConcluido && !_soPerguntandoDisp && ((querAgendar && historicoTemEspecialidadeLocal && !ehPerguntaDisponibilidadeMedico) || (historicoConversa && /horário|data|nascimento|doutor|dr\./i.test(historicoConversa) && historicoTemEspecialidadeLocal && !ehPerguntaPreco && !_soPerguntandoDisp) || clienteFornecendoDadosPessoais);
    const clienteEscolhendoHorarioAgora = !_soPerguntandoDisp && /pode ser|quero|às?\s*\d|hoje|\d{1,2}[h:]|horário/i.test(messageText) && historicoTemEspecialidadeLocal;
    if ((estaEmFluxoAgendamento || clienteEscolhendoHorarioAgora) && !clienteRecusandoAgendar) {
      try {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const dataHojeFormatada = hoje.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        let medicosDisponiveis = '';
        try {
          const medicosAtivos = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
          medicosDisponiveis = medicosAtivos.map(m => `- ${m.nome} (${m.especialidade}) [ID: ${m.id}]`).join('\n');
        } catch (e) {}

        const promptExtracao = `Você é inteligentíssimo em extrair dados de agendamento. Analise MUITO BEM o histórico E a última mensagem.

        ⚠️ REGRAS CRÍTICAS DE INTERPRETAÇÃO:
        1. Se cliente diz "João, 14 horas" = escolheu MÉDICO (João) E HORÁRIO (14:00)
        2. Se cliente diz "14 horas" ou "14h" ou "às 14" = está confirmando o HORÁRIO que foi oferecido
        3. Se cliente diz "segunda" ou "21/01" = está escolhendo a DATA
        4. Se cliente diz nome próprio em contexto de agendamento = é o NOME DO MÉDICO ou NOME DO PACIENTE (use contexto!)
        5. Se está no fluxo de agendamento (histórico menciona médicos/horários), interprete SEMPRE para preencher dados faltantes
        6. ⚠️ CRÍTICO: Se cliente envia "Nome Completo CPF" (ex: "Antonio thiago cavalcanti 12345678900"), extraia:
           - nome_paciente = "Antonio Thiago Cavalcanti" (tudo antes do CPF, capitalize corretamente)
           - cpf = "12345678900" (os 11 dígitos numéricos)
           - Também aceitar formatos com pontos: "123.456.789-00"

        HISTÓRICO DA CONVERSA:
        ${historicoConversa || '(sem histórico)'}

        ÚLTIMA MENSAGEM DO CLIENTE:
        ${messageText}

⚠️ DATA ATUAL: ${dataHojeFormatada} (${hoje.toISOString().split('T')[0]})

📋 MÉDICOS CADASTRADOS NO SISTEMA:
${medicosDisponiveis}

EXTRAIA OS DADOS QUE CONSEGUIR ENCONTRAR:
1. nome_paciente: nome completo (ex: "Antonio Thiago Cavalcanti Alves") - se vier junto com CPF, separe!
2. cpf: 11 dígitos numéricos (ex: "12345678900") - pode vir formatado como "123.456.789-00", extraia apenas os números
3. medico_nome: nome EXATO do médico escolhido da lista acima (ex: "Dr. João Inocencio Rodrigues Gonçalves")
4. medico_id: ID do médico escolhido da lista acima (se encontrar)
5. data_agendamento: formato YYYY-MM-DD (converta "14/01" para "${anoAtual}-01-14", "hoje" para "${hoje.toISOString().split('T')[0]}")
6. horario: formato HH:MM (converta "17:30", "17h30", "às 17:30" para "17:30")

REGRAS CRÍTICAS:
- Se o cliente disse "hoje", use ${hoje.toISOString().split('T')[0]}
- Se disse apenas dia/mês (14/01), adicione ano ${anoAtual}
- Marque cada campo como null se NÃO encontrar
- dados_completos = true APENAS se nome_paciente + cpf + medico + data + horario estiverem preenchidos
- IMPORTANTE: Use o nome EXATO do médico que foi OFERECIDO no histórico da conversa
- Se o assistente ofereceu "Dr. Douglas Filipe Bianchi", use EXATAMENTE esse nome
- NÃO confunda médicos diferentes - verifique qual médico foi mencionado na conversa
- ⚠️ MUITO IMPORTANTE: Se o cliente enviou nome e CPF juntos (ex: "Antonio thiago 12345678900"), EXTRAIA AMBOS! O nome é tudo antes do CPF, o CPF são os 11 dígitos numéricos.
- 🚨🚨 REGRA ABSOLUTAMENTE CRÍTICA SOBRE HORÁRIOS: O horario extraído DEVE ser EXATAMENTE um dos horários listados pelo ASSISTENTE no histórico da conversa. Procure a mensagem onde o assistente mostrou disponibilidades (ex: "Segunda 2/03: 08:00", "Sexta 6/03: 10:00"). Se o cliente escolheu "sexta dia 6" e o horário oferecido para sexta dia 6 foi "10:00", extraia horario="10:00". NUNCA invente horário (como 14:00) que NÃO foi oferecido. Se não especificou horário, use o PRIMEIRO horário oferecido para o dia escolhido.

Retorne JSON.`;

        let extracao = { dados_completos: false, nome_paciente: null, cpf: null, medico_nome: null, medico_id: null, data_agendamento: null, horario: null };
        try {
          const _extR = await Promise.race([fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${Deno.env.get('OPENAI_API_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:promptExtracao+'\n\nRetorne APENAS JSON válido.'}],max_tokens:500,temperature:0,response_format:{type:'json_object'}})}), new Promise((_,r)=>setTimeout(()=>r(new Error('Timeout')),15000))]);
          if (_extR.ok) { const _ed=await _extR.json(); try { extracao=JSON.parse(_ed.choices?.[0]?.message?.content||'{}'); } catch(e){} }
        } catch(_ee){}

        // CORREÇÃO: Se a data extraída não bate com o dia da semana mencionado no histórico, corrigir
        if (extracao.data_agendamento) {
          const diasSemanaRegex = /segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo/gi;
          const diasSemanaMap = {'segunda':1,'terca':2,'terça':2,'quarta':3,'quinta':4,'sexta':5,'sabado':6,'sábado':6,'domingo':0};
          // Verificar se no histórico/mensagem há menção a dia da semana
          const textoCompleto = (messageText + ' ' + (ultimaMsgAssistenteFull || '')).toLowerCase();
          const matchDiaSemana = textoCompleto.match(diasSemanaRegex);
          if (matchDiaSemana) {
            const diaSemanaDesejado = diasSemanaMap[matchDiaSemana[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
            if (diaSemanaDesejado !== undefined) {
              const dataExtraida = new Date(extracao.data_agendamento + 'T12:00:00');
              const diaSemanaExtraido = dataExtraida.getUTCDay();
              if (diaSemanaExtraido !== diaSemanaDesejado) {
                // Calcular a próxima ocorrência do dia da semana desejado
                const hoje = new Date();
                const hojeLocal = new Date(hoje.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T12:00:00');
                let diff = diaSemanaDesejado - hojeLocal.getUTCDay();
                if (diff <= 0) diff += 7;
                const novaData = new Date(hojeLocal);
                novaData.setUTCDate(novaData.getUTCDate() + diff);
                // Se o cliente mencionou "dia X", verificar se bate
                const diaNumMatch = messageText.match(/dia\s*(\d{1,2})/i);
                if (diaNumMatch) {
                  const diaNum = parseInt(diaNumMatch[1]);
                  if (novaData.getUTCDate() === diaNum) {
                    extracao.data_agendamento = novaData.toISOString().split('T')[0];
                    console.log(`📅 Data corrigida para ${extracao.data_agendamento} (${matchDiaSemana[0]} dia ${diaNum})`);
                  }
                } else {
                  extracao.data_agendamento = novaData.toISOString().split('T')[0];
                  console.log(`📅 Data corrigida para ${extracao.data_agendamento} (próxima ${matchDiaSemana[0]})`);
                }
              }
            }
          }
        }

        if(extracao.horario&&extracao.data_agendamento&&historicoConversa&&!historicoConversa.includes(extracao.horario)){const dO=new Date(extracao.data_agendamento+'T12:00:00');const dN=String(dO.getUTCDate()).padStart(2,'0');const mN=String(dO.getUTCMonth()+1).padStart(2,'0');const hA=historicoMensagensRaw.filter(m=>m.role==='assistant').map(m=>m.content).join('\n');const rx=new RegExp(`(?:${dN}[/.]${mN}|dia\\s*${parseInt(dN)})[^\\n]*(\\d{2}:\\d{2})`,'gi');const mt=[...(hA.matchAll(rx))];if(mt.length>0){extracao.horario=mt[0][1];}}
            if (!extracao.nome_paciente) dadosFaltantes.push('nome completo');
            if (!extracao.cpf) dadosFaltantes.push('CPF');

        const jaEscolheuMedico = historicoConversa && /(Dr\.|👨‍⚕️|médico|doutor)/i.test(historicoConversa) && (extracao.medico_nome || extracao.medico_id);
        const jaEscolheuHorario = historicoConversa && /\d{1,2}[h:]|14:00|15:00|16:00|hora/i.test(historicoConversa) && extracao.horario;

        if (!extracao.medico_nome && !extracao.medico_id && !jaEscolheuMedico) dadosFaltantes.push('médico');
        if (!extracao.data_agendamento) dadosFaltantes.push('data da consulta');
        if (!extracao.horario && !jaEscolheuHorario) dadosFaltantes.push('horário');

        const _nV=extracao.nome_paciente&&extracao.nome_paciente.trim().split(/\s+/).length>=2&&extracao.nome_paciente.trim().length>=5;
        const _cpfV=extracao.cpf&&extracao.cpf.replace(/\D/g,'').length===11;
        if(!_nV||!_cpfV){extracao.dados_completos=false;if(!_nV&&!dadosFaltantes.includes('nome completo'))dadosFaltantes.push('nome completo');if(!_cpfV&&!dadosFaltantes.includes('CPF'))dadosFaltantes.push('CPF');}
        const mensagemEhPerguntaNova=/\?|quanto custa|qual valor|pre[cç]o|valor da consulta|valor do exame|onde fica|endere[cç]o|telefone|conv[eê]nio|convenio/i.test(messageText||'');
        const assistentePediuConfirmacaoHorario=/você gostaria de agendar esse horário|gostaria de agendar esse horário|quer agendar esse horário|posso confirmar esse horário|qual dessas datas|qual desses hor[áa]rios|qual hor[áa]rio.*prefere|qual data.*prefere|qual.*voc[êe].*prefere|qual.*você.*prefere|escolha.*data|escolha.*hor[áa]rio/i.test(ultimaMsgAssistenteFull||'');
        const assistentePediuDadosParaFinalizar=/nome completo|cpf|data de nascimento|dd\/mm\/aaaa|para finalizar|para confirmar|para prosseguir/i.test(ultimaMsgAssistenteFull||'');
        const clienteConfirmouOuEscolheu=/^(sim|s|ok|quero|pode|claro|isso|esse|essa|confirmo|pode ser|vamos|fechado|certo|correto)$/i.test((messageText||'').trim())||/\d{1,2}[:h]\d{2}|\d{1,2}\/\d{1,2}|segunda|ter[cç]a|quarta|quinta|sexta|s[áa]bado|amanh[ãa]|hoje/i.test(messageText||'');
        const clienteEnviouCPFNaMensagem=/\d{11}/.test((messageText||'').replace(/\D/g,''));
        const clienteEnviouDadosPessoaisNaMensagem=(clienteEnviouCPFNaMensagem&&/[A-Za-zÀ-ÿ]{2,}/.test(messageText||''))||(/\d{1,2}\/\d{1,2}\/\d{4}/.test(messageText||'')&&/[A-Za-zÀ-ÿ]{2,}/.test(messageText||''));
        const clienteEnviouComplementoDadosNaMensagem=clienteEnviouDadosPessoaisNaMensagem||clienteEnviouCPFNaMensagem||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test((messageText||'').trim())||(/^[A-Za-zÀ-ÿ\s]+$/.test((messageText||'').trim())&&(messageText||'').trim().split(/\s+/).length>=2);
        
        const assistentePediuConfirmacaoDados = /correto.*\?|confirma.*\?|est[áa] (correto|certo).*\?|s[óo] para confirmar/i.test(ultimaMsgAssistenteFull||'');

        // No fluxo de remarcação, o paciente já existe no sistema - buscar dados dele se nome/CPF estão faltando
        let _nVFinal = _nV;
        let _cpfVFinal = _cpfV;
        if (!_nV || !_cpfV) {
          // Tentar obter nome/CPF do paciente pelo telefone
          try {
            const telN = phoneNumber.replace(/\D/g, '');
            const u8Tel = telN.slice(-8);
            const todosPacs = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
            const pacEncontrado = todosPacs.find(p => (p.telefone || '').replace(/\D/g, '').slice(-8) === u8Tel);
            if (pacEncontrado) {
              if (!_nV && pacEncontrado.nome && pacEncontrado.nome.trim().split(/\s+/).length >= 2) {
                extracao.nome_paciente = pacEncontrado.nome;
                _nVFinal = true;
              }
              if (!_cpfV && pacEncontrado.cpf && pacEncontrado.cpf.replace(/\D/g, '').length === 11 && pacEncontrado.cpf !== 'NÃO INFORMADO') {
                extracao.cpf = pacEncontrado.cpf.replace(/\D/g, '');
                _cpfVFinal = true;
              }
            }
          } catch (e) {}
        }
        const podeCriarAgendamentoAgora=!mensagemEhPerguntaNova&&((assistentePediuConfirmacaoHorario&&clienteConfirmouOuEscolheu)||(assistentePediuDadosParaFinalizar&&clienteEnviouComplementoDadosNaMensagem&&_nVFinal&&_cpfVFinal)||(assistentePediuConfirmacaoDados&&clienteConfirmouOuEscolheu&&_nVFinal&&_cpfVFinal));
        if (_nVFinal && _cpfVFinal && (extracao.medico_nome || extracao.medico_id) && extracao.data_agendamento && extracao.horario && podeCriarAgendamentoAgora) {
          
          // REMARCAÇÃO: Se o histórico indica remarcação, cancelar o agendamento antigo ANTES de criar o novo
          const ehRemarcacao = /remarcar|adiar|mudar.*data|mudar.*hor[áa]rio/i.test(historicoConversa || '');
          let agendamentoAntigoCancelado = false;
          if (ehRemarcacao) {
            try {
              const telNormRemar = phoneNumber.replace(/\D/g, '');
              const variantesRemar = [telNormRemar];
              if (telNormRemar.startsWith('55') && telNormRemar.length >= 12) variantesRemar.push(telNormRemar.slice(2));
              if (!telNormRemar.startsWith('55') && telNormRemar.length >= 10) variantesRemar.push('55' + telNormRemar);
              const ultimos8Remar = telNormRemar.slice(-8);
              const hjRemar = new Date().toISOString().split('T')[0];

              const todosPacsRemar = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
              const pacsPorTelefone = todosPacsRemar.filter(p => {
                const telPaciente = (p.telefone || '').replace(/\D/g, '');
                return variantesRemar.includes(telPaciente) || (ultimos8Remar && telPaciente.slice(-8) === ultimos8Remar);
              });

              let agsAtivosRemar = [];
              const idsAgendamento = new Set();

              for (const pacienteTel of pacsPorTelefone) {
                const agsPaciente = await base44.asServiceRole.entities.Agendamento.filter({ paciente_id: pacienteTel.id });
                agsPaciente
                  .filter(a => a.data_agendamento >= hjRemar && ['Agendado', 'Confirmado', 'Pago'].includes(a.status))
                  .forEach(a => {
                    if (!idsAgendamento.has(a.id)) {
                      idsAgendamento.add(a.id);
                      agsAtivosRemar.push(a);
                    }
                  });
              }

              if (agsAtivosRemar.length > 0) {
                // Tentar identificar qual agendamento cancelar pelo médico mencionado no histórico
                let agParaCancelar = null;
                if (extracao.medico_id) {
                  agParaCancelar = agsAtivosRemar.find(a => a.medico_id === extracao.medico_id);
                }
                if (!agParaCancelar && extracao.medico_nome) {
                  const mdsRemar = await base44.asServiceRole.entities.Medico.list();
                  const medRemar = mdsRemar.find(m => m.nome.toLowerCase().includes(extracao.medico_nome.toLowerCase()) || extracao.medico_nome.toLowerCase().includes(m.nome.toLowerCase()));
                  if (medRemar) agParaCancelar = agsAtivosRemar.find(a => a.medico_id === medRemar.id);
                }
                // Se só tem 1 agendamento ativo, cancelar ele
                if (!agParaCancelar && agsAtivosRemar.length === 1) {
                  agParaCancelar = agsAtivosRemar[0];
                }
                if (agParaCancelar) {
                  await base44.asServiceRole.entities.Agendamento.update(agParaCancelar.id, { status: 'Cancelado', observacoes: `Cancelado automaticamente para remarcação via WhatsApp em ${new Date().toLocaleString('pt-BR')}` });
                  try {
                    const mdsNotif = await base44.asServiceRole.entities.Medico.list();
                    const medNotif = mdsNotif.find(m => m.id === agParaCancelar.medico_id);
                    const dfNotif = new Date(agParaCancelar.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
                    await base44.asServiceRole.entities.Notification.create({ type: 'agendamento_cancelado', message: `🔄 ${agParaCancelar.paciente_nome || 'Paciente'} remarcou ${medNotif?.especialidade || ''} com ${medNotif?.nome || 'Médico'} - ${dfNotif} às ${agParaCancelar.horario}`, data: { agendamento_id: agParaCancelar.id, paciente_nome: agParaCancelar.paciente_nome, medico_nome: medNotif?.nome, cancelado_por: 'WhatsApp - Glória (remarcação)' }, is_read: false });
                  } catch (e) {}
                  agendamentoAntigoCancelado = true;
                  console.log(`🔄 Agendamento antigo ${agParaCancelar.id} cancelado para remarcação`);
                }
              }
            } catch (e) { console.log('⚠️ Erro ao cancelar agendamento antigo para remarcação:', e.message); }
          }

          let medicos = [];
          try {
            medicos = await Promise.race([
              base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Medicos')), 3000))
            ]);
          } catch (e) {}
          let medicoEncontrado = null;
          
          if (extracao.medico_id) medicoEncontrado = medicos.find(m => m.id === extracao.medico_id);
          
          if (!medicoEncontrado && extracao.medico_nome) {
            const nomeExtraidoLower = extracao.medico_nome.toLowerCase();
            medicoEncontrado = medicos.find(m => m.nome.toLowerCase() === nomeExtraidoLower);
            if (!medicoEncontrado) {
              medicoEncontrado = medicos.find(m => {
                const nomeMedicoLower = m.nome.toLowerCase();
                return nomeMedicoLower.includes(nomeExtraidoLower) || nomeExtraidoLower.includes(nomeMedicoLower) ||
                       nomeExtraidoLower.split(' ').filter(p => p.length > 2 && nomeMedicoLower.includes(p)).length >= 2;
              });
            }
          }
          
          if (medicoEncontrado) {
            const cpfLimpo = extracao.cpf ? extracao.cpf.replace(/\D/g, '') : null;

            let paciente = null;
            if (cpfLimpo && cpfLimpo.length === 11) {
              const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
              paciente = todosPacientes.find(p => (p.cpf || '').replace(/\D/g, '') === cpfLimpo);
            }
            if (!paciente) {
              let pacientesExistentes = await base44.asServiceRole.entities.Paciente.filter({ telefone: phoneNumber });
              if (pacientesExistentes.length === 0) {
                const telNorm = phoneNumber.replace(/\D/g, '');
                const variantes = [telNorm];
                if (telNorm.startsWith('55') && telNorm.length >= 12) variantes.push(telNorm.slice(2));
                if (!telNorm.startsWith('55') && telNorm.length >= 10) variantes.push('55' + telNorm);
                for (const v of variantes) {
                  if (paciente) break;
                  const found = await base44.asServiceRole.entities.Paciente.filter({ telefone: v });
                  if (found.length > 0) paciente = found[0];
                }
              } else {
                paciente = pacientesExistentes[0];
              }
            }
            
            if (paciente) {
              const updateData = { nome: extracao.nome_paciente };
              if (!paciente.telefone || paciente.telefone === '') updateData.telefone = phoneNumber;
              if (cpfLimpo && cpfLimpo.length === 11 && (!paciente.cpf || paciente.cpf === 'NÃO INFORMADO')) {
                updateData.cpf = cpfLimpo;
              }
              await base44.asServiceRole.entities.Paciente.update(paciente.id, updateData);
            } else {
              paciente = await base44.asServiceRole.entities.Paciente.create({
                nome: extracao.nome_paciente, telefone: phoneNumber, cpf: cpfLimpo || 'NÃO INFORMADO', observacoes: 'Criado via WhatsApp pela Glória'
              });
            }

            let agendamentosExistentes = [];
            try {
              const _agEx = await Promise.race([
                base44.asServiceRole.entities.Agendamento.filter({ medico_id: medicoEncontrado.id, data_agendamento: extracao.data_agendamento, horario: extracao.horario }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Agendamentos')), 2000))
              ]);
              agendamentosExistentes = _agEx.filter(a => a.status !== 'Cancelado');
            } catch (e) {}

            let horarioValidado=false;
            try{
              const sr = await base44.asServiceRole.functions.invoke('getAvailableSlots', { medico_id: medicoEncontrado.id, data: extracao.data_agendamento });
              if (sr?.data?.available_slots && sr.data.available_slots.includes(extracao.horario)) {
                horarioValidado = true;
              }
            }catch(vE){}
            if(!horarioValidado){mensagemAgendamento=`😔 O horário ${extracao.horario} em ${new Date(extracao.data_agendamento+'T12:00:00').toLocaleDateString('pt-BR')} não está disponível na agenda do(a) ${medicoEncontrado.nome}. Vou buscar os próximos horários disponíveis!`;dadosFaltantes.push('horário válido');}
            else if (agendamentosExistentes.length === 0) {
              let categoriaParticularId = null;
              let valorConsulta = 0;
              try {
                const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({ nome: 'Particular', status: 'Ativo' });
                if (categorias.length > 0) {
                  categoriaParticularId = categorias[0].id;
                  try {
                    const [tabelaPrecos, procedimentos] = await Promise.all([
                      Promise.race([base44.asServiceRole.entities.TabelaPreco.filter({ categoria_id: categoriaParticularId }, '-created_date', 500), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout TabelaPrecos')), 3000))]).catch(() => []),
                      Promise.race([base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' }, '-created_date', 500), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Procedimentos')), 3000))]).catch(() => [])
                    ]);
                    const especialidadeMedico = (medicoEncontrado.especialidade || '').toLowerCase();
                    let procedimentoConsulta = procedimentos.find(p => { const nomeLower = (p.nome || '').toLowerCase(); const espLower = (p.especialidade || '').toLowerCase(); return (nomeLower.includes('consulta') || nomeLower.includes(especialidadeMedico)) && (espLower.includes(especialidadeMedico) || especialidadeMedico.includes(espLower)); });
                    if (!procedimentoConsulta) procedimentoConsulta = procedimentos.find(p => { const nomeLower = (p.nome || '').toLowerCase(); return nomeLower.includes('consulta') && (nomeLower.includes('clínico') || nomeLower.includes('clinico') || nomeLower.includes('geral')); });
                    if (procedimentoConsulta) { const preco = tabelaPrecos.find(tp => tp.procedimento_id === procedimentoConsulta.id); if (preco) valorConsulta = preco.valor || 0; }
                  } catch (precoError) {}
                }
              } catch (e) {}
              
              const novoAgendamento = await base44.asServiceRole.entities.Agendamento.create({
                paciente_id: paciente.id, paciente_nome: extracao.nome_paciente, medico_id: medicoEncontrado.id, data_agendamento: extracao.data_agendamento, horario: extracao.horario, tipo_servico: 'Consulta', status: 'Agendado', categoria_preco_id: categoriaParticularId, valor_total: valorConsulta, valor_final: valorConsulta, observacoes: ehRemarcacao && agendamentoAntigoCancelado ? 'Remarcado pela Glória' : 'Agendado pela Glória', agendado_por: 'Glória', agendado_por_tipo: 'chatbot'
              });

              try {
                const dataObjNotif = new Date(extracao.data_agendamento + 'T12:00:00');
                const dataFormatadaNotif = dataObjNotif.toLocaleDateString('pt-BR');
                await base44.asServiceRole.entities.Notification.create({
                  type: 'novo_agendamento', message: `${ehRemarcacao ? '🔄' : '🆕'} ${extracao.nome_paciente} - ${medicoEncontrado.especialidade} com ${medicoEncontrado.nome} em ${dataFormatadaNotif} às ${extracao.horario}${ehRemarcacao ? ' (remarcação)' : ''}`, data: { agendamento_id: novoAgendamento.id, paciente_nome: extracao.nome_paciente, medico_nome: medicoEncontrado.nome, especialidade: medicoEncontrado.especialidade, data: extracao.data_agendamento, horario: extracao.horario, agendado_por: 'Glória', agendado_por_tipo: 'chatbot' }, is_read: false
                });
              } catch (notifError) {}

              agendamentoCriado = true;
              const dataObj = new Date(extracao.data_agendamento + 'T12:00:00');
              const dataFormatada = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
              mensagemAgendamento = `✅ Agendamento confirmado!\n\n📋 Resumo:\n• Paciente: ${extracao.nome_paciente}\n• Médico: ${medicoEncontrado.nome} (${medicoEncontrado.especialidade})\n• Data: ${dataFormatada}\n• Horário: ${extracao.horario}\n\n📍 Endereço: Tristão Monteiro, 580 – Zona Nova, Tramandaí/RS\n\n⚠️ Lembre-se de trazer documento original com foto.\n\nTe aguardamos! 😊`;
            } else if(agendamentosExistentes.length > 0) {
              mensagemAgendamento = `😔 Poxa, esse horário acabou de ser preenchido. Vou verificar outras opções disponíveis para você!`;
            }
          }
        }
      } catch (extracaoError) {}
    }

    const estaConfirmando = /^(sim|s|ok|certo|correto|confirmo|pode|isso|claro|beleza|tudo bem|confirm|yes)$/i.test(messageText.trim());
    if(agendamentoCriado){
      try{const c=await buscarContatoPorTelefone(phoneNumber);const ts=new Date().toISOString();if(c){const h=c.historico_mensagens||[];h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:mensagemAgendamento,timestamp:ts});await base44.asServiceRole.entities.Contato.update(c.id,{ultima_mensagem:messageText,ultima_resposta:mensagemAgendamento,historico_mensagens:h.slice(-50),ultima_interacao:ts,total_mensagens:(c.total_mensagens||0)+2,agendamentos_realizados:(c.agendamentos_realizados||0)+1,processando_ia_lock:null});}}catch(e){}
      await liberarLock(base44, phoneNumber, lockName);
      return Response.json({success:true,resposta:mensagemAgendamento,conversationId:null,agendamento_criado:true});
    }

    if(mensagemAgendamento && !agendamentoCriado){
      try{const c=await buscarContatoPorTelefone(phoneNumber);const ts=new Date().toISOString();if(c){const h=c.historico_mensagens||[];h.push({role:'user',content:messageText,timestamp:ts},{role:'assistant',content:mensagemAgendamento,timestamp:ts});await base44.asServiceRole.entities.Contato.update(c.id,{ultima_mensagem:messageText,ultima_resposta:mensagemAgendamento,historico_mensagens:h.slice(-50),ultima_interacao:ts,total_mensagens:(c.total_mensagens||0)+2,processando_ia_lock:null});}}catch(e){}
      await liberarLock(base44, phoneNumber, lockName);
      return Response.json({success:true,resposta:mensagemAgendamento,conversationId:null,agendamento_criado:false});
    }

    const agoraBrasilia = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const horaNumero = parseInt(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
    const dataAtualCompleta = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dataAtualISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const diaSemanaHoje = new Date().toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    const diaSemanaNum = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(diaSemanaHoje);
    const clinicaAbertaHoje = diaSemanaNum >= 1 && diaSemanaNum <= 5;
    const diasSemPt = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
    const statusClinicaHoje = clinicaAbertaHoje ? `🏥 A CLÍNICA ESTÁ ABERTA HOJE (${diasSemPt[diaSemanaNum]}), das 08:00 às 19:00. NÃO diga que está fechada!` : `🚫 A CLÍNICA ESTÁ FECHADA HOJE (${diasSemPt[diaSemanaNum]}). Funciona segunda a sexta, 08:00 às 19:00.`;
    let saudacaoHorario = 'Bom-dia';
    if (horaNumero >= 12 && horaNumero < 18) saudacaoHorario = 'Boa-tarde';
    else if (horaNumero >= 18 || horaNumero < 5) saudacaoHorario = 'Boa-noite';
    const ehPrimeiraMensagem = ehPrimeiraMensagemDefinitiva;
    let infoProcedimentosExames = '';
    let _allProcedimentos = [];
    let _allExames = [];
    let _allTabelaPrecos = [];
    let _categoriasMap = {};
    
    {
      try {
        const [procedimentos, exames, tabelaPrecos] = await Promise.all([
          Promise.race([base44.asServiceRole.entities.Procedimento.list('-created_date', 2000), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Procedimentos')), 10000))]).catch(e => { console.log('⚠️ Timeout/erro Procedimentos:', e.message); return []; }),
          Promise.race([base44.asServiceRole.entities.Exame.list('-created_date', 2000), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Exames')), 10000))]).catch(e => { console.log('⚠️ Timeout/erro Exames:', e.message); return []; }),
          Promise.race([base44.asServiceRole.entities.TabelaPreco.list('-created_date', 2000), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout TabelaPrecos')), 10000))]).catch(e => { console.log('⚠️ Timeout/erro TabelaPrecos:', e.message); return []; })
        ]);
        _allProcedimentos = Array.isArray(procedimentos) ? procedimentos.filter(p => p.status === 'Ativo') : [];
        _allExames = Array.isArray(exames) ? exames.filter(e => e.status === 'Ativo') : [];
        _allTabelaPrecos = Array.isArray(tabelaPrecos) ? tabelaPrecos : [];
        console.log('📦 Dados carregados: Procedimentos=', _allProcedimentos.length, 'Exames=', _allExames.length, 'TabelaPrecos=', _allTabelaPrecos.length);

        let categoriasPreco = [];
        try { categoriasPreco = await Promise.race([base44.asServiceRole.entities.CategoriaPreco.filter({ status: 'Ativo' }), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout CategoriaPreco')), 2000))]); } catch (e) {}
        const categoriasMap = {};
        categoriasPreco.forEach(c => { categoriasMap[c.id] = c.nome; });
        _categoriasMap = categoriasMap;

      if (procedimentos.length > 0 || exames.length > 0) {
          infoProcedimentosExames = `\n\n📋 BASE DE DADOS - PROCEDIMENTOS E EXAMES COM PREÇOS:\n`;
          if (procedimentos.length > 0) {
            infoProcedimentosExames += '\n🏥 PROCEDIMENTOS DISPONÍVEIS:\n';
            for (const proc of procedimentos) {
              const precosDeste = tabelaPrecos.filter(tp => tp.procedimento_id === proc.id && tp.valor > 0);
              let valoresStr = '';
              if (precosDeste.length > 0) {
                const partes = precosDeste.map(tp => { const catNome = categoriasMap[tp.categoria_id] || 'Outro'; return `${catNome}: R$ ${tp.valor.toFixed(2)}`; });
                valoresStr = partes.join(' | ');
              } else { valoresStr = 'Consultar'; }
              infoProcedimentosExames += `• ${proc.nome}${proc.especialidade ? ` (${proc.especialidade})` : ''} - ${valoresStr}\n`;
            }
          }
          if (exames.length > 0) {
            infoProcedimentosExames += '\n🔬 EXAMES DISPONÍVEIS:\n';
            for (const exame of exames) {
              const valores = [];
              if (exame.valor_particular) valores.push(`Particular: R$ ${exame.valor_particular.toFixed(2)}`);
              if (exame.valor_convenio) valores.push(`Convênio/Cartão: R$ ${exame.valor_convenio.toFixed(2)}`);
              const valoresStr = valores.length > 0 ? valores.join(' | ') : 'Consultar';
              infoProcedimentosExames += `• ${exame.nome}${exame.tipo ? ` (${exame.tipo})` : ''} - ${valoresStr}\n`;
            }
          }
          infoProcedimentosExames += `\n🚨🚨🚨 REGRAS ABSOLUTAS DE PREÇOS 🚨🚨🚨:\n1. COPIE os valores EXATOS com centavos da lista acima (ex: R$ 21,85 e NÃO R$ 22,00 ou R$ 40,00).\n2. Se o exame NÃO está na lista acima, diga "Consultar na recepção" - NUNCA invente um preço.\n3. NÃO arredonde valores. R$ 5,82 é R$ 5,82, NÃO R$ 6,00 nem R$ 15,00.\n4. Para TOTAIS, some os valores EXATOS com centavos. Confira a soma.\n5. "Colesterol total e frações" = Colesterol Total + Colesterol HDL + Colesterol LDL + Colesterol VLDL + Triglicerídios (some cada um).\n6. "Glicose em jejum" = GLICOSE (R$ que está na lista).\n7. "Hemoglobina glicada" = HEMOGLOBINA GLICOSILADA (AC1) na lista.\n8. Para exames de sangue, a clínica faz coleta diária, NÃO precisa agendar.\n9. Se o valor_convenio for 0 ou não existir, NÃO mostre preço de Cartão Mais Vida para esse exame - mostre apenas Particular.`;
        }
      } catch (e) {}
    }

    let instrucoesMidia = '';
    if (mediaType === 'image') instrucoesMidia = `\n\n📷 IMAGEM RECEBIDA: O texto da imagem foi extraído via OCR e está no conteúdo da mensagem.\n🚨 INSTRUÇÕES OBRIGATÓRIAS PARA ORÇAMENTO:\n1. LISTE APENAS exames que aparecem na imagem.\n2. Para CADA exame, encontre o nome EXATO na BASE DE DADOS acima e copie o valor COM CENTAVOS.\n3. PROIBIDO arredondar ou inventar valores. Se na base diz R$ 21,85, escreva R$ 21,85.\n4. Se um exame não está na base, escreva "Consultar na recepção".\n5. Some os valores EXATOS para o total. Confira a soma.\n6. Mostre Particular. Só mostre Cartão Mais Vida se o exame tiver valor_convenio > 0.\n⚠️ REGRA DOPPLER: "Doppler" NÃO é um exame separado! É um complemento. Ex: "Ecocardiograma" + "Doppler" = UM ÚNICO exame "Ecocardiograma com Doppler". "Ecografia" + "Doppler" = "Ecografia com Doppler". NUNCA liste Doppler como item separado.`;
    else if (mediaType === 'document') instrucoesMidia = `\n\n📄 DOCUMENTO RECEBIDO:\n🚨 INSTRUÇÕES OBRIGATÓRIAS PARA ORÇAMENTO:\n1. LISTE APENAS exames do documento.\n2. Para CADA exame, encontre o nome EXATO na BASE DE DADOS acima e copie o valor COM CENTAVOS.\n3. PROIBIDO arredondar ou inventar valores. Se na base diz R$ 5,82, escreva R$ 5,82.\n4. Se um exame não está na base, escreva "Consultar na recepção".\n5. Some os valores EXATOS para o total. Confira a soma.\n6. Mostre Particular. Só mostre Cartão Mais Vida se o exame tiver valor_convenio > 0.\n⚠️ REGRA DOPPLER: "Doppler" NÃO é um exame separado! É um complemento. Ex: "Ecocardiograma" + "Doppler" = UM ÚNICO exame "Ecocardiograma com Doppler". NUNCA liste Doppler como item separado.`;
    else if (mediaType === 'audio') instrucoesMidia = `\n\n🎤 ÁUDIO: OUÇA e RESPONDA ao conteúdo. Se não entender: "Poderia digitar?"`;
    else if (mediaType === 'video') instrucoesMidia = `\n\n🎥 VÍDEO: Analise e confirme recebimento.`;
    
    let historicoParaPrompt = '';
    let contextoPreviousConversation = '';
    let infoAgendamentosCliente = '';
    try {
      const { agendamentos: aC } = await listarAgendamentosFuturosPorTelefone(phoneNumber);
      if (aC.length > 0) {
        const mds = await base44.asServiceRole.entities.Medico.list(); const mM = {}; mds.forEach(m => { mM[m.id] = m; });
        infoAgendamentosCliente = `\n\n📅 AGENDAMENTOS FUTUROS DESTE CLIENTE NO SISTEMA:\n`;
        aC.forEach(ag => { const md = mM[ag.medico_id]; const dF = new Date(ag.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR'); infoAgendamentosCliente += `- ${ag.tipo_servico} com ${md ? md.nome : 'Médico'} em ${dF} às ${ag.horario} (Status: ${ag.status})\n`; });
        infoAgendamentosCliente += `\n🚨 REGRA CRÍTICA: Se o cliente perguntar sobre seu agendamento, confirmar o horário, ou disser que está chegando, USE ESTES DADOS REAIS. Se o cliente disser um horário diferente do que está no sistema, CORRIJA-O educadamente informando o horário real que consta no sistema. NUNCA concorde com um horário errado!`;
      } else {
        infoAgendamentosCliente = `\n\n📅 AGENDAMENTOS FUTUROS DESTE CLIENTE NO SISTEMA:\nNenhum agendamento futuro encontrado. 🚨 REGRA CRÍTICA E ABSOLUTA: O cliente NÃO TEM consultas marcadas. Se ele quiser cancelar ou verificar, diga que NÃO HÁ consultas. NUNCA, SOB NENHUMA HIPÓTESE, invente ou liste consultas fictícias usando os nomes dos médicos.`;
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
      let listaMedicosAtivosParaPrompt = '';
      try {
        const medicosAtivosPrompt = todosMedicosParaDeteccao.length > 0 
          ? todosMedicosParaDeteccao 
          : await Promise.race([
              base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }),
              new Promise((_, r) => setTimeout(() => r(new Error('T')), 3000))
            ]).then(ms => ms.filter(m => !/(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i.test(m.nome || '')));
        const _dN=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
        listaMedicosAtivosParaPrompt=medicosAtivosPrompt.map(m=>{const hA=(m.horarios_atendimento||[]).filter(h=>!h.bloqueado&&!h.data_especifica);const ds=[...new Set(hA.map(h=>Math.floor(h.dia_semana)))].sort();const dS=ds.length>0?ds.map(d=>{const hs=hA.filter(h=>Math.floor(h.dia_semana)===d);return `${_dN[d]} ${hs.map(h=>h.horario_inicio+'-'+h.horario_fim).join('/')}`;}).join(', '):'SEM AGENDA';return `- ${m.nome} (${m.especialidade}${m.especialidades?.length>0?' / '+m.especialidades.join(', '):''})[Agenda: ${dS}]`;}).join('\n');
      } catch (e) {}

      const promptResult = await base44.asServiceRole.functions.invoke('gerarPromptChat', {
        promptSistema: config.prompt_sistema,
        informacoesInstitucionais: config.informacoes_institucionais || '',
        dataAtualCompleta, dataAtualISO, horaAtual, saudacaoHorario,
        historicoConversa, historicoParaPrompt, ehPrimeiraMensagem, senderName,
        dadosFaltantes, infoDisponibilidade, infoProcedimentosExames,
        instrucoesMidia, infoCancelamento, infoResultadoExame, infoAgendamentosCliente
      });
      promptCompleto = promptResult.data.prompt;
      
      if (listaMedicosAtivosParaPrompt) {
        promptCompleto += `\n\n🚨🚨🚨 REGRA ABSOLUTAMENTE CRÍTICA - LISTA DE MÉDICOS DA CLÍNICA 🚨🚨🚨
        
Os ÚNICOS médicos e profissionais que trabalham nesta clínica são os listados abaixo.
NUNCA mencione, ofereça ou agende com médicos que NÃO estejam nesta lista.
Se um nome de médico aparecer no histórico da conversa mas NÃO estiver na lista abaixo, esse médico NÃO faz mais parte da clínica.

📋 MÉDICOS ATIVOS CADASTRADOS NO SISTEMA:
${listaMedicosAtivosParaPrompt}

⛔ PROIBIDO:
- Inventar nomes de médicos que não estão na lista acima
- Mencionar médicos que saíram da clínica
- Agendar com profissionais inexistentes
- 🚨 OFERECER DIAS QUE O MÉDICO NÃO ATENDE! Cada médico acima tem [Agenda: ...] com os dias EXATOS. Se Dr. João atende só Qua, NUNCA ofereça segunda/terça/quinta/sexta para ele. SEMPRE consulte a agenda antes de sugerir um dia.
- Se o cliente pedir um dia que o médico NÃO atende, diga: "O(a) Dr(a). X atende apenas nas [dias]. Posso verificar os próximos horários disponíveis?"
- Se o cliente perguntar por um médico que NÃO está na lista, diga que esse profissional não faz mais parte da equipe`;
      }
    } catch (e) {
      promptCompleto = config.prompt_sistema;
    }
    
    promptCompleto += `\n\n🕒 INFORMAÇÃO DE TEMPO REAL (HORÁRIO DE BRASÍLIA):
- Hoje é: ${dataAtualCompleta} (Formato ISO: ${dataAtualISO})
- Horário atual: ${horaAtual}
🚨 REGRA DE TEMPO: Use esta data como referência absoluta. Se o cliente pedir para "amanhã", calcule o dia seguinte a ${dataAtualCompleta}. Se o próximo horário disponível cair na data de amanhã, responda que TEM horário para amanhã.`;

    promptCompleto += `\n\n🚨🚨 REGRA ABSOLUTA - STATUS DA CLÍNICA HOJE (calculado pelo sistema, NÃO pela IA):\n${statusClinicaHoje}\n⚠️ NUNCA contradiga esta informação. Se o sistema diz que está ABERTA, ela está ABERTA. Se diz FECHADA, está FECHADA. Não tente adivinhar o dia da semana - CONFIE nesta informação.`;
    promptCompleto += `\n\n🚨🚨 REGRA ABSOLUTA SOBRE CONFIRMAÇÃO DE AGENDAMENTO 🚨🚨\nVocê NUNCA pode dizer que agendou, confirmou, realizou ou concluiu um agendamento por conta própria.\nSe o sistema não retornou uma confirmação real, responda apenas com o próximo passo necessário ou com a indisponibilidade real.\nSão PROIBIDAS frases como: "agendamento confirmado", "agendamento realizado com sucesso", "te esperamos", "te aguardamos", "vou finalizar o agendamento agora".\nSe ainda faltar qualquer validação do sistema, diga somente o que falta ou informe que o horário não está disponível.`;
    promptCompleto += `\n\n🚨🚨 REGRA ABSOLUTA CONTRA ALUCINAÇÃO DE AGENDAMENTOS 🚨🚨\nSe o cliente pedir para cancelar ou verificar agendamentos e o sistema informar "Sem agendamentos futuros", você DEVE dizer EXATAMENTE ISSO. NUNCA, SOB NENHUMA HIPÓTESE, invente consultas fictícias usando os nomes dos médicos da clínica e suas agendas. Você só pode listar consultas que foram explicitamente fornecidas na seção "AGENDAMENTOS FUTUROS" ou "CANCELAMENTO".`;

    const modeloLLM = config.modelo_llm || 'gpt-4o';
    let llmResponse = null;
    console.log('🔍 Checkpoint: chegou na chamada LLM. modelo:', modeloLLM, 'respostaQuemAtendeDia:', !!respostaQuemAtendeDia, 'arquivoParaEnviar:', !!arquivoParaEnviar);
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
            if (m.role && m.content && typeof m.content === 'string' && m.content.trim().length > 0) {
              let cleanContent = m.content;
              if (m.mediaUrl) cleanContent = cleanContent.replace(m.mediaUrl, '').trim();
              if (cleanContent.length > 0) messages.push({ role: m.role, content: cleanContent });
            }
          });
        }
        let cleanMessageText = messageText || '(sem texto)';
        if (mediaUrl) cleanMessageText = cleanMessageText.replace(mediaUrl, '').trim();
        let userContent = [{ type: 'text', text: cleanMessageText || '(sem texto)' }];
        if (mediaUrl && mediaType === 'image') {
          userContent.push({ type: 'image_url', image_url: { url: mediaUrl, detail: 'high' } });

          const normalizarItem = (texto) => (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
          const buscarExameFuzzy = (nome, listaExames) => {
            const nomeNorm = normalizarItem(nome);
            // 1. Match exato normalizado
            let found = listaExames.find(e => normalizarItem(e.nome) === nomeNorm);
            if (found) return found;
            // 2. Match via sinônimos
            const alias = sinonimosExames[nomeNorm];
            if (alias) {
              const aliasNorm = normalizarItem(alias);
              found = listaExames.find(e => normalizarItem(e.nome) === aliasNorm);
              if (found) return found;
              // 2b. Contains match para sinônimo
              found = listaExames.find(e => { const en = normalizarItem(e.nome); return en.includes(aliasNorm) || aliasNorm.includes(en); });
              if (found) return found;
            }
            // 3. Contains match
            found = listaExames.find(e => { const en = normalizarItem(e.nome); return (nomeNorm.length >= 4 && en.includes(nomeNorm)) || (en.length >= 4 && nomeNorm.includes(en)); });
            if (found) return found;
            // 4. Palavras-chave match (todas as palavras do termo devem estar no nome do exame)
            const palavras = nomeNorm.split(' ').filter(p => p.length >= 3);
            if (palavras.length >= 1) {
              found = listaExames.find(e => { const en = normalizarItem(e.nome); return palavras.every(p => en.includes(p)); });
              if (found) return found;
            }
            return null;
          };
          const fmtPreco = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
          const sinonimosExames = {
            'glicemia de jejum': 'glicose', 'glicose em jejum': 'glicose', 'glicemia': 'glicose',
            'hemoglobina glicada': 'hemoglobina glicosilada ac1', 'hba1c': 'hemoglobina glicosilada ac1',
            'ureia': 'ureia', 'urea': 'ureia', 'creatinina': 'creatinina', 'acido urico': 'acido urico',
            'tgo': 'tgo ast', 'ast': 'tgo ast', 'tgp': 'tgp alt', 'alt': 'tgp alt',
            'gama gt': 'gama  gt', 'ggt': 'gama  gt',
            'vitamina d 1 25 dihidroxi': 'vitamina d 1 25 dihidroxi', 'vitamina d': 'vitamina d 1 25 dihidroxi',
            'vitamina b12': 'vitamina b12', 'psa total': 'psa total', 'psa livre': 'psa livre',
            'testosterona total': 'testosterona total', 'testosterona livre': 'testosterona livre',
            'sodio': 'sodio', 'potassio': 'potassio', 'triglicerideos': 'trigliceridios'
          };
          const gruposCompostos = {
            'colesterol total e fracoes': ['colesterol total', 'colesterol hdl', 'colesterol ldl', 'colesterol vldl', 'trigliceridios'],
            'perfil lipidico': ['colesterol total', 'colesterol hdl', 'colesterol ldl', 'colesterol vldl', 'trigliceridios'],
            'lipidograma': ['colesterol total', 'colesterol hdl', 'colesterol ldl', 'colesterol vldl', 'trigliceridios'],
            'ast e alt': ['tgo ast', 'tgp alt'], 'tgo e tgp': ['tgo ast', 'tgp alt'],
            'psa total e livre': ['psa total', 'psa livre'],
            'testosterona total e livre': ['testosterona total', 'testosterona livre']
          };

          let itensExtraidos = [];
          try {
            const openaiKeyExt = Deno.env.get('OPENAI_API_KEY');
            const extResp = await Promise.race([
              fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKeyExt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'gpt-4o',
                  messages: [{
                    role: 'user',
                    content: [
                      { type: 'text', text: 'Leia esta solicitação médica e extraia TODOS os exames e procedimentos pedidos, linha por linha, sem pular nenhum item. Ignore cabeçalho, dados do paciente, médico e datas. Retorne JSON no formato {"itens": ["item 1", "item 2"]}.' },
                      { type: 'image_url', image_url: { url: mediaUrl, detail: 'high' } }
                    ]
                  }],
                  max_tokens: 1200,
                  temperature: 0,
                  response_format: { type: 'json_object' }
                })
              }),
              new Promise((_, r) => setTimeout(() => r(new Error('Timeout extração imagem')), 25000))
            ]);

            if (extResp.ok) {
              const extData = await extResp.json();
              const parsed = JSON.parse(extData.choices?.[0]?.message?.content || '{}');
              itensExtraidos = Array.isArray(parsed.itens) ? parsed.itens : [];
              console.log('🔍 Itens extraídos da imagem:', itensExtraidos);
            }
          } catch (e) {
            console.log('⚠️ Erro ao extrair itens da imagem:', e.message);
          }

          if ((!Array.isArray(_allExames) || _allExames.length === 0) || (!Array.isArray(_allProcedimentos) || _allProcedimentos.length === 0)) {
            try {
              const [exReload, procReload, tpReload] = await Promise.all([
                base44.asServiceRole.entities.Exame.list('-created_date', 2000).then(items => items.filter(e => e.status === 'Ativo')).catch(() => []),
                base44.asServiceRole.entities.Procedimento.list('-created_date', 2000).then(items => items.filter(p => p.status === 'Ativo')).catch(() => []),
                base44.asServiceRole.entities.TabelaPreco.list('-created_date', 2000).catch(() => [])
              ]);
              _allExames = Array.isArray(exReload) ? exReload : [];
              _allProcedimentos = Array.isArray(procReload) ? procReload : [];
              _allTabelaPrecos = Array.isArray(tpReload) ? tpReload : [];
            } catch (e) {
              console.log('❌ Falha ao recarregar base da imagem:', e.message);
            }
          }

          if (itensExtraidos.length > 0 && (_allExames.length > 0 || _allProcedimentos.length > 0)) {
            const buscarExame = (nome) => buscarExameFuzzy(nome, _allExames);
            const buscarProcedimento = (nome) => {
              const nomeNorm = normalizarItem(nome);
              return _allProcedimentos.find(p => normalizarItem(p.nome) === nomeNorm) || null;
            };
            const buscarPrecoProcedimento = (procedimentoId) => {
              const preco = _allTabelaPrecos.find(tp => tp.procedimento_id === procedimentoId && Number(tp.valor) > 0);
              return preco ? Number(preco.valor) : null;
            };

            let linhas = [];
            let total = 0;
            let naoEncontrados = [];
            let contador = 1;
            const itensJaCobrados = new Set();

            for (const itemOriginal of itensExtraidos) {
              const itemNorm = normalizarItem(itemOriginal);
              const grupo = Object.keys(gruposCompostos).find(k => itemNorm === k);

              if (grupo) {
                const subitens = gruposCompostos[grupo];
                let subtotal = 0;
                let detalhes = [];
                let faltandoSubitem = false;
                let adicionouAlgum = false;
                for (const subitem of subitens) {
                  const exame = buscarExame(subitem);
                  const chaveSubitem = exame ? `exame:${normalizarItem(exame.nome)}` : `exame:${subitem}`;
                  if (exame && Number(exame.valor_particular) > 0) {
                    if (!itensJaCobrados.has(chaveSubitem)) {
                      subtotal += Number(exame.valor_particular);
                      detalhes.push(`   - ${exame.nome}: ${fmtPreco(exame.valor_particular)}`);
                      itensJaCobrados.add(chaveSubitem);
                      adicionouAlgum = true;
                    }
                  } else {
                    faltandoSubitem = true;
                    naoEncontrados.push(subitem);
                  }
                }
                if (!faltandoSubitem && adicionouAlgum && subtotal > 0) {
                  linhas.push(`${contador}. *${itemOriginal}*: ${fmtPreco(subtotal)}`);
                  linhas.push(...detalhes);
                  total += subtotal;
                  contador++;
                } else if (faltandoSubitem) {
                  naoEncontrados.push(itemOriginal);
                }
                continue;
              }

              const exame = buscarExame(itemOriginal);
              if (exame && Number(exame.valor_particular) > 0) {
                const chaveExame = `exame:${normalizarItem(exame.nome)}`;
                if (!itensJaCobrados.has(chaveExame)) {
                  linhas.push(`${contador}. *${exame.nome}*: ${fmtPreco(exame.valor_particular)}`);
                  total += Number(exame.valor_particular);
                  contador++;
                  itensJaCobrados.add(chaveExame);
                }
                continue;
              }

              const procedimento = buscarProcedimento(itemOriginal);
              if (procedimento) {
                const precoProcedimento = buscarPrecoProcedimento(procedimento.id);
                if (precoProcedimento && precoProcedimento > 0) {
                  const chaveProc = `procedimento:${normalizarItem(procedimento.nome)}`;
                  if (!itensJaCobrados.has(chaveProc)) {
                    linhas.push(`${contador}. *${procedimento.nome}*: ${fmtPreco(precoProcedimento)}`);
                    total += precoProcedimento;
                    contador++;
                    itensJaCobrados.add(chaveProc);
                  }
                  continue;
                }
              }

              naoEncontrados.push(itemOriginal);
            }

            if (linhas.length > 0) {
              let orcamentoTexto = 'Aqui está o orçamento da solicitação enviada:\n\n';
              orcamentoTexto += linhas.join('\n');
              if (naoEncontrados.length > 0) {
                const itensUnicosNaoEncontrados = [...new Set(naoEncontrados)];
                orcamentoTexto += '\n\n⚠️ *Itens não encontrados no sistema:*\n';
                orcamentoTexto += itensUnicosNaoEncontrados.map(item => `- ${item}`).join('\n');
              }
              orcamentoTexto += `\n\n💰 *Total apenas dos itens cadastrados: ${fmtPreco(total)}*`;
              orcamentoTexto += '\n\n🏥 Para exames laboratoriais, a coleta é feita de segunda a sexta, das 07:30 às 09:00, sem necessidade de agendamento.';
              orcamentoTexto += '\n\nSe quiser, também posso te orientar sobre os próximos passos. 😊';

              try {
                const contato = await buscarContatoPorTelefone(phoneNumber);
                const ts = new Date().toISOString();
                if (contato) {
                  const historico = contato.historico_mensagens || [];
                  const userMsgExists = messageId && historico.some(m => m.messageId === messageId && m.role === 'user');
                  if (!userMsgExists) historico.push({ role: 'user', content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText, timestamp: ts, messageId, mediaType, mediaUrl });
                  historico.push({ role: 'assistant', content: orcamentoTexto, timestamp: ts });
                  await base44.asServiceRole.entities.Contato.update(contato.id, {
                    ultima_mensagem: messageText,
                    ultima_resposta: orcamentoTexto,
                    historico_mensagens: historico.slice(-50),
                    ultima_interacao: ts,
                    total_mensagens: (contato.total_mensagens || 0) + 2,
                    processando_ia_lock: null
                  });
                }
              } catch (e) {}

              await liberarLock(base44, phoneNumber, lockName);
              return Response.json({ success: true, resposta: orcamentoTexto, conversationId: null, orcamento_direto: true });
            }
          }

          userContent[0].text += `\n\n🚨 A imagem não gerou orçamento automático. Responda normalmente apenas se NÃO for uma solicitação médica.`;
        } else if (mediaUrl && mediaType === 'document') {
          try {
            const eR = await base44.asServiceRole.functions.invoke('extractPdfText', { fileUrl: mediaUrl });
            if(eR?.data?.text){
              const pdfText = eR.data.text;
              userContent[0].text+=`\n\n🚨 CONTEÚDO DO PDF 🚨\n${pdfText}`;
              // Extrair nomes dos exames do PDF e criar mini-tabela
              let examesExtraidosPdf = null;
              try {
                const openaiKeyPdf = Deno.env.get('OPENAI_API_KEY');
                const extPdfResp = await Promise.race([
                  fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${openaiKeyPdf}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: 'gpt-4o-mini',
                      messages: [{ role: 'user', content: `Liste APENAS os nomes dos exames médicos neste texto, um por linha. Não inclua preços. Se "Doppler" aparecer junto com outro exame, combine como um só. Retorne JSON: {"exames": ["nome1", ...]}\n\nTexto:\n${pdfText}` }],
                      max_tokens: 500, temperature: 0, response_format: { type: 'json_object' }
                    })
                  }),
                  new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 12000))
                ]);
                if (extPdfResp.ok) {
                  const extPdfData = await extPdfResp.json();
                  try { examesExtraidosPdf = JSON.parse(extPdfData.choices?.[0]?.message?.content || '{}').exames || null; } catch(e) {}
                }
              } catch(e) {}

              // Gerar orçamento DIRETAMENTE no código para PDF também
              if (examesExtraidosPdf && examesExtraidosPdf.length > 0 && Array.isArray(_allExames) && _allExames.length > 0) {
                const normTxt = (t) => (t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                const SINONIMOS = {'hemograma':'hemograma completo','glicemia de jejum':'glicose','glicose em jejum':'glicose','glicemia':'glicose','glicose de jejum':'glicose','hemoglobina glicada':'hemoglobina glicosilada ac1','hba1c':'hemoglobina glicosilada ac1','vitamina d':'vitamina d 1 25 dihidroxi','vit d':'vitamina d 1 25 dihidroxi','1 25 dihidroxi vitamina d':'vitamina d 1 25 dihidroxi','25 oh vitamina d':'25 hidroxivitamina d','25hidroxivitamina d':'25 hidroxivitamina d','tgo':'tgo ast','tgp':'tgp alt','ast':'tgo ast','alt':'tgp alt','triglicerideos':'trigliceridios','triglicerides':'trigliceridios','trigliceridos':'trigliceridios','gama gt':'gama  gt','ggt':'gama  gt','gamaglutamiltransferase':'gama  gt','tsh':'tsh  h tireoestimulante','tsh ultrassensivel':'tsh  h tireoestimulante','acido urico':'acido urico','fosfatase alcalina':'fosfatase alcalina','ferro serico':'ferro serico','ferritina':'ferritina','calcio':'calcio','calcio serico':'calcio','magnesio':'magnesio','magnesio serico':'magnesio','eas':'eas  urina tipo i','urina tipo 1':'eas  urina tipo i','urina tipo i':'eas  urina tipo i','exame de urina':'eas  urina tipo i','parcial de urina':'eas  urina tipo i','beta hcg':'beta hcg','sodio':'sodio','potassio':'potassio','t4 livre':'t4 livre','t4l':'t4 livre','t3 livre':'t3','t3l':'t3','psa total':'psa total','psa livre':'psa livre','psa':'psa total','ureia':'ureia','urea':'ureia','creatinina':'creatinina','colesterol total':'colesterol total','colesterol hdl':'colesterol hdl','hdl':'colesterol hdl','colesterol ldl':'colesterol ldl','ldl':'colesterol ldl','colesterol vldl':'colesterol vldl','vldl':'colesterol vldl','bilirrubina total':'bilirrubinas totais e fracoes','bilirrubinas':'bilirrubinas totais e fracoes','fosforo':'fosforo','fosforo serico':'fosforo','pcr':'proteina c reativa','proteina c reativa':'proteina c reativa','vhs':'vhs','urocultura':'urocultura','parasitologico de fezes':'parasitologico de fezes','epf':'parasitologico de fezes','eletrocardiograma':'eletrocardiograma','ecg':'eletrocardiograma','ecocardiograma':'ecocardiograma','ecocardiograma com doppler':'ecocardiograma com doppler','raio x de torax':'raio x de torax','rx de torax':'raio x de torax','rx torax':'raio x de torax','radiografia de torax':'raio x de torax'};
                const COMPOSTOS = {'colesterol total e fracoes':['colesterol total','colesterol hdl','colesterol ldl','colesterol vldl','trigliceridios'],'perfil lipidico':['colesterol total','colesterol hdl','colesterol ldl','colesterol vldl','trigliceridios'],'ast e alt':['tgo ast','tgp alt'],'tgo e tgp':['tgo ast','tgp alt'],'transaminases':['tgo ast','tgp alt'],'hepatograma':['tgo ast','tgp alt','gama  gt','fosfatase alcalina'],'funcao renal':['ureia','creatinina'],'funcao hepatica':['tgo ast','tgp alt','gama  gt','fosfatase alcalina'],'pasta do figado':['tgo ast','tgp alt','gama  gt','fosfatase alcalina'],'provas de funcao hepatica':['tgo ast','tgp alt','gama  gt','fosfatase alcalina'],'bilirrubinas total e fracoes':['bilirrubinas totais e fracoes']};
                const buscarExame = (nomeNorm) => {
                  let m = _allExames.find(e => normTxt(e.nome) === nomeNorm); if (m) return m;
                  const sin = SINONIMOS[nomeNorm]; if (sin) {
                    const sinNorm = normTxt(sin);
                    m = _allExames.find(e => normTxt(e.nome) === sinNorm); if (m) return m;
                    m = _allExames.find(e => { const en = normTxt(e.nome); return en.includes(sinNorm) || sinNorm.includes(en); }); if (m) return m;
                  }
                  // Contains match
                  m = _allExames.find(e => { const en = normTxt(e.nome); return (nomeNorm.length >= 4 && en.includes(nomeNorm)) || (en.length >= 4 && nomeNorm.includes(en)); }); if (m) return m;
                  // Palavras-chave match
                  const palavras = nomeNorm.split(' ').filter(p => p.length >= 3);
                  if (palavras.length >= 1) { m = _allExames.find(e => { const en = normTxt(e.nome); return palavras.every(p => en.includes(p)); }); if (m) return m; }
                  return null;
                };
                const fmtPreco = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
                let orcLinhas = []; let totalP = 0; let naoEnc = []; let itemN = 0; const itensPdfJaCobrados = new Set();
                for (const nomeExame of examesExtraidosPdf) {
                  const nomeNorm = normTxt(nomeExame);
                  const compostoKey = Object.keys(COMPOSTOS).find(k => nomeNorm === k || nomeNorm.includes(k) || k.includes(nomeNorm));
                  if (compostoKey) {
                    const subExames = COMPOSTOS[compostoKey]; let subT = 0; let subL = []; let allOk = true; let adicionou = false;
                    for (const sn of subExames) { const sm = buscarExame(sn); const chave = sm ? `exame:${normTxt(sm.nome)}` : `exame:${sn}`; if (sm && sm.valor_particular) { if (!itensPdfJaCobrados.has(chave)) { subL.push(`   - ${sm.nome}: ${fmtPreco(sm.valor_particular)}`); subT += sm.valor_particular; itensPdfJaCobrados.add(chave); adicionou = true; } } else allOk = false; }
                    if (allOk && adicionou && subT > 0) { itemN++; orcLinhas.push(`${itemN}. *${nomeExame}*: ${fmtPreco(subT)}`); for (const sl of subL) orcLinhas.push(sl); totalP += subT; }
                    else if (!allOk) { for (const sn of subExames) naoEnc.push(sn); }
                    continue;
                  }
                  let match = buscarExame(nomeNorm);
                  if (!match && Array.isArray(_allProcedimentos)) { const procM = _allProcedimentos.find(p => normTxt(p.nome) === nomeNorm); if (procM) { const precoP = _allTabelaPrecos.find(tp => tp.procedimento_id === procM.id && tp.valor > 0); if (precoP) { const chaveProc = `procedimento:${normTxt(procM.nome)}`; if (!itensPdfJaCobrados.has(chaveProc)) { itemN++; orcLinhas.push(`${itemN}. *${nomeExame}*: ${fmtPreco(precoP.valor)}`); totalP += precoP.valor; itensPdfJaCobrados.add(chaveProc); } continue; } } }
                  if (match && match.valor_particular) { const chaveMatch = `exame:${normTxt(match.nome)}`; if (!itensPdfJaCobrados.has(chaveMatch)) { itemN++; orcLinhas.push(`${itemN}. *${nomeExame}*: ${fmtPreco(match.valor_particular)}`); totalP += match.valor_particular; itensPdfJaCobrados.add(chaveMatch); } }
                  else naoEnc.push(nomeExame);
                }
                let orcTxtPdf = 'Aqui está o orçamento dos exames da requisição:\n\n' + orcLinhas.join('\n') + '\n';
                if (naoEnc.length > 0) { orcTxtPdf += '\n⚠️ *Consultar na recepção:*\n'; for (const ne of naoEnc) orcTxtPdf += `- ${ne}\n`; }
                orcTxtPdf += `\n💰 *Total: ${fmtPreco(totalP)}*`;
                orcTxtPdf += '\n\n🏥 A coleta de sangue é feita de segunda a sexta, das 07:30 às 09:00. Não é necessário agendar.';
                orcTxtPdf += '\n\nSe precisar de mais alguma coisa, estou à disposição! 😊';
                // BYPASS LLM: retornar direto
                try {
                  const cOrc2 = await buscarContatoPorTelefone(phoneNumber);
                  const tsOrc2 = new Date().toISOString();
                  if (cOrc2) {
                    const hOrc2 = cOrc2.historico_mensagens || [];
                    const exists2 = messageId && hOrc2.some(m => m.messageId === messageId && m.role === 'user');
                    if (!exists2) hOrc2.push({ role: 'user', content: mediaUrl ? `${messageText}\n${mediaUrl}` : messageText, timestamp: tsOrc2, messageId, mediaType, mediaUrl });
                    hOrc2.push({ role: 'assistant', content: orcTxtPdf, timestamp: tsOrc2 });
                    await base44.asServiceRole.entities.Contato.update(cOrc2.id, { ultima_mensagem: messageText, ultima_resposta: orcTxtPdf, historico_mensagens: hOrc2.slice(-50), ultima_interacao: tsOrc2, total_mensagens: (cOrc2.total_mensagens || 0) + 2, processando_ia_lock: null });
                  }
                } catch (e) {}
                await liberarLock(base44, phoneNumber, lockName);
                return Response.json({ success: true, resposta: orcTxtPdf, conversationId: null, orcamento_direto: true });
              }
              userContent[0].text+=`\n\n🚨 Responda ao cliente sobre o documento. NÃO pergunte se quer agendar coleta.`;
            }
            else{userContent[0].text+=`\n\n⚠️ PDF ilegível. Peça foto nítida.`;}
          } catch(e){userContent[0].text+=`\n\n⚠️ PDF ilegível. Peça foto nítida.`;}
        }
        messages.push({ role: 'user', content: userContent });
        const isOrcamento = mediaType === 'image' || mediaType === 'document' || /or[çc]amento|quanto custa|pre[çc]o|valor/i.test(messageText);
        const body = { model: modeloLLM, messages, max_tokens: 1500, temperature: isOrcamento ? 0.2 : (config.temperatura || 0.7) };
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
          if (!llmResponse) console.log('⚠️ OpenAI retornou sem conteúdo:', JSON.stringify(data).substring(0, 500));
        } else {
          const errBody = await openaiResp.text().catch(() => '');
          console.log('❌ OpenAI erro:', openaiResp.status, errBody.substring(0, 500));
        }
      } catch (e) { console.log('❌ OpenAI exception:', e.message); }
    }
    
    if (!llmResponse) {
      console.log('⚠️ llmResponse é null/vazio - usando fallback');
      llmResponse = 'Olá! Recebi sua mensagem, mas estou com uma instabilidade no atendimento automático agora. Pode me enviar novamente em instantes ou falar com a recepção pelo (51) 3661-5991.';
    }

    const _tcm=(messageText+' '+(historicoConversa||'')).toLowerCase();
    const motivoIdentificado=_tcm.includes('cancelar')||_tcm.includes('desmarcar')?'Cancelamento':_tcm.includes('resultado')||_tcm.includes('laudo')?'Resultado de Exames':_tcm.includes('orçamento')||_tcm.includes('orcamento')||_tcm.includes('quanto custa')?'Orçamento':_tcm.includes('cartão')||_tcm.includes('mais vida')?'Cartão Mais Vida':_tcm.includes('turma')||_tcm.includes('hidrogin')||_tcm.includes('pilates')||_tcm.includes('natac')||_tcm.includes('nataç')?'Turmas':_tcm.includes('procedimento')?'Procedimentos':_tcm.includes('agendar')||_tcm.includes('marcar')||_tcm.includes('consulta')?'Agendamento':null;

    try {
      const cFinal = await buscarContatoPorTelefone(phoneNumber);
      const timestamp = new Date().toISOString();

      if (cFinal) {
        const contato = cFinal;
        
        // Se tínhamos um lock, verificar se ainda é nosso
        if (lockName && contato.processando_ia_lock && contato.processando_ia_lock !== lockName) {
            console.log(`🛑 Lock perdido durante o processamento da IA (meu: ${lockName}, atual: ${contato.processando_ia_lock}). Abortando salvamento.`);
            return Response.json({ success: true, status: 'lock_perdido_pos_ia', resposta: null });
        }
        
        const historicoAtual = contato.historico_mensagens || [];

        const historicoCompleto = historicoAtual.filter(m => m.role === 'assistant');
        const ultimasRespostasAssistente = historicoCompleto.slice(-5);

        const ultimaResposta = ultimasRespostasAssistente[ultimasRespostasAssistente.length - 1];
        const ehFallbackMsg = llmResponse && /instabilidade no atendimento autom/i.test(llmResponse);
        const respostaIdentica = !ehFallbackMsg && ultimaResposta?.content && llmResponse && ultimaResposta.content.trim() === (llmResponse||'').trim();
        const jaEnviouMsgOrcamento = ultimasRespostasAssistente.some(m => m.content && /já enviei o orçamento/i.test(m.content));
        
        // Anti-duplicidade final: verificar se a resposta gerada já foi enviada recentemente (últimos 30s)
        const respostaRecenteIdentica = ultimaResposta && 
                                        ultimaResposta.timestamp && 
                                        (Date.now() - new Date(ultimaResposta.timestamp).getTime() < 30000) && 
                                        llmResponse && 
                                        ultimaResposta.content.trim() === llmResponse.trim();

        if (respostaIdentica || respostaRecenteIdentica || (jaEnviouMsgOrcamento && llmResponse && /já enviei o orçamento/i.test(llmResponse))) {
          console.log('🚫 Resposta idêntica detectada no final do processamento. Abortando envio.');
          await liberarLock(base44, phoneNumber, lockName);
          return Response.json({ success: true, resposta: null, duplicado: true });
        }

        let conteudoUsuario = messageText;
        if (mediaUrl) conteudoUsuario = `${messageText}\n${mediaUrl}`;

        const userMsgJaExiste = messageId && historicoAtual.some(m => m.messageId === messageId && m.role === 'user');
        if (!userMsgJaExiste) historicoAtual.push({ role: 'user', content: conteudoUsuario, timestamp, messageId, mediaType, mediaUrl });
        historicoAtual.push({ role: 'assistant', content: llmResponse, timestamp });
        
        const historicoLimitado = historicoAtual.slice(-50);
        let historicoParaSalvar = historicoLimitado;
        if (conversaFinalizada) historicoParaSalvar = [{ role: 'user', content: messageText, timestamp, messageId }, { role: 'assistant', content: llmResponse, timestamp }];
        
        const updateData = {
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse,
          historico_mensagens: historicoParaSalvar,
          ultima_interacao: timestamp,
          total_mensagens: conversaFinalizada ? 2 : (contato.total_mensagens || 0) + 2,
          status: contato.conversa_finalizada ? 'Lead' : contato.status,
          conversa_finalizada: false
        };

        if (motivoIdentificado) {
          const interessesAtuais = contato.interesses || [];
          if (!interessesAtuais.includes(motivoIdentificado)) updateData.interesses = [...interessesAtuais, motivoIdentificado];
        }

        if (motivoIdentificado === 'Turmas') updateData.status = 'Turmas';

        await base44.asServiceRole.entities.Contato.update(contato.id, updateData);
      } else {
        let tCP = phoneNumber.replace(/\D/g, '');
        if (!tCP.startsWith('55')) tCP = '55' + tCP;
        const novoContatoData = {
          nome: senderName, telefone: tCP, paciente_id: pacienteId,
          ultima_mensagem: messageText, ultima_resposta: llmResponse,
          historico_mensagens: [{ role: 'user', content: messageText, timestamp, messageId }, { role: 'assistant', content: llmResponse, timestamp }],
          ultima_interacao: timestamp, total_mensagens: 2,
          origem: 'WhatsApp', status: 'Novo', atendimento_humano: false
        };

        if (motivoIdentificado) novoContatoData.interesses = [motivoIdentificado];
        if (motivoIdentificado === 'Turmas') novoContatoData.status = 'Turmas';

        await base44.asServiceRole.entities.Contato.create(novoContatoData);
      }
    } catch (e) {}
    
    if (arquivoParaEnviar && arquivoParaEnviar.url) {
      try {
        const cEnv = await buscarContatoPorTelefone(phoneNumber);
        if (cEnv) {
          const contato = cEnv;
          const historicoAtual = contato.historico_mensagens || [];
          const timestamp = new Date().toISOString();
          historicoAtual.push({ role: 'assistant', content: `📄 ${arquivoParaEnviar.nome}: ${arquivoParaEnviar.url}`, timestamp, mediaType: 'document', mediaUrl: arquivoParaEnviar.url });
          await base44.asServiceRole.entities.Contato.update(contato.id, { historico_mensagens: historicoAtual.slice(-50) });
        }
      } catch (e) {}
    }

    await liberarLock(base44, phoneNumber, lockName);

    return Response.json({ 
      success: true, 
      resposta: llmResponse,
      conversationId: null,
      arquivoParaEnviar: arquivoParaEnviar
    });
    
  } catch (error) {
    try {
      if (typeof phoneNumber !== 'undefined' && phoneNumber) await liberarLock(base44, phoneNumber, lockName);
    } catch (e) { }
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});

async function liberarLock(base44, phoneNumber, lockName = null) {
  try {
    const telNorm = phoneNumber.replace(/\D/g, '');
    const vars = [phoneNumber, telNorm];
    if (telNorm.startsWith('55') && telNorm.length >= 12) vars.push(telNorm.slice(2));
    if (!telNorm.startsWith('55') && telNorm.length >= 10) vars.push('55' + telNorm);
    
    for (const v of vars) {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: v });
      if (contatos.length > 0 && contatos[0].processando_ia_lock) {
        // Só liberar se não informou lockName (forçado) ou se o lock atual for o mesmo que o nosso
        if (!lockName || contatos[0].processando_ia_lock === lockName) {
          await base44.asServiceRole.entities.Contato.update(contatos[0].id, { processando_ia_lock: null });
        }
        return;
      }
    }
  } catch (e) {}
}