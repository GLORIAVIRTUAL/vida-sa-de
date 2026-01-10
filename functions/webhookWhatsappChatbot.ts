import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    console.log('📨 Mensagem recebida do WhatsApp:', body);

    const { phone, message, messageId, senderName } = body;

    if (!phone || !message) {
      return Response.json({ 
        error: 'Phone e message são obrigatórios' 
      }, { status: 400 });
    }

    // Registrar conversa
    try {
      // Buscar ou criar paciente pelo telefone
      let paciente = await base44.asServiceRole.entities.Paciente.filter({
        telefone: phone
      });

      let pacienteId;
      if (Array.isArray(paciente) && paciente.length > 0) {
        pacienteId = paciente[0].id;
        console.log(`✅ Paciente encontrado: ${paciente[0].id}`);
      } else {
        // Criar paciente rapidamente
        const novoPaciente = await base44.asServiceRole.entities.Paciente.create({
          nome: senderName || 'Cliente WhatsApp',
          telefone: phone,
          cpf: '',
          convenio: 'Particular'
        });
        pacienteId = novoPaciente.id;
        console.log(`🆕 Novo paciente criado: ${pacienteId}`);
      }

      // Invocar agente de IA para processar a mensagem
      console.log('🤖 Enviando para agente de IA...');
      
      const agentResponse = await base44.agents.addMessage(
        { agentName: 'chatbot_agendamentos' },
        {
          role: 'user',
          content: message,
          metadata: {
            phone,
            pacienteId,
            senderName
          }
        }
      );

      console.log('✅ Resposta do agente:', agentResponse);

      // Enviar resposta via WhatsApp através da Z-API
      if (agentResponse?.content) {
        await enviarMensagemWhatsapp(phone, agentResponse.content);
      }

      return Response.json({ 
        success: true, 
        message: 'Mensagem processada',
        pacienteId,
        agentResponse
      });

    } catch (error) {
      console.error('❌ Erro ao processar:', error);
      
      // Enviar mensagem de erro ao usuário
      await enviarMensagemWhatsapp(
        phone, 
        '❌ Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente.'
      );

      throw error;
    }

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return Response.json({ 
      error: error.message || 'Erro ao processar webhook' 
    }, { status: 500 });
  }
});

// Função auxiliar para enviar mensagem via Z-API
async function enviarMensagemWhatsapp(phone, mensagem) {
  try {
    const instanceId = Deno.env.get('WHATSAPP_INSTANCE_ID');
    const token = Deno.env.get('WHATSAPP_API_KEY');

    if (!instanceId || !token) {
      console.warn('⚠️ Credenciais Z-API não configuradas');
      return;
    }

    // Limpar telefone
    const telefoneLimpo = phone.replace(/\D/g, '');
    const telefoneFormatado = telefoneLimpo.startsWith('55') 
      ? telefoneLimpo 
      : `55${telefoneLimpo}`;

    const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    
    const response = await fetch(zapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: telefoneFormatado,
        message: mensagem
      })
    });

    if (!response.ok) {
      console.error('❌ Erro ao enviar mensagem Z-API:', response.status);
    } else {
      console.log('✅ Mensagem enviada via WhatsApp');
    }
  } catch (error) {
    console.error('❌ Erro ao enviar via Z-API:', error);
  }
}