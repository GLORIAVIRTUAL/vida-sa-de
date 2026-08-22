// Envio de mensagens da Glória pela Z-API. Único ponto de saída de mensagens
// automáticas (sem prefixo de atendente humano).

function credenciais() {
  return {
    instanceId: Deno.env.get('ZAPI_INSTANCE_ID'),
    token: Deno.env.get('ZAPI_TOKEN'),
    clientToken: Deno.env.get('ZAPI_CLIENT_TOKEN')
  };
}

function cabecalhos(clientToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (clientToken) headers['Client-Token'] = clientToken;
  return headers;
}

async function postar(url, headers, body) {
  const resposta = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const bruto = await resposta.text();
  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch (_e) {
    dados = { raw: bruto };
  }
  return { ok: resposta.ok, status: resposta.status, dados };
}

export async function enviarTexto(telefone, mensagem) {
  const { instanceId, token, clientToken } = credenciais();
  if (!instanceId || !token) return { ok: false, erro: 'ZAPI_NAO_CONFIGURADO' };
  if (!telefone || !mensagem) return { ok: false, erro: 'PARAMETROS_INVALIDOS' };
  const url = 'https://api.z-api.io/instances/' + instanceId + '/token/' + token + '/send-text';
  const r = await postar(url, cabecalhos(clientToken), { phone: telefone, message: mensagem });
  return {
    ok: r.ok,
    status: r.status,
    messageId: r.dados && (r.dados.messageId || r.dados.id) ? (r.dados.messageId || r.dados.id) : null,
    erro: r.ok ? null : 'FALHA_ENVIO_TEXTO'
  };
}

export async function enviarDocumento(telefone, urlArquivo, nomeArquivo) {
  const { instanceId, token, clientToken } = credenciais();
  if (!instanceId || !token) return { ok: false, erro: 'ZAPI_NAO_CONFIGURADO' };
  if (!telefone || !urlArquivo) return { ok: false, erro: 'PARAMETROS_INVALIDOS' };
  const url = 'https://api.z-api.io/instances/' + instanceId + '/token/' + token + '/send-document/pdf';
  const r = await postar(url, cabecalhos(clientToken), {
    phone: telefone,
    document: urlArquivo,
    fileName: nomeArquivo || 'documento.pdf'
  });
  return {
    ok: r.ok,
    status: r.status,
    messageId: r.dados && (r.dados.messageId || r.dados.id) ? (r.dados.messageId || r.dados.id) : null,
    erro: r.ok ? null : 'FALHA_ENVIO_DOCUMENTO'
  };
}