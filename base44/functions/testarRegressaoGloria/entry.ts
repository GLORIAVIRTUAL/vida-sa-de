import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { processarTurno } from '../../shared/gloriaDialogo.ts';
import { infoCartaoCore } from '../../shared/gloriaCartao.ts';

// Cenários fixos e isolados: nunca lê contatos nem envia WhatsApp.
export default async function(req) {
  const criados = [];
  let client;
  try {
    client = createClientFromRequest(req);
    const user = await client.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { persistir = false, llm_real = false } = await req.json();
    const dia = '2099-10-20';
    const info = 'HIDROGINÁSTICA\n- 3x/semana: R$ 220,00 Cartão Mais Vida\n- SEMPRE mostre TODAS as opções ao cliente\n\nCARTÃO MAIS VIDA\nPLANOS:\n- Individual: R$ 24,90/mês\nBENEFÍCIOS:\n- Desconto em consultas\n- SEMPRE informe ao cliente todas as opções\nCARÊNCIAS:\n- Consultas sem carência\n\nRETORNOS MÉDICOS\n- Gratuito em 15 dias\n\nEndereço: Rua Teste, 100\nLocalização: https://example.invalid/mapa';
    const tabelas = {
      Medico: [{ id: 'regressao-medico', nome: 'Médico Teste Glória', especialidade: 'Clínico Geral', status: 'Ativo', tempo_consulta_minutos: 30, horarios_atendimento: [{ data_especifica: dia, horario_inicio: '08:00', horario_fim: '10:00' }] }],
      Paciente: [], Agendamento: [], GloriaOperacao: [], Notification: [],
      ChatbotConfig: [{ ativo: true, informacoes_institucionais: info }],
      CategoriaPreco: [{ id: 'regressao-part', nome: 'Particular', status: 'Ativo' }, { id: 'regressao-cv', nome: 'Cartão Mais Vida', status: 'Ativo' }],
      Procedimento: [{ id: 'regressao-consulta', nome: 'CONSULTA CLINICO GERAL', especialidade: 'Clínico Geral', status: 'Ativo' }],
      TabelaPreco: [{ procedimento_id: 'regressao-consulta', categoria_id: 'regressao-part', valor: 150 }, { procedimento_id: 'regressao-consulta', categoria_id: 'regressao-cv', valor: 100 }], Exame: []
    };
    let extracao = {};
    let sequencia = 0;
    const persistidos = [];
    const entities = Object.fromEntries(Object.entries(tabelas).map(([nome, rows]) => [nome, {
      async list() { return rows; },
      async filter(query) { return rows.filter(r => Object.entries(query).every(([k,v]) => v && typeof v === 'object' ? r[k] !== v.$ne : r[k] === v)); },
      async get(id) { return rows.find(r => r.id === id); },
      async create(data) {
        let row = { ...data, id: nome + (++sequencia), created_date: new Date().toISOString() };
        if (persistir && nome === 'Agendamento') {
          const real = await client.entities.Agendamento.create({ ...data, observacoes: 'TESTE ISOLADO DE REGRESSÃO — remoção automática' });
          criados.push(real.id);
          row = await client.entities.Agendamento.get(real.id);
          persistidos.push({ valor_total: row.valor_total, valor_final: row.valor_final, categoria: row.categoria_preco_id, procedimento: row.procedimento_id });
        }
        rows.push(row); return row;
      },
      async update(id, data) { const row = rows.find(r => r.id === id); Object.assign(row, data); return row; }
    }]));
    const sr = { entities, integrations: { Core: { InvokeLLM: async (params) => llm_real ? client.integrations.Core.InvokeLLM(params) : extracao } } };
    let contato = { telefone: '5551999990000', atendimento_humano: false, gloria_estado: 'OCIOSO', gloria_estado_dados: {}, historico_mensagens: [] };
    const resultados = [];
    const respostas = [];
    function check(nome, passou) { resultados.push({ nome, passou: !!passou }); }
    async function turno(texto, campos = {}) {
      extracao = { intencao: 'OUTRO', ...campos };
      const r = await processarTurno(sr, { contato, texto });
      if (r) {
        contato.gloria_estado = r.estado; contato.gloria_estado_dados = r.dados;
        contato.historico_mensagens.push({ role: 'user', content: texto }, { role: 'assistant', content: r.texto });
        respostas.push({ cliente: texto, resposta: r.texto, estado: r.estado });
      }
      return r;
    }
    // Exercita a confirmação real do diálogo e a composição do registro salvo.
    contato.gloria_estado = 'AGENDAMENTO_CONFIRMACAO';
    contato.gloria_estado_dados = { especialidade: 'Clínico Geral', medico_id: 'regressao-medico', medico_nome: 'Médico Teste Glória', paciente_nome: 'Paciente Teste Glória', data: dia, hora: '08:00' };
    let r = await turno('sim');
    check('confirmação preserva contexto concluído', r.estado === 'OCIOSO' && r.dados.ultimo_agendamento?.id);
    check('novo agendamento tem preço e categoria', tabelas.Agendamento[0]?.valor_total === 150 && tabelas.Agendamento[0]?.valor_final === 150 && tabelas.Agendamento[0]?.categoria_preco_id === 'regressao-part');
    await turno('quanto custa a consulta com o clinico geral', { intencao: 'PRECO', especialidade: 'Clínico Geral' });
    r = await turno('particular');
    check('preço particular sem oferecer novo agendamento', r.texto.includes('150,00') && !r.texto.includes('veja um horário'));
    r = await turno('ja marquei, quanto custa pelo cartao mais vida', { intencao: 'PRECO' });
    check('comparação pelo cartão responde preço da consulta', r.texto.includes('100,00') && !r.texto.includes('24,90') && r.estado !== 'AGUARDANDO_HUMANO');
    check('comparação não altera nem duplica agendamento', tabelas.Agendamento.length === 1 && tabelas.Agendamento[0].valor_total === 150);
    r = await turno('nao, qual o endereco da clinica', { intencao: 'INFORMACAO', negativa: true });
    check('endereço sem transferência', r.texto.includes('Rua Teste, 100') && r.estado === 'OCIOSO');
    r = await turno('qual o valor do cartao mais vida', { intencao: 'PRECO' });
    check('preço do próprio cartão não vira consulta', r.texto.includes('24,90') && !r.texto.includes('100,00'));
    const cartao = await infoCartaoCore(sr);
    check('cartão não expõe instruções nem seções vizinhas', cartao.includes('24,90') && !/SEMPRE|HIDROGIN|RETORNOS|Rua Teste/.test(cartao));
    r = await turno('não, qual o endereço da clínica?', { intencao: 'INFORMACAO', negativa: true });
    check('recusa adesão e responde endereço', r.estado === 'OCIOSO' && !r.dados.assunto_cartao && r.texto.includes('Rua Teste'));
    // Um novo fluxo com convênio informado grava a tarifa desse convênio.
    contato.gloria_estado = 'AGENDAMENTO_CONFIRMACAO';
    contato.gloria_estado_dados = { especialidade: 'Clínico Geral', medico_id: 'regressao-medico', medico_nome: 'Médico Teste Glória', paciente_nome: 'Paciente Teste Convênio', data: dia, hora: '08:30', convenio: 'Cartão Mais Vida' };
    r = await turno('sim');
    check('agendamento com convênio salva tarifa correta', r.estado === 'OCIOSO' && tabelas.Agendamento[1]?.valor_total === 100 && tabelas.Agendamento[1]?.categoria_preco_id === 'regressao-cv');
    contato.gloria_estado = 'AGENDAMENTO_CONFIRMACAO';
    contato.gloria_estado_dados = { especialidade: 'Clínico Geral', medico_id: 'regressao-medico', medico_nome: 'Médico Teste Glória', paciente_nome: 'Paciente Teste Sem Preço', data: dia, hora: '09:00', convenio: 'Não cadastrado' };
    r = await turno('sim');
    check('preço ausente não cria agendamento sem valor', r.estado === 'AGUARDANDO_HUMANO' && tabelas.Agendamento.length === 2);
    // Perguntas paralelas no meio de uma etapa respondem e mantêm a proposta aberta.
    const proposta = { especialidade: 'Clínico Geral', medico_id: 'regressao-medico', medico_nome: 'Médico Teste Glória', data: dia,
      opcoes: ['20/10/2099 às 09:30'], sugestoes: [{ data: dia, hora: '09:30' }] };
    contato.gloria_estado = 'AGENDAMENTO_SELECAO_OPCAO'; contato.gloria_estado_dados = { ...proposta };
    const leitura = {};
    extracao = { intencao: 'ENDERECO' };
    r = await processarTurno(sr, { contato, texto: 'onde vocês ficam?', registro: leitura });
    check('endereço no meio da oferta mantém a proposta', r.estado === 'AGENDAMENTO_SELECAO_OPCAO' && r.texto.includes('Rua Teste') && r.texto.includes('09:30'));
    check('interpretação fica registrada', leitura.intencao === 'ENDERECO' && leitura.estado_anterior === 'AGENDAMENTO_SELECAO_OPCAO');
    r = await turno('e como funciona o cartão mais vida?', { intencao: 'PRECO_CARTAO' });
    check('dúvida do cartão no meio da oferta mantém a proposta', r.estado === 'AGENDAMENTO_SELECAO_OPCAO' && r.texto.includes('24,90') && r.texto.includes('09:30') && !r.dados.assunto_cartao);
    r = await turno('sim', { confirmacao: true });
    check('sim depois da dúvida confirma o horário, não a adesão', r.estado !== 'AGUARDANDO_HUMANO' && r.dados.hora === '09:30');
    contato.gloria_estado = 'AGENDAMENTO_SELECAO_OPCAO'; contato.gloria_estado_dados = { ...proposta };
    r = await turno('vocês abrem sábado?', { intencao: 'HORARIO_CLINICA' });
    check('horário da clínica pela intenção mantém a proposta', r.estado === 'AGENDAMENTO_SELECAO_OPCAO' && r.texto.includes('09:30'));
    contato.gloria_estado = 'OCIOSO'; contato.gloria_estado_dados = { tentativas_entendimento: 1 };
    r = await turno('quero agendar', { intencao: 'AGENDAR' });
    check('mensagem entendida zera tentativas', !r.dados.tentativas_entendimento);
    // Especialidade que não existe no cadastro não substitui a do agendamento em andamento.
    contato.gloria_estado = 'AGENDAMENTO_SELECAO_OPCAO'; contato.gloria_estado_dados = { ...proposta };
    r = await turno('e com astrologia?', { intencao: 'AGENDAR', especialidade: 'Astrologia' });
    check('especialidade inexistente é ignorada', r.dados.especialidade === 'Clínico Geral');
    contato.atendimento_humano = true;
    check('atendimento humano continua sem resposta automática', await turno('qual o endereço?') === null);
    if (persistir) check('valores confirmados por leitura após salvar', persistidos.length === 2 && persistidos[0].valor_total === 150 && persistidos[1].valor_total === 100);
    return Response.json({ ok: resultados.every(r => r.passou), resultados, respostas, persistidos, modo: llm_real ? 'classificador real, cadastros isolados' : 'simulação isolada' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    for (const id of criados) await client.entities.Agendamento.delete(id);
  }
}