import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

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

    const result = {};

    // 1. Try to parse the certificate
    try {
      const x509 = new crypto.X509Certificate(certPem);
      result.cert_subject = x509.subject;
      result.cert_issuer = x509.issuer;
      result.cert_valid_from = x509.validFrom;
      result.cert_valid_to = x509.validTo;
      result.cert_parsed = true;

      // 2. Try to parse the private key
      try {
        const privateKey = crypto.createPrivateKey(keyPem);
        result.key_parsed = true;
        result.key_type = privateKey.asymmetricKeyType;

        // 3. Check if key matches cert (sign + verify)
        try {
          const testData = Buffer.from('test-match-check');
          const signature = crypto.sign('sha256', testData, privateKey);
          const publicKey = x509.publicKey;
          const matches = crypto.verify('sha256', testData, publicKey, signature);
          result.cert_key_match = matches;
        } catch (e) {
          result.cert_key_match = false;
          result.match_error = e.message;
        }
      } catch (e) {
        result.key_parsed = false;
        result.key_error = e.message;
      }
    } catch (e) {
      result.cert_parsed = false;
      result.cert_error = e.message;
    }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});