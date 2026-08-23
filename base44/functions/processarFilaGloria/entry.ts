// Worker da fila da Glória: entrega respostas já prontas, com lock, retentativas
// com backoff e sem reenviar texto que já foi entregue.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { autorizarInternoOuAdmin, gerarToken } from '../../shared/gloriaCore.ts';
import { enviarTexto, enviarDocumento } from '../../shared/gloriaZapi.ts';

const LOTE = 10;
const MAX_TENTATIVAS = 5;
const LOCK_SEGUNDOS = 120;

function proximaTentativa(tentativas) {
  const minutos = Math.min(30, Math.pow(2, tentativas));
  return new Date(Date.now() + minutos * 60000).toISOString();
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const autorizacao = await autorizarInternoOuAdmin(
      base44,
      body && body.token_interno,
      Deno.env.get('GLORIA_INTERNAL_TOKEN')
    );
    const viaAutomacao = !!(body && body.automation && body.automation.id);
    if (!autorizacao.ok && !viaAutomacao) return Response.json(autorizacao, { status: 403 });

    const sr = base44.asServiceRole;
    const agora = Date.now();
    const prontos = await sr.entities.GloriaJob.filter({ status: 'ProntoParaEnvio' }, 'created_date', 50);

    const elegiveis = prontos.filter((job) => {
      const lockAtivo = job.lock_expira_em && new Date(job.lock_expira_em).getTime() > agora;
      if (lockAtivo) return false;
      if (job.proxima_tentativa_em && new Date(job.proxima_tentativa_em).getTime() > agora) return false;
      return (job.tentativas || 0) < MAX_TENTATIVAS;
    }).slice(0, LOTE);

    let enviados = 0;
    let falhas = 0;

    for (const job of elegiveis) {
      const token = gerarToken(12);
      await sr.entities.GloriaJob.update(job.id, {
        lock_token: token,
        lock_expira_em: new Date(Date.now() + LOCK_SEGUNDOS * 1000).toISOString(),
        tentativas: (job.tentativas || 0) + 1
      });

      // Confirma que o lock é nosso antes de enviar (evita entrega dupla).
      const atual = await sr.entities.GloriaJob.get(job.id);
      if (!atual || atual.lock_token !== token || atual.status !== 'ProntoParaEnvio') continue;

      let textoEntregue = !!atual.texto_entregue;
      let zapiMessageId = atual.zapi_message_id || null;
      let erro = null;

      if (!textoEntregue && atual.resposta_texto) {
        const envio = await enviarTexto(atual.telefone_canonico, atual.resposta_texto);
        if (envio.ok) {
          textoEntregue = true;
          zapiMessageId = envio.messageId || zapiMessageId;
        } else {
          erro = envio.erro || 'FALHA_ENVIO_TEXTO';
        }
      }

      let documentoEntregue = true;
      if (!erro && atual.resposta_arquivo_url) {
        const envio = await enviarDocumento(atual.telefone_canonico, atual.resposta_arquivo_url, 'documento.pdf');
        if (!envio.ok) {
          documentoEntregue = false;
          erro = envio.erro || 'FALHA_ENVIO_DOCUMENTO';
        }
      }

      if (!erro && documentoEntregue) {
        await sr.entities.GloriaJob.update(job.id, {
          status: 'Enviado',
          texto_entregue: textoEntregue,
          zapi_message_id: zapiMessageId,
          erro: null,
          lock_token: null,
          lock_expira_em: null,
          processado_em: new Date().toISOString()
        });
        enviados++;
      } else {
        const tentativas = (atual.tentativas || 0) + 1;
        const esgotou = tentativas >= MAX_TENTATIVAS;
        await sr.entities.GloriaJob.update(job.id, {
          status: esgotou ? 'Falha' : 'ProntoParaEnvio',
          texto_entregue: textoEntregue,
          zapi_message_id: zapiMessageId,
          erro,
          proxima_tentativa_em: esgotou ? null : proximaTentativa(tentativas),
          lock_token: null,
          lock_expira_em: null
        });
        falhas++;
      }
    }

    return Response.json({ ok: true, avaliados: elegiveis.length, enviados, falhas });
  } catch (erro) {
    console.error('processarFilaGloria: erro inesperado', erro && erro.message);
    return Response.json({ ok: false, codigo: 'ERRO_INTERNO', mensagem: 'Erro interno.' }, { status: 500 });
  }
}