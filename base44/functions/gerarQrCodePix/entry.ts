import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import https from 'node:https';
import { Buffer } from 'node:buffer';

// Helper: makes HTTPS request with mTLS using node:https
function mtlsRequest({ url, method, headers, body, cert, key }) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
      cert,
      key,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data)),
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

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

    // Step 1: Get OAuth token (Basic Auth + mTLS)
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenBody = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'cob.write cob.read',
    }).toString();

    const tokenResponse = await mtlsRequest({
      url: `${baseUrl}/oauth/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'Content-Length': Buffer.byteLength(tokenBody),
      },
      body: tokenBody,
      cert: certPem,
      key: keyPem,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token error:', errorText);
      return Response.json({ error: 'Failed to get OAuth token', details: errorText, status: tokenResponse.status }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return Response.json({ error: 'No access token returned', tokenData }, { status: 500 });
    }

    // Step 2: Generate dynamic Pix charge (cob)
    const txid = ordem_servico_id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 35).padEnd(26, '0');
    
    const cobPayload = JSON.stringify({
      calendario: { expiracao: 3600 },
      valor: { original: Number(valor).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: `OS ${ordem_servico_id}`,
    });

    const cobResponse = await mtlsRequest({
      url: `${baseUrl}/api/v2/cob/${txid}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(cobPayload),
      },
      body: cobPayload,
      cert: certPem,
      key: keyPem,
    });

    if (!cobResponse.ok) {
      const errorText = await cobResponse.text();
      console.error('Cob generation error:', errorText);
      return Response.json({ error: 'Failed to generate Pix charge', details: errorText, status: cobResponse.status }, { status: 500 });
    }

    const cobData = await cobResponse.json();

    return Response.json({
      success: true,
      qr_code: cobData.pixCopiaECola,
      location: cobData.location,
      txid: cobData.txid || txid,
      transaction_id: cobData.txid || txid,
      valor: valor,
      chave_pix: pixKey,
      ordem_servico_id: ordem_servico_id,
      expiracao: cobData.calendario?.expiracao,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});