// Processa jobs Pendentes da Glória: aplica a máquina de estados e deixa a
// resposta pronta para a fila de envio. Um contato por vez (lock por contato).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  autorizarInternoOuAdmin, gerarToken, garantirContato, acrescentarHistorico
} from '../../shared/gloriaCore.ts';
import { processarTurno, expiracao } from '../../shared/gloriaDialogo.ts';
import { transcreverAudio } from '../../shared/gloriaLlm.ts';

const LOTE = 5;
const LOCK_SEGUNDOS = 120;
const MAX_TENTATIVAS = 3;

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
    const pendentes = await sr.entities.GloriaJob.filter({ status: 'Pendente' }, 'created_date', 50);

    const elegiveis = pendentes.filter((job) => {
      const lockAtivo = job.lock_expira_em && new Date(job.lock_expira_em).getTime() > agora;
      if (lockAtivo) return false;
      if (job.proxima_tentativa_em && new Date(job.proxima_tentativa_em).getTime() > agora) return false;
      return (job.tentativas || 0) < MAX_TENTATIVAS;
    }).slice(0, LOTE);

    let processados = 0;
    let ignorados = 0;
    let falhas = 0;
    const contatosVistos = new Set();

    for (const job of elegiveis) {
      // Um job por contato por rodada, preservando a ordem das mensagens.
      if (contatosVistos.has(job.telefone_canonico)) continue;
      contatosVistos.add(job.telefone_canonico);

      const token = gerarToken(12);
      await sr.entities.GloriaJob.update(job.id, {
        status: 'Processando',
        lock_token: token,
        lock_expira_em: new Date(Date.now() + LOCK_SEGUNDOS * 1000).toISOString(),
        tentativas: (job.tentativas || 0) + 1
      });
      const atual = await sr.entities.GloriaJob.get(job.id);
      if (!atual || atual.lock_token !== token) continue;

      try {
        const garantido = await garantirContato(sr, job.telefone_canonico, job.remetente_nome);
        if (!garantido.ok) throw new Error(garantido.codigo);
        const contato = garantido.contato;

        // Atendimento humano em andamento: registra a mensagem e não responde.
        if (contato.atendimento_humano === true) {
          await acrescentarHistorico(sr, contato, {
            role: 'user', content: job.texto || '', messageId: job.message_id,
            mediaType: job.media_tipo, mediaUrl: job.media_url
          });
          await sr.entities.GloriaJob.update(job.id, {
            status: 'Ignorado', erro: 'ATENDIMENTO_HUMANO',
            lock_token: null, lock_expira_em: null, processado_em: new Date().toISOString()
          });
          ignorados++;
          continue;
        }

        let texto = job.texto || '';
        if (!texto && job.media_tipo === 'audio' && job.media_url) {
          texto = await transcreverAudio(sr, { audioUrl: job.media_url });
        }

        const registro = await acrescentarHistorico(sr, contato, {
          role: 'user', content: texto, messageId: job.message_id,
          mediaType: job.media_tipo, mediaUrl: job.media_url
        });
        if (registro.duplicado) {
          await sr.entities.GloriaJob.update(job.id, {
            status: 'Ignorado', erro: 'MENSAGEM_DUPLICADA',
            lock_token: null, lock_expira_em: null, processado_em: new Date().toISOString()
          });
          ignorados++;
          continue;
        }

        const contatoAtual = await sr.entities.Contato.get(contato.id);
        const turno = await processarTurno(sr, { contato: contatoAtual, texto, mediaUrl: job.media_url });

        if (!turno) {
          await sr.entities.GloriaJob.update(job.id, {
            status: 'Ignorado', erro: 'AGUARDANDO_HUMANO',
            lock_token: null, lock_expira_em: null, processado_em: new Date().toISOString()
          });
          ignorados++;
          continue;
        }

        await sr.entities.Contato.update(contato.id, {
          gloria_estado: turno.estado,
          gloria_estado_dados: turno.dados || {},
          gloria_estado_expira_em: expiracao(),
          atendimento_humano: turno.estado === 'AGUARDANDO_HUMANO'
        });
        await acrescentarHistorico(sr, await sr.entities.Contato.get(contato.id), {
          role: 'assistant', content: turno.texto
        });

        await sr.entities.GloriaJob.update(job.id, {
          status: 'ProntoParaEnvio',
          resposta_texto: turno.texto,
          erro: null,
          lock_token: null,
          lock_expira_em: null
        });
        processados++;
      } catch (erro) {
        const tentativas = (atual.tentativas || 0);
        const esgotou = tentativas >= MAX_TENTATIVAS;
        await sr.entities.GloriaJob.update(job.id, {
          status: esgotou ? 'Falha' : 'Pendente',
          erro: 'ERRO_PROCESSAMENTO',
          proxima_tentativa_em: esgotou ? null : new Date(Date.now() + 120000).toISOString(),
          lock_token: null,
          lock_expira_em: null
        });
        console.error('processarConversaGloria: falha no job', job.id, erro && erro.message);
        falhas++;
      }
    }

    return Response.json({ ok: true, avaliados: elegiveis.length, processados, ignorados, falhas });
  } catch (erro) {
    console.error('processarConversaGloria: erro inesperado', erro && erro.message);
    return Response.json({ ok: false, codigo: 'ERRO_INTERNO', mensagem: 'Erro interno.' }, { status: 500 });
  }
}