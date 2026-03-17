import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phoneNumber, resposta, contatoId, arquivoParaEnviar } = await req.json();
    
    if (!phoneNumber || !resposta) {
      return Response.json({ error: 'phoneNumber e resposta são obrigatórios' }, { status: 400 });
    }

    console.log('📤 Enviando resposta da Glória via WhatsApp para:', phoneNumber);

    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!instanceId || !token) {
      return Response.json({ error: 'Z-API não configurado' }, { status: 400 });
    }

    const telefoneFormatado = phoneNumber.replace(/\D/g, '');
    const headers = { 'Content-Type': 'application/json' };
    if (clientToken) headers['Client-Token'] = clientToken;

    // Enviar texto
    try {
      const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: telefoneFormatado, message: resposta })
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

    // Se houver arquivo para enviar (resultado de exame)
    if (arquivoParaEnviar && arquivoParaEnviar.url) {
      try {
        const docUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/${arquivoParaEnviar.url.includes('.pdf') ? 'pdf' : 'doc'}`;
        await fetch(docUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: telefoneFormatado,
            document: arquivoParaEnviar.url,
            fileName: arquivoParaEnviar.nome || 'Resultado_Exame.pdf'
          })
        });
        console.log('✅ Documento enviado');
      } catch (docError) {
        console.error('❌ Erro ao enviar documento:', docError.message);
      }
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});