// gloriaDialogo — máquina de estados determinística da conversa da Glória.
// A IA só interpreta a mensagem; todas as decisões e gravações vêm do núcleo.

import {
  normalizarTelefone, normalizarTexto, hojeLocal,
  buscarPacientesPorTelefone, proximosHorariosCore, getAvailableSlotsCore, validarData, validarHora,
  createAppointmentCore, cancelAppointmentCore, confirmAppointmentCore, rescheduleAppointmentCore
} from './gloriaCore.ts';
import { especialidadesDisponiveisCore, medicosPorEspecialidadeCore } from './gloriaAgenda.ts';
import { medicoPorNomeCore } from './gloriaHorariosMedico.ts';
import { precoPorTermoCore, precoConsultaPorEspecialidadeCore, categoriasPrecoCore } from './gloriaPrecos.ts';
import { extrairIntencao } from './gloriaLlm.ts';
import { infoCartaoCore } from './gloriaCartao.ts';
import { resolverRequisicaoArquivo } from './gloriaRequisicao.ts';

const EXPIRA_MINUTOS = 60;

function expiracao() {
  return new Date(Date.now() + EXPIRA_MINUTOS * 60000).toISOString();
}

function listar(opcoes) {
  return opcoes.map((o) => '• ' + o).join('\n');
}

// Escolha por número da lista ou por texto exatamente igual ao rótulo.
function escolher(opcoes, extraido, texto) {
  if (extraido && Number.isInteger(extraido.opcao) && extraido.opcao >= 1 && extraido.opcao <= opcoes.length) {
    return extraido.opcao - 1;
  }
  const direto = String(texto || '').trim();
  if (/^\d+$/.test(direto)) {
    const n = Number(direto);
    if (n >= 1 && n <= opcoes.length) return n - 1;
  }
  const alvo = normalizarTexto(direto);
  const idx = opcoes.findIndex((o) => normalizarTexto(o) === alvo);
  if (idx >= 0) return idx;
  if (opcoes.length === 1 && extraido.confirmacao) return 0;
  const termos = [extraido.medico, extraido.especialidade, direto].filter(Boolean).map(normalizarTexto);
  const candidatos = opcoes.map((o, i) => ({ texto: normalizarTexto(o), i }))
    .filter((o) => termos.some((t) => t.length >= 3 && (o.texto.includes(t) || t.includes(o.texto))));
  return candidatos.length === 1 ? candidatos[0].i : -1;
}

function dataBr(data, hora) {
  const [a, m, d] = String(data).split('-');
  return d + '/' + m + '/' + a + (hora ? ' às ' + hora : '');
}

function resposta(texto, estado, dados) {
  return { texto, estado: estado || 'OCIOSO', dados: dados || {} };
}

const PARA_HUMANO = 'Vou chamar uma pessoa da recepção para te ajudar. Em breve alguém responde por aqui.';

const TEXTO_HORARIOS = 'Nosso horário de funcionamento é:\n\n' +
  '• Segunda a sexta: 7h30 às 18h\n' +
  '• Sábado: 7h30 às 12h';

const TEXTO_LABORATORIAL = 'Exames laboratoriais não precisam de agendamento! Você pode vir de segunda a sábado, a partir das 7h30, por ordem de chegada.\n\n' +
  TEXTO_HORARIOS;

// ---------------------------------------------------------------- etapas

function nomeInformadoValido(nome) {
  return /^[\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*)+$/u.test(String(nome || '').trim());
}

async function pedirEspecialidade(sr, contexto = {}) {
  const esp = await especialidadesDisponiveisCore(sr);
  const lista = esp.especialidades || [];
  if (!lista.length) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  return resposta('Para qual especialidade você quer agendar?\n\n' + listar(lista),
    'AGENDAMENTO_ESPECIALIDADE', { ...contexto, opcoes: lista });
}

async function primeiroHorario(sr, medico, contexto) {
  if (contexto.data) {
    if (!validarData(contexto.data) || contexto.data < hojeLocal()) return null;
    const r = await getAvailableSlotsCore(sr, { medico_id: medico.id, data: contexto.data, duracao_minutos: contexto.duracao_minutos });
    const hora = r.ok && (r.available_slots || []).slice().sort().find((h) => !contexto.hora || h >= contexto.hora);
    return hora ? { data: contexto.data, hora } : null;
  }
  const r = await proximosHorariosCore(sr, { medico_id: medico.id, maximo: 1, duracao_minutos: contexto.duracao_minutos, hora_minima: contexto.hora });
  return (r.sugestoes || [])[0] || null;
}

async function pedirMedico(sr, especialidade, contexto = {}) {
  const res = await medicosPorEspecialidadeCore(sr, { especialidade });
  const medicos = res.medicos || [];
  if (!medicos.length) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  if (contexto.primeiro_disponivel && !contexto.medico) {
    const candidatos = [];
    for (const m of medicos) {
      const horario = await primeiroHorario(sr, m, contexto);
      if (horario) candidatos.push({ medico: m, horario });
    }
    candidatos.sort((a, b) => (a.horario.data + a.horario.hora).localeCompare(b.horario.data + b.horario.hora));
    if (!candidatos.length) return resposta('Não encontrei horário disponível para essa especialidade nesse período. Você tem outra data em mente?',
      'AGENDAMENTO_ESPECIALIDADE', { ...contexto, especialidade });
    return pedirHorario(sr, especialidade, candidatos[0].medico, { ...contexto, primeiro_disponivel: false });
  }
  if (contexto.medico) {
    const busca = await medicoPorNomeCore(sr, { nome: contexto.medico });
    const candidatos = medicos.filter((m) => (busca.medicos || []).some((b) => b.id === m.id));
    if (candidatos.length === 1) return pedirHorario(sr, especialidade, candidatos[0], contexto);
  }
  if (medicos.length === 1) return pedirHorario(sr, especialidade, medicos[0], contexto);
  return resposta('Em ' + especialidade + ', temos ' + medicos.map((m) => m.nome).join(', ') + '. Com quem você prefere agendar?',
    'AGENDAMENTO_MEDICO', { ...contexto, especialidade, medicos, opcoes: medicos.map((m) => m.nome) });
}

