import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import tls from 'node:tls';

function normalizePem(pem) {
  if (!pem) return pem;
  let content = pem.trim();
  if (content.includes('\n') && /-----BEGIN [^-]+-----\n/.test(content)) {
    return content;
  }
  const headerMatch = content.match(/-----BEGIN ([^-]+)-----/);
  const footerMatch = content.match(/-----END ([^-]+)-----/);
  if (!headerMatch || !footerMatch) return content;
  const header = headerMatch[0];
  const footer = footerMatch[0];
  let body = content.substring(content.indexOf(header) + header.length, content.indexOf(footer));
  body = body.replace(/\s+/g, '');
  const wrapped = body.match(/.{1,64}/g).join('\n');
  return `${header}\n${wrapped}\n${footer}\n`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const certPem = normalizePem(Deno.env.get('SICREDI_CERT_PEM'));
    const keyPem = normalizePem(Deno.env.get('SICREDI_KEY_PEM'));
    const chainPem = normalizePem(Deno.env.get('SICREDI_CHAIN_PEM'));
    const ambiente = Deno.env.get('SICREDI_AMBIENTE') || 'homologacao';
    const host = ambiente === 'producao' ? 'api-pix.sicredi.com.br' : 'api-pix-h.sicredi.com.br';

    const fullCert = chainPem ? `${certPem.trim()}\n${chainPem.trim()}\n` : certPem;

    function tryHandshake(certToSend, label) {
      return new Promise((resolve) => {
        const socket = tls.connect({
          host,
          port: 443,
          cert: certToSend,
          key: keyPem,
          servername: host,
          rejectUnauthorized: true,
          timeout: 8000,
        }, () => {
          resolve({
            label,
            connected: true,
            authorized: socket.authorized,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
            protocol: socket.getProtocol(),
            cipher: socket.getCipher(),
          });
          socket.end();
        });
        socket.on('error', (err) => {
          resolve({ label, connected: false, error: err.message, code: err.code });
        });
        socket.on('timeout', () => {
          resolve({ label, connected: false, error: 'timeout' });
          socket.destroy();
        });
      });
    }

    const certOnly = await tryHandshake(certPem, 'cert_only');
    const certPlusChain = await tryHandshake(fullCert, 'cert_plus_chain');

    return Response.json({ host, ambiente, chain_present: !!chainPem, certOnly, certPlusChain });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});