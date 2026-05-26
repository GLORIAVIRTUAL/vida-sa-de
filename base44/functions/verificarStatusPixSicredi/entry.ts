import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { transaction_id } = await req.json();
    
    if (!transaction_id) {
      return Response.json({ error: 'Missing transaction_id' }, { status: 400 });
    }

    const clientId = Deno.env.get('SICREDI_CLIENT_ID');
    const clientSecret = Deno.env.get('SICREDI_CLIENT_SECRET');
    const ambiente = Deno.env.get('SICREDI_AMBIENTE') || 'homologacao';

    if (!clientId || !clientSecret) {
      return Response.json({ error: 'Sicredi credentials not configured' }, { status: 500 });
    }

    const baseUrl = ambiente === 'producao' 
      ? 'https://api-pix.sicredi.com.br'
      : 'https://api-pix-h.sicredi.com.br';

    // Get OAuth token
    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      return Response.json({ error: 'Failed to get OAuth token' }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Check payment status
    const statusResponse = await fetch(`${baseUrl}/v2/cob/${transaction_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('Status check error:', errorText);
      return Response.json({ error: 'Failed to check payment status', details: errorText }, { status: 500 });
    }

    const statusData = await statusResponse.json();

    // Check if payment was received
    const isPaid = statusData.status === 'RECEBIDA' || statusData.status === 'PAGA' || 
                   (statusData.pix && statusData.pix.length > 0);

    return Response.json({
      success: true,
      transaction_id: transaction_id,
      status: statusData.status,
      is_paid: isPaid,
      valor: statusData.valor,
      data_vencimento: statusData.data_vencimento,
      pix_recebida: statusData.pix ? statusData.pix.length > 0 : false,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});