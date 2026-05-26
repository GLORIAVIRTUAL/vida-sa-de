import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ordem_servico_id, valor } = await req.json();
    
    if (!ordem_servico_id || !valor) {
      return Response.json({ error: 'Missing required fields: ordem_servico_id, valor' }, { status: 400 });
    }

    // Get credentials from environment
    const clientId = Deno.env.get('SICREDI_CLIENT_ID');
    const clientSecret = Deno.env.get('SICREDI_CLIENT_SECRET');
    const certPem = Deno.env.get('SICREDI_CERT_PEM');
    const keyPem = Deno.env.get('SICREDI_KEY_PEM');
    const pixKey = Deno.env.get('SICREDI_PIX_KEY');
    const ambiente = Deno.env.get('SICREDI_AMBIENTE') || 'homologacao';

    if (!clientId || !clientSecret || !certPem || !keyPem || !pixKey) {
      return Response.json({ error: 'Sicredi credentials not configured' }, { status: 500 });
    }

    // API endpoint based on environment
    const baseUrl = ambiente === 'producao' 
      ? 'https://api-pix.sicredi.com.br'
      : 'https://api-pix-h.sicredi.com.br';

    // Step 1: Get OAuth token with mTLS (certificate + private key)
    // For Sicredi, we need to use the certificate and key for mutual TLS authentication
    const tlsOptions = {
      cert: certPem,
      key: keyPem,
    };

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
      ...tlsOptions,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token error:', errorText);
      return Response.json({ error: 'Failed to get OAuth token', details: errorText }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return Response.json({ error: 'No access token returned' }, { status: 500 });
    }

    // Step 2: Generate QR Code (Immediate/Static)
    const qrCodePayload = {
      chave_pix: pixKey,
      valor: valor,
      descricao: `OS ${ordem_servico_id}`,
      identificador_unico: ordem_servico_id,
      tipo_qr: 'DINAMICO', // ou ESTATICO, dependendo de preferência
    };

    const qrResponse = await fetch(`${baseUrl}/v2/cob`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(qrCodePayload),
    });

    if (!qrResponse.ok) {
      const errorText = await qrResponse.text();
      console.error('QR Code generation error:', errorText);
      return Response.json({ error: 'Failed to generate QR code', details: errorText }, { status: 500 });
    }

    const qrData = await qrResponse.json();

    // Extract QR code image URL or content
    const qrCode = qrData.qr_code || qrData.qrcode;
    const transactionId = qrData.id || qrData.identificador_unico;

    return Response.json({
      success: true,
      qr_code: qrCode,
      transaction_id: transactionId,
      valor: valor,
      chave_pix: pixKey,
      ordem_servico_id: ordem_servico_id,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});