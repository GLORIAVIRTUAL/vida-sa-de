// Página pública de confirmação de presença. Aceita apenas token de uso único,
// dentro do prazo. O token nunca é armazenado em claro (comparação por hash).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  sha256Hex, gerarToken, erroSeguro, autorizarInternoOuAdmin, confirmAppointmentCore
} from '../../shared/gloriaCore.ts';

const VALIDADE_HORAS = 72;

// Geração do link: usa a própria URL desta função, garantindo endereço correto.
async function gerarLink(base44, req, body) {
  const autorizacao = await autorizarInternoOuAdmin(base44, body.token_interno, Deno.env.get('GLORIA_INTERNAL_TOKEN'));
  if (!autorizacao.ok) return Response.json(autorizacao, { status: 403 });
  if (!body.agendamento_id) {
    return Response.json(erroSeguro('AGENDAMENTO_OBRIGATORIO', 'agendamento_id é obrigatório.'), { status: 400 });
  }
  const sr = base44.asServiceRole;
  const agendamento = await sr.entities.Agendamento.get(body.agendamento_id);
  if (!agendamento) {
    return Response.json(erroSeguro('AGENDAMENTO_NAO_ENCONTRADO', 'Agendamento não encontrado.'), { status: 404 });
  }
  if (agendamento.status === 'Cancelado') {
    return Response.json(erroSeguro('AGENDAMENTO_CANCELADO', 'Agendamento cancelado.'), { status: 400 });
  }
  const token = gerarToken(32);
  const hash = await sha256Hex(token);
  const expiraEm = new Date(Date.now() + VALIDADE_HORAS * 3600000).toISOString();
  await sr.entities.GloriaOperacao.create({
    chave_idempotencia: 'LINK_CONFIRMACAO:' + agendamento.id + ':' + hash.slice(0, 16),
    tipo: 'CONFIRMAR',
    status: 'Iniciada',
    agendamento_id: agendamento.id,
    paciente_id: agendamento.paciente_id || null,
    medico_id: agendamento.medico_id || null,
    data: agendamento.data_agendamento,
    hora: agendamento.horario,
    confirmacao_token_hash: hash,
    confirmacao_token_expira_em: expiraEm
  });
  // Domínio público do app (mesmo usado nos links enviados hoje aos pacientes).
  const link = 'https://clinica-plus-7629e61a.base44.app/functions/confirmarPresencaGloria?t=' + token;
  return Response.json({ ok: true, url: link, expira_em: expiraEm });
}

function pagina(titulo, corpo, cor = '#2563eb') {
  return new Response(
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + titulo + '</title></head>' +
    '<body style="font-family:system-ui,Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px;">' +
    '<div style="max-width:420px;margin:40px auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 6px 20px rgba(0,0,0,.08);text-align:center;">' +
    '<h1 style="font-size:20px;color:' + cor + ';margin:0 0 12px;">' + titulo + '</h1>' +
    corpo +
    '<p style="margin-top:24px;font-size:12px;color:#94a3b8;">Centro Vida Saúde</p>' +
    '</div></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function dataBr(data, hora) {
  if (!data) return '';
  const [a, m, d] = String(data).split('-');
  return d + '/' + m + '/' + a + (hora ? ' às ' + hora : '');
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    let token = url.searchParams.get('t') || '';
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body && body.acao === 'gerar_link') return await gerarLink(base44, req, body);
      if (body && body.t) token = body.t;
    }
    if (!token) return pagina('Link inválido', '<p>Este link não é válido.</p>', '#dc2626');

    const sr = base44.asServiceRole;

    const hash = await sha256Hex(token);
    const operacoes = await sr.entities.GloriaOperacao.filter({ confirmacao_token_hash: hash });
    const operacao = operacoes.length === 1 ? operacoes[0] : null;
    if (!operacao) return pagina('Link inválido', '<p>Este link não é válido.</p>', '#dc2626');
    if (operacao.confirmacao_token_usado_em) {
      return pagina('Presença já confirmada', '<p>Sua presença já havia sido confirmada. Obrigado!</p>', '#16a34a');
    }
    if (!operacao.confirmacao_token_expira_em || new Date(operacao.confirmacao_token_expira_em).getTime() < Date.now()) {
      await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Expirada' });
      return pagina('Link expirado', '<p>Este link expirou. Fale com a recepção pelo WhatsApp.</p>', '#dc2626');
    }

    const agendamento = await sr.entities.Agendamento.get(operacao.agendamento_id);
    if (!agendamento) return pagina('Não encontrado', '<p>Agendamento não encontrado.</p>', '#dc2626');
    if (agendamento.status === 'Cancelado') {
      return pagina('Agendamento cancelado', '<p>Este agendamento está cancelado. Fale com a recepção.</p>', '#dc2626');
    }

    // GET apenas mostra os dados; a confirmação só ocorre no POST do botão.
    if (req.method !== 'POST') {
      return pagina(
        'Confirmar presença',
        '<p style="color:#334155;">' + (agendamento.paciente_nome || 'Paciente') + '<br>' +
        dataBr(agendamento.data_agendamento, agendamento.horario) + '</p>' +
        '<button id="b" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:14px 20px;font-size:16px;width:100%;cursor:pointer;">Confirmar presença</button>' +
        '<p id="m" style="color:#64748b;font-size:13px;"></p>' +
        '<script>document.getElementById("b").onclick=async function(){' +
        'this.disabled=true;document.getElementById("m").textContent="Confirmando...";' +
        'var r=await fetch(window.location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},' +
        'body:JSON.stringify({t:new URLSearchParams(window.location.search).get("t")})});' +
        'document.open();document.write(await r.text());document.close();};<\/script>'
      );
    }

    // Uso único: marca o token antes de confirmar; se já foi marcado, para aqui.
    const recheque = await sr.entities.GloriaOperacao.get(operacao.id);
    if (recheque.confirmacao_token_usado_em) {
      return pagina('Presença já confirmada', '<p>Sua presença já havia sido confirmada. Obrigado!</p>', '#16a34a');
    }
    await sr.entities.GloriaOperacao.update(operacao.id, {
      confirmacao_token_usado_em: new Date().toISOString(),
      status: 'Concluida'
    });

    const resultado = await confirmAppointmentCore(sr, {
      chave_idempotencia: 'CONFIRMAR_LINK:' + agendamento.id,
      agendamento_id: agendamento.id
    });
    if (!resultado.ok) {
      return pagina('Não foi possível confirmar', '<p>' + resultado.mensagem + '</p>', '#dc2626');
    }

    return pagina(
      'Presença confirmada',
      '<p style="color:#334155;">Obrigado! Sua consulta de ' +
      dataBr(agendamento.data_agendamento, agendamento.horario) + ' está confirmada.</p>',
      '#16a34a'
    );
  } catch (erro) {
    console.error('confirmarPresencaGloria: erro inesperado', erro && erro.message);
    return pagina('Erro', '<p>Não foi possível processar agora. Tente novamente.</p>', '#dc2626');
  }
}