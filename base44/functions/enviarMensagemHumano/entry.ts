import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phoneNumber, messageText, contatoId, messageType, mediaUrl, fileName } = await req.json();
    
    if (!phoneNumber) {
      return Response.json({ error: 'phoneNumber é obrigatório' }, { status: 400 });
    }
    
    if (!messageText && !mediaUrl) {
      return Response.json({ error: 'messageText ou mediaUrl é obrigatório' }, { status: 400 });
    }

    console.log('📤 Enviando mensagem humana para:', phoneNumber, 'texto:', messageText, 'tipo:', messageType || 'text');

    // Enviar mensagem via Z-API
    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const zapiToken = Deno.env.get("ZAPI_TOKEN");
    const zapiClientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

    if (!instanceId || !zapiToken) {
      return Response.json({ error: 'Z-API não configurado' }, { status: 400 });
    }

    let numero = phoneNumber.replace(/\D/g, '');
    // Adicionar código do Brasil (55) APENAS se o número tiver formato local brasileiro:
    // 10 dígitos (fixo DDD+8) ou 11 dígitos com 9 após o DDD (celular DDD+9XXXXXXXX).
    // Números internacionais (ex: +1 902... do Canadá) são mantidos como estão.
    const formatoLocalBR = numero.length === 10 || (numero.length === 11 && numero[2] === '9');
    if (!numero.startsWith('55') && formatoLocalBR) {
      numero = '55' + numero;
    }
    // Usar display_name se existir, senão full_name
    const nomeRemetente = user.display_name || user.full_name || 'Recepção';

    const headers = {
      'Content-Type': 'application/json'
    };
    if (zapiClientToken) {
      headers['Client-Token'] = zapiClientToken;
    }

    try {
      let url;
      let body;

      // Escolher endpoint e body baseado no tipo de mídia
      if (messageType === 'image' && mediaUrl) {
        url = `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-image`;
        body = {
          phone: numero,
          image: mediaUrl,
          caption: `*${nomeRemetente}:* ${messageText || ''}`
        };
        console.log('📷 Enviando IMAGEM via Z-API');
      } else if (messageType === 'document' && mediaUrl) {
        url = `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-document/pdf`;
        body = {
          phone: numero,
          document: mediaUrl,
          fileName: fileName || 'documento.pdf'
        };
        console.log('📄 Enviando DOCUMENTO via Z-API');
      } else if (messageType === 'audio' && mediaUrl) {
        url = `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-audio`;
        body = {
          phone: numero,
          audio: mediaUrl,
          waveform: true
        };
        console.log('🎤 Enviando ÁUDIO via Z-API:', mediaUrl);
      } else {
        url = `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-text`;
        body = {
          phone: numero,
          message: `*${nomeRemetente}:* ${messageText || ''}`
        };
        console.log('💬 Enviando TEXTO via Z-API');
      }

      console.log('📤 URL:', url);
      console.log('📤 Body:', JSON.stringify(body));

      const enviarParaZapi = async (payload) => {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const rawText = await response.text();
        let parsed;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = { raw: rawText };
        }
        return { response, parsed, rawText };
      };

      let tentativa = await enviarParaZapi(body);
      console.log('📤 Z-API response status:', tentativa.response.status);
      console.log('📤 Z-API response body:', tentativa.parsed);

      if (!tentativa.response.ok && !messageType) {
        console.warn('⚠️ Primeira tentativa falhou, reenviando texto sem identificação do atendente');
        tentativa = await enviarParaZapi({
          phone: numero,
          message: messageText || ''
        });
        console.log('📤 Retry status:', tentativa.response.status);
        console.log('📤 Retry body:', tentativa.parsed);
      }
      
      if (!tentativa.response.ok) {
        console.error('❌ Erro Z-API:', tentativa.parsed);
        return Response.json({
          error: 'Erro ao enviar via Z-API',
          details: tentativa.parsed,
          status: tentativa.response.status
        }, { status: 400 });
      }
      console.log('✅ Mensagem enviada via Z-API com sucesso');
    } catch (error) {
      console.error('❌ Erro ao enviar Z-API:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Atualizar histórico do contato
    let historicoSalvo = true;
    if (contatoId) {
      try {
        const contatos = await base44.asServiceRole.entities.Contato.filter({ id: contatoId });
        if (contatos.length > 0) {
          const contato = contatos[0];
          const historicoAtual = contato.historico_mensagens || [];
          const timestamp = new Date().toISOString();
          
          // Salvar conteúdo da mensagem - incluir URL da mídia para exibição
          let conteudoMensagem = '';
          if (messageType === 'image' && mediaUrl) {
            conteudoMensagem = `📷 Imagem: ${mediaUrl}`;
          } else if (messageType === 'document' && mediaUrl) {
            conteudoMensagem = `📄 ${fileName || 'Documento'}: ${mediaUrl}`;
          } else if (messageType === 'audio' && mediaUrl) {
            conteudoMensagem = `🎤 Áudio: ${mediaUrl}`;
          } else {
            conteudoMensagem = messageText || '';
          }
          
          historicoAtual.push({
            role: 'assistant',
            content: `[👤 ${user.display_name || user.full_name || 'Recepção'}]: ${conteudoMensagem}`,
            timestamp,
            humano: true,
            mediaType: messageType || 'text',
            mediaUrl: mediaUrl || null
          });

          const nomeAtendente = user.display_name || user.full_name || user.email || 'Atendente';
          await base44.asServiceRole.entities.Contato.update(contatoId, {
            historico_mensagens: historicoAtual.slice(-50),
            ultima_resposta: conteudoMensagem,
            ultima_interacao: timestamp,
            total_mensagens: (contato.total_mensagens || 0) + 1,
            atendimento_humano: true,
            atendente_atual: nomeAtendente,
            atendente_id: user.id
          });
        }
      } catch (historyError) {
        historicoSalvo = false;
        console.error('⚠️ Mensagem enviada, mas falhou ao salvar histórico:', historyError.message);
      }
    }

    return Response.json({ success: true, message: 'Mensagem enviada', history_saved: historicoSalvo });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});