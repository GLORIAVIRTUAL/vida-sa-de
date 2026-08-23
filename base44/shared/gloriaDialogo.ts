// gloriaDialogo — máquina de estados determinística da conversa da Glória.
// A IA só interpreta a mensagem; todas as decisões e gravações vêm do núcleo.

import {
  normalizarTelefone, normalizarTexto, hojeLocal,
  buscarPacientesPorTelefone, buscarPacientePorCpf, criarPacienteSeguro,
  nomeCompletoValido, validarCpf, proximosHorariosCore,
  createAppointmentCore, cancelAppointmentCore, confirmAppointmentCore, orcamentoCore
} from './gloriaCore.ts';
import { especialidadesDisponiveisCore, medicosPorEspecialidadeCore } from './gloriaAgenda.ts';
import { medicoPorNomeCore, diasAtendimentoCore } from './gloriaHorariosMedico.ts';
import { extrairIntencao } from './gloriaLlm.ts';

const EXPIRA_MINUTOS = 60;

function expiracao() {
  return new Date(Date.now() + EXPIRA_MINUTOS * 60000).toISOString();
}

function listar(opcoes) {
  return opcoes.map((o, i) => (i + 1) + '. ' + o).join('\n');
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
  return idx;
}

function dataBr(data, hora) {
  const [a, m, d] = String(data).split('-');
  return d + '/' + m + '/' + a + (hora ? ' às ' + hora : '');
}

function resposta(texto, estado, dados) {
  return { texto, estado: estado || 'OCIOSO', dados: dados || {} };
}

const PARA_HUMANO = 'Vou chamar uma pessoa da recepção para te ajudar. Em breve alguém responde por aqui.';

// ---------------------------------------------------------------- etapas

async function pedirEspecialidade(sr) {
  const esp = await especialidadesDisponiveisCore(sr);
  const lista = (esp.especialidades || []).slice(0, 30);
  if (lista.length === 0) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  return resposta(
    'Claro! Para qual especialidade você quer agendar?\n\n' + listar(lista) + '\n\nResponda com o número.',
    'AGENDAMENTO_ESPECIALIDADE',
    { opcoes: lista }
  );
}

async function pedirMedico(sr, especialidade) {
  const res = await medicosPorEspecialidadeCore(sr, { especialidade });
  const medicos = res.medicos || [];
  if (medicos.length === 0) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  if (medicos.length === 1) return await pedirHorario(sr, especialidade, medicos[0]);
  const nomes = medicos.map((m) => m.nome);
  return resposta(
    'Com qual profissional de ' + especialidade + ' você prefere?\n\n' + listar(nomes) + '\n\nResponda com o número.',
    'AGENDAMENTO_MEDICO',
    { especialidade, opcoes: nomes, medicos: medicos.map((m) => ({ id: m.id, nome: m.nome })) }
  );
}

async function pedirHorario(sr, especialidade, medico) {
  const res = await proximosHorariosCore(sr, { medico_id: medico.id, maximo: 6 });
  const sugestoes = res.sugestoes || [];
  if (sugestoes.length === 0) {
    return resposta(
      'Não encontrei horários livres para ' + medico.nome + ' nos próximos dias. Vou pedir para a recepção te ajudar.',
      'AGUARDANDO_HUMANO'
    );
  }
  const rotulos = sugestoes.map((s) => dataBr(s.data, s.hora));
  return resposta(
    'Estes são os próximos horários com ' + medico.nome + ':\n\n' + listar(rotulos) + '\n\nResponda com o número do horário desejado.',
    'AGENDAMENTO_SELECAO_OPCAO',
    { especialidade, medico_id: medico.id, medico_nome: medico.nome, opcoes: rotulos, sugestoes }
  );
}

async function seguirParaIdentificacao(sr, telefone, dados) {
  const pacientes = await buscarPacientesPorTelefone(sr, telefone);
  if (pacientes.length === 1) {
    return confirmar(dados, pacientes[0]);
  }
  return resposta(
    'Para finalizar, me diga seu *nome completo*, por favor.',
    'IDENTIFICACAO_NOME',
    dados
  );
}

function confirmar(dados, paciente) {
  return resposta(
    'Confere para mim:\n\n' +
    'Paciente: ' + paciente.nome + '\n' +
    'Profissional: ' + dados.medico_nome + '\n' +
    'Data: ' + dataBr(dados.data, dados.hora) + '\n\n' +
    'Posso confirmar? Responda *SIM* para agendar.',
    'AGENDAMENTO_CONFIRMACAO',
    { ...dados, paciente_id: paciente.id, paciente_nome: paciente.nome }
  );
}

// acao: 'CANCELAR' (cancela) ou 'CONFIRMAR' (confirma presença).
async function listarAgendamentos(sr, telefone, acao, titulo) {
  const pacientes = await buscarPacientesPorTelefone(sr, telefone);
  if (pacientes.length === 0) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  const hoje = hojeLocal();
  let agendamentos = [];
  for (const p of pacientes) {
    const achados = await sr.entities.Agendamento.filter({ paciente_id: p.id });
    agendamentos = agendamentos.concat(
      achados.filter((a) => a.data_agendamento >= hoje && ['Agendado', 'Confirmado'].includes(a.status))
    );
  }
  agendamentos.sort((x, y) => (x.data_agendamento + x.horario).localeCompare(y.data_agendamento + y.horario));
  if (agendamentos.length === 0) {
    return resposta('Não encontrei consultas futuras no seu cadastro. Se precisar, posso chamar a recepção.', 'OCIOSO');
  }
  const rotulos = agendamentos.map((a) => dataBr(a.data_agendamento, a.horario));
  if (agendamentos.length === 1) {
    return resposta(
      titulo + '\n\n' + rotulos[0] + '\n\nResponda *SIM* para confirmar.',
      acao === 'CANCELAR' ? 'CANCELAMENTO_CONFIRMACAO' : 'CONFIRMACAO_CONSULTA',
      { acao, agendamento_id: agendamentos[0].id, rotulo: rotulos[0] }
    );
  }
  return resposta(
    titulo + '\n\n' + listar(rotulos) + '\n\nResponda com o número.',
    'CANCELAMENTO_SELECAO',
    { acao, opcoes: rotulos, agendamentos: agendamentos.map((a) => a.id) }
  );
}

// Responde "que dia o Dr. X atende?" com os dias reais da agenda.
async function informarDiasAtendimento(sr, nomeMedico) {
  const busca = await medicoPorNomeCore(sr, { nome: nomeMedico });
  const encontrados = busca.ok ? busca.medicos : [];
  if (encontrados.length !== 1) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');

  const res = await diasAtendimentoCore(sr, { medico_id: encontrados[0].id });
  if (!res.ok || res.dias.length === 0) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');

  const linhas = res.dias.map((d) => '• ' + d.dia + ': ' + d.horarios.join(', '));
  return resposta(
    res.nome + ' atende nos seguintes dias:\n\n' + linhas.join('\n') +
    '\n\nQuer que eu veja os próximos horários livres para agendar?',
    'OCIOSO'
  );
}

// ---------------------------------------------------------------- turno

export async function processarTurno(sr, { contato, texto, mediaUrl }) {
  const telefone = normalizarTelefone(contato.telefone_normalizado || contato.telefone);
  const estado = contato.gloria_estado || 'OCIOSO';
  const dados = contato.gloria_estado_dados || {};
  const expirado = contato.gloria_estado_expira_em && new Date(contato.gloria_estado_expira_em).getTime() < Date.now();
  const estadoAtual = expirado ? 'OCIOSO' : estado;

  const extraido = await extrairIntencao(sr, {
    texto,
    historico: contato.historico_mensagens,
    estado: estadoAtual,
    opcoes_oferecidas: dados.opcoes,
    dataHoje: hojeLocal()
  });

  if (extraido.intencao === 'FALAR_COM_HUMANO') {
    return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  }

  // Etapas em andamento têm prioridade sobre nova classificação de intenção.
  switch (estadoAtual) {
    case 'AGENDAMENTO_ESPECIALIDADE': {
      const i = escolher(dados.opcoes || [], extraido, texto);
      if (i < 0) return resposta('Não entendi. Responda com o número da especialidade, por favor.', estadoAtual, dados);
      return await pedirMedico(sr, dados.opcoes[i]);
    }
    case 'AGENDAMENTO_MEDICO': {
      const i = escolher(dados.opcoes || [], extraido, texto);
      if (i < 0) return resposta('Não entendi. Responda com o número do profissional, por favor.', estadoAtual, dados);
      const escolhido = (dados.medicos || [])[i];
      if (!escolhido) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      return await pedirHorario(sr, dados.especialidade, escolhido);
    }
    case 'AGENDAMENTO_SELECAO_OPCAO': {
      const i = escolher(dados.opcoes || [], extraido, texto);
      const escolhido = (dados.sugestoes || [])[i];
      if (i < 0 || !escolhido) return resposta('Não entendi. Responda com o número do horário, por favor.', estadoAtual, dados);
      const novos = {
        medico_id: dados.medico_id,
        medico_nome: dados.medico_nome,
        especialidade: dados.especialidade,
        data: escolhido.data,
        hora: escolhido.hora
      };
      return await seguirParaIdentificacao(sr, telefone, novos);
    }
    case 'IDENTIFICACAO_NOME': {
      const nome = extraido.nome || texto;
      if (!nomeCompletoValido(String(nome || '').trim())) {
        return resposta('Preciso do nome completo (nome e sobrenome), como está no documento.', estadoAtual, dados);
      }
      return resposta('Obrigada! Agora me informe seu *CPF*, por favor.', 'IDENTIFICACAO_CPF', { ...dados, nome: String(nome).trim() });
    }
    case 'IDENTIFICACAO_CPF': {
      const cpf = extraido.cpf || texto;
      if (!validarCpf(cpf)) return resposta('Esse CPF não parece válido. Pode me enviar novamente?', estadoAtual, dados);
      const existente = await buscarPacientePorCpf(sr, cpf);
      if (existente) return confirmar(dados, existente);
      const criado = await criarPacienteSeguro(sr, { nome: dados.nome, cpf, telefone });
      if (!criado.ok) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      return confirmar(dados, criado.paciente);
    }
    case 'AGENDAMENTO_CONFIRMACAO': {
      if (extraido.negativa) return resposta('Sem problema, não agendei nada. Se quiser tentar outro horário, é só me dizer.', 'OCIOSO');
      if (!extraido.confirmacao) return resposta('Só para confirmar: posso agendar? Responda *SIM* ou *NÃO*.', estadoAtual, dados);
      const res = await createAppointmentCore(sr, {
        chave_idempotencia: 'AGENDAR:' + telefone + ':' + dados.medico_id + ':' + dados.data + ':' + dados.hora,
        medico_id: dados.medico_id,
        data: dados.data,
        hora: dados.hora,
        paciente_id: dados.paciente_id,
        paciente_nome: dados.paciente_nome,
        telefone_canonico: telefone
      });
      if (!res.ok) return resposta(res.mensagem + ' Quer ver outros horários?', 'OCIOSO');
      return resposta(
        'Prontinho! Sua consulta com ' + dados.medico_nome + ' está agendada para ' + dataBr(dados.data, dados.hora) + '.\n\n' +
        'Chegue com 10 minutos de antecedência. Até logo!',
        'OCIOSO'
      );
    }
    case 'CANCELAMENTO_SELECAO': {
      const i = escolher(dados.opcoes || [], extraido, texto);
      const id = (dados.agendamentos || [])[i];
      if (i < 0 || !id) return resposta('Não entendi. Responda com o número da consulta, por favor.', estadoAtual, dados);
      if (dados.acao === 'CONFIRMAR') {
        return resposta('Confirma sua presença na consulta de ' + dados.opcoes[i] + '? Responda *SIM*.', 'CONFIRMACAO_CONSULTA', { acao: 'CONFIRMAR', agendamento_id: id, rotulo: dados.opcoes[i] });
      }
      return resposta('Confirma o cancelamento da consulta de ' + dados.opcoes[i] + '? Responda *SIM*.', 'CANCELAMENTO_CONFIRMACAO', { acao: 'CANCELAR', agendamento_id: id, rotulo: dados.opcoes[i] });
    }
    case 'CANCELAMENTO_CONFIRMACAO': {
      if (extraido.negativa) return resposta('Ok, mantive sua consulta como está.', 'OCIOSO');
      if (!extraido.confirmacao) return resposta('Responda *SIM* para cancelar ou *NÃO* para manter.', estadoAtual, dados);
      const res = await cancelAppointmentCore(sr, {
        chave_idempotencia: 'CANCELAR:' + dados.agendamento_id,
        agendamento_id: dados.agendamento_id,
        telefone_canonico: telefone,
        motivo: 'Cancelado pelo paciente no WhatsApp'
      });
      if (!res.ok) return resposta(res.mensagem, 'OCIOSO');
      return resposta('Consulta de ' + dados.rotulo + ' cancelada. Se quiser reagendar, estou por aqui.', 'OCIOSO');
    }
    case 'CONFIRMACAO_CONSULTA': {
      if (extraido.negativa) return resposta('Entendi. Se precisar cancelar ou remarcar, me avise.', 'OCIOSO');
      if (!extraido.confirmacao) return resposta('Responda *SIM* para confirmar sua presença.', estadoAtual, dados);
      const res = await confirmAppointmentCore(sr, { agendamento_id: dados.agendamento_id });
      if (!res.ok) return resposta(res.mensagem, 'OCIOSO');
      return resposta('Presença confirmada para ' + dados.rotulo + '. Obrigada!', 'OCIOSO');
    }
    case 'AGUARDANDO_HUMANO':
      return null; // atendimento humano em andamento: a Glória não responde
    default:
      break;
  }

  // Estado OCIOSO: nova intenção.
  switch (extraido.intencao) {
    case 'AGENDAR':
      return await pedirEspecialidade(sr);
    case 'CANCELAR':
    case 'REMARCAR':
      return await listarAgendamentos(sr, telefone, 'CANCELAR', 'Qual consulta você quer cancelar? Depois posso buscar um novo horário para você.');
    case 'CONFIRMAR':
      return await listarAgendamentos(sr, telefone, 'CONFIRMAR', 'Qual consulta você quer confirmar?');
    case 'ORCAMENTO': {
      const itens = Array.isArray(extraido.itens_orcamento) ? extraido.itens_orcamento : [];
      if (itens.length === 0 || mediaUrl) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      const res = await orcamentoCore(sr, { itens });
      if (!res.ok || res.itens.length === 0) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      const linhas = res.itens.map((i) => '• ' + i.nome + ': R$ ' + i.valor.toFixed(2).replace('.', ','));
      const pendentes = res.desconhecidos.length
        ? '\n\nNão localizei o valor de: ' + res.desconhecidos.join(', ') + '. A recepção pode confirmar.'
        : '';
      return resposta(
        'Valores particulares:\n\n' + linhas.join('\n') +
        '\n\n*Total: R$ ' + res.total.toFixed(2).replace('.', ',') + '*' + pendentes,
        'OCIOSO'
      );
    }
    case 'DIAS_ATENDIMENTO':
      return await informarDiasAtendimento(sr, extraido.medico);
    case 'INFORMACAO':
      if (extraido.medico) return await informarDiasAtendimento(sr, extraido.medico);
      return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
    case 'SAUDACAO':
      return resposta('Olá! Sou a Glória, do Centro Vida Saúde. Posso te ajudar a agendar, confirmar ou cancelar uma consulta. O que você precisa?', 'OCIOSO');
    default:
      return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  }
}

export { expiracao };