async function pedirHorario(sr, especialidade, medico, contexto = {}) {
  const dados = { ...contexto, assunto_cartao: false, especialidade, medico: medico.nome, medico_id: medico.id, medico_nome: medico.nome };
  const primeiro = await primeiroHorario(sr, medico, dados);
  if (!primeiro) return resposta('Não encontrei horário disponível ' + (dados.data ? 'nessa data' : 'nos próximos dias') +
    ' com ' + medico.nome + '. Você tem outra data em mente?', 'AGENDAMENTO_SELECAO_OPCAO', { ...dados, opcoes: [], sugestoes: [] });
  return resposta('O primeiro horário disponível com ' + medico.nome + ' é ' + dataBr(primeiro.data, primeiro.hora) + '. Pode ser?',
    'AGENDAMENTO_SELECAO_OPCAO', { ...dados, opcoes: [dataBr(primeiro.data, primeiro.hora)], sugestoes: [primeiro] });
}

async function iniciarAgendamento(sr, contexto) {
  if (contexto.medico) {
    const busca = await medicoPorNomeCore(sr, { nome: contexto.medico });
    if ((busca.medicos || []).length === 1) {
      const m = await sr.entities.Medico.get(busca.medicos[0].id);
      return pedirHorario(sr, contexto.especialidade || m.especialidade, m, contexto);
    }
    if ((busca.medicos || []).length > 1) return resposta('Qual destes profissionais você procura?\n\n' + listar(busca.medicos.map((m) => m.nome)),
      'AGENDAMENTO_MEDICO', { ...contexto, medicos: busca.medicos, opcoes: busca.medicos.map((m) => m.nome) });
    return resposta('Não localizei esse profissional. Pode me dizer o nome ou a especialidade?', 'AGENDAMENTO_ESPECIALIDADE', contexto);
  }
  if (contexto.medico_id) return pedirHorario(sr, contexto.especialidade, { id: contexto.medico_id, nome: contexto.medico_nome }, contexto);
  if (contexto.especialidade) {
    const esp = await especialidadesDisponiveisCore(sr);
    const alvo = (esp.especialidades || []).find((e) => normalizarTexto(e) === normalizarTexto(contexto.especialidade));
    if (alvo) return pedirMedico(sr, alvo, contexto);
  }
  return pedirEspecialidade(sr, contexto);
}

async function seguirParaIdentificacao(sr, telefone, dados) {
  if (dados.acao === 'REMARCAR') return confirmar(dados, { id: dados.paciente_id, nome: dados.paciente_nome });
  const pacientes = await buscarPacientesPorTelefone(sr, telefone);
  if (dados.nome && nomeInformadoValido(dados.nome)) {
    const correspondentes = pacientes.filter((p) => normalizarTexto(p.nome) === normalizarTexto(dados.nome));
    if (correspondentes.length > 1) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
    return confirmar(dados, correspondentes[0] || { nome: dados.nome });
  }
  if (pacientes.length === 1) return confirmar(dados, pacientes[0]);
  return resposta('Para finalizar, me diga o nome completo de quem vai consultar, por favor.', 'IDENTIFICACAO_NOME', dados);
}

function confirmar(dados, paciente) {
  return resposta('Confere para mim:\n\nPaciente: ' + paciente.nome + '\nProfissional: ' + dados.medico_nome +
    '\nData: ' + dataBr(dados.data, dados.hora) + '\n\nPosso confirmar' + (dados.acao === 'REMARCAR' ? ' a remarcação?' : '?'),
    'AGENDAMENTO_CONFIRMACAO', { ...dados, paciente_id: paciente.id, paciente_nome: paciente.nome });
}

function proporNovaConsulta(dados) {
  return resposta('A remarcação mantém o paciente e o profissional da consulta original. Posso buscar uma nova consulta com os dados que você informou, mantendo a antiga?',
    'AGENDAMENTO_CONFIRMACAO', { ...dados, nova_consulta: true, acao: undefined, agendamento_id: undefined,
      paciente_id: undefined, paciente_nome: undefined, opcoes: [], sugestoes: [] });
}

async function agendamentosDoTelefone(sr, telefone) {
  const pacientes = await buscarPacientesPorTelefone(sr, telefone);
  const encontrados = new Map();
  for (const p of pacientes) for (const a of await sr.entities.Agendamento.filter({ paciente_id: p.id })) encontrados.set(a.id, a);
  // Reservas sem CPF continuam acessíveis apenas pelo telefone da operação concluída.
  const operacoes = await sr.entities.GloriaOperacao.filter({ telefone_canonico: telefone, status: 'Concluida' });
  for (const op of operacoes) if (['AGENDAR', 'REMARCAR'].includes(op.tipo) && op.agendamento_id) {
    const a = await sr.entities.Agendamento.get(op.agendamento_id);
    if (a && a.is_reserva && !a.paciente_id) encontrados.set(a.id, a);
  }
  return Array.from(encontrados.values()).filter((a) => a.data_agendamento >= hojeLocal() && ['Agendado', 'Confirmado'].includes(a.status))
    .sort((a, b) => (a.data_agendamento + a.horario).localeCompare(b.data_agendamento + b.horario));
}

async function selecionarAgendamento(sr, agendamento, acao, contexto) {
  const medico = await sr.entities.Medico.get(agendamento.medico_id);
  const rotulo = (medico?.nome || 'Consulta') + ' — ' + dataBr(agendamento.data_agendamento, agendamento.horario);
  const dados = { ...contexto, acao, agendamento_id: agendamento.id, rotulo, medico_id: agendamento.medico_id,
    medico_nome: medico?.nome, paciente_id: agendamento.paciente_id, paciente_nome: agendamento.paciente_nome,
    duracao_minutos: agendamento.duracao_minutos };
  if (acao === 'REMARCAR') {
    if (!medico) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
    return pedirHorario(sr, medico.especialidade, medico, dados);
  }
  return resposta((acao === 'CONFIRMAR' ? 'Posso confirmar sua presença em ' : 'Posso cancelar ') + rotulo + '?',
    acao === 'CONFIRMAR' ? 'CONFIRMACAO_CONSULTA' : 'CANCELAMENTO_CONFIRMACAO', dados);
}

