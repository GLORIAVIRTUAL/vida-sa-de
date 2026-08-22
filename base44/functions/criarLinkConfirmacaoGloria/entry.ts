// Gera link de confirmação com token de uso único e prazo de validade.
// O token em claro só existe na resposta; no banco fica apenas o hash SHA-256.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { autorizarInternoOuAdmin, gerarToken, sha256Hex, erroSeguro } from '../../shared/gloriaCore.ts';

const VALIDADE_HORAS = 72;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { agendamento_id, token_interno } = body || {};

    const autorizacao = await autorizarInternoOuAdmin(
      base44,
      token_interno,
      Deno.env.get('GLORIA_INTERNAL_TOKEN')
    );
    if (!autorizacao.ok) return Response.json(autorizacao, { status: 403 });

    if (!agendamento_id) {
      return Response.json(erroSeguro('AGENDAMENTO_OBRIGATORIO', 'agendamento_id é obrigatório.'), { status: 400 });
    }

    const sr = base44.asServiceRole;
    const agendamento = await sr.entities.Agendamento.get(agendamento_id);
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

    const base = new URL(req.url);
    base.pathname = base.pathname.replace(/criarLinkConfirmacaoGloria\/?$/, 'confirmarPresencaGloria');
    base.search = '?t=' + token;

    return Response.json({ ok: true, url: base.toString(), expira_em: expiraEm });
  } catch (erro) {
    console.error('criarLinkConfirmacaoGloria: erro inesperado', erro && erro.message);
    return Response.json({ ok: false, codigo: 'ERRO_INTERNO', mensagem: 'Erro interno.' }, { status: 500 });
  }
}