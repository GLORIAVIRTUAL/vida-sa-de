// gloriaDialogo — máquina de estados determinística da conversa da Glória.
// A IA só interpreta a mensagem; todas as decisões e gravações vêm do núcleo.

import {
  normalizarTelefone, normalizarTexto, hojeLocal,
  buscarPacientesPorTelefone, buscarPacientePorCpf, criarPacienteSeguro,
  nomeCompletoValido, validarCpf, proximosHorariosCore,
  createAppointmentCore, cancelAppointmentCore, confirmAppointmentCore
} from './gloriaCore.ts';
import { especialidadesDisponiveisCore, medicosPorEspecialidadeCore } from './gloriaAgenda.ts';
import { medicoPorNomeCore, diasAtendimentoCore } from './gloriaHorariosMedico.ts';
import { precoPorTermoCore, precoConsultaPorEspecialidadeCore, categoriasPrecoCore } from './gloriaPrecos.ts';
import { extrairIntencao } from './gloriaLlm.ts';
import { infoCartaoCore } from './gloriaCartao.ts';

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
  // Oferece o PRIMEIRO horário livre de cada profissional (sem listar tudo).
  const sugestoes = [];
  for (const m of medicos.slice(0, 8)) {
    const r = await proximosHorariosCore(sr, { medico_id: m.id, maximo: 1 });
    const s = (r.sugestoes || [])[0];
    if (s) sugestoes.push({ ...s, medico_id: m.id, medico_nome: m.nome });
  }
  if (sugestoes.length === 0) {
    return resposta('Não encontrei horários livres de ' + especialidade + ' nos próximos dias. Vou pedir para a recepção te ajudar.', 'AGUARDANDO_HUMANO');
  }
  const rotulos = sugestoes.map((s) => s.medico_nome + ' — ' + dataBr(s.data, s.hora));
  return resposta(
    'Estes são os primeiros horários disponíveis em ' + especialidade + ':\n\n' + listar(rotulos) +
    '\n\nResponda com o número do horário desejado.',
    'AGENDAMENTO_SELECAO_OPCAO',
    { especialidade, opcoes: rotulos, sugestoes }
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
      acao === 'CONFIRMAR' ? 'CONFIRMACAO_CONSULTA' : 'CANCELAMENTO_CONFIRMACAO',
      { acao, agendamento_id: agendamentos[0].id, rotulo: rotulos[0], medico_id: agendamentos[0].medico_id }
    );
  }
  return resposta(
    titulo + '\n\n' + listar(rotulos) + '\n\nResponda com o número.',
    'CANCELAMENTO_SELECAO',
    {
      acao,
      opcoes: rotulos,
      agendamentos: agendamentos.map((a) => a.id),
      medicos_ids: agendamentos.map((a) => a.medico_id)
    }
  );
}

function reais(valor) {
  return 'R$ ' + valor.toFixed(2).replace('.', ',');
}

