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
        console.log('✅ Paciente encontrado:', pacienteId);
      } else {
        const novoPaciente = await base44.asServiceRole.entities.Paciente.create({
          nome: senderName,
          telefone: phoneNumber,
          cpf: 'NÃO INFORMADO',
          observacoes: 'Criado via WhatsApp'
        });
        pacienteId = novoPaciente.id;
        console.log('✅ Novo paciente criado:', pacienteId);
      }
    } catch (error) {
      console.error('❌ Erro com paciente:', error);
    }

    // Buscar conversa existente
    const conversas = await base44.asServiceRole.agents.listConversations({ agent_name: 'chatbot_agendamentos' });
    let conversation = conversas.conversations?.find(c => c.metadata?.phone === phoneNumber);

    if (!conversation) {
      // Criar nova conversa COM a mensagem inicial
      console.log('🆕 Criando conversa nova');
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: 'chatbot_agendamentos',
        metadata: {
          phone: phoneNumber,
          senderName,
          pacienteId
        },
        initial_message: {
          role: 'user',
          content: messageText
        }
      });
      console.log('✅ Conversa criada:', conversation.id);
    } else {
      // Adicionar mensagem à conversa existente
      console.log('📝 Adicionando à conversa:', conversation.id);
      
      // Buscar conversa completa
      const conversaCompleta = await base44.asServiceRole.agents.getConversation(conversation.id);
      
      // Adicionar mensagem
      await base44.asServiceRole.agents.addMessage(conversaCompleta, {
        role: 'user',
        content: messageText
      });
      console.log('✅ Mensagem adicionada');
    }

    // Aguardar resposta do agente
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Buscar resposta
    const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
    const ultimaMensagem = conversaAtualizada.messages?.[conversaAtualizada.messages.length - 1];

    if (ultimaMensagem?.role === 'assistant') {
      // Enviar resposta pelo WhatsApp
      await enviarWhatsApp(phoneNumber, ultimaMensagem.content);
      console.log('✅ Resposta enviada');
    } else {
      console.log('⚠️ Sem resposta do agente');
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