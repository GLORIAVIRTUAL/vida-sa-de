import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Mescla contatos duplicados (mesmos últimos 8 dígitos de telefone) em um único contato.
 * Para cada grupo:
 *  - O contato MAIS ANTIGO é mantido como principal
 *  - Todos os históricos de mensagens são unificados (deduplicados por messageId/timestamp+content)
 *  - O nome melhor é mantido (preferindo o que parece ser nome real, não "Cliente"/"Usuário")
 *  - paciente_id é preservado (preferindo qualquer um que tenha)
 *  - Os contatos duplicados são DELETADOS
 *
 * Payload opcional:
 *  - dryRun: true (apenas simula, não altera nada)
 *  - ignorarTelefonesInvalidos: true (pula telefones com sequências de zeros/noves)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dryRun = body.dryRun === true;
    const ignorarTelefonesInvalidos = body.ignorarTelefonesInvalidos !== false; // default true
    const limite = body.limite || 50; // processar no máximo N grupos por chamada para evitar rate limit
    const delayMs = body.delayMs || 250; // delay entre operações

    // Buscar todos os contatos
    let todosContatos = [];
    let skip = 0;
    const batchSize = 500;
    while (todosContatos.length < 20000) {
      const lote = await base44.asServiceRole.entities.Contato.list('-created_date', batchSize, skip);
      if (!lote || lote.length === 0) break;
      todosContatos = [...todosContatos, ...lote];
      if (lote.length < batchSize) break;
      skip += batchSize;
    }

    console.log(`📊 Total de contatos carregados: ${todosContatos.length}`);

    // Agrupar por últimos 8 dígitos
    const grupos = new Map();
    for (const c of todosContatos) {
      const telNum = (c.telefone || '').replace(/\D/g, '');
      if (telNum.length < 8) continue;
      const chave = telNum.slice(-8);

      // Pular telefones inválidos
      if (ignorarTelefonesInvalidos) {
        if (/^0+$/.test(chave) || /^9+$/.test(chave) || /^1+$/.test(chave)) continue;
      }

      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(c);
    }

    const resultados = {
      total_grupos_processados: 0,
      total_contatos_mesclados: 0,
      total_contatos_deletados: 0,
      total_mensagens_unificadas: 0,
      erros: [],
      detalhes: [],
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    for (const [chave, lista] of grupos.entries()) {
      if (lista.length < 2) continue;
      if (resultados.total_grupos_processados >= limite) {
        resultados.atingiu_limite = true;
        break;
      }

      resultados.total_grupos_processados += 1;

      // Ordenar por created_date (mais antigo primeiro)
      lista.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const principal = lista[0];
      const duplicados = lista.slice(1);

      // Unificar histórico
      const historicoUnificado = [...(principal.historico_mensagens || [])];
      let mensagensAdicionadas = 0;

      for (const dup of duplicados) {
        const histDup = dup.historico_mensagens || [];
        for (const msg of histDup) {
          // Deduplicar por messageId (se houver) ou timestamp+content
          const jaExiste = historicoUnificado.some(m => {
            if (msg.messageId && m.messageId) return m.messageId === msg.messageId;
            return m.timestamp === msg.timestamp && m.content === msg.content;
          });
          if (!jaExiste) {
            historicoUnificado.push(msg);
            mensagensAdicionadas += 1;
          }
        }
      }

      // Ordenar por timestamp
      historicoUnificado.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

      // Determinar melhor nome (preferindo não-genérico)
      const nomesGenericos = ['cliente', 'usuário', 'usuario', 'whatsapp', ''];
      let melhorNome = principal.nome;
      if (!melhorNome || nomesGenericos.includes(melhorNome.toLowerCase().trim())) {
        for (const c of lista) {
          if (c.nome && !nomesGenericos.includes(c.nome.toLowerCase().trim())) {
            melhorNome = c.nome;
            break;
          }
        }
      }

      // Preservar paciente_id se algum tiver
      let pacienteId = principal.paciente_id || null;
      if (!pacienteId) {
        for (const c of lista) {
          if (c.paciente_id) { pacienteId = c.paciente_id; break; }
        }
      }

      // Mais recente ultima_interacao
      let ultimaInteracaoMaisRecente = principal.ultima_interacao;
      for (const c of lista) {
        if (c.ultima_interacao && (!ultimaInteracaoMaisRecente || new Date(c.ultima_interacao) > new Date(ultimaInteracaoMaisRecente))) {
          ultimaInteracaoMaisRecente = c.ultima_interacao;
        }
      }

      // Determinar telefone "canônico" (com 55 na frente se aplicável)
      let telCanonico = (principal.telefone || '').replace(/\D/g, '');
      if (telCanonico.length === 10 || telCanonico.length === 11) {
        telCanonico = '55' + telCanonico;
      }

      // Unir interesses (sem duplicar)
      const interessesUnificados = new Set(principal.interesses || []);
      for (const c of lista) {
        (c.interesses || []).forEach(i => interessesUnificados.add(i));
      }

      const detalheGrupo = {
        chave_telefone: chave,
        principal_id: principal.id,
        principal_nome: principal.nome,
        principal_telefone: principal.telefone,
        nome_final: melhorNome,
        duplicados_deletados: duplicados.map(d => ({ id: d.id, nome: d.nome, telefone: d.telefone })),
        total_mensagens_antes: (principal.historico_mensagens || []).length,
        total_mensagens_depois: historicoUnificado.length,
        mensagens_adicionadas: mensagensAdicionadas,
      };

      if (!dryRun) {
        try {
          // Atualizar principal com tudo unificado
          await base44.asServiceRole.entities.Contato.update(principal.id, {
            telefone: telCanonico,
            nome: melhorNome,
            historico_mensagens: historicoUnificado.slice(-300),
            ultima_interacao: ultimaInteracaoMaisRecente,
            paciente_id: pacienteId,
            interesses: Array.from(interessesUnificados),
          });
          await sleep(delayMs);

          // Deletar duplicados (com delay entre cada)
          for (const dup of duplicados) {
            try {
              await base44.asServiceRole.entities.Contato.delete(dup.id);
              resultados.total_contatos_deletados += 1;
              await sleep(delayMs);
            } catch (e) {
              resultados.erros.push({ id: dup.id, erro: e.message });
              // Em caso de rate limit, esperar mais
              if (e.message?.toLowerCase().includes('rate')) {
                await sleep(2000);
              }
            }
          }
        } catch (e) {
          resultados.erros.push({ grupo: chave, erro: e.message });
          detalheGrupo.erro = e.message;
          if (e.message?.toLowerCase().includes('rate')) {
            await sleep(2000);
          }
        }
      }

      resultados.total_contatos_mesclados += lista.length;
      resultados.total_mensagens_unificadas += mensagensAdicionadas;
      resultados.detalhes.push(detalheGrupo);
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      ...resultados,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});