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

    // Enviar mensagem via WhatsApp (Meta)
    const phoneId = Deno.env.get("META_PHONE_NUMBER_ID");
    const accessToken = Deno.env.get("META_ACCESS_TOKEN");

    if (phoneId && accessToken) {
      // Formatar número
      let numero = phoneNumber.replace(/\D/g, '');
      if (!numero.startsWith('55')) numero = '55' + numero;

      let messageBody;
      
      // Montar body baseado no tipo de mensagem
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
      } else if (messageType === 'audio' && mediaUrl) {
        messageBody = {
          messaging_product: 'whatsapp',
          to: numero,
          type: 'audio',
          audio: { link: mediaUrl }
        };
      } else {
        // Mensagem de texto padrão
        messageBody = {
          messaging_product: 'whatsapp',
          to: numero,
          type: 'text',
          text: { body: messageText || '' }
        };
      }

      const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageBody)
      });

      const result = await response.json();
      console.log('📱 WhatsApp response:', result);
      
      if (!response.ok) {
        console.error('❌ Erro WhatsApp:', result);
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
        let conteudoMensagem = messageText || '';
        if (messageType === 'image' && mediaUrl) {
          conteudoMensagem = `📷 ${mediaUrl}`;
        } else if (messageType === 'document' && mediaUrl) {
          conteudoMensagem = `📄 ${fileName || 'Documento'}: ${mediaUrl}`;
        } else if (messageType === 'audio' && mediaUrl) {
          conteudoMensagem = `🎤 ${mediaUrl}`;
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