async function listarAgendamentos(sr, telefone, acao, titulo, contexto = {}) {
  let agendamentos = await agendamentosDoTelefone(sr, telefone);
  if (!agendamentos.length) return resposta('Não encontrei consultas futuras vinculadas a este telefone. A consulta foi marcada com outro número?', 'OCIOSO', { ...contexto, busca_agendamento: true });
  if (contexto.medico) {
    const busca = await medicoPorNomeCore(sr, { nome: contexto.medico });
    const filtrados = agendamentos.filter((a) => (busca.medicos || []).some((m) => m.id === a.medico_id));
    if (filtrados.length) agendamentos = filtrados;
  }
  if (agendamentos.length === 1) return selecionarAgendamento(sr, agendamentos[0], acao, contexto);
  const rotulos = [];
  for (const a of agendamentos) {
    const m = await sr.entities.Medico.get(a.medico_id);
    rotulos.push((m?.nome || 'Consulta') + ' — ' + dataBr(a.data_agendamento, a.horario) + ' — ' + a.paciente_nome);
  }
  return resposta(titulo + '\n\n' + listar(rotulos) + '\n\nPode me dizer o profissional ou a data.', 'CANCELAMENTO_SELECAO',
    { ...contexto, acao, opcoes: rotulos, agendamentos: agendamentos.map((a) => a.id) });
}

function reais(valor) {
  return 'R$ ' + valor.toFixed(2).replace('.', ',');
}

// Responde "quanto custa...?" usando apenas valores cadastrados no sistema.
// Pergunta obrigatória no início de todo orçamento.
function pedirItensOrcamento(contexto = {}) {
  return resposta(
    'Claro! Me diga quais consultas, exames ou procedimentos você quer orçar (pode mandar vários de uma vez).\n\n' +
    'Se preferir, envie a foto ou o PDF da requisição médica que eu leio os exames por aqui.',
    'ORCAMENTO_ITENS',
    contexto
  );
}

async function perguntarConvenio(sr, resolvido, texto, contexto = {}) {
  const nomes = await categoriasPrecoCore(sr);
  const convenios = nomes.filter((n) => normalizarTexto(n) !== 'particular');

  // Se o cliente já disse o convênio na própria pergunta, não pergunta de novo.
  const t = normalizarTexto(texto || '');
  const citado = convenios.find((c) => t.includes(normalizarTexto(c)));
  if (citado) return informarPreco(resolvido, citado, contexto);
  if (t.includes('particular')) return informarPreco(resolvido, 'Particular', contexto);
  const salvo = nomes.find((c) => normalizarTexto(c) === normalizarTexto(contexto.convenio || ''));
  if (salvo) return informarPreco(resolvido, salvo, contexto);
  if (convenios.length === 0) return informarPreco(resolvido, 'Particular', contexto);
  const opcoes = ['Não tenho convênio (Particular)'].concat(convenios);
  return resposta(
    'Antes de passar os valores: você tem algum convênio da clínica?\n\n' + listar(opcoes) +
    '\n\nPode me dizer o nome.',
    'PRECO_CONVENIO',
    { ...contexto, opcoes, categorias: ['Particular'].concat(convenios), resolvido }
  );
}