// Responde "quanto custa...?" usando apenas valores cadastrados no sistema.
// Pergunta obrigatória no início de todo orçamento.
async function pedirConvenio(sr, extraido, texto) {
  // Só pergunta o convênio se algum item pedido existir no cadastro.
  const resolvido = await resolverBlocos(sr, extraido, texto);
  if (resolvido.blocos.length === 0) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');

  const nomes = await categoriasPrecoCore(sr);
  const convenios = nomes.filter((n) => normalizarTexto(n) !== 'particular');

  // Se o cliente já disse o convênio na própria pergunta, não pergunta de novo.
  const t = normalizarTexto(texto || '');
  const citado = convenios.find((c) => t.includes(normalizarTexto(c)));
  if (citado) return informarPreco(resolvido, citado);
  if (t.includes('particular')) return informarPreco(resolvido, 'Particular');
  if (convenios.length === 0) return informarPreco(resolvido, 'Particular');
  const opcoes = ['Não tenho convênio (Particular)'].concat(convenios);
  return resposta(
    'Antes de passar os valores: você tem algum convênio da clínica?\n\n' + listar(opcoes) +
    '\n\nResponda com o número.',
    'PRECO_CONVENIO',
    { opcoes, categorias: ['Particular'].concat(convenios), resolvido }
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

function informarPreco(resolvido, categoria) {
  const blocos = resolvido.blocos || [];
  // Termos não localizados só interessam quando nada foi encontrado; se já
  // achamos valores, não confundir o cliente com variações do mesmo pedido.
  const naoEncontrados = [];
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
  const pendentes = naoEncontrados.length
    ? '\n\nSobre ' + naoEncontrados.join(', ') + ', a recepção confirma o valor para você.'
    : '';
  return resposta(
    linhas.join('\n\n') + pendentes + '\n\nQuer que eu veja um horário disponível?',
    'OCIOSO',
    { orcamento_nomes: blocos.map((b) => b.nome) }
  );
}

// Responde "que dia o Dr. X atende?" com os dias reais da agenda.
async function informarDiasAtendimento(sr, nomeMedico) {
  const busca = await medicoPorNomeCore(sr, { nome: nomeMedico });
  const encontrados = busca.ok ? busca.medicos : [];
  if (encontrados.length !== 1) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');

  const res = await diasAtendimentoCore(sr, { medico_id: encontrados[0].id });
  const datas = res.ok ? (res.datas || []) : [];
  if (!res.ok || (res.dias.length === 0 && datas.length === 0)) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');

  const linhas = res.dias.map((d) => '• ' + d.dia + ': ' + d.horarios.join(', '))
    .concat(datas.map((d) => '• ' + d.dia + ', ' + dataBr(d.data) + ': ' + d.horarios.join(', ')));
  return resposta(
    res.nome + ' atende nos seguintes dias:\n\n' + linhas.join('\n') +
    '\n\nQuer que eu veja os próximos horários livres para agendar?',
    'OCIOSO',
    { medico_id: encontrados[0].id, medico_nome: res.nome, especialidade: encontrados[0].especialidade }
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

  if (extraido.intencao === 'FALAR_COM_HUMANO' && estadoAtual !== 'PRECO_CONVENIO') {
    return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
  }

  // Pergunta sobre o Cartão Mais Vida Saúde: responde com o material cadastrado.
  const txt = normalizarTexto(texto || '');
  const perguntaCartao = ['cartao mais vida', 'mais vida saude', 'cartao de vcs', 'cartao de voces', 'plano de vcs', 'plano de voces', 'aceitam plano', 'aceita plano', 'tem plano', 'tem cartao', 'cartao do plano']
    .some((k) => txt.includes(k));

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

  // Etapas em andamento têm prioridade sobre nova classificação de intenção.
  switch (mudouAssunto ? 'OCIOSO' : estadoAtual) {
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
        medico_id: escolhido.medico_id || dados.medico_id,
        medico_nome: escolhido.medico_nome || dados.medico_nome,
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
      const base = { acao: dados.acao, agendamento_id: id, rotulo: dados.opcoes[i], medico_id: (dados.medicos_ids || [])[i] };
      if (dados.acao === 'CONFIRMAR') {
        return resposta('Confirma sua presença na consulta de ' + dados.opcoes[i] + '? Responda *SIM*.', 'CONFIRMACAO_CONSULTA', base);
      }
      if (dados.acao === 'REMARCAR') {
        return resposta('Vou desmarcar a consulta de ' + dados.opcoes[i] + ' e buscar um novo horário. Confirma? Responda *SIM*.', 'CANCELAMENTO_CONFIRMACAO', base);
      }
      return resposta('Confirma o cancelamento da consulta de ' + dados.opcoes[i] + '? Responda *SIM*.', 'CANCELAMENTO_CONFIRMACAO', base);
    }
    case 'CANCELAMENTO_CONFIRMACAO': {
      if (extraido.negativa) return resposta('Ok, mantive sua consulta como está.', 'OCIOSO');
      if (!extraido.confirmacao) return resposta('Responda *SIM* para confirmar ou *NÃO* para manter como está.', estadoAtual, dados);
      const res = await cancelAppointmentCore(sr, {
        chave_idempotencia: 'CANCELAR:' + dados.agendamento_id,
        agendamento_id: dados.agendamento_id,
        telefone_canonico: telefone,
        motivo: dados.acao === 'REMARCAR' ? 'Remarcação solicitada pelo paciente no WhatsApp' : 'Cancelado pelo paciente no WhatsApp'
      });
      if (!res.ok) return resposta(res.mensagem, 'OCIOSO');
      if (dados.acao === 'REMARCAR' && dados.medico_id) {
        const medico = await sr.entities.Medico.get(dados.medico_id).catch(() => null);
        if (medico) return await pedirHorario(sr, medico.especialidade, { id: medico.id, nome: medico.nome });
      }
      if (dados.acao === 'REMARCAR') return await pedirEspecialidade(sr);
      return resposta('Consulta de ' + dados.rotulo + ' cancelada. Se quiser reagendar, estou por aqui.', 'OCIOSO');
    }
    case 'CONFIRMACAO_CONSULTA': {
      if (extraido.negativa) return resposta('Entendi. Se precisar cancelar ou remarcar, me avise.', 'OCIOSO');
      if (!extraido.confirmacao) return resposta('Responda *SIM* para confirmar sua presença.', estadoAtual, dados);
      const res = await confirmAppointmentCore(sr, { agendamento_id: dados.agendamento_id });
      if (!res.ok) return resposta(res.mensagem, 'OCIOSO');
      return resposta('Presença confirmada para ' + dados.rotulo + '. Obrigada!', 'OCIOSO');
    }
    case 'PRECO_CONVENIO': {
      const t = normalizarTexto(texto || '');
      // "não tenho convênio", "particular", "sou particular" → Particular.
      if (extraido.negativa || t.includes('particular') || t.includes('nao tenho') || t.includes('nenhum')) {
        return informarPreco(dados.resolvido || {}, 'Particular');
      }
      const categorias = dados.categorias || [];
      let i = escolher(dados.opcoes || [], extraido, texto);
      // Casamento parcial pelo nome do convênio ("tenho o cartão mais vida").
      if (i < 0 && t.length >= 3) {
        i = categorias.findIndex((c) => t.includes(normalizarTexto(c)));
      }
      const categoria = categorias[i];
      if (i < 0 || !categoria) {
        return resposta('Não entendi. Responda com o número da opção do seu convênio (ou 1 se não tiver).', estadoAtual, dados);
      }
      return informarPreco(dados.resolvido || {}, categoria);
    }
    case 'AGUARDANDO_HUMANO':
      return null; // atendimento humano em andamento: a Glória não responde
    default:
      break;
  }

  // Se acabamos de oferecer horários de um médico, "quero/sim" segue com ele.
  const afirmativo = ['sim', 'quero', 'queria', 'pode', 'pode ser', 'claro', 'por favor', 'isso', 'ok', 'vamos', 'gostaria', 'aceito', 'bora']
    .some((a) => normalizarTexto(texto || '') === a || normalizarTexto(texto || '').startsWith(a + ' '));
  if (dados.medico_id && !expirado && (extraido.confirmacao || afirmativo || extraido.intencao === 'AGENDAR')) {
    return await pedirHorario(sr, dados.especialidade, { id: dados.medico_id, nome: dados.medico_nome });
  }

  // Acabamos de passar o valor de um exame/procedimento e o cliente aceitou ver
  // horário: agenda o próprio serviço, sem perguntar especialidade de novo.
  const nomesOrcados = Array.isArray(dados.orcamento_nomes) ? dados.orcamento_nomes : [];
  if (nomesOrcados.length > 0 && !expirado && (extraido.confirmacao || afirmativo || extraido.intencao === 'AGENDAR')) {
    const esp = await especialidadesDisponiveisCore(sr);
    const disponiveis = esp.especialidades || [];
    const alvo = disponiveis.find((e) => nomesOrcados.some((n) => {
      const nn = normalizarTexto(n);
      const ne = normalizarTexto(e);
      return nn === ne || nn.includes(ne) || ne.includes(nn);
    }));
    if (alvo) return await pedirMedico(sr, alvo);
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
        'OCIOSO'
      );
    }
  }

  // Estado OCIOSO: nova intenção.
  switch (extraido.intencao) {
    case 'AGENDAR': {
      // Especialidade já dita na mensagem: vai direto aos horários.
      if (extraido.especialidade) {
        const esp = await especialidadesDisponiveisCore(sr);
        const alvo = (esp.especialidades || []).find((e) => normalizarTexto(e) === normalizarTexto(extraido.especialidade));
        if (alvo) return await pedirMedico(sr, alvo);
      }
      return await pedirEspecialidade(sr);
    }
    case 'CANCELAR':
      return await listarAgendamentos(sr, telefone, 'CANCELAR', 'Qual consulta você quer cancelar?');
    case 'REMARCAR':
      return await listarAgendamentos(sr, telefone, 'REMARCAR', 'Qual consulta você quer remarcar?');
    case 'CONFIRMAR':
      return await listarAgendamentos(sr, telefone, 'CONFIRMAR', 'Qual consulta você quer confirmar?');
    case 'ORCAMENTO': {
      const itens = Array.isArray(extraido.itens_orcamento) ? extraido.itens_orcamento : [];
      if ((itens.length === 0 && !extraido.especialidade) || mediaUrl) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      return await pedirConvenio(sr, extraido, texto);
    }
    case 'PRECO':
      return await pedirConvenio(sr, extraido, texto);
    case 'DIAS_ATENDIMENTO': {
      const t = normalizarTexto(texto || '');
      const citado = extraido.medico && normalizarTexto(extraido.medico)
        .split(' ')
        .some((p) => p.length >= 4 && t.includes(p));
      if (!citado) return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
      return await informarDiasAtendimento(sr, extraido.medico);
    }
    case 'INFORMACAO': {
      // Só trata como pergunta sobre médico se o nome estiver na mensagem atual
      // (evita reaproveitar o médico citado antes no histórico).
      const t = normalizarTexto(texto || '');
      const citado = extraido.medico && normalizarTexto(extraido.medico)
        .split(' ')
        .some((p) => p.length >= 4 && t.includes(p));
      if (citado) return await informarDiasAtendimento(sr, extraido.medico);
      return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
    }
    case 'SAUDACAO':
      return resposta('Olá! Sou a Glória, do Centro Vida Saúde. Posso te ajudar a agendar consultas, exames e procedimentos, confirmar ou cancelar atendimentos, passar valores e também com o Cartão Mais Vida Saúde. O que você precisa?', 'OCIOSO');
    default: {
      // Agradecimento/despedida encerra a conversa com cordialidade.
      const t = normalizarTexto(texto || '');
      const despedida = ['obrigado', 'obrigada', 'obg', 'valeu', 'tchau', 'ate logo', 'ate mais', 'boa noite', 'bom dia'];
      if (t.length <= 40 && despedida.some((d) => t.includes(d))) {
        return resposta('Eu que agradeço! Qualquer coisa, estou por aqui. Boa sorte e até logo! 😊', 'OCIOSO');
      }
      return resposta(PARA_HUMANO, 'AGUARDANDO_HUMANO');
    }
  }
}

export { expiracao };