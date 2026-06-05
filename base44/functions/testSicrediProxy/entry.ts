import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';

// Normaliza PEM reconstruindo quebras de linha se foram removidas
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

// Abre um túnel CONNECT no proxy e devolve o socket TCP cru
function connectViaProxy({ proxyHost, proxyPort, proxyAuth, targetHost, targetPort }) {
  return new Promise((resolve, reject) => {
    const headers = [
      `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
      `Host: ${targetHost}:${targetPort}`,
    ];
    if (proxyAuth) {
      headers.push(`Proxy-Authorization: Basic ${proxyAuth}`);
    }
    headers.push('', '');

    const socket = net.connect(proxyPort, proxyHost, () => {
      socket.write(headers.join('\r\n'));
    });

    let response = '';
    const onData = (chunk) => {
      response += chunk.toString();
      if (response.includes('\r\n\r\n')) {
        socket.removeListener('data', onData);
        const statusLine = response.split('\r\n')[0];
        if (/ 200 /.test(statusLine)) {
          resolve(socket);
        } else {
          reject(new Error(`Proxy CONNECT falhou: ${statusLine}`));
        }
      }
    };
    socket.on('data', onData);
    socket.on('error', reject);
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = Deno.env.get('SICREDI_CLIENT_ID');
    const clientSecret = Deno.env.get('SICREDI_CLIENT_SECRET');
    const certPem = normalizePem(Deno.env.get('SICREDI_CERT_PEM'));
    const keyPem = normalizePem(Deno.env.get('SICREDI_KEY_PEM'));
    const chainPem = normalizePem(Deno.env.get('SICREDI_CHAIN_PEM'));
    const ambiente = Deno.env.get('SICREDI_AMBIENTE') || 'homologacao';
    const proxyUrl = Deno.env.get('PROXY_URL');

    if (!proxyUrl) {
      return Response.json({ error: 'PROXY_URL não configurado' }, { status: 500 });
    }

    const baseUrl = ambiente === 'producao'
      ? 'https://api-pix.sicredi.com.br'
      : 'https://api-pix-h.sicredi.com.br';
    const targetHost = new URL(baseUrl).hostname;

    const proxy = new URL(proxyUrl);
    const proxyAuth = proxy.username
      ? btoa(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`)
      : null;

    // 1) Abre túnel CONNECT no Squid até o Sicredi (porta 443)
    const tunnelSocket = await connectViaProxy({
      proxyHost: proxy.hostname,
      proxyPort: Number(proxy.port) || 8080,
      proxyAuth,
      targetHost,
      targetPort: 443,
    });

    // 2) Faz handshake TLS/mTLS por cima do túnel
    const fullCert = chainPem ? `${certPem.trim()}\n${chainPem.trim()}\n` : certPem;
    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const result = await new Promise((resolve, reject) => {
      const agent = new https.Agent({
        socket: tunnelSocket,
        cert: fullCert,
        key: keyPem,
        servername: targetHost,
      });

      const options = {
        host: targetHost,
        port: 443,
        path: '/oauth/token?grant_type=client_credentials',
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${basicAuth}`,
          'Accept': 'application/json',
        },
      };

      const r = https.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      r.on('error', reject);
      r.end();
    });

    return Response.json({
      success: result.status >= 200 && result.status < 300,
      proxy_ip: proxy.hostname,
      sicredi_status: result.status,
      sicredi_response: result.body,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});