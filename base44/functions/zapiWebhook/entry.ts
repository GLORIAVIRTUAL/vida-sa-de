// Webhook da Z-API: apenas registra a mensagem recebida na fila da Glória
// (GloriaJob). Nenhuma decisão de negócio aqui — o processamento é feito por
// processarConversaGloria e o envio por processarFilaGloria.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizarTelefone, gerarToken } from '../../shared/gloriaCore.ts';

export default async function (req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ message: 'Método não permitido. Use POST.' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;
    const payload = await req.json().catch(() => ({}));

    // Ecos e callbacks da própria API não são mensagens do paciente.
    if (payload.fromApi === true) {
      return Response.json({ message: 'Callback API ignorado' });
    }

    const messageId = payload.messageId || payload.id;
    const status = payload.status;

    if (payload.fromMe === true && !status) {
      return Response.json({ message: 'Eco ignorado' });
    }

    // Atualização de status de mensagem enviada.
    if (payload.fromMe === true && messageId && status) {
      const mapa = { SENT: 'enviado', DELIVERED: 'entregue', READ: 'lido', FAIL: 'falhou', NOT_SENT: 'falhou' };
      const novo = mapa[status];
      if (novo) {
        const logs = await sr.entities.NotificationLog.filter({ api_message_id: messageId });
        if (logs.length > 0) {
          await sr.entities.NotificationLog.update(logs[0].id, { status_entrega: novo });
        }
      }
      return Response.json({ message: 'Status atualizado' });
    }

    if (payload.isGroup === true) {
      return Response.json({ message: 'Grupo ignorado' });
    }

    const telefone = normalizarTelefone(payload.phone || payload.from);
    if (!telefone || !messageId) {
      return Response.json({ message: 'Payload sem telefone ou messageId' });
    }

    // Foto de perfil do WhatsApp: guarda no contato para exibir no chat.
    const fotoPerfil = payload.senderPhoto || payload.photo || payload.chatPhoto || null;
    if (fotoPerfil) {
      try {
        const achados = await sr.entities.Contato.filter({ telefone_normalizado: telefone });
        const contato = achados[0] || (await sr.entities.Contato.filter({ telefone }))[0];
        if (contato && contato.foto_url !== fotoPerfil) {
          await sr.entities.Contato.update(contato.id, { foto_url: fotoPerfil });
        }
      } catch (erroFoto) {
        console.warn('zapiWebhook: falha ao salvar foto do contato', erroFoto && erroFoto.message);
      }
    }

    // Idempotência: um job por mensagem do provedor.
    const chaveEvento = 'whatsapp:' + messageId;
    const existentes = await sr.entities.GloriaJob.filter({ chave_evento: chaveEvento });
    if (existentes.length > 0) {
      return Response.json({ message: 'Mensagem já enfileirada' });
    }

    // Texto e mídia.
    let texto = String(payload.text?.message || payload.body || payload.message?.text || (typeof payload.message === 'string' ? payload.message : '') || '').trim();
    let mediaTipo = null;
    let mediaUrl = null;

    // Blocos de mídia conhecidos da Z-API. Alguns envios (encaminhados, figurinhas,
    // documentos com legenda) chegam com nomes diferentes, então varremos todos.
    const blocos = [
      ['image', payload.image],
      ['document', payload.document],
      ['audio', payload.audio],
      ['video', payload.video],
      ['image', payload.sticker],
      ['image', payload.photo],
      ['document', payload.documentMessage],
      ['audio', payload.ptt || payload.audioMessage],
      ['video', payload.videoMessage],
      ['image', payload.imageMessage]
    ];
    for (const [tipo, bloco] of blocos) {
      if (!bloco || typeof bloco !== 'object') continue;
      const url = bloco.imageUrl || bloco.documentUrl || bloco.audioUrl || bloco.videoUrl ||
        bloco.stickerUrl || bloco.url || bloco.fileUrl || bloco.mediaUrl ||
        Object.values(bloco).find((v) => typeof v === 'string' && v.startsWith('http'));
      if (url) {
        mediaTipo = tipo;
        mediaUrl = String(url);
        texto = texto || String(bloco.caption || bloco.fileName || bloco.title || '');
        break;
      }
    }

    // Tipos sem arquivo (contato, localização, enquete): registra como texto para
    // o atendente ver que algo chegou.
    if (!texto && !mediaUrl) {
      const contatoVcard = payload.contact || payload.vcard || payload.contactMessage;
      const local = payload.location || payload.locationMessage;
      if (contatoVcard) {
        texto = '[Contato recebido] ' + String(contatoVcard.displayName || contatoVcard.name || contatoVcard.phones || '').slice(0, 200);
      } else if (local) {
        texto = '[Localização recebida] ' + [local.address, local.latitude, local.longitude].filter(Boolean).join(' ');
      } else if (payload.poll || payload.pollMessage) {
        texto = '[Enquete recebida]';
      } else if (payload.reaction || payload.reactionMessage) {
        texto = '[Reação] ' + String((payload.reaction || payload.reactionMessage).value || '');
      }
    }

    if (!texto && !mediaUrl) {
      // Nada reconhecido: guarda o payload para investigação em vez de descartar.
      try {
        await sr.entities.WebhookLog.create({
          endpoint: 'zapiWebhook:conteudo_nao_reconhecido',
          method: 'POST',
          body: JSON.stringify(payload).slice(0, 4000),
          response_sent: 'Mensagem sem conteúdo',
          status: 'error'
        });
      } catch (_) { /* log é auxiliar */ }
      return Response.json({ message: 'Mensagem sem conteúdo' });
    }

    // Registra a mensagem primeiro, já com a URL da Z-API: se o upload da mídia
    // falhar (arquivos grandes, ex: 16 MB), o envio não se perde.
    const job = await sr.entities.GloriaJob.create({
      chave_evento: chaveEvento,
      correlation_id: gerarToken(8),
      canal: 'whatsapp',
      telefone_canonico: telefone,
      message_id: String(messageId),
      remetente_nome: payload.senderName || payload.chatName || '',
      texto: texto || null,
      media_tipo: mediaTipo,
      media_url: mediaUrl,
      status: 'Pendente'
    });

    // Upload permanente: a URL da Z-API expira.
    if (mediaUrl) {
      try {
        const resposta = await fetch(mediaUrl, { redirect: 'follow' });
        if (resposta.ok) {
          const blob = await resposta.blob();
          if (blob.size > 0) {
            const ext = { image: 'jpg', document: 'pdf', audio: 'ogg', video: 'mp4' }[mediaTipo] || 'bin';
            const mime = { image: 'image/jpeg', document: 'application/pdf', audio: 'audio/ogg', video: 'video/mp4' }[mediaTipo] || blob.type;
            const arquivo = new File([blob], 'whatsapp_' + messageId + '.' + ext, { type: mime });
            const enviado = await sr.integrations.Core.UploadFile({ file: arquivo });
            if (enviado?.file_url) {
              mediaUrl = enviado.file_url;
              await sr.entities.GloriaJob.update(job.id, { media_url: mediaUrl });
            }
          }
        }
      } catch (erroUpload) {
        console.warn('zapiWebhook: falha no upload da mídia', erroUpload && erroUpload.message);
      }
    }

    // Acumulador de 5s: dá tempo do cliente mandar várias linhas e a Glória
    // responder tudo de uma vez (quem chegar depois processa o grupo inteiro).
    await new Promise((r) => setTimeout(r, 5500));

    // Processamento imediato: responde na hora, sem esperar a automação.
    try {
      const tokenInterno = Deno.env.get('GLORIA_INTERNAL_TOKEN');
      await sr.functions.invoke('processarConversaGloria', { token_interno: tokenInterno });
      await sr.functions.invoke('processarFilaGloria', { token_interno: tokenInterno });
    } catch (erroProcessamento) {
      console.warn('zapiWebhook: processamento imediato falhou', erroProcessamento && erroProcessamento.message);
    }

    return Response.json({ message: 'Mensagem enfileirada' });
  } catch (erro) {
    console.error('zapiWebhook: erro', erro && erro.message);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}