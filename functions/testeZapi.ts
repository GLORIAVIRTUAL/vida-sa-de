import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    console.log('🔑 Configuração Z-API:');
    console.log('   - instanceId:', instanceId);
    console.log('   - token:', token);
    console.log('   - clientToken:', clientToken);

    const telefone = '558788020504';
    const mensagem = 'Teste de envio via Z-API';

    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    console.log('🔗 URL:', url);

    const headers = {
      'Content-Type': 'application/json',
      'Client-Token': clientToken
    };
    console.log('📋 Headers:', JSON.stringify(headers));

    const body = {
      phone: telefone,
      message: mensagem
    };
    console.log('📋 Body:', JSON.stringify(body));

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const result = await response.json();
    console.log('📊 Response status:', response.status);
    console.log('📊 Response body:', JSON.stringify(result));

    return Response.json({ 
      success: response.ok,
      status: response.status,
      result 
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});