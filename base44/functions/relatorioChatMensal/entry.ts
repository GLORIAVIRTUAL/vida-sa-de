import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { mes = '2026-07' } = await req.json();
    if (!/^\d{4}-\d{2}$/.test(mes)) return Response.json({ error: 'Mês inválido' }, { status: 400 });

    const [ano, numeroMes] = mes.split('-').map(Number);
    const inicio = Date.UTC(ano, numeroMes - 1, 1, 3, 0, 0);
    const fim = Date.UTC(ano, numeroMes, 1, 3, 0, 0);
    const dentroDoMes = (valor) => {
      const timestamp = Date.parse(valor || '');
      return Number.isFinite(timestamp) && timestamp >= inicio && timestamp < fim;
    };

    const contatosBrutos = [];
    for (let skip = 0; skip < 10000; skip += 500) {
      const lote = await base44.asServiceRole.entities.Contato.list('-ultima_interacao', 500, skip);
      contatosBrutos.push(...(lote || []));
      if (!lote || lote.length < 500) break;
    }

    const contatosPorTelefone = new Map();
    contatosBrutos.forEach((contato) => {
      const telefone = String(contato.telefone || '').replace(/\D/g, '');
      const chave = telefone.length >= 8 ? telefone.slice(-8) : contato.id;
      const existente = contatosPorTelefone.get(chave);
      if (!existente) {
        contatosPorTelefone.set(chave, {
          ...contato,
          tags: [...(contato.tags || [])],
          interesses: [...(contato.interesses || [])],
          historico_mensagens: [...(contato.historico_mensagens || [])],
          dados_extras: {
            ...(contato.dados_extras || {}),
            tag_historico: [...(contato.dados_extras?.tag_historico || [])]
          }
        });
        return;
      }

      existente.tags.push(...(contato.tags || []));
      existente.interesses.push(...(contato.interesses || []));
      const mensagensExistentes = new Set(existente.historico_mensagens.map(
        (mensagem) => `${mensagem.timestamp || ''}|${mensagem.role || ''}|${mensagem.content || ''}`
      ));
      (contato.historico_mensagens || []).forEach((mensagem) => {
        const chaveMensagem = `${mensagem.timestamp || ''}|${mensagem.role || ''}|${mensagem.content || ''}`;
        if (!mensagensExistentes.has(chaveMensagem)) {
          mensagensExistentes.add(chaveMensagem);
          existente.historico_mensagens.push(mensagem);
        }
      });
      const eventosExistentes = new Set(existente.dados_extras.tag_historico.map(
        (evento) => `${evento.timestamp || ''}|${evento.acao || ''}|${evento.tag || ''}|${evento.atendente || ''}`
      ));
      (contato.dados_extras?.tag_historico || []).forEach((evento) => {
        const chaveEvento = `${evento.timestamp || ''}|${evento.acao || ''}|${evento.tag || ''}|${evento.atendente || ''}`;
        if (!eventosExistentes.has(chaveEvento)) {
          eventosExistentes.add(chaveEvento);
          existente.dados_extras.tag_historico.push(evento);
        }
      });
    });

    const contatos = Array.from(contatosPorTelefone.values());
    const conversas = contatos.filter((contato) =>
      contato.historico_mensagens.some((mensagem) => dentroDoMes(mensagem.timestamp))
    );
    const tagsContagem = new Map();
    const atendentesContagem = new Map();

    conversas.forEach((contato) => {
      const tagsUnicas = new Map();
      [...(contato.tags || []), ...(contato.interesses || [])].forEach((tag) => {
        const nome = String(tag || '').trim();
        if (nome) tagsUnicas.set(nome.toLocaleLowerCase('pt-BR'), nome);
      });
      tagsUnicas.forEach((nome) => tagsContagem.set(nome, (tagsContagem.get(nome) || 0) + 1));

      const eventos = (contato.dados_extras?.tag_historico || []).filter(
        (evento) => evento.acao === 'adicionar' && dentroDoMes(evento.timestamp)
      );
      if (eventos.length > 0) {
        eventos.forEach((evento) => {
          const nome = String(evento.atendente || 'Não identificado').trim();
          atendentesContagem.set(nome, (atendentesContagem.get(nome) || 0) + 1);
        });
        return;
      }

      const autores = new Set();
      (contato.historico_mensagens || []).forEach((mensagem) => {
        if (!dentroDoMes(mensagem.timestamp)) return;
        const autor = String(mensagem.content || '').match(/^\[👤\s*([^\]]+)\]:/u)?.[1]?.trim();
        if (autor) autores.add(autor);
      });
      if (tagsUnicas.size > 0 && autores.size === 1) {
        const nome = Array.from(autores)[0];
        atendentesContagem.set(nome, (atendentesContagem.get(nome) || 0) + tagsUnicas.size);
      }
    });

    const tags = Array.from(tagsContagem, ([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
    const atendentes = Array.from(atendentesContagem, ([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));

    return Response.json({
      mes,
      conversas: conversas.length,
      criterio_conversas: 'Contatos únicos por telefone com ao menos uma mensagem no mês.',
      pacientes_com_tags: conversas.filter((contato) => (contato.tags || []).length + (contato.interesses || []).length > 0).length,
      total_tags: tags.reduce((total, tag) => total + tag.quantidade, 0),
      tags,
      atendentes,
      criterio_atendentes: 'Eventos registrados; para dados antigos, único atendente humano identificado na conversa do mês.'
    });
  } catch (error) {
    console.error('Erro ao gerar relatório mensal do chat:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}