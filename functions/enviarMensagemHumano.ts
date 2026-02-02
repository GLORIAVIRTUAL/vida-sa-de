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

    // Enviar mensagem via WhatsApp (Z-API é o principal)
    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const zapiToken = Deno.env.get("ZAPI_TOKEN");
    const zapiClientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

    let mensagemEnviada = false;

    // Tentar enviar via Z-API (prioridade)
    if (instanceId && zapiToken) {
      console.log('📤 Tentando enviar via Z-API...');
      let numero = phoneNumber.replace(/\D/g, '');
      
      const mensagemComNome = `*${user.full_name || 'Recepção'}:* ${messageText || ''}`;

      try {
        const url = `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-text`;
        const headers = {
          'Content-Type': 'application/json'
        };
        if (zapiClientToken) {
          headers['Client-Token'] = zapiClientToken;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: numero,
            message: mensagemComNome
          })
        });

        const result = await response.json();
        console.log('✅ Z-API response:', result);
        
        if (response.ok) {
          mensagemEnviada = true;
          console.log('✅ Mensagem enviada via Z-API com sucesso');
        } else {
          console.warn('⚠️ Z-API retornou erro:', result);
        }
      } catch (zapiError) {
        console.error('⚠️ Erro Z-API:', zapiError.message);
      }
    }

    // Fallback: enviar via Meta se Z-API falhar
    if (!mensagemEnviada) {
      const phoneId = Deno.env.get("META_PHONE_NUMBER_ID");
      const accessToken = Deno.env.get("META_ACCESS_TOKEN");

      if (phoneId && accessToken) {
        console.log('📤 Fallback: Tentando enviar via Meta WhatsApp...');
        let numero = phoneNumber.replace(/\D/g, '');
        if (!numero.startsWith('55')) numero = '55' + numero;

        let messageBody;
        
        if (messageType === 'image' && mediaUrl) {
          messageBody = {
            messaging_product: 'whatsapp',
            to: numero,
            type: 'image',
            image: { link: mediaUrl }
          };
        } else if (messageType === 'document' && mediaUrl) {
          messageBody = {
            messaging_product: 'whatsapp',
            to: numero,
            type: 'document',
            document: { 
              link: mediaUrl,
              filename: fileName || 'arquivo'
            }
          };
        } else if (messageText) {
          const mensagemComNome = `*${user.full_name || 'Recepção'}:* ${messageText}`;
          messageBody = {
            messaging_product: 'whatsapp',
            to: numero,
            type: 'text',
            text: { body: mensagemComNome }
          };
        } else {
          return Response.json({ error: 'Nenhum conteúdo para enviar' }, { status: 400 });
        }

        try {
          const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(messageBody)
          });

          const result = await response.json();
          console.log('📱 Meta response:', result);
          
          if (response.ok) {
            mensagemEnviada = true;
            console.log('✅ Mensagem enviada via Meta com sucesso');
          } else {
            console.error('❌ Erro Meta:', result);
          }
        } catch (metaError) {
          console.error('❌ Erro ao enviar Meta:', metaError.message);
        }
      }
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

        await base44.asServiceRole.entities.Contato.update(contatoId, {
          historico_mensagens: historicoAtual.slice(-50),
          ultima_resposta: conteudoMensagem,
          ultima_interacao: timestamp,
          total_mensagens: (contato.total_mensagens || 0) + 1
        });
      }
    }

    return Response.json({ success: true, message: 'Mensagem enviada' });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});