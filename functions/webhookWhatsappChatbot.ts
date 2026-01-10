import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // Verificar token do webhook (segurança)
  const verifyToken = Deno.env.get('META_VERIFY_TOKEN') || 'seu_token_de_verificacao';
  
  // GET - Verificação do webhook pela Meta
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (token === verifyToken) {
      console.log('✅ Webhook verificado pela Meta');
      return new Response(challenge);
    } else {
      console.error('❌ Token inválido');
      return new Response('Invalid token', { status: 403 });
    }
  }

  // POST - Receber mensagens
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('📨 Webhooks da Meta recebido:', JSON.stringify(body, null, 2));

      // Extrair dados da Meta (novo formato ou webhook direto)
      const messages = body?.value?.messages || body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
      const contacts = body?.value?.contacts || body?.entry?.[0]?.changes?.[0]?.value?.contacts || [];
      const phoneNumberId = body?.value?.metadata?.phone_number_id || body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      
      if (messages.length === 0) {
        return Response.json({ success: true });
      }

      const message = messages[0];
      const contact = contacts[0];

      // Apenas processar mensagens de texto
      if (message.type !== 'text') {
        console.log('⏭️ Tipo de mensagem não suportado:', message.type);
        return Response.json({ success: true });
      }

      const phoneNumber = message.from;
      const messageText = message.text?.body;
      const senderName = contact?.profile?.name || 'Cliente WhatsApp';

      if (!phoneNumber || !messageText) {
        return Response.json({ success: true });
      }

      // Buscar ou criar paciente
      let pacienteId;
      const base44 = createClientFromRequest(req);
      try {
        let pacientes = await base44.asServiceRole.entities.Paciente.filter({
          telefone: phoneNumber
        });

        if (Array.isArray(pacientes) && pacientes.length > 0) {
          pacienteId = pacientes[0].id;
          console.log(`✅ Paciente encontrado: ${pacienteId}`);
        } else {
          const novoPaciente = await base44.asServiceRole.entities.Paciente.create({
            nome: senderName,
            telefone: phoneNumber,
            cpf: '',
            convenio: 'Particular'
          });
          pacienteId = novoPaciente.id;
          console.log(`🆕 Novo paciente criado: ${pacienteId}`);
        }

      } catch (error) {
        console.error('❌ Erro ao processar paciente:', error);
        return Response.json({ success: true });
      }

      // Invocar agente de IA (separado para não quebrar o webhook)
      console.log('🤖 Enviando para agente de IA...');
      try {
        // Criar conversa do agente com service role (webhook não tem usuário autenticado)
        const conversation = await base44.asServiceRole.agents.createConversation({
          agent_name: 'chatbot_agendamentos',
          metadata: {
            phone: phoneNumber,
            pacienteId,
            senderName
          }
        });

        // Adicionar mensagem do usuário
        await base44.asServiceRole.agents.addMessage(conversation, {
          role: 'user',
          content: messageText
        });

        console.log('✅ Mensagem enviada para o agente');

      } catch (agentError) {
        console.error('⚠️ Erro ao chamar agente:', agentError.message);
      }

      // Sempre responder sucesso ao webhook da Meta
      try {
        await enviarMensagemMeta(
          phoneNumber,
          '✅ Sua mensagem foi recebida! Um assistente irá respondê-lo em breve.'
        );
      } catch (metaError) {
        console.error('❌ Erro ao enviar resposta Meta:', metaError.message);
      }

      return Response.json({ success: true });

    } catch (error) {
      console.error('❌ Erro no webhook:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'Método não permitido' }, { status: 405 });
});

// Função auxiliar para enviar mensagem via API oficial da Meta
async function enviarMensagemMeta(phoneNumber, mensagem) {
  try {
    const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
    const accessToken = Deno.env.get('META_ACCESS_TOKEN');

    if (!phoneNumberId || !accessToken) {
      console.warn('⚠️ Credenciais Meta WhatsApp não configuradas');
      return;
    }

    const metaUrl = `https://graph.instagram.com/v18.0/${phoneNumberId}/messages`;

    const response = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: mensagem
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Erro ao enviar mensagem Meta:', result);
      return;
    }

    console.log('✅ Mensagem enviada via Meta:', result.messages?.[0]?.id);

  } catch (error) {
    console.error('❌ Erro ao enviar via Meta:', error);
  }
}