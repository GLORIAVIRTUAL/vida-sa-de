import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    const nomeRemetente = user.full_name || 'Recepção';

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
        // Z-API usa send-audio para áudios normais ou send-ptv para mensagens de voz
        url = `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-audio`;
        body = {
          phone: numero,
          audio: mediaUrl,
          waveform: true // Mostra como mensagem de voz
        };
        console.log('🎤 Enviando ÁUDIO via Z-API:', mediaUrl);
      } else {
        // Texto simples
        url = `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-text`;
        body = {
          phone: numero,
          message: `*${nomeRemetente}:* ${messageText || ''}`
        };
        console.log('💬 Enviando TEXTO via Z-API');
      }

      console.log('📤 URL:', url);
      console.log('📤 Body:', JSON.stringify(body));

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const result = await response.json();
      console.log('📤 Z-API response:', result);
      
      if (!response.ok) {
        console.error('❌ Erro Z-API:', result);
        return Response.json({ error: 'Erro ao enviar via Z-API', details: result }, { status: 400 });
      }
      console.log('✅ Mensagem enviada via Z-API com sucesso');
    } catch (error) {
      console.error('❌ Erro ao enviar Z-API:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Atualizar histórico do contato
    if (contatoId) {
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
          content: `[👤 ${user.full_name || 'Recepção'}]: ${conteudoMensagem}`,
          timestamp,
          humano: true,
          mediaType: messageType || 'text',
          mediaUrl: mediaUrl || null
        });

        // Atualizar contato - incluindo quem está atendendo (ao enviar mensagem)
        await base44.asServiceRole.entities.Contato.update(contatoId, {
          historico_mensagens: historicoAtual.slice(-50),
          ultima_resposta: conteudoMensagem,
          ultima_interacao: timestamp,
          total_mensagens: (contato.total_mensagens || 0) + 1,
          atendente_atual: user.full_name || user.email || 'Atendente',
          atendente_id: user.id
        });
      }
    }

    return Response.json({ success: true, message: 'Mensagem enviada' });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});