// Busca no cadastro os valores dos itens pedidos (sem depender do convênio).
async function resolverBlocos(sr, extraido, texto) {
  const brutos = Array.isArray(extraido.itens_orcamento) ? extraido.itens_orcamento : [];
  // "consulta" sem especificação é resolvido pela especialidade informada.
  const termos = brutos.filter((t) => {
    const n = normalizarTexto(t);
    if (['consulta', 'consultas'].includes(n)) return false;
    // Com especialidade conhecida, a consulta já é respondida pelo bloco abaixo.
    return !(extraido.especialidade && n.startsWith('consulta'));
  });

  const blocos = [];
  const naoEncontrados = [];

  if (extraido.especialidade) {
    const res = await precoConsultaPorEspecialidadeCore(sr, { especialidade: extraido.especialidade });
    if (res.ok) blocos.push(...res.itens);
    else {
      // Pode não ser especialidade de consulta (ex: "Ecografia de abdome"):
      // busca o próprio termo em procedimentos e exames.
      const direto = await precoPorTermoCore(sr, { termo: extraido.especialidade });
      if (direto.ok) blocos.push(...direto.itens);
      else naoEncontrados.push(extraido.especialidade);
    }
  }

  for (const termo of termos.slice(0, 5)) {
    const res = await precoPorTermoCore(sr, { termo });
    if (res.ok) blocos.push(...res.itens);
    else naoEncontrados.push(termo);
  }

  // Se a IA não extraiu nada útil, procura direto pelas palavras da mensagem.
  if (blocos.length === 0 && texto) {
    const limpo = normalizarTexto(texto)
      .replace(/[?!.,]/g, ' ')
      .split(' ')
      .filter((p) => p.length > 3 && !['quanto', 'quando', 'custa', 'valor', 'valores', 'preco', 'pelo', 'pela', 'para', 'particular', 'cartao', 'mais', 'vida', 'saude', 'uma', 'voces'].includes(p))
      .join(' ');
    if (limpo) {
      const res = await precoPorTermoCore(sr, { termo: limpo });
      if (res.ok) blocos.push(...res.itens);
    }
  }

  const vistos = new Set();
  const unicos = blocos.filter((b) => {
    const k = normalizarTexto(b.nome);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  return { blocos: unicos, naoEncontrados };
}

function informarPreco(resolvido, categoria, contexto = {}) {
  const blocos = resolvido.blocos || [];
  // Termos não localizados só interessam quando nada foi encontrado; se já
  // achamos valores, não confundir o cliente com variações do mesmo pedido.
  const naoEncontrados = [];
  // Itens da requisição que não existem no cadastro: a clínica não realiza.
  const naoRealizados = Array.isArray(resolvido.naoRealizados) ? resolvido.naoRealizados.slice() : [];
  if (blocos.length === 0 && naoRealizados.length > 0) {
    return resposta(
      'Verifiquei sua requisição: não realizamos ' + naoRealizados.join(', ') + ' aqui na clínica.\n\n' +
      'Se quiser, posso chamar alguém da recepção para te orientar.',
      'OCIOSO'
    );
  }
  if (blocos.length === 0) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');

  // Mostra só Particular e o convênio informado pelo cliente.
  const permitidas = ['particular', normalizarTexto(categoria || 'Particular')];
  const linhas = [];
  for (const b of blocos) {
    const valores = b.valores.filter((v) => permitidas.includes(normalizarTexto(v.categoria)));
    if (valores.length === 0) {
      naoEncontrados.push(b.nome);
      continue;
    }
    linhas.push('*' + b.nome + '*\n' + valores.map((v) => '• ' + v.categoria + ': ' + reais(v.valor)).join('\n'));
  }
  if (linhas.length === 0) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  if (contexto.retorno_agendamento) {
    const retorno = contexto.retorno_agendamento;
    return resposta(linhas.join('\n\n') + '\n\n' + retorno.texto, retorno.estado,
      { ...retorno.dados, convenio: categoria });
  }
  let pendentes = naoEncontrados.length
    ? '\n\nSobre ' + naoEncontrados.join(', ') + ', a recepção confirma o valor para você.'
    : '';
  if (naoRealizados.length > 0) {
    pendentes += '\n\n⚠️ Não realizamos aqui na clínica: ' + naoRealizados.join(', ') + '.';
  }
  // Exames laboratoriais são por ordem de chegada: não há agendamento.
  const soLaboratorial = blocos.every((b) => b.laboratorial);
  const fecho = soLaboratorial
    ? '\n\n' + TEXTO_LABORATORIAL
    : '\n\nQuer que eu veja um horário disponível?';
  return resposta(
    linhas.join('\n\n') + pendentes + fecho,
    'OCIOSO',
    {
      ...contexto,
      convenio: categoria,
      orcamento_nomes: blocos.map((b) => b.nome),
      orcamento_laboratorial: soLaboratorial,
      orcamento_especialidades: blocos.map((b) => b.especialidade).filter(Boolean)
    }
  );
}

// Responde "que dia o Dr. X atende?" com os dias reais da agenda.
async function informarDiasAtendimento(sr, nomeMedico, contexto = {}) {
  return iniciarAgendamento(sr, { ...contexto, medico: nomeMedico });
}

// ---------------------------------------------------------------- turno

export async function processarTurno(sr, { contato, texto, mediaUrl, mediaTipo }) {
  if (contato.atendimento_humano === true || contato.gloria_estado === 'AGUARDANDO_HUMANO') return null;
  const telefone = normalizarTelefone(contato.telefone_normalizado || contato.telefone);
  const estado = contato.gloria_estado || 'OCIOSO';
  let dados = contato.gloria_estado_dados || {};
  const expirado = contato.gloria_estado_expira_em && new Date(contato.gloria_estado_expira_em).getTime() < Date.now();
  const estadoAtual = expirado ? 'OCIOSO' : estado;

  const txt = normalizarTexto(texto || '');
  if (estadoAtual === 'RESULTADO_EXAME_CPF' ||
      (/\b(laudos?|resultados?)\b/.test(txt) && /\b(exames?|meu|minha|saiu|pronto|buscar|retirar)\b/.test(txt)) ||
      /\b(falar|conversar)\b.*\b(humano|pessoa|atendente|recepcao)\b/.test(txt)) {
    return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  }

  // Primeiro nome do contato, para tratamento pessoal (ignora nomes que são só números).
  const nomeBruto = String(contato.nome || '').trim();
  const primeiroNome = /[a-zA-ZÀ-ÿ]{2,}/.test(nomeBruto) ? nomeBruto.split(/\s+/)[0] : '';

  const extraido = await extrairIntencao(sr, {
    nomeContato: primeiroNome,
    texto,
    historico: contato.historico_mensagens,
    estado: estadoAtual,
    opcoes_oferecidas: dados.opcoes,
    dataHoje: hojeLocal()
  });

  if (['FALAR_COM_HUMANO', 'RESULTADO_EXAME'].includes(extraido.intencao)) {
    return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  }

  // Pergunta sobre o Cartão Mais Vida Saúde: responde com o material cadastrado.
  const querCartao = !extraido.negativa && !/\bnao\s+(quero|gostaria|vou|desejo)\b/.test(txt) && /\b(comprar|aderir|adesao|contratar|adquirir|fazer)\b/.test(txt) &&
    (/\b(cartao|plano)\b/.test(txt) || (dados.assunto_cartao && !expirado));
  if (extraido.intencao === 'ADERIR_CARTAO' || querCartao ||
      (dados.assunto_cartao && !expirado && extraido.confirmacao && !extraido.negativa)) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');

  // Campos explícitos complementam o contexto; ausência nunca apaga o que já sabemos.
  const anteriores = expirado ? {} : dados;
  dados = { ...anteriores };
  for (const campo of ['nome', 'medico', 'especialidade']) if (extraido[campo]) dados[campo] = extraido[campo];
  if (validarData(extraido.data)) dados.data = extraido.data;
  if (validarHora(extraido.hora)) dados.hora = extraido.hora;

  // Uma nova ação explícita pode interromper uma etapa; confirmações curtas
  // continuam vinculadas à proposta atual, sem reiniciar o fluxo.
  if (!extraido.confirmacao && ['CANCELAR', 'REMARCAR', 'CONFIRMAR'].includes(extraido.intencao)) {
    const titulos = { CANCELAR: 'Qual consulta você quer cancelar?', REMARCAR: 'Qual consulta você quer remarcar?', CONFIRMAR: 'Qual consulta você quer confirmar?' };
    const contexto = { ...dados, assunto_cartao: false, acao: extraido.intencao,
      data: validarData(extraido.data) ? extraido.data : undefined,
      hora: validarHora(extraido.hora) ? extraido.hora : undefined };
    return listarAgendamentos(sr, telefone, extraido.intencao, titulos[extraido.intencao], contexto);
  }

  // Pergunta sobre horário de funcionamento da clínica.
  if (['horario de funcionamento', 'horario da clinica', 'que horas abre', 'que horas fecha', 'abre que horas', 'fecha que horas', 'ate que horas', 'ate qual horario', 'funciona sabado', 'abre sabado', 'atende sabado', 'horario de atendimento']
      .some((k) => txt.includes(k))) {
    let retomada = 'Pode me dizer como posso ajudar.';
    if (estadoAtual === 'CANCELAMENTO_CONFIRMACAO') retomada = dados.acao === 'REMARCAR'
      ? 'Posso buscar um novo horário para a consulta de ' + dados.rotulo + ', mantendo a antiga até confirmar a remarcação?'
      : 'Sobre a consulta de ' + dados.rotulo + ': posso cancelar?';
    if (estadoAtual === 'CONFIRMACAO_CONSULTA') retomada = 'Posso confirmar sua presença em ' + dados.rotulo + '?';
    if (estadoAtual === 'AGENDAMENTO_CONFIRMACAO') retomada = dados.nova_consulta
      ? 'Posso buscar uma nova consulta mantendo a antiga?'
      : confirmar(dados, { id: dados.paciente_id, nome: dados.paciente_nome }).texto;
    if (estadoAtual === 'AGENDAMENTO_SELECAO_OPCAO' && dados.sugestoes?.length === 1) retomada =
      'Sobre a consulta com ' + dados.medico_nome + ' em ' + dataBr(dados.sugestoes[0].data, dados.sugestoes[0].hora) + ': esse horário funciona para você?';
    return resposta(TEXTO_HORARIOS + '\n\n' + retomada, estadoAtual, dados);
  }

  // Requisição de exames em imagem ou PDF: lê os exames pedidos e orça com os
  // valores cadastrados. O que não existe no cadastro é informado como não realizado.
  if (mediaUrl && (mediaTipo === 'image' || mediaTipo === 'document')) {
    const resolvido = await resolverRequisicaoArquivo(sr, { fileUrl: mediaUrl });
    if (resolvido.vazio) {
      return resposta(
        'Recebi seu arquivo, mas não consegui ler os exames solicitados. Pode enviar uma foto mais nítida do pedido? Se preferir, chamo alguém da recepção.',
        'OCIOSO'
      );
    }
    return await perguntarConvenio(sr, resolvido, texto, dados);
  }


  const perguntaCartao = ['cartao mais vida', 'mais vida saude', 'cartao de vcs', 'cartao de voces', 'plano de vcs', 'plano de voces', 'aceitam plano', 'aceita plano', 'tem plano', 'tem cartao', 'cartao do plano']
    .some((k) => txt.includes(k));

  // Continuação do assunto do cartão: "quero mais informações", "quais os
  // benefícios", "como funciona" — responde com o material cadastrado.
  const seguirCartao = !!dados.assunto_cartao && !expirado &&
    ['mais informac', 'informac', 'beneficio', 'como funciona', 'o que inclui', 'o que cobre', 'cobertura', 'detalhes', 'saber mais', 'me explica']
      .some((k) => txt.includes(k));
  if (seguirCartao) {
    const detalhes = await infoCartaoCore(sr, { completo: true });
    if (detalhes) {
      return resposta(
        detalhes + '\n\nQuer que eu chame alguém da recepção para fazer seu cartão?',
        'OCIOSO',
        { ...dados, assunto_cartao: true }
      );
    }
  }

  // O cliente mudou de assunto no meio de um fluxo: atende o novo pedido em vez
  // de insistir na etapa anterior.
  const estadosDesviaveis = [
    'AGENDAMENTO_ESPECIALIDADE', 'AGENDAMENTO_MEDICO', 'AGENDAMENTO_SELECAO_OPCAO',
    'AGENDAMENTO_CONFIRMACAO', 'CANCELAMENTO_SELECAO', 'CANCELAMENTO_CONFIRMACAO', 'CONFIRMACAO_CONSULTA'
  ];
  const numeroPuro = /^\d+$/.test(String(texto || '').trim());
  const mudouAssunto = estadosDesviaveis.includes(estadoAtual) && !numeroPuro &&
    !extraido.confirmacao && !extraido.negativa &&
    (perguntaCartao || ['PRECO', 'ORCAMENTO', 'DIAS_ATENDIMENTO'].includes(extraido.intencao));

  if (extraido.especialidade && anteriores.especialidade &&
      normalizarTexto(extraido.especialidade) !== normalizarTexto(anteriores.especialidade) &&
      (estadoAtual.startsWith('AGENDAMENTO_') || estadoAtual.startsWith('IDENTIFICACAO_'))) {
    const contexto = { ...dados, medico: extraido.medico || undefined, medico_id: undefined, medico_nome: undefined,
      opcoes: [], sugestoes: [] };
    if (dados.acao === 'REMARCAR') return proporNovaConsulta(contexto);
    return iniciarAgendamento(sr, contexto);
  }

  // Perguntas simultâneas sobre disponibilidade e preço não se perdem na
  // etapa de escolha do médico. Os valores continuam vindo do cadastro.
  const querPrimeiro = /\b(proxim[oa]s?|primeir[oa]s?)\b.*\b(disponiv|horario|vaga)/.test(txt) ||
    /\b(qualquer medico|quem tiver|mais cedo)\b/.test(txt);
  const querPrecoConsulta = /\b(valor|preco|quanto custa|quanto fica)\b/.test(txt) || extraido.intencao === 'PRECO';
  const emAgendamento = estadoAtual.startsWith('AGENDAMENTO_');
  if ((emAgendamento || extraido.intencao === 'AGENDAR') && dados.especialidade &&
      (querPrimeiro || querPrecoConsulta) && !perguntaCartao && !/\b(exame|exames|procedimento|procedimentos)\b/.test(txt) && !extraido.negativa && !dados.nova_consulta) {
    let retorno = { estado: estadoAtual, dados, texto: 'Com qual profissional você prefere consultar?' };
    const mudouMedico = extraido.medico && normalizarTexto(extraido.medico) !== normalizarTexto(anteriores.medico || anteriores.medico_nome);
    const mudouPaciente = estadoAtual === 'AGENDAMENTO_CONFIRMACAO' && extraido.nome && normalizarTexto(extraido.nome) !== normalizarTexto(dados.paciente_nome);
    if (dados.acao === 'REMARCAR' && (mudouMedico || mudouPaciente)) return proporNovaConsulta(dados);
    if (mudouMedico || !emAgendamento) {
      retorno = await iniciarAgendamento(sr, { ...dados, primeiro_disponivel: querPrimeiro });
    } else if ((extraido.data || extraido.hora) && dados.medico_id) {
      const contexto = { ...dados, data: dados.data || dados.sugestoes?.[0]?.data };
      retorno = await pedirHorario(sr, dados.especialidade, { id: dados.medico_id, nome: dados.medico_nome }, contexto);
    } else if (mudouPaciente) {
      retorno = await seguirParaIdentificacao(sr, telefone, { ...dados, paciente_id: undefined, paciente_nome: undefined });
    } else if (querPrimeiro) {
      const contexto = { ...dados, medico: dados.medico || dados.medico_nome, primeiro_disponivel: true };
      retorno = await iniciarAgendamento(sr, contexto);
    } else if (estadoAtual === 'AGENDAMENTO_SELECAO_OPCAO' && dados.sugestoes?.[0]) {
      const h = dados.sugestoes[0];
      retorno.texto = 'Sobre a consulta com ' + dados.medico_nome + ' em ' + dataBr(h.data, h.hora) + ': pode ser?';
    } else if (estadoAtual === 'AGENDAMENTO_CONFIRMACAO') {
      retorno = confirmar(dados, { id: dados.paciente_id, nome: dados.paciente_nome });
    }
    if (!querPrecoConsulta) return retorno;
    const res = await precoConsultaPorEspecialidadeCore(sr, { especialidade: dados.especialidade });
    if (!res.ok) return resposta('Não localizei o valor dessa consulta no cadastro. ' + retorno.texto, retorno.estado, retorno.dados);
    const preco = await perguntarConvenio(sr, { blocos: res.itens }, texto,
      { ...retorno.dados, retorno_agendamento: retorno });
    if (querPrimeiro && preco.estado === 'PRECO_CONVENIO') preco.texto = retorno.texto.replace(' Pode ser?', '') + '\n\n' + preco.texto;
    return preco;
  }

  // Etapas em andamento têm prioridade sobre nova classificação de intenção.
  switch (mudouAssunto ? 'OCIOSO' : estadoAtual) {
    case 'AGENDAMENTO_ESPECIALIDADE': {
      if (extraido.medico) return iniciarAgendamento(sr, dados);
      const i = escolher(dados.opcoes || [], extraido, texto);
      if (i < 0 && !extraido.especialidade) return resposta('Qual especialidade você procura?', estadoAtual, dados);
      return iniciarAgendamento(sr, { ...dados, especialidade: i >= 0 ? dados.opcoes[i] : extraido.especialidade });
    }
    case 'AGENDAMENTO_MEDICO': {
      const i = escolher(dados.opcoes || [], extraido, texto);
      const m = (dados.medicos || [])[i];
      if (!m) return resposta('Com qual profissional você prefere consultar?', estadoAtual, dados);
      return pedirHorario(sr, dados.especialidade, m, dados);
    }
    case 'AGENDAMENTO_SELECAO_OPCAO': {
      if (validarHora(extraido.hora) && !extraido.data && !dados.data && dados.sugestoes?.[0]) {
        dados.data = dados.sugestoes[0].data;
      }
      if (extraido.medico && normalizarTexto(extraido.medico) !== normalizarTexto(anteriores.medico || anteriores.medico_nome)) {
        if (dados.acao === 'REMARCAR') return proporNovaConsulta(dados);
        return iniciarAgendamento(sr, dados);
      }
      if (extraido.data || extraido.hora) return pedirHorario(sr, dados.especialidade, { id: dados.medico_id, nome: dados.medico_nome }, dados);
      if (extraido.negativa) return resposta('Tudo bem. Qual data você prefere?', estadoAtual, { ...dados, opcoes: [], sugestoes: [] });
      const i = escolher(dados.opcoes || [], extraido, texto);
      const escolhido = (dados.sugestoes || [])[i];
      if (!escolhido) return resposta('Esse horário funciona para você? Se preferir, me diga outra data.', estadoAtual, dados);
      return seguirParaIdentificacao(sr, telefone, { ...dados, data: escolhido.data, hora: escolhido.hora });
    }
    case 'IDENTIFICACAO_CPF': // Migra conversas antigas sem solicitar documento.
    case 'IDENTIFICACAO_NOME': {
      const nome = dados.nome || (estadoAtual === 'IDENTIFICACAO_NOME' ? String(texto || '').trim() : '');
      if (!nomeInformadoValido(nome)) return resposta('Me diga o nome e sobrenome de quem vai consultar, por favor.', 'IDENTIFICACAO_NOME', dados);
      return seguirParaIdentificacao(sr, telefone, { ...dados, nome });
    }
    case 'AGENDAMENTO_CONFIRMACAO': {
      if (dados.nova_consulta) {
        if (extraido.negativa) return resposta('Tudo bem, sua consulta original continua como estava.', 'OCIOSO');
        if (!extraido.confirmacao) return resposta('Posso buscar uma nova consulta mantendo a antiga?', estadoAtual, dados);
        return iniciarAgendamento(sr, { ...dados, nova_consulta: false });
      }
      if (extraido.nome && normalizarTexto(extraido.nome) !== normalizarTexto(dados.paciente_nome)) {
        if (dados.acao === 'REMARCAR') return proporNovaConsulta(dados);
        return seguirParaIdentificacao(sr, telefone, { ...dados, paciente_id: undefined, paciente_nome: undefined });
      }
      if (extraido.medico && normalizarTexto(extraido.medico) !== normalizarTexto(anteriores.medico || anteriores.medico_nome)) {
        if (dados.acao === 'REMARCAR') return proporNovaConsulta(dados);
        return iniciarAgendamento(sr, dados);
      }
      if (extraido.data || extraido.hora) return pedirHorario(sr, dados.especialidade, { id: dados.medico_id, nome: dados.medico_nome }, dados);
      if (extraido.negativa) return resposta('Tudo bem, não alterei sua agenda. Qual data você prefere?', 'AGENDAMENTO_SELECAO_OPCAO', { ...dados, opcoes: [], sugestoes: [] });
      if (!extraido.confirmacao) return resposta('Posso confirmar esse horário?', estadoAtual, dados);
      const remarcacao = dados.acao === 'REMARCAR';
      if (remarcacao && !(await agendamentosDoTelefone(sr, telefone)).some((a) => a.id === dados.agendamento_id)) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      const res = remarcacao ? await rescheduleAppointmentCore(sr, {
        chave_idempotencia: 'REMARCAR:' + dados.agendamento_id + ':' + dados.data + ':' + dados.hora,
        agendamento_id: dados.agendamento_id, nova_data: dados.data, nova_hora: dados.hora,
        paciente_id: dados.paciente_id, telefone_canonico: telefone
      }) : await createAppointmentCore(sr, {
        chave_idempotencia: 'AGENDAR:' + telefone + ':' + (dados.paciente_id || normalizarTexto(dados.paciente_nome)) + ':' + dados.medico_id + ':' + dados.data + ':' + dados.hora,
        medico_id: dados.medico_id, data: dados.data, hora: dados.hora,
        paciente_id: dados.paciente_id, paciente_nome: dados.paciente_nome,
        telefone_canonico: telefone, reserva_sem_cadastro: !dados.paciente_id
      });
      if (!res.ok) {
        if (res.codigo === 'REMARCACAO_PARCIAL') return resposta(res.mensagem + ' ' + PARA_HUMANO, 'AGUARDANDO_HUMANO');
        if (['HORARIO_INDISPONIVEL', 'SLOT_EM_USO', 'CONFLITO_CONCORRENTE'].includes(res.codigo)) return pedirHorario(sr, dados.especialidade, { id: dados.medico_id, nome: dados.medico_nome }, dados);
        return resposta('Não consegui concluir agora. ' + PARA_HUMANO, 'AGUARDANDO_HUMANO');
      }
      return resposta('Prontinho! Sua consulta com ' + dados.medico_nome + ' está ' + (remarcacao ? 'remarcada' : 'agendada') +
        ' para ' + dataBr(dados.data, dados.hora) + '.\n\nChegue com 10 minutos de antecedência. Até logo!', 'OCIOSO');
    }
    case 'CANCELAMENTO_SELECAO': {
      const i = escolher(dados.opcoes || [], extraido, texto);
      const id = (dados.agendamentos || [])[i];
      if (!id) return resposta('Pode me dizer o profissional ou a data da consulta?', estadoAtual, dados);
      const agendamento = (await agendamentosDoTelefone(sr, telefone)).find((a) => a.id === id);
      if (!agendamento) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      return selecionarAgendamento(sr, agendamento, dados.acao, dados);
    }
    case 'CANCELAMENTO_CONFIRMACAO': {
      if (extraido.negativa) return resposta('Tudo bem, mantive sua consulta como está.', 'OCIOSO');
      if (!extraido.confirmacao) return resposta('Posso confirmar essa alteração?', estadoAtual, dados);
      const agendamento = (await agendamentosDoTelefone(sr, telefone)).find((a) => a.id === dados.agendamento_id);
      if (!agendamento) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      // Conversas abertas na versão antiga também migram para o fluxo seguro.
      if (dados.acao === 'REMARCAR') return selecionarAgendamento(sr, agendamento, 'REMARCAR', dados);
      const res = await cancelAppointmentCore(sr, { chave_idempotencia: 'CANCELAR:' + dados.agendamento_id,
        agendamento_id: dados.agendamento_id, paciente_id: agendamento.paciente_id, telefone_canonico: telefone,
        motivo: 'Cancelado pelo paciente no WhatsApp' });
      if (!res.ok) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      return resposta('Consulta de ' + dados.rotulo + ' cancelada. Se precisar agendar novamente, estou por aqui.', 'OCIOSO');
    }
    case 'CONFIRMACAO_CONSULTA': {
      if (extraido.negativa) return resposta('Entendi. Se precisar cancelar ou remarcar, me avise.', 'OCIOSO');
      if (!extraido.confirmacao) return resposta('Posso confirmar sua presença?', estadoAtual, dados);
      const agendamento = (await agendamentosDoTelefone(sr, telefone)).find((a) => a.id === dados.agendamento_id);
      if (!agendamento) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      const res = await confirmAppointmentCore(sr, { agendamento_id: dados.agendamento_id, paciente_id: agendamento.paciente_id });
      if (!res.ok) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      return resposta('Presença confirmada para ' + dados.rotulo + '. Obrigada!', 'OCIOSO');
    }


    case 'ORCAMENTO_ITENS': {
      const resolvido = await resolverBlocos(sr, extraido, texto);
      if (resolvido.blocos.length === 0) {
        const tentativas = (dados.tentativas || 0) + 1;
        if (tentativas >= 3) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
        return resposta(
          'Não localizei esse item no nosso cadastro. Me diga o nome do exame, procedimento ou a especialidade da consulta (ex: "ecocardiograma", "consulta com cardiologista").',
          'ORCAMENTO_ITENS',
          { tentativas }
        );
      }
      return await perguntarConvenio(sr, resolvido, texto, dados);
    }
    case 'PRECO_CONVENIO': {
      const t = normalizarTexto(texto || '');
      // "não tenho convênio", "particular", "sou particular" → Particular.
      if (extraido.negativa || t.includes('particular') || t.includes('nao tenho') || t.includes('nenhum')) {
        return informarPreco(dados.resolvido || {}, 'Particular', dados);
      }
      const categorias = dados.categorias || [];
      let i = escolher(dados.opcoes || [], extraido, texto);
      // Casamento parcial pelo nome do convênio ("tenho o cartão mais vida").
      if (i < 0 && t.length >= 3) {
        i = categorias.findIndex((c) => t.includes(normalizarTexto(c)));
      }
      const categoria = categorias[i];
      if (i < 0 || !categoria) {
        return resposta('Qual é o nome do seu convênio? Se não tiver, pode me dizer que é particular.', estadoAtual, dados);
      }
      return informarPreco(dados.resolvido || {}, categoria, dados);
    }
    case 'AGUARDANDO_HUMANO':
      return null; // atendimento humano em andamento: a Glória não responde
    default:
      break;
  }

  // Se acabamos de oferecer horários de um médico, "quero/sim" segue com ele.
  const afirmativo = ['sim', 'quero', 'queria', 'pode', 'pode ser', 'claro', 'por favor', 'isso', 'ok', 'vamos', 'gostaria', 'aceito', 'bora']
    .some((a) => normalizarTexto(texto || '') === a);
  if (dados.medico_id && !expirado && (extraido.confirmacao || afirmativo || extraido.intencao === 'AGENDAR')) {
    return await iniciarAgendamento(sr, dados);
  }

  // Acabamos de passar o valor de um exame/procedimento e o cliente aceitou ver
  // horário: agenda o próprio serviço, sem perguntar especialidade de novo.
  const nomesOrcados = Array.isArray(dados.orcamento_nomes) ? dados.orcamento_nomes : [];
  if (nomesOrcados.length > 0 && dados.orcamento_laboratorial && !expirado &&
      (extraido.confirmacao || afirmativo || extraido.intencao === 'AGENDAR')) {
    return resposta(TEXTO_LABORATORIAL + '\n\nÉ só trazer o pedido médico, se tiver. Te espero por aqui!', 'OCIOSO');
  }
  if (nomesOrcados.length > 0 && !expirado && (extraido.confirmacao || afirmativo || extraido.intencao === 'AGENDAR')) {
    const esp = await especialidadesDisponiveisCore(sr);
    const disponiveis = esp.especialidades || [];
    // 1º: especialidade cadastrada no próprio procedimento/exame orçado.
    const espOrcadas = Array.isArray(dados.orcamento_especialidades) ? dados.orcamento_especialidades : [];
    const porCadastro = disponiveis.find((e) => espOrcadas.some((x) => normalizarTexto(x) === normalizarTexto(e)));
    if (porCadastro) return await pedirMedico(sr, porCadastro, dados);
    const alvo = disponiveis.find((e) => nomesOrcados.some((n) => {
      const nn = normalizarTexto(n);
      const ne = normalizarTexto(e);
      return nn === ne || nn.includes(ne) || ne.includes(nn);
    }));
    if (alvo) return await pedirMedico(sr, alvo, dados);
    return resposta(
      'Para agendar ' + nomesOrcados[0] + ' vou chamar alguém da recepção, que confirma o melhor horário com você. Só um instante!',
      'AGUARDANDO_HUMANO'
    );
  }

  // Pergunta sobre valor/adesão do próprio cartão também cai aqui (não é orçamento
  // de exame), desde que nenhum outro serviço tenha sido pedido.
  const pediuOutroServico = (Array.isArray(extraido.itens_orcamento) ? extraido.itens_orcamento : [])
    .some((i) => { const n = normalizarTexto(i); return !n.includes('cartao') && !n.includes('plano'); });
  if (perguntaCartao && !pediuOutroServico && !['AGENDAR', 'CANCELAR', 'REMARCAR', 'CONFIRMAR'].includes(extraido.intencao)) {
    const info = await infoCartaoCore(sr);
    if (info) {
      return resposta(
        info + '\n\nQuer que eu chame alguém da recepção para fazer seu cartão?',
        'OCIOSO',
        { ...dados, assunto_cartao: true }
      );
    }
  }

  // Cliente quer enviar a requisição/pedido de exames: pode mandar por aqui.
  if (['requisicao', 'pedido de exame', 'pedido do medico', 'pedido medico', 'encaminhamento']
      .some((k) => txt.includes(k)) &&
      ['mandar', 'enviar', 'manda', 'envio', 'posso', 'foto', 'pdf', 'anexar'].some((k) => txt.includes(k))) {
    return resposta(
      'Pode mandar sim! Envie a foto ou o PDF da requisição aqui mesmo que eu leio os exames e já te passo o orçamento.',
      'OCIOSO'
    );
  }

  // Pedido de orçamento em palavras próprias, sem citar o item.
  if (['orcamento', 'orçamento', 'quanto custa', 'quanto fica', 'qual o valor', 'valores dos exames', 'tabela de preco']
      .some((k) => txt.includes(k)) &&
      !['AGENDAR', 'CANCELAR', 'REMARCAR', 'CONFIRMAR', 'ORCAMENTO', 'PRECO'].includes(extraido.intencao)) {
    return pedirItensOrcamento(dados);
  }

  // Coleta de exames laboratoriais: sem agendamento, por ordem de chegada.
  if (['exame de sangue', 'exames de sangue', 'exame laboratorial', 'exames laboratoriais', 'laboratorio', 'coleta de sangue', 'hemograma']
      .some((k) => txt.includes(k)) && ['AGENDAR', 'INFORMACAO', 'OUTRO', 'SAUDACAO'].includes(extraido.intencao)) {
    return resposta(TEXTO_LABORATORIAL + '\n\nÉ só trazer o pedido médico, se tiver. Te espero por aqui!', 'OCIOSO');
  }

  // Estado OCIOSO: nova intenção.
  switch (extraido.intencao) {
    case 'AGENDAR':
      return iniciarAgendamento(sr, dados);
    case 'CANCELAR':
      return listarAgendamentos(sr, telefone, 'CANCELAR', 'Qual consulta você quer cancelar?', dados);
    case 'REMARCAR':
      return listarAgendamentos(sr, telefone, 'REMARCAR', 'Qual consulta você quer remarcar?', dados);
    case 'CONFIRMAR':
      return listarAgendamentos(sr, telefone, 'CONFIRMAR', 'Qual consulta você quer confirmar?', dados);


    case 'ORCAMENTO':
    case 'PRECO': {
      const itens = Array.isArray(extraido.itens_orcamento) ? extraido.itens_orcamento : [];
      // Pedido genérico ("quero um orçamento de exames"): pergunta os itens.
      if (itens.length === 0 && !extraido.especialidade) return pedirItensOrcamento(dados);
      const resolvido = await resolverBlocos(sr, extraido, texto);
      if (resolvido.blocos.length === 0) return pedirItensOrcamento(dados);
      return await perguntarConvenio(sr, resolvido, texto, dados);
    }
    case 'DIAS_ATENDIMENTO': {
      const t = normalizarTexto(texto || '');
      const citado = extraido.medico && normalizarTexto(extraido.medico)
        .split(' ')
        .some((p) => p.length >= 4 && t.includes(p));
      if (!citado && !dados.medico_id) return resposta('De qual profissional você quer consultar a agenda?', 'AGENDAMENTO_ESPECIALIDADE', dados);
      return await informarDiasAtendimento(sr, extraido.medico || dados.medico_nome, dados);
    }
    case 'INFORMACAO': {
      // Só trata como pergunta sobre médico se o nome estiver na mensagem atual
      // (evita reaproveitar o médico citado antes no histórico).
      const t = normalizarTexto(texto || '');
      const citado = extraido.medico && normalizarTexto(extraido.medico)
        .split(' ')
        .some((p) => p.length >= 4 && t.includes(p));
      if (citado) return await informarDiasAtendimento(sr, extraido.medico || dados.medico_nome, dados);
      return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
    }
    case 'SAUDACAO':
      return resposta('Olá' + (primeiroNome ? ', ' + primeiroNome : '') + '! Sou a Glória, do Centro Vida Saúde. Posso te ajudar a agendar consultas, exames e procedimentos, confirmar ou cancelar atendimentos, passar valores e também com o Cartão Mais Vida Saúde. O que você precisa?', 'OCIOSO');
    default: {
      // Agradecimento/despedida encerra a conversa com cordialidade.
      const t = normalizarTexto(texto || '');
      const despedida = ['obrigado', 'obrigada', 'obg', 'valeu', 'tchau', 'ate logo', 'ate mais', 'boa noite', 'bom dia'];
      if (t.length <= 40 && despedida.some((d) => t.includes(d))) {
        return resposta('Eu que agradeço! Qualquer coisa, estou por aqui. Boa sorte e até logo! 😊', 'OCIOSO');
      }
      if ((dados.tentativas_entendimento || 0) >= 2 || dados.busca_agendamento) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      return resposta('Pode me contar um pouco mais sobre o que você precisa?', 'OCIOSO', { ...dados, tentativas_entendimento: (dados.tentativas_entendimento || 0) + 1 });
    }
  }
}

export { expiracao };
