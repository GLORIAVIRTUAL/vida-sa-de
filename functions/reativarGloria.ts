import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phoneNumber, messageText, senderName, contatoId } = await req.json();
    
    if (!phoneNumber || !messageText) {
      return Response.json({ error: 'phoneNumber e messageText são obrigatórios' }, { status: 400 });
    }

    console.log('🔄 Reativando Glória para:', phoneNumber, '| Msg:', messageText);

    // Buscar paciente pelo telefone
    let pacienteId = null;
    try {
      const telNorm = phoneNumber.replace(/\D/g, '');
      const variantes = [phoneNumber, telNorm];
      if (telNorm.startsWith('55') && telNorm.length >= 12) variantes.push(telNorm.slice(2));
      if (!telNorm.startsWith('55') && telNorm.length >= 10) variantes.push('55' + telNorm);
      
      for (const v of variantes) {
        const pacientes = await base44.asServiceRole.entities.Paciente.filter({ telefone: v });
        if (pacientes.length > 0) {
          pacienteId = pacientes[0].id;
          break;
        }
      }
    } catch (e) {
      console.warn('⚠️ Erro ao buscar paciente:', e.message);
    }

    // Primeiro, garantir que o contato está com atendimento_humano = false
    // para que processarMensagemAgente não ignore a mensagem
    if (contatoId) {
      try {
        await base44.asServiceRole.entities.Contato.update(contatoId, {
          atendimento_humano: false
        });
        console.log('✅ Contato atualizado para modo IA');
      } catch (e) {
        console.warn('⚠️ Erro ao atualizar contato:', e.message);
      }
    }

    // Chamar processarMensagemAgente para gerar resposta da IA
    console.log('📞 Chamando processarMensagemAgente...');
    let resultado;
    try {
      resultado = await base44.asServiceRole.functions.invoke('processarMensagemAgente', {
        phoneNumber,
        messageText,
        senderName: senderName || 'Cliente',
        pacienteId,
        mediaType: 'text',
        mediaUrl: null,
        messageId: null
      });
      console.log('✅ processarMensagemAgente retornou:', JSON.stringify(resultado.data).substring(0, 200));
    } catch (invokeError) {
      console.error('❌ Erro ao chamar processarMensagemAgente:', invokeError.message);
      return Response.json({ success: false, error: invokeError.message }, { status: 500 });
    }

    const respostaIA = resultado.data?.resposta;
    console.log('📝 Resposta da IA:', respostaIA ? respostaIA.substring(0, 100) + '...' : 'NULL');

    if (respostaIA) {
      // Enviar resposta via Z-API (WhatsApp)
      const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
      const token = Deno.env.get('ZAPI_TOKEN');
      const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

      if (instanceId && token) {
        const telefoneFormatado = phoneNumber.replace(/\D/g, '');
        const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
        
        const headers = { 'Content-Type': 'application/json' };
        if (clientToken) headers['Client-Token'] = clientToken;

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ phone: telefoneFormatado, message: respostaIA })
          });
          
          const result = await response.json();
          if (response.ok) {
            console.log('✅ WhatsApp enviado com sucesso');
          } else {
            console.error('❌ Erro Z-API:', result);
          }
        } catch (whatsappError) {
          console.error('❌ Erro ao enviar WhatsApp:', whatsappError.message);
        }
      } else {
        console.warn('⚠️ Z-API não configurado');
      }

      // Se houver arquivo para enviar (resultado de exame)
      if (resultado.data?.arquivoParaEnviar) {
        const arquivo = resultado.data.arquivoParaEnviar;
        try {
          const telefoneFormatado = phoneNumber.replace(/\D/g, '');
          const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
          const token = Deno.env.get('ZAPI_TOKEN');
          const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
          
          const docUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/${arquivo.url.includes('.pdf') ? 'pdf' : 'doc'}`;
          const headers = { 'Content-Type': 'application/json' };
          if (clientToken) headers['Client-Token'] = clientToken;
          
          await fetch(docUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              phone: telefoneFormatado,
              document: arquivo.url,
              fileName: arquivo.nome || 'Resultado_Exame.pdf'
            })
          });
          console.log('✅ Documento enviado');
        } catch (docError) {
          console.error('❌ Erro ao enviar documento:', docError.message);
        }
      }

      return Response.json({ success: true, resposta: respostaIA });
    } else {
      console.log('⚠️ Sem resposta da IA');
      return Response.json({ success: true, resposta: null });
    }

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});