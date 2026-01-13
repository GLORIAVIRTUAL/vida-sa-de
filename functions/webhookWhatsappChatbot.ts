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
    const phoneNumber = message.from;
    const messageText = message.text?.body;
    const senderName = value?.contacts?.[0]?.profile?.name || 'Usuário';

    if (!phoneNumber || !messageText) {
      console.log('⚠️ Mensagem inválida');
      return Response.json({ success: true });
    }

    console.log('💬 Mensagem:', { phoneNumber, senderName, messageText });

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

    // Buscar conversa existente
    const conversas = await base44.asServiceRole.agents.listConversations({ agent_name: 'chatbot_agendamentos' });
    let conversation = conversas.conversations?.find(c => c.metadata?.phone === phoneNumber);

    if (!conversation) {
      // Criar conversa COM mensagem inicial
      console.log('🆕 Nova conversa');
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: 'chatbot_agendamentos',
        metadata: { phone: phoneNumber, senderName, pacienteId },
        initial_message: { role: 'user', content: messageText }
      });
      console.log('✅ Criada:', conversation.id.substring(0, 8));
    } else {
      // Adicionar mensagem via fetch direto (evita bug do SDK)
      console.log('📝 Msg existente:', conversation.id.substring(0, 8));

      const url = `https://api.base44.com/agents/conversations/${conversation.id}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'user',
          content: messageText
        })
      });

      if (!response.ok) {
        throw new Error(`Erro API: ${response.status}`);
      }

      console.log('✅ Msg adicionada');
    }

    // Aguardar resposta do agente com polling progressivo
    let resposta = null;
    const delays = [3000, 3000, 4000, 5000, 5000, 5000]; // Total: 25s

    for (let i = 0; i < delays.length; i++) {
      await new Promise(resolve => setTimeout(resolve, delays[i]));

      const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
      const msgs = conversaAtualizada.messages || [];
      const ultimaMensagem = msgs[msgs.length - 1];

      console.log(`🔍 Tentativa ${i+1}/${delays.length}: ${msgs.length} msgs | Última: ${ultimaMensagem?.role || 'nenhuma'}`);

      if (ultimaMensagem?.role === 'assistant' && ultimaMensagem.content) {
        resposta = ultimaMensagem.content;
        console.log('✅ Agente respondeu');
        break;
      }
    }

    if (resposta) {
      await enviarWhatsApp(phoneNumber, resposta);
      console.log('✅ WhatsApp enviado');
    } else {
      console.log('⚠️ Timeout 25s - enviando fallback');
      await enviarWhatsApp(phoneNumber, 'Olá! Estou processando sua solicitação. Um momento, por favor.');
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