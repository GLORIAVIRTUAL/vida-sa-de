import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const certPem = Deno.env.get('SICREDI_CERT_PEM') || '';
    const keyPem = Deno.env.get('SICREDI_KEY_PEM') || '';
    const clientId = Deno.env.get('SICREDI_CLIENT_ID') || '';
    const clientSecret = Deno.env.get('SICREDI_CLIENT_SECRET') || '';
    const pixKey = Deno.env.get('SICREDI_PIX_KEY') || '';
    const ambiente = Deno.env.get('SICREDI_AMBIENTE') || '';

    return Response.json({
      ambiente,
      pixKey,
      clientId_length: clientId.length,
      clientSecret_length: clientSecret.length,
      cert_length: certPem.length,
      cert_starts_with: certPem.substring(0, 30),
      cert_ends_with: certPem.substring(certPem.length - 30),
      cert_has_begin: certPem.includes('-----BEGIN CERTIFICATE-----'),
      cert_has_end: certPem.includes('-----END CERTIFICATE-----'),
      cert_has_newlines: certPem.includes('\n'),
      key_length: keyPem.length,
      key_starts_with: keyPem.substring(0, 30),
      key_has_begin_private: keyPem.includes('-----BEGIN PRIVATE KEY-----') || keyPem.includes('-----BEGIN RSA PRIVATE KEY-----') || keyPem.includes('-----BEGIN EC PRIVATE KEY-----'),
      key_has_newlines: keyPem.includes('\n'),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});