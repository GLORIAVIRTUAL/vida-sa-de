import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import https from 'node:https';
import { Buffer } from 'node:buffer';

// Helper: normalizes PEM content - reconstructs newlines if they were stripped
function normalizePem(pem) {
  if (!pem) return pem;
  let content = pem.trim();
  // If it already has proper newlines inside the base64 body, return as-is
  if (content.includes('\n') && /-----BEGIN [^-]+-----\n/.test(content)) {
    return content;
  }
  // Detect the header/footer labels
  const headerMatch = content.match(/-----BEGIN ([^-]+)-----/);
  const footerMatch = content.match(/-----END ([^-]+)-----/);
  if (!headerMatch || !footerMatch) return content;
  const header = headerMatch[0];
  const footer = footerMatch[0];
  // Extract the base64 body between header and footer
  let body = content.substring(content.indexOf(header) + header.length, content.indexOf(footer));
  // Remove all whitespace from the body
  body = body.replace(/\s+/g, '');
  // Re-wrap base64 body at 64 chars per line
  const wrapped = body.match(/.{1,64}/g).join('\n');
  return `${header}\n${wrapped}\n${footer}\n`;
}

// Helper: makes HTTPS request with mTLS using node:https
function mtlsRequest({ url, method, headers, body, cert, key, ca }) {
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
      ...(ca ? { ca } : {}),
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
    const certPem = normalizePem(Deno.env.get('SICREDI_CERT_PEM'));
    const keyPem = normalizePem(Deno.env.get('SICREDI_KEY_PEM'));
    const chainPem = normalizePem(Deno.env.get('SICREDI_CHAIN_PEM'));
    const pixKey = Deno.env.get('SICREDI_PIX_KEY');
    const ambiente = Deno.env.get('SICREDI_AMBIENTE') || 'homologacao';

    if (!clientId || !clientSecret || !certPem || !keyPem || !pixKey) {
      return Response.json({ error: 'Sicredi credentials not configured' }, { status: 500 });
    }

    // API endpoint based on environment
    const baseUrl = ambiente === 'producao' 
      ? 'https://api-pix.sicredi.com.br'
      : 'https://api-pix-h.sicredi.com.br';

    // Build full client cert chain: client cert + intermediate chain concatenated.
    // Akamai/mTLS requires the client to present the full chain during the handshake.
    const fullCert = chainPem ? `${certPem.trim()}\n${chainPem.trim()}\n` : certPem;

    // Step 1: Get OAuth token (Basic Auth + mTLS)
    // Following the official Sicredi collection: grant_type goes in the query
    // string, Content-Type is application/json and there is NO request body.
    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const tokenResponse = await mtlsRequest({
      url: `${baseUrl}/oauth/token?grant_type=client_credentials`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
      },
      cert: fullCert,
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
      url: `${baseUrl}/api/v3/cob/${txid}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(cobPayload),
      },
      body: cobPayload,
      cert: fullCert,
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