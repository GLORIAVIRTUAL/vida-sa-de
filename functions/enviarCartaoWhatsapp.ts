import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { telefone, imagemBase64, nomePaciente } = await req.json();

    if (!telefone || !imagemBase64) {
      return Response.json({ 
        error: 'Telefone e imagem são obrigatórios' 
      }, { status: 400 });
    }

    // Limpar telefone (remover caracteres especiais)
    const telefoneLimpo = telefone.replace(/\D/g, '');
    
    // Garantir que tem DDI do Brasil
    const telefoneFormatado = telefoneLimpo.startsWith('55') 
      ? telefoneLimpo 
      : `55${telefoneLimpo}`;

    console.log('📱 Enviando cartão para:', telefoneFormatado);

    // Buscar credenciais Z-API
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!instanceId || !token) {
      throw new Error('Credenciais Z-API não configuradas (ZAPI_INSTANCE_ID e ZAPI_TOKEN)');
    }

    // Converter base64 para Blob
    const base64Data = imagemBase64.split(',')[1];
    
    // Enviar via Z-API
    const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`;
    
    const headers = {
      'Content-Type': 'application/json'
    };
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }
    
    const response = await fetch(zapiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: telefoneFormatado,
        image: imagemBase64,
        caption: `🎉 Seu Cartão Mais Vida está pronto!\n\n${nomePaciente || 'Cliente'}, segue seu cartão digital.\n\nGuarde este arquivo para apresentar na clínica.\n\n✅ Centro Vida Saúde`
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Erro Z-API:', result);
      throw new Error(result.message || 'Erro ao enviar mensagem');
    }

    console.log('✅ Cartão enviado com sucesso:', result);

    // Registrar log de notificação
    try {
      await base44.asServiceRole.entities.NotificationLog.create({
        tipo_canal: 'whatsapp',
        telefone_destino: telefoneFormatado,
        mensagem_enviada: `Cartão Digital - ${nomePaciente || 'Cliente'}`,
        paciente_nome: nomePaciente || 'Cliente',
        status_entrega: 'enviado',
        api_message_id: result.messageId || null,
        resposta_api: JSON.stringify(result)
      });
    } catch (logError) {
      console.warn('⚠️ Erro ao registrar log:', logError);
    }

    return Response.json({ 
      success: true, 
      message: 'Cartão enviado com sucesso!',
      messageId: result.messageId 
    });

  } catch (error) {
    console.error('❌ Erro ao enviar cartão:', error);
    return Response.json({ 
      error: error.message || 'Erro ao enviar cartão' 
    }, { status: 500 });
  }
});