// Retomada solicitada pelo painel: usa o mesmo diálogo do webhook.
// A mensagem já está no histórico; o chamador continua responsável pelo envio.
import { buscarContatoPorTelefone, acrescentarHistorico, gerarToken } from './gloriaCore.ts';
import { processarTurno, expiracao } from './gloriaDialogo.ts';
import { transcreverAudio } from './gloriaLlm.ts';

export async function retomarConversaGloria(sr, telefone) {
  const contato = await buscarContatoPorTelefone(sr, telefone);
  if (!contato || contato.atendimento_humano !== false) {
    return { success: true, resposta: null, atendimento_humano: true };
  }
  const historico = contato.historico_mensagens || [];
  const versao = (c) => JSON.stringify([c.historico_mensagens || [], c.gloria_estado, c.gloria_estado_dados || {}]);
  const inicio = versao(contato);
  const indice = historico.findLastIndex((m) => m.role === 'user');
  if (indice < 0 || historico.slice(indice + 1).some((m) => m.role === 'assistant' && !m.humano)) {
    return { success: true, resposta: null, status: 'ja_respondido' };
  }
  const antigo = contato.processando_ia_lock;
  if (antigo && Date.now() - new Date(antigo.split('_')[0]).getTime() < 120000) {
    return { success: true, resposta: null, status: 'processando' };
  }
  const lock = new Date().toISOString() + '_' + gerarToken(8);
  await sr.entities.Contato.update(contato.id, { processando_ia_lock: lock });
  try {
    const atual = await sr.entities.Contato.get(contato.id);
    if (atual.processando_ia_lock !== lock || atual.atendimento_humano !== false || versao(atual) !== inicio) return { success: true, resposta: null };
    const mensagem = historico[indice];
    let texto = mensagem.content || '';
    if (mensagem.mediaType === 'audio' && mensagem.mediaUrl) texto = await transcreverAudio(sr, { audioUrl: mensagem.mediaUrl });
    const turno = await processarTurno(sr, { contato: atual, texto, mediaUrl: mensagem.mediaUrl, mediaTipo: mensagem.mediaType });
    if (!turno) return { success: true, resposta: null };
    const fresco = await sr.entities.Contato.get(contato.id);
    if (fresco.atendimento_humano !== false) return { success: true, resposta: null, atendimento_humano: true };
    if (fresco.processando_ia_lock !== lock || versao(fresco) !== inicio) return { success: true, resposta: null, status: 'conversa_atualizada' };
    await sr.entities.Contato.update(contato.id, {
      gloria_estado: turno.estado, gloria_estado_dados: turno.dados || {},
      gloria_estado_expira_em: expiracao(), atendimento_humano: turno.estado === 'AGUARDANDO_HUMANO'
    });
    await acrescentarHistorico(sr, fresco, { role: 'assistant', content: turno.texto });
    return { success: true, resposta: turno.texto, arquivoParaEnviar: null };
  } finally {
    const atual = await sr.entities.Contato.get(contato.id);
    if (atual?.processando_ia_lock === lock) await sr.entities.Contato.update(contato.id, { processando_ia_lock: null });
  }
}
