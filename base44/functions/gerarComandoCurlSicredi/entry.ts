import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const clientId = Deno.env.get('SICREDI_CLIENT_ID') || '';
    const clientSecret = Deno.env.get('SICREDI_CLIENT_SECRET') || '';
    const ambiente = Deno.env.get('SICREDI_AMBIENTE') || 'homologacao';

    const baseUrl = ambiente === 'producao'
      ? 'https://api-pix.sicredi.com.br'
      : 'https://api-pix-h.sicredi.com.br';

    // Comando 1: mTLS com -u (Basic auth montado pelo curl)
    const comandoU = [
      `curl -v ${baseUrl}/oauth/token \\`,
      `  --cert /opt/sicredi-proxy/certs/cert.pem \\`,
      `  --key /opt/sicredi-proxy/certs/key.pem \\`,
      `  -H "Content-Type: application/x-www-form-urlencoded" \\`,
      `  -u "${clientId}:${clientSecret}" \\`,
      `  -d "grant_type=client_credentials"`,
    ].join('\n');

    return Response.json({
      ambiente,
      base_url: baseUrl,
      client_id_preview: clientId ? `${clientId.slice(0, 6)}...${clientId.slice(-4)} (len: ${clientId.length})` : 'VAZIO',
      client_secret_len: clientSecret.length,
      comando_curl: comandoU,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});