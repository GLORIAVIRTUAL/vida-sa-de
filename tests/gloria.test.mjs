import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { processarTurno } from '../base44/shared/gloriaDialogo.ts';
import { infoCartaoCore } from '../base44/shared/gloriaCartao.ts';
import { retomarConversaGloria } from '../base44/shared/gloriaRetomada.ts';
import { createAppointmentCore, rescheduleAppointmentCore } from '../base44/shared/gloriaCore.ts';

const phone = '5551999991234';
const day = '2099-10-20';
const states = JSON.parse(readFileSync(new URL('../base44/entities/Contato.jsonc', import.meta.url), 'utf8')).properties.gloria_estado.enum;
function fixture({ patients = [], appointments = [], info = 'CARTÃO MAIS VIDA SAÚDE\nBenefícios\nAUXÍLIO FUNERAL\n' + 'Detalhes institucionais. '.repeat(160) } = {}) {
  const tables = {
    Medico: [{ id: 'm1', nome: 'Ana Silva', especialidade: 'Cardiologia', status: 'Ativo', tempo_consulta_minutos: 30,
      horarios_atendimento: [ { data_especifica: day, horario_inicio: '09:00', horario_fim: '12:00' },
        ...Array.from({ length: 7 }, (_, dia_semana) => ({ dia_semana, horario_inicio: '09:00', horario_fim: '12:00' })) ] }],
    Paciente: patients, Agendamento: appointments, GloriaOperacao: [], Notification: [], ChatbotConfig: [{ ativo: true, informacoes_institucionais: info }],
    Contato: [], CategoriaPreco: [{ id: 'part', nome: 'Particular', status: 'Ativo' }],
    Procedimento: [{ id: 'consulta', nome: 'Consulta Cardiologia', especialidade: 'Cardiologia', status: 'Ativo' }],
    TabelaPreco: [{ procedimento_id: 'consulta', categoria_id: 'part', valor: 150 }], Exame: []
  };
  let extraction = {};
  const writes = [];
  const entities = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    async filter(query) { return rows.filter(row => Object.entries(query).every(([key, value]) => value && typeof value === 'object' ? row[key] !== value.$ne : row[key] === value)); },
    async list() { return rows; },
    async get(id) { return rows.find(row => row.id === id); },
    async create(data) { const row = { ...data, id: name + rows.length, created_date: new Date().toISOString() }; rows.push(row); writes.push([name, 'create', row.id]); return row; },
    async update(id, data) { const row = rows.find(row => row.id === id); Object.assign(row, data); writes.push([name, 'update', id, data.status]); return row; }
  }]));
  const sr = { entities, integrations: { Core: { async InvokeLLM() { return extraction; } } } };
  const contact = { telefone: phone, gloria_estado: 'OCIOSO', gloria_estado_dados: {} };
  async function turn(texto, fields = {}, extra = {}) {
    extraction = { intencao: 'OUTRO', ...fields };
    const result = await processarTurno(sr, { contato: contact, texto, ...extra });
    if (result) { assert.ok(states.includes(result.estado), 'Estado deve existir no schema de Contato'); contact.gloria_estado = result.estado; contact.gloria_estado_dados = result.dados; }
    return result;
  }
  return { sr, contact, turn, tables, writes, info };
}

test('resultado interrompe identificação e não acessa laudos', async () => {
  const f = fixture(); f.contact.gloria_estado = 'IDENTIFICACAO_NOME';
  const r = await f.turn('Quero meu laudo de exame', { intencao: 'RESULTADO_EXAME' }, { mediaUrl: 'https://example.invalid/laudo.pdf', mediaTipo: 'document' });
  assert.equal(r.estado, 'AGUARDANDO_HUMANO'); assert.doesNotMatch(r.texto, /CPF/i);
});

test('pode e sim avançam mesmo se a IA repetir campos do histórico', async () => {
  const f = fixture();
  await f.turn('Ana em 20/10/2099 para Maria Souza', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  const repetidos = { intencao: 'AGENDAR', medico: 'Dra. Ana', data: day, hora: '09:00', especialidade: 'Clínico Geral' };
  const r = await f.turn('pode', repetidos);
  assert.equal(r.estado, 'AGENDAMENTO_CONFIRMACAO');
  assert.equal(r.dados.medico_nome, 'Ana Silva');
  assert.equal((await f.turn('sim', repetidos)).estado, 'OCIOSO');
  assert.equal(f.tables.Agendamento.length, 1);
});

test('próximo disponível e preço usam especialidade sem exigir nome de médico', async () => {
  const f = fixture();
  f.tables.Medico.push({ ...f.tables.Medico[0], id: 'm2', nome: 'Bianca Souza', horarios_atendimento: [{ data_especifica: day, horario_inicio: '08:00', horario_fim: '09:00' }] });
  f.tables.Medico.push({ ...f.tables.Medico[0], id: 'exam', nome: 'EXAMES' }, { ...f.tables.Medico[0], id: 'holter', nome: 'HOLTER' });
  let r = await f.turn('Quero cardiologista em 20/10/2099', { intencao: 'AGENDAR', especialidade: 'Cardiologia', data: day });
  assert.doesNotMatch(r.texto, /EXAMES|HOLTER/);
  r = await f.turn('qual o proximos disponivel? e qual o valor da consulta?', { intencao: 'OUTRO' });
  assert.equal(r.dados.medico_id, 'm2');
  assert.equal(r.dados.sugestoes.length, 1);
  assert.match(r.texto, /08:00/); assert.match(r.texto, /150,00/);
  assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO');
  assert.equal((await f.turn('pode')).estado, 'IDENTIFICACAO_NOME');
});

test('preço com convênio volta à proposta sem perder médico ou confirmação', async () => {
  const f = fixture();
  f.tables.CategoriaPreco.push({ id: 'cv', nome: 'Mais Vida', status: 'Ativo' });
  f.tables.TabelaPreco.push({ procedimento_id: 'consulta', categoria_id: 'cv', valor: 90 });
  await f.turn('Ana em 20/10/2099 para Maria Souza', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  let r = await f.turn('qual o valor da consulta?', { intencao: 'OUTRO' });
  assert.equal(r.estado, 'PRECO_CONVENIO');
  r = await f.turn('Mais Vida');
  assert.match(r.texto, /90,00/);
  assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO');
  assert.equal((await f.turn('pode')).estado, 'AGENDAMENTO_CONFIRMACAO');
});

test('primeira mensagem pode pedir primeiro horário e preço da especialidade', async () => {
  const f = fixture();
  f.tables.Medico.push({ ...f.tables.Medico[0], id: 'm2', nome: 'Bianca Souza', horarios_atendimento: [{ data_especifica: day, horario_inicio: '08:00', horario_fim: '09:00' }] });
  const r = await f.turn('Quero o primeiro horário disponível de cardiologia e o valor', { intencao: 'AGENDAR', especialidade: 'Cardiologia', data: day });
  assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO'); assert.equal(r.dados.medico_id, 'm2');
  assert.match(r.texto, /150,00/);
});

test('próximo horário preserva o médico escolhido mesmo com outro mais cedo', async () => {
  const f = fixture();
  f.tables.Medico.push({ ...f.tables.Medico[0], id: 'm2', nome: 'Bianca Souza', horarios_atendimento: [{ data_especifica: day, horario_inicio: '08:00', horario_fim: '09:00' }] });
  await f.turn('Agendar Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day });
  const r = await f.turn('qual o próximo disponível e o valor?');
  assert.equal(r.dados.medico_id, 'm1'); assert.equal(r.dados.sugestoes[0].data, day);
  assert.match(r.texto, /09:00/); assert.match(r.texto, /150,00/);
});

test('preço reaproveita convênio informado e cartão não vira preço da consulta', async () => {
  const f = fixture();
  f.tables.CategoriaPreco.push({ id: 'cv', nome: 'Mais Vida', status: 'Ativo' });
  f.tables.TabelaPreco.push({ procedimento_id: 'consulta', categoria_id: 'cv', valor: 90 });
  await f.turn('Agendar Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day });
  f.contact.gloria_estado_dados.convenio = 'Mais Vida';
  const r = await f.turn('qual o valor da consulta?');
  assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO'); assert.match(r.texto, /90,00/);
  const cartao = await f.turn('qual o valor do cartão mais vida saúde?', { intencao: 'PRECO' });
  assert.ok(cartao.texto.includes(f.info.trim()));
});

test('aceitação com mudança de horário não confirma a proposta antiga', async () => {
  const f = fixture();
  await f.turn('Agendar Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  const r = await f.turn('sim, mas às 10h', { confirmacao: true, hora: '10:00' });
  assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO'); assert.equal(r.dados.sugestoes[0].hora, '10:00');
  assert.equal(f.tables.Agendamento.length, 0);
});

test('trocar médico ou horário junto com preço refaz a proposta antes de confirmar', async () => {
  const f = fixture();
  f.tables.Medico.push({ ...f.tables.Medico[0], id: 'm2', nome: 'Bianca Souza' });
  await f.turn('Agendar Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  await f.turn('pode');
  let r = await f.turn('Quero Bianca, qual o preço?', { medico: 'Bianca Souza', intencao: 'PRECO' });
  assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO'); assert.equal(r.dados.medico_id, 'm2');
  await f.turn('pode');
  r = await f.turn('às 10h qual o valor?', { hora: '10:00', intencao: 'PRECO' });
  assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO'); assert.equal(r.dados.sugestoes[0].hora, '10:00');
  assert.equal(f.tables.Agendamento.length, 0);
});

test('retomada descarta resposta quando outra mensagem atualiza a conversa', async () => {
  const f = fixture();
  f.tables.Contato.push({ ...f.contact, id: 'c1', atendimento_humano: false,
    historico_mensagens: [{ role: 'user', content: 'bom dia' }] });
  f.sr.integrations.Core.InvokeLLM = async () => {
    f.tables.Contato[0].historico_mensagens.push({ role: 'user', content: 'quero agendar', messageId: 'nova' });
    f.tables.Contato[0].gloria_estado = 'AGENDAMENTO_MEDICO';
    return { intencao: 'SAUDACAO' };
  };
  assert.equal((await retomarConversaGloria(f.sr, phone)).resposta, null);
  assert.equal(f.tables.Contato[0].gloria_estado, 'AGENDAMENTO_MEDICO');
  assert.equal(f.tables.Contato[0].historico_mensagens.length, 2);
});

test('retomada do painel usa diálogo atual, grava estado e não duplica resposta', async () => {
  const f = fixture();
  f.sr.integrations.Core.InvokeLLM = async () => ({ intencao: 'SAUDACAO' });
  f.tables.Contato.push({ ...f.contact, id: 'c1', nome: 'Thiago Cavalcanti', atendimento_humano: false,
    historico_mensagens: [{ role: 'user', content: 'bom dia', messageId: 'msg1' }] });
  const r = await retomarConversaGloria(f.sr, phone);
  assert.match(r.resposta, /Sou a Glória/); assert.doesNotMatch(r.resposta, /atendente virtual/i);
  assert.equal(f.tables.Contato[0].historico_mensagens.length, 2);
  assert.equal(f.tables.Contato[0].gloria_estado, 'OCIOSO');
  assert.equal((await retomarConversaGloria(f.sr, phone)).resposta, null);
});

test('retomada em modo humano não responde nem altera histórico', async () => {
  const f = fixture();
  f.tables.Contato.push({ ...f.contact, id: 'c1', atendimento_humano: true,
    historico_mensagens: [{ role: 'user', content: 'bom dia' }] });
  assert.equal((await retomarConversaGloria(f.sr, phone)).resposta, null);
  assert.equal(f.writes.length, 0);
});
test('pedido explícito de humano funciona durante orçamento', async () => {
  const f = fixture(); f.contact.gloria_estado = 'PRECO_CONVENIO';
  assert.equal((await f.turn('Quero falar com uma pessoa', { intencao: 'FALAR_COM_HUMANO' })).estado, 'AGUARDANDO_HUMANO');
});
test('cartão entrega todo o conteúdo e adesão transfere', async () => {
  const f = fixture(); assert.equal(await infoCartaoCore(f.sr), f.info.trim());
  const r = await f.turn('Como funciona o cartão mais vida saúde?', { intencao: 'INFORMACAO' });
  assert.ok(r.texto.includes(f.info.trim()));
  assert.equal((await f.turn('Quero fazer o cartão', {})).estado, 'AGUARDANDO_HUMANO');
});
test('agendamento preserva médico, data e nome e oferece só o primeiro horário', async () => {
  const f = fixture();
  let r = await f.turn('Sou maria souza, quero Ana Silva em 20/10/2099', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'maria souza' });
  assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO');
  assert.equal(r.dados.sugestoes.length, 1); assert.equal(r.dados.sugestoes[0].data, day);
  assert.match(r.texto, /09:00/); assert.doesNotMatch(r.texto, /09:30|número|\b1\./);
  r = await f.turn('Pode ser', { confirmacao: true });
  assert.equal(r.estado, 'AGENDAMENTO_CONFIRMACAO'); assert.doesNotMatch(r.texto, /CPF/i);
  r = await f.turn('Pode marcar', { confirmacao: true });
  assert.equal(r.estado, 'OCIOSO'); assert.equal(f.tables.Agendamento.length, 1);
  assert.equal(f.tables.Agendamento[0].paciente_nome, 'maria souza');
  assert.equal(f.tables.Paciente.length, 0);
  r = await f.turn('Quero cancelar', { intencao: 'CANCELAR' });
  assert.equal(r.estado, 'CANCELAMENTO_CONFIRMACAO');
  await f.turn('Sim', { confirmacao: true }); assert.equal(f.tables.Agendamento[0].status, 'Cancelado');
});
test('horário sem data respeita a preferência e correção mantém a data oferecida', async () => {
  const f = fixture();
  let r = await f.turn('Quero Ana às 10h', { intencao: 'AGENDAR', medico: 'Ana Silva', hora: '10:00' });
  assert.equal(r.dados.sugestoes.length, 1);
  assert.ok(r.dados.sugestoes[0].hora >= '10:00');
  const offered = r.dados.sugestoes[0].data;
  r = await f.turn('Às 11h', { hora: '11:00' });
  assert.equal(r.dados.sugestoes[0].data, offered);
  assert.ok(r.dados.sugestoes[0].hora >= '11:00');
});

test('remarcação cria antes de cancelar e mantém vínculo', async () => {
  const f = fixture({ patients: [{ id: 'p1', nome: 'Maria Souza', telefone: phone }], appointments: [{ id: 'old', medico_id: 'm1', paciente_id: 'p1', paciente_nome: 'Maria Souza', data_agendamento: day, horario: '09:00', status: 'Agendado' }] });
  await f.turn('Remarcar para 20/10/2099', { intencao: 'REMARCAR', data: day });
  for (let i = 0; i < 4 && f.tables.Agendamento.length === 1; i++) await f.turn('sim', { confirmacao: true });
  assert.equal(f.tables.Agendamento.length, 2);
  assert.equal(f.tables.Agendamento[1].horario, '09:30');
  assert.equal(f.tables.Agendamento[0].status, 'Cancelado');
  const create = f.writes.findIndex(w => w[0] === 'Agendamento' && w[1] === 'create');
  const cancel = f.writes.findIndex(w => w[0] === 'Agendamento' && w[2] === 'old' && w[3] === 'Cancelado');
  assert.ok(create >= 0 && cancel > create);
});
test('humano ativo não recebe resposta da Glória', async () => {
  const f = fixture(); f.contact.atendimento_humano = true;
  assert.equal(await f.turn('Oi', { intencao: 'SAUDACAO' }), null);
});

test('recusar adesão e depois agendar não transfere para humano', async () => {
  const f = fixture();
  await f.turn('Como funciona o cartão mais vida?', { intencao: 'INFORMACAO' });
  assert.notEqual((await f.turn('Não quero fazer o cartão', { negativa: true })).estado, 'AGUARDANDO_HUMANO');
  await f.turn('Quero agendar com Ana Silva', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  assert.equal((await f.turn('sim', { confirmacao: true })).estado, 'AGENDAMENTO_CONFIRMACAO');
});
test('nome corrigido na confirmação não agenda para o paciente anterior', async () => {
  const f = fixture({ patients: [{ id: 'p1', nome: 'Maria Souza', telefone: phone }] });
  await f.turn('Agendar com Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day });
  await f.turn('sim', { confirmacao: true });
  const r = await f.turn('Na verdade é para João Santos', { nome: 'João Santos' });
  assert.equal(r.dados.paciente_nome, 'João Santos'); assert.equal(r.dados.paciente_id, undefined);
});
test('troca explícita para cancelamento interrompe oferta de agendamento', async () => {
  const f = fixture({ patients: [{ id: 'p1', nome: 'Maria Souza', telefone: phone }], appointments: [{ id: 'old', medico_id: 'm1', paciente_id: 'p1', paciente_nome: 'Maria Souza', data_agendamento: day, horario: '09:00', status: 'Agendado' }] });
  await f.turn('Quero agendar', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day });
  assert.equal((await f.turn('Na verdade quero cancelar minha consulta', { intencao: 'CANCELAR' })).estado, 'CANCELAMENTO_CONFIRMACAO');
});
test('migra etapa de CPF sem pedir documento', async () => {
  const f = fixture(); f.contact.gloria_estado = 'IDENTIFICACAO_CPF';
  f.contact.gloria_estado_dados = { nome: 'Maria Souza', medico_id: 'm1', medico_nome: 'Ana Silva', data: day, hora: '09:00' };
  const r = await f.turn('Não quero informar CPF', {});
  assert.equal(r.estado, 'AGENDAMENTO_CONFIRMACAO'); assert.doesNotMatch(r.texto, /CPF/i);
});
test('horário ocupado mantém consulta antiga e permite tentar outra data', async () => {
  const f = fixture({ patients: [{ id: 'p1', nome: 'Maria Souza', telefone: phone }], appointments: [{ id: 'old', medico_id: 'm1', paciente_id: 'p1', paciente_nome: 'Maria Souza', data_agendamento: day, horario: '09:00', status: 'Agendado' }] });
  const r = await rescheduleAppointmentCore(f.sr, { chave_idempotencia: 'r1', agendamento_id: 'old', nova_data: day, nova_hora: '09:00', telefone_canonico: phone });
  assert.equal(r.ok, false); assert.equal(f.tables.Agendamento[0].status, 'Agendado'); assert.equal(f.tables.Agendamento.length, 1);
});
test('reservas sem cadastro também podem ser remarcadas e operação repetida não duplica', async () => {
  const f = fixture();
  await f.turn('Agendar Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  await f.turn('sim', { confirmacao: true }); await f.turn('sim', { confirmacao: true });
  await f.turn('Remarcar', { intencao: 'REMARCAR', data: day });
  await f.turn('sim', { confirmacao: true }); await f.turn('sim', { confirmacao: true });
  assert.equal(f.tables.Agendamento.length, 2); assert.equal(f.tables.Agendamento[0].status, 'Cancelado');
  assert.equal(f.tables.Agendamento[1].is_reserva, true);
  const r = await f.turn('Cancelar', { intencao: 'CANCELAR' }); assert.equal(r.dados.agendamento_id, 'Agendamento1');
  const op = f.tables.GloriaOperacao.find(o => o.tipo === 'REMARCAR');
  assert.equal((await rescheduleAppointmentCore(f.sr, { chave_idempotencia: op.chave_idempotencia })).idempotente, true);
  assert.equal(f.tables.Agendamento.length, 2);
});
test('outro telefone não acessa reserva e chamadas normais ainda exigem paciente', async () => {
  const f = fixture();
  const r = await createAppointmentCore(f.sr, { chave_idempotencia: 'r1', medico_id: 'm1', data: day, hora: '09:00', paciente_nome: 'Maria Souza', telefone_canonico: phone });
  assert.equal(r.codigo, 'PACIENTE_OBRIGATORIO');
  await f.turn('Agendar Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  await f.turn('sim', { confirmacao: true }); await f.turn('sim', { confirmacao: true });
  f.contact.telefone = '5551988881234';
  const cancel = await f.turn('Cancelar', { intencao: 'CANCELAR' });
  assert.equal(cancel.dados.agendamento_id, undefined); assert.equal(f.tables.Agendamento[0].status, 'Agendado');
});

test('informar preço preserva médico e data para continuar agendando', async () => {
  const f = fixture();
  f.contact.gloria_estado = 'PRECO_CONVENIO';
  f.contact.gloria_estado_dados = { medico_id: 'm1', medico_nome: 'Ana Silva', especialidade: 'Cardiologia', data: day,
    resolvido: { blocos: [{ nome: 'Consulta cardiologia', valores: [{ categoria: 'Particular', valor: 100 }], especialidade: 'Cardiologia' }] } };
  let r = await f.turn('Particular', {}); assert.equal(r.dados.data, day); assert.equal(r.dados.medico_id, 'm1');
  r = await f.turn('Pode ver um horário', { confirmacao: true });
  assert.equal(r.dados.sugestoes[0].data, day); assert.equal(r.dados.medico_id, 'm1');
});
test('pergunta de funcionamento durante oferta mantém o contexto', async () => {
  const f = fixture();
  await f.turn('Agendar Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  const r = await f.turn('Que horas abre?', { intencao: 'INFORMACAO' });
  assert.match(r.texto, /7h30/); assert.equal(r.dados.data, day); assert.equal(r.dados.medico_id, 'm1');
});

test('mudar paciente na remarcação exige nova decisão e mantém consulta original', async () => {
  const f = fixture({ patients: [{ id: 'p1', nome: 'Maria Souza', telefone: phone }], appointments: [{ id: 'old', medico_id: 'm1', paciente_id: 'p1', paciente_nome: 'Maria Souza', data_agendamento: day, horario: '09:00', status: 'Agendado' }] });
  await f.turn('Remarcar', { intencao: 'REMARCAR', data: day }); await f.turn('sim', { confirmacao: true });
  await f.turn('Quero agendar para João Santos', { intencao: 'AGENDAR', nome: 'João Santos' });
  await f.turn('sim', { confirmacao: true });
  assert.equal(f.tables.Agendamento[0].status, 'Agendado'); assert.equal(f.tables.Agendamento.length, 1);
  assert.equal(f.contact.gloria_estado_dados.nome, 'João Santos');
  assert.notEqual(f.contact.gloria_estado_dados.acao, 'REMARCAR');
});
test('corrigir especialidade descarta profissional incompatível', async () => {
  const f = fixture();
  f.tables.Medico.push({ ...f.tables.Medico[0], id: 'm2', nome: 'Bruno Santos', especialidade: 'Dermatologia' });
  await f.turn('Agendar Ana', { intencao: 'AGENDAR', medico: 'Ana Silva', data: day, nome: 'Maria Souza' });
  await f.turn('sim', { confirmacao: true });
  const r = await f.turn('Na verdade quero dermatologia', { intencao: 'AGENDAR', especialidade: 'Dermatologia' });
  assert.equal(r.dados.medico_id, 'm2'); assert.equal(r.estado, 'AGENDAMENTO_SELECAO_OPCAO');
});

test('falha ao cancelar após criar remarcação informa humano sem perder agendamentos', async () => {
  const f = fixture({ patients: [{ id: 'p1', nome: 'Maria Souza', telefone: phone }], appointments: [{ id: 'old', medico_id: 'm1', paciente_id: 'p1', paciente_nome: 'Maria Souza', data_agendamento: day, horario: '09:00', status: 'Agendado' }] });
  const update = f.sr.entities.Agendamento.update;
  f.sr.entities.Agendamento.update = async (id, data) => { if (id === 'old') throw Error('service unavailable'); return update(id, data); };
  await f.turn('Remarcar', { intencao: 'REMARCAR', data: day }); await f.turn('sim', { confirmacao: true });
  const r = await f.turn('sim', { confirmacao: true });
  assert.equal(r.estado, 'AGUARDANDO_HUMANO'); assert.match(r.texto, /anterior/);
  assert.equal(f.tables.Agendamento.length, 2); assert.equal(f.tables.Agendamento[0].status, 'Agendado');
});
test('informação durante cancelamento mantém a confirmação explicitamente vinculada à consulta', async () => {
  const f = fixture({ patients: [{ id: 'p1', nome: 'Maria Souza', telefone: phone }], appointments: [{ id: 'old', medico_id: 'm1', paciente_id: 'p1', paciente_nome: 'Maria Souza', data_agendamento: day, horario: '09:00', status: 'Agendado' }] });
  await f.turn('Cancelar', { intencao: 'CANCELAR' });
  const r = await f.turn('Que horas abre?', { intencao: 'INFORMACAO' });
  assert.match(r.texto, /cancelar/i); assert.match(r.texto, /20\/10\/2099/);
  assert.equal(f.tables.Agendamento[0].status, 'Agendado');
});
