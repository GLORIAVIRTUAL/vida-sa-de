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
// Acumulador: só responde 5s após a última mensagem, para agrupar várias linhas.
const DEBOUNCE_MS = 5000;
// A Glória responde apenas nas conversas onde o atendente desativou o modo
// humano (atendimento_humano = false). Por padrão os contatos ficam manuais.
const IA_ATIVA = true;

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

    for (const bruto of elegiveis) {
      // Um contato por rodada, preservando a ordem das mensagens.
      if (contatosVistos.has(bruto.telefone_canonico)) continue;
      contatosVistos.add(bruto.telefone_canonico);

      // Acumulador: espera DEBOUNCE_MS após a última mensagem do contato para
      // responder todas as linhas de uma vez.
      const grupo = pendentes
        .filter((j) => j.telefone_canonico === bruto.telefone_canonico && j.status === 'Pendente' &&
          !(j.lock_expira_em && new Date(j.lock_expira_em).getTime() > agora))
        .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
      const ultima = grupo[grupo.length - 1] || bruto;
      if (agora - new Date(ultima.created_date).getTime() < DEBOUNCE_MS) continue;

      const job = ultima;
      const anteriores = grupo.slice(0, -1);

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

        // Mensagem nova reabre a conversa: se estava finalizada, ela voltaria
        // para o fim da lista do painel e passaria despercebida.
        if (contato.conversa_finalizada === true) {
          await sr.entities.Contato.update(contato.id, { conversa_finalizada: false });
          contato.conversa_finalizada = false;
        }

        // IA desligada (atendimento manual) ou atendimento humano em andamento:
        // registra a mensagem e não responde.
        if (!IA_ATIVA || contato.atendimento_humano === true) {
          // Registra todas as mensagens do grupo, na ordem, mantendo o histórico
          // local sincronizado (senão a imagem enviada antes do texto se perde).
          for (const item of grupo) {
            const gravadoHumano = await acrescentarHistorico(sr, contato, {
              role: 'user', content: item.texto || '', messageId: item.message_id,
              mediaType: item.media_tipo, mediaUrl: item.media_url
            });
            contato.historico_mensagens = gravadoHumano.historico;
            contato.total_mensagens = (contato.total_mensagens || 0) + 1;
            if (item.id !== job.id) {
              await sr.entities.GloriaJob.update(item.id, {
                status: 'Ignorado', erro: 'ATENDIMENTO_HUMANO',
                lock_token: null, lock_expira_em: null, processado_em: new Date().toISOString()
              });
            }
          }
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

        // Mensagens anteriores do mesmo contato entram no mesmo turno: ficam no
        // histórico e o texto delas é lido junto com a última mensagem.
        const partes = [];
        for (const antigo of anteriores) {
          let t = antigo.texto || '';
          if (!t && antigo.media_tipo === 'audio' && antigo.media_url) {
            t = await transcreverAudio(sr, { audioUrl: antigo.media_url });
          }
          // O histórico local precisa acompanhar cada gravação: sem isso a
          // mensagem anterior (ex: a imagem enviada antes do texto) é sobrescrita.
          const gravado = await acrescentarHistorico(sr, contato, {
            role: 'user', content: t, messageId: antigo.message_id,
            mediaType: antigo.media_tipo, mediaUrl: antigo.media_url
          });
          contato.historico_mensagens = gravado.historico;
          contato.total_mensagens = (contato.total_mensagens || 0) + 1;
          await sr.entities.GloriaJob.update(antigo.id, {
            status: 'Ignorado', erro: 'AGRUPADO',
            lock_token: null, lock_expira_em: null, processado_em: new Date().toISOString()
          });
          if (t) partes.push(t);
        }
        if (partes.length > 0) texto = partes.concat(texto ? [texto] : []).join('\n');

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
        // Atendente devolveu a conversa para a Glória: sai do estado de espera.
        if (contatoAtual.gloria_estado === 'AGUARDANDO_HUMANO') {
          contatoAtual.gloria_estado = 'OCIOSO';
          contatoAtual.gloria_estado_dados = {};
        }
        const leitura = {};
        const turno = await processarTurno(sr, { contato: contatoAtual, texto, mediaUrl: job.media_url, mediaTipo: job.media_tipo, registro: leitura });

        if (!turno) {
          await sr.entities.GloriaJob.update(job.id, {
            status: 'Ignorado', erro: 'AGUARDANDO_HUMANO',
            estado_anterior: leitura.estado_anterior || null, estado_novo: null, interpretacao: leitura,
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
          estado_anterior: leitura.estado_anterior || null,
          estado_novo: turno.estado,
          interpretacao: leitura,
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
        // Falha definitiva: a conversa vai para a recepção em vez de ficar sem resposta.
        if (esgotou) {
          const contatos = await sr.entities.Contato.filter({ telefone_normalizado: job.telefone_canonico });
          for (const c of contatos) {
            await sr.entities.Contato.update(c.id, {
              atendimento_humano: true, gloria_estado: 'AGUARDANDO_HUMANO',
              gloria_estado_dados: { motivo_transferencia: 'Falha no processamento da Glória' }
            });
          }
        }
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