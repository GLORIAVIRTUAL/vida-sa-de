// gloriaCore — única fonte de verdade determinística da Glória.
// Nenhuma decisão de negócio aqui depende de IA. Todas as funções recebem um
// cliente com service role (sr = base44.asServiceRole).

// ---------------------------------------------------------------- erros seguros

export function erroSeguro(codigo, mensagem) {
  return { ok: false, codigo, mensagem };
}

export function ok(dados) {
  return { ok: true, ...dados };
}

// ---------------------------------------------------------------- telefone

// Normalização canônica. Brasil: 55 + DDD(2) + número(8 ou 9).
// Internacional: mantém os dígitos como recebidos (8 a 15 dígitos).
// Nunca faz comparação parcial nem usa "últimos 8 dígitos".
export function normalizarTelefone(bruto) {
  if (!bruto) return null;
  let d = String(bruto).replace(/\D/g, '');
  if (!d) return null;
  d = d.replace(/^0+/, '');
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  if (d.length >= 8 && d.length <= 15) return d;
  return null;
}

// Variantes EXATAS do mesmo número (com e sem o nono dígito, com e sem DDI).
export function variantesTelefone(canonico) {
  const c = normalizarTelefone(canonico);
  if (!c) return [];
  const set = new Set([c]);
  if (c.startsWith('55')) {
    const resto = c.slice(2);
    set.add(resto);
    if (resto.length === 11 && resto[2] === '9') {
      const sem9 = resto.slice(0, 2) + resto.slice(3);
      set.add(sem9);
      set.add('55' + sem9);
    }
    if (resto.length === 10) {
      const com9 = resto.slice(0, 2) + '9' + resto.slice(2);
      set.add(com9);
      set.add('55' + com9);
    }
  }
  const saida = [];
  for (const v of set) {
    saida.push(v);
    if (v.length === 12 || v.length === 13) {
      saida.push('+' + v);
    }
    // Máscaras usadas nos cadastros antigos: (51)998330123, (51) 99833-0123...
    if (v.length === 10 || v.length === 11) {
      const ddd = v.slice(0, 2);
      const num = v.slice(2);
      const pre = num.slice(0, num.length - 4);
      const suf = num.slice(-4);
      saida.push(
        '(' + ddd + ')' + num,
        '(' + ddd + ') ' + num,
        '(' + ddd + ')' + pre + '-' + suf,
        '(' + ddd + ') ' + pre + '-' + suf
      );
    }
  }
  return Array.from(new Set(saida));
}

// ---------------------------------------------------------------- CPF

export function normalizarCpf(bruto) {
  if (!bruto) return null;
  const d = String(bruto).replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

export function validarCpf(bruto) {
  const cpf = normalizarCpf(bruto);
  if (!cpf) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

export function mascararCpf(texto) {
  if (!texto) return texto;
  return String(texto).replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '***.***.***-**');
}

// ---------------------------------------------------------------- data e hora

const FUSO = 'America/Sao_Paulo';

export function validarData(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return false;
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function validarHora(hora) {
  return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(String(hora || ''));
}

export function hojeLocal() {
  return new Date().toLocaleDateString('en-CA', { timeZone: FUSO });
}

export function minutosAgoraLocal() {
  const t = new Date().toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function horaParaMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + m;
}

export function minutosParaHora(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function normalizarTexto(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- hashes e tokens

export function gerarToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(valor) {
  const dados = new TextEncoder().encode(String(valor));
  const hash = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- autorização

// Aceita token interno (GLORIA_INTERNAL_TOKEN) ou usuário admin autenticado.
export async function autorizarInternoOuAdmin(base44, tokenRecebido, tokenInterno) {
  if (tokenRecebido && tokenInterno && tokenRecebido === tokenInterno) {
    return ok({ tipo: 'interno' });
  }
  let user = null;
  try {
    user = await base44.auth.me();
  } catch (_e) {
    user = null;
  }
  if (user && user.role === 'admin') return ok({ tipo: 'admin', user });
  return erroSeguro('NAO_AUTORIZADO', 'Acesso restrito.');
}

// ---------------------------------------------------------------- contatos e pacientes

export async function buscarContatoPorTelefone(sr, telefone) {
  const canonico = normalizarTelefone(telefone);
  if (!canonico) return null;
  const porCanonico = await sr.entities.Contato.filter({ telefone_normalizado: canonico });
  if (porCanonico.length > 0) return porCanonico[0];
  for (const v of variantesTelefone(canonico)) {
    const achados = await sr.entities.Contato.filter({ telefone: v });
    if (achados.length > 0) return achados[0];
  }
  return null;
}

export async function garantirContato(sr, telefone, nome) {
  const canonico = normalizarTelefone(telefone);
  if (!canonico) return erroSeguro('TELEFONE_INVALIDO', 'Telefone inválido.');
  const existente = await buscarContatoPorTelefone(sr, canonico);
  if (existente) {
    if (existente.telefone_normalizado !== canonico) {
      await sr.entities.Contato.update(existente.id, { telefone_normalizado: canonico });
    }
    return ok({ contato: { ...existente, telefone_normalizado: canonico } });
  }
  const criado = await sr.entities.Contato.create({
    telefone: canonico,
    telefone_normalizado: canonico,
    nome: nome || '',
    origem: 'WhatsApp',
    status: 'Novo',
    // Primeiro atendimento é sempre humano: a Glória só entra quando o
    // atendente desativa o modo manual no painel.
    atendimento_humano: true,
    gloria_estado: 'OCIOSO',
    ultima_interacao: new Date().toISOString()
  });
  return ok({ contato: criado });
}

// Acrescenta ao histórico sem duplicar (dedupe por messageId).
export async function acrescentarHistorico(sr, contato, mensagem) {
  const historico = Array.isArray(contato.historico_mensagens) ? contato.historico_mensagens.slice() : [];
  if (mensagem.messageId && historico.some((m) => m.messageId === mensagem.messageId)) {
    return ok({ duplicado: true, historico });
  }
  historico.push({
    role: mensagem.role,
    content: mensagem.content || '',
    timestamp: mensagem.timestamp || new Date().toISOString(),
    humano: !!mensagem.humano,
    messageId: mensagem.messageId || '',
    mediaType: mensagem.mediaType || '',
    mediaUrl: mensagem.mediaUrl || ''
  });
  const atualizacao = {
    historico_mensagens: historico.slice(-200),
    ultima_interacao: new Date().toISOString(),
    total_mensagens: (contato.total_mensagens || 0) + 1
  };
  if (mensagem.role === 'user') {
    atualizacao.ultima_mensagem = mensagem.content || '';
    atualizacao.gloria_ultima_mensagem_id = mensagem.messageId || null;
  } else {
    atualizacao.ultima_resposta = mensagem.content || '';
  }
  await sr.entities.Contato.update(contato.id, atualizacao);
  return ok({ duplicado: false, historico });
}

export async function buscarPacientesPorTelefone(sr, telefone) {
  const canonico = normalizarTelefone(telefone);
  if (!canonico) return [];
  const encontrados = new Map();
  for (const v of variantesTelefone(canonico)) {
    for (const campo of ['telefone', 'telefone_secundario']) {
      const achados = await sr.entities.Paciente.filter({ [campo]: v });
      for (const p of achados) encontrados.set(p.id, p);
    }
  }
  return Array.from(encontrados.values());
}

export async function buscarPacientePorCpf(sr, cpf) {
  const normalizado = normalizarCpf(cpf);
  if (!normalizado || !validarCpf(normalizado)) return null;
  const formatado = normalizado.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  for (const v of [normalizado, formatado]) {
    const achados = await sr.entities.Paciente.filter({ cpf: v });
    if (achados.length > 0) return achados[0];
  }
  return null;
}

export function nomeCompletoValido(nome) {
  const limpo = String(nome || '').trim();
  if (limpo !== String(nome || '')) return false;
  if (limpo.length < 5) return false;
  const partes = limpo.split(/\s+/);
  if (partes.length < 2) return false;
  return partes.every((p) => p.length >= 2 && p[0] === p[0].toUpperCase() && /^[^\d]+$/.test(p));
}

// Só cria paciente com nome completo e CPF válido; nunca mescla duplicados.
export async function criarPacienteSeguro(sr, { nome, cpf, telefone }) {
  if (!nomeCompletoValido(nome)) {
    return erroSeguro('NOME_INVALIDO', 'Nome completo obrigatório, sem espaços extras e com iniciais maiúsculas.');
  }
  if (!validarCpf(cpf)) return erroSeguro('CPF_INVALIDO', 'CPF inválido.');
  const canonico = normalizarTelefone(telefone);
  if (!canonico) return erroSeguro('TELEFONE_INVALIDO', 'Telefone inválido.');
  const jaExiste = await buscarPacientePorCpf(sr, cpf);
  if (jaExiste) return ok({ paciente: jaExiste, criado: false });
  const paciente = await sr.entities.Paciente.create({
    nome: String(nome).trim(),
    cpf: normalizarCpf(cpf),
    telefone: canonico
  });
  return ok({ paciente, criado: true });
}

// ---------------------------------------------------------------- médicos e agenda compartilhada

export async function listarMedicosAtivos(sr) {
  const todos = await sr.entities.Medico.filter({ status: 'Ativo' });
  return todos;
}

// Agenda compartilhada SOMENTE por agenda_compartilhada_id. Nunca por nome.
export async function idsDaAgenda(sr, medico) {
  if (!medico) return [];
  const chave = medico.agenda_compartilhada_id;
  if (!chave) return [medico.id];
  const mesmos = await sr.entities.Medico.filter({ agenda_compartilhada_id: chave });
  const ids = mesmos.map((m) => m.id);
  if (!ids.includes(medico.id)) ids.push(medico.id);
  return ids;
}

function semanaDoMes(dataUtc) {
  const dia = dataUtc.getUTCDate();
  const primeiroDiaSemana = new Date(Date.UTC(dataUtc.getUTCFullYear(), dataUtc.getUTCMonth(), 1)).getUTCDay();
  return Math.ceil((dia + primeiroDiaSemana) / 7);
}

export function checarRecorrencia(recorrencia, dataUtc) {
  if (!recorrencia || recorrencia === 'Toda Semana') return true;
  if (recorrencia === 'Apenas uma vez') return false;
  const semana = semanaDoMes(dataUtc);
  switch (recorrencia) {
    case '1ª e 3ª Semana do Mês': return semana === 1 || semana === 3;
    case '2ª e 4ª Semana do Mês': return semana === 2 || semana === 4;
    case 'Apenas 1ª Semana do Mês': return semana === 1;
    case 'Apenas 2ª Semana do Mês': return semana === 2;
    case 'Apenas 3ª Semana do Mês': return semana === 3;
    case 'Apenas 4ª Semana do Mês': return semana === 4;
    default: return true;
  }
}

// Períodos de atendimento válidos para a data, respeitando exceções e bloqueios.
export function periodosDoDia(medico, data) {
  const horarios = medico.horarios_atendimento || [];
  const [a, m, d] = data.split('-').map(Number);
  const dataUtc = new Date(Date.UTC(a, m - 1, d));
  const diaSemana = dataUtc.getUTCDay();

  const daData = horarios.filter((h) => h.data_especifica === data);
  if (daData.some((h) => h.bloqueado === true)) {
    return { bloqueado: true, periodos: [] };
  }
  if (daData.length > 0) {
    return { bloqueado: false, periodos: daData.filter((h) => !h.bloqueado) };
  }
  const recorrentes = horarios.filter((h) =>
    Math.floor(h.dia_semana) === diaSemana &&
    !h.data_especifica &&
    !h.bloqueado &&
    checarRecorrencia(h.recorrencia, dataUtc)
  );
  if (recorrentes.length > 0) return { bloqueado: false, periodos: recorrentes };

  const recorrentesComData = horarios.filter((h) =>
    h.data_especifica &&
    !h.bloqueado &&
    Math.floor(h.dia_semana) === diaSemana &&
    h.recorrencia && h.recorrencia !== 'Apenas uma vez' &&
    checarRecorrencia(h.recorrencia, dataUtc)
  );
  if (recorrentesComData.length > 0) {
    recorrentesComData.sort((x, y) => (y.data_especifica || '').localeCompare(x.data_especifica || ''));
    return { bloqueado: false, periodos: [recorrentesComData[0]] };
  }
  return { bloqueado: false, periodos: [] };
}

async function agendamentosDaAgenda(sr, idsAgenda, data) {
  let lista = [];
  for (const id of idsAgenda) {
    const achados = await sr.entities.Agendamento.filter({
      medico_id: id,
      data_agendamento: data,
      status: { $ne: 'Cancelado' }
    });
    lista = lista.concat(achados);
  }
  return lista;
}

function intervalosOcupados(agendamentos, duracaoPadrao) {
  return agendamentos
    .filter((ag) => validarHora(ag.horario))
    .map((ag) => {
      const inicio = horaParaMinutos(ag.horario);
      const dur = Number(ag.duracao_minutos) > 0 ? Number(ag.duracao_minutos) : duracaoPadrao;
      return { inicio, fim: inicio + dur };
    });
}

export function haSobreposicao(intervalos, inicio, fim) {
  return intervalos.some((iv) => inicio < iv.fim && fim > iv.inicio);
}

// Disponibilidade sempre calculada com dados atuais.
export async function getAvailableSlotsCore(sr, { medico_id, data, duracao_minutos }) {
  if (!medico_id) return erroSeguro('MEDICO_OBRIGATORIO', 'medico_id é obrigatório.');
  if (!validarData(data)) return erroSeguro('DATA_INVALIDA', 'Formato de data inválido. Use YYYY-MM-DD.');

  const medico = await sr.entities.Medico.get(String(medico_id).replace(/[{}]/g, ''));
  if (!medico) return erroSeguro('MEDICO_NAO_ENCONTRADO', 'Médico não encontrado.');
  if (medico.status !== 'Ativo') {
    return ok({ available_slots: [], message: 'Médico não está disponível.', medico_info: { nome: medico.nome, status: medico.status } });
  }

  const { bloqueado, periodos } = periodosDoDia(medico, data);
  if (bloqueado) {
    return ok({ available_slots: [], bloqueado: true, message: 'Clínica fechada nesta data (feriado/bloqueio).' });
  }
  if (periodos.length === 0) {
    return ok({ available_slots: [], message: 'Médico não atende neste dia.' });
  }

  const idsAgenda = await idsDaAgenda(sr, medico);
  const agendamentos = await agendamentosDaAgenda(sr, idsAgenda, data);
  const duracaoPadrao = Number(medico.tempo_consulta_minutos) > 0 ? Number(medico.tempo_consulta_minutos) : 30;
  const ehHoje = data === hojeLocal();
  const agora = minutosAgoraLocal();
  const tipo = medico.tipo_atendimento || 'Horários Marcados';

  if (tipo === 'Ordem de Chegada') {
    const limite = Number(medico.limite_ordem_chegada) > 0 ? Number(medico.limite_ordem_chegada) : 1;
    const inicio = periodos[0].horario_inicio;
    const ocupadas = agendamentos.filter((ag) => ag.horario === inicio).length;
    const passou = ehHoje && horaParaMinutos(inicio) <= agora;
    const slots = (ocupadas < limite && !passou) ? [inicio] : [];
    return ok({
      available_slots: slots,
      vagas_restantes: Math.max(0, limite - ocupadas),
      medico_info: { nome: medico.nome, especialidade: medico.especialidade, tipo_atendimento: tipo, tempo_consulta: duracaoPadrao }
    });
  }

  const ocupados = intervalosOcupados(agendamentos, duracaoPadrao);
  const slots = [];
  for (const periodo of periodos) {
    if (!validarHora(periodo.horario_inicio) || !validarHora(periodo.horario_fim)) continue;
    const passo = Number(periodo.tempo_consulta) > 0 ? Number(periodo.tempo_consulta) : duracaoPadrao;
    const duracao = Number(duracao_minutos) > 0 ? Number(duracao_minutos) : passo;
    const inicioMin = horaParaMinutos(periodo.horario_inicio);
    const fimMin = horaParaMinutos(periodo.horario_fim);
    for (let min = inicioMin; min + duracao <= fimMin; min += passo) {
      if (ehHoje && min <= agora) continue;
      if (haSobreposicao(ocupados, min, min + duracao)) continue;
      const hora = minutosParaHora(min);
      if (!slots.includes(hora)) slots.push(hora);
    }
  }

  return ok({
    available_slots: slots.sort(),
    medico_info: { nome: medico.nome, especialidade: medico.especialidade, tipo_atendimento: tipo, tempo_consulta: duracaoPadrao }
  });
}

// Próximos horários livres a partir de hoje (limite de dias e de sugestões).
export async function proximosHorariosCore(sr, { medico_id, dias = 21, maximo = 6, duracao_minutos }) {
  const sugestoes = [];
  const base = hojeLocal();
  const [a, m, d] = base.split('-').map(Number);
  for (let i = 0; i < dias && sugestoes.length < maximo; i++) {
    const dt = new Date(Date.UTC(a, m - 1, d + i));
    const data = dt.toISOString().slice(0, 10);
    const res = await getAvailableSlotsCore(sr, { medico_id, data, duracao_minutos });
    if (res.ok && Array.isArray(res.available_slots)) {
      for (const hora of res.available_slots) {
        if (sugestoes.length >= maximo) break;
        sugestoes.push({ data, hora });
      }
    }
  }
  return ok({ sugestoes });
}

// ---------------------------------------------------------------- operações e locks

const LOCK_MINUTOS = 2;

export function chaveSlot(idsAgenda, data, hora, assento = 1) {
  return idsAgenda.slice().sort().join('|') + '@' + data + 'T' + hora + '#' + assento;
}

export async function adquirirLockSlot(sr, slot_chave, contexto = {}) {
  const agora = Date.now();
  const existentes = await sr.entities.GloriaOperacao.filter({ tipo: 'LOCK_SLOT', slot_chave });
  for (const op of existentes) {
    const ativo = op.status === 'Iniciada' && op.lock_expira_em && new Date(op.lock_expira_em).getTime() > agora;
    if (ativo) return erroSeguro('SLOT_EM_USO', 'Este horário está sendo reservado neste momento.');
  }
  const token = gerarToken(16);
  const lock = await sr.entities.GloriaOperacao.create({
    chave_idempotencia: 'LOCK:' + slot_chave + ':' + token,
    tipo: 'LOCK_SLOT',
    status: 'Iniciada',
    lock_token: token,
    lock_expira_em: new Date(agora + LOCK_MINUTOS * 60000).toISOString(),
    slot_chave,
    data: contexto.data || null,
    hora: contexto.hora || null,
    medico_id: contexto.medico_id || null,
    telefone_canonico: contexto.telefone_canonico || null
  });
  // Reconciliação: se outro lock foi criado em paralelo, o mais antigo vence.
  const todos = await sr.entities.GloriaOperacao.filter({ tipo: 'LOCK_SLOT', slot_chave });
  const ativos = todos.filter((op) => op.status === 'Iniciada' && op.lock_expira_em && new Date(op.lock_expira_em).getTime() > agora);
  ativos.sort((x, y) => String(x.created_date).localeCompare(String(y.created_date)));
  if (ativos.length > 1 && ativos[0].id !== lock.id) {
    await sr.entities.GloriaOperacao.update(lock.id, { status: 'Revertida' });
    return erroSeguro('SLOT_EM_USO', 'Este horário está sendo reservado neste momento.');
  }
  return ok({ lock });
}

export async function liberarLock(sr, lock, status = 'Concluida') {
  if (!lock) return;
  await sr.entities.GloriaOperacao.update(lock.id, { status, lock_expira_em: new Date().toISOString() });
}

export async function operacaoPorChave(sr, chave_idempotencia) {
  const achados = await sr.entities.GloriaOperacao.filter({ chave_idempotencia });
  return achados.length > 0 ? achados[0] : null;
}

// ---------------------------------------------------------------- agendar / cancelar / remarcar / confirmar

// Reserva idempotente: revalida a disponibilidade imediatamente antes de gravar.
export async function createAppointmentCore(sr, entrada) {
  const {
    chave_idempotencia, medico_id, data, hora, paciente_id, paciente_nome,
    tipo_servico = 'Consulta', categoria_preco_id, duracao_minutos, valor_total, valor_final,
    procedimento_id, observacoes, agendado_por = 'Glória', agendado_por_tipo = 'chatbot', telefone_canonico
  } = entrada || {};

  if (!chave_idempotencia) return erroSeguro('CHAVE_OBRIGATORIA', 'chave_idempotencia é obrigatória.');
  const jaFeita = await operacaoPorChave(sr, chave_idempotencia);
  if (jaFeita && jaFeita.status === 'Concluida' && jaFeita.agendamento_id) {
    const existente = await sr.entities.Agendamento.get(jaFeita.agendamento_id);
    return ok({ agendamento: existente, idempotente: true });
  }
  if (!validarData(data)) return erroSeguro('DATA_INVALIDA', 'Data inválida.');
  if (!validarHora(hora)) return erroSeguro('HORA_INVALIDA', 'Horário inválido.');
  if (!paciente_id) return erroSeguro('PACIENTE_OBRIGATORIO', 'Paciente não identificado.');

  const medico = medico_id ? await sr.entities.Medico.get(medico_id) : null;
  if (medico_id && !medico) return erroSeguro('MEDICO_NAO_ENCONTRADO', 'Médico não encontrado.');
  const paciente = await sr.entities.Paciente.get(paciente_id);
  if (!paciente) return erroSeguro('PACIENTE_NAO_ENCONTRADO', 'Paciente não encontrado.');

  const idsAgenda = medico ? await idsDaAgenda(sr, medico) : [];
  const duracaoPadrao = medico && Number(medico.tempo_consulta_minutos) > 0 ? Number(medico.tempo_consulta_minutos) : 30;
  const duracao = Number(duracao_minutos) > 0 ? Number(duracao_minutos) : duracaoPadrao;
  const slot_chave = chaveSlot(idsAgenda.length ? idsAgenda : ['sem-medico'], data, hora);

  const operacao = await sr.entities.GloriaOperacao.create({
    chave_idempotencia,
    tipo: 'AGENDAR',
    status: 'Iniciada',
    telefone_canonico: telefone_canonico || null,
    paciente_id,
    medico_id: medico_id || null,
    data,
    hora,
    slot_chave,
    entrada: { tipo_servico, duracao_minutos: duracao }
  });

  const travado = await adquirirLockSlot(sr, slot_chave, { data, hora, medico_id, telefone_canonico });
  if (!travado.ok) {
    await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Falha', erro: travado.codigo });
    return travado;
  }

  try {
    // Revalidação obrigatória com dados atuais antes de gravar.
    if (medico) {
      const disp = await getAvailableSlotsCore(sr, { medico_id, data, duracao_minutos: duracao });
      if (!disp.ok) {
        await liberarLock(sr, travado.lock, 'Falha');
        await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Falha', erro: disp.codigo });
        return disp;
      }
      if (!disp.available_slots.includes(hora)) {
        await liberarLock(sr, travado.lock, 'Concluida');
        await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Falha', erro: 'HORARIO_INDISPONIVEL' });
        return erroSeguro('HORARIO_INDISPONIVEL', 'Este horário não está mais disponível.');
      }
    }

    const agendamento = await sr.entities.Agendamento.create({
      paciente_id,
      paciente_nome: paciente_nome || paciente.nome,
      medico_id: medico_id || undefined,
      data_agendamento: data,
      horario: hora,
      tipo_servico,
      duracao_minutos: duracao,
      procedimento_id: procedimento_id || undefined,
      categoria_preco_id: categoria_preco_id || undefined,
      valor_total: typeof valor_total === 'number' ? valor_total : undefined,
      valor_final: typeof valor_final === 'number' ? valor_final : undefined,
      status: 'Agendado',
      observacoes: observacoes || undefined,
      agendado_por,
      agendado_por_tipo
    });

    // Reconciliação de concorrência: se surgiu conflito de intervalo, desfaz o mais novo.
    if (medico) {
      const doDia = await agendamentosDaAgenda(sr, idsAgenda, data);
      const inicio = horaParaMinutos(hora);
      const fim = inicio + duracao;
      const conflitos = doDia.filter((ag) => {
        if (ag.id === agendamento.id) return false;
        if (!validarHora(ag.horario)) return false;
        const i = horaParaMinutos(ag.horario);
        const f = i + (Number(ag.duracao_minutos) > 0 ? Number(ag.duracao_minutos) : duracaoPadrao);
        return inicio < f && fim > i;
      });
      const ehOrdemChegada = (medico.tipo_atendimento || 'Horários Marcados') === 'Ordem de Chegada';
      if (conflitos.length > 0 && !ehOrdemChegada) {
        const maisAntigo = conflitos
          .concat([agendamento])
          .sort((x, y) => String(x.created_date).localeCompare(String(y.created_date)))[0];
        if (maisAntigo.id === agendamento.id) {
          // este é o mais antigo: mantém
        } else {
          await sr.entities.Agendamento.update(agendamento.id, { status: 'Cancelado', observacoes: 'Cancelado automaticamente por conflito de horário.' });
          await liberarLock(sr, travado.lock, 'Concluida');
          await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Falha', erro: 'HORARIO_INDISPONIVEL' });
          return erroSeguro('HORARIO_INDISPONIVEL', 'Este horário acabou de ser ocupado.');
        }
      }
    }

    await liberarLock(sr, travado.lock, 'Concluida');
    await sr.entities.GloriaOperacao.update(operacao.id, {
      status: 'Concluida',
      agendamento_id: agendamento.id,
      resultado: { agendamento_id: agendamento.id, data, hora }
    });

    // Notificação visual/sonora no sistema (painel) para agendamentos da Glória.
    const [ano, mes, dia] = String(data).split('-');
    await sr.entities.Notification.create({
      type: 'novo_agendamento',
      message: (paciente_nome || paciente.nome) + ' — ' + (medico ? medico.nome + ' — ' : '') +
        dia + '/' + mes + '/' + ano + ' às ' + hora,
      data: {
        agendamento_id: agendamento.id,
        agendado_por,
        agendado_por_tipo,
        paciente_nome: paciente_nome || paciente.nome,
        medico_nome: medico ? medico.nome : null,
        data_agendamento: data,
        horario: hora
      },
      is_read: false
    }).catch(() => {});

    return ok({ agendamento, idempotente: false });
  } catch (erro) {
    await liberarLock(sr, travado.lock, 'Falha');
    await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Falha', erro: 'ERRO_AO_GRAVAR' });
    return erroSeguro('ERRO_AO_GRAVAR', 'Não foi possível concluir a reserva.');
  }
}

export async function cancelAppointmentCore(sr, { chave_idempotencia, agendamento_id, paciente_id, telefone_canonico, motivo }) {
  if (!chave_idempotencia) return erroSeguro('CHAVE_OBRIGATORIA', 'chave_idempotencia é obrigatória.');
  const jaFeita = await operacaoPorChave(sr, chave_idempotencia);
  if (jaFeita && jaFeita.status === 'Concluida') {
    return ok({ agendamento_id: jaFeita.agendamento_id, idempotente: true });
  }
  const agendamento = await sr.entities.Agendamento.get(agendamento_id);
  if (!agendamento) return erroSeguro('AGENDAMENTO_NAO_ENCONTRADO', 'Agendamento não encontrado.');
  if (paciente_id && agendamento.paciente_id !== paciente_id) {
    return erroSeguro('NAO_AUTORIZADO', 'Agendamento não pertence a este paciente.');
  }
  if (agendamento.status === 'Cancelado') {
    return ok({ agendamento_id: agendamento.id, idempotente: true });
  }
  const operacao = await sr.entities.GloriaOperacao.create({
    chave_idempotencia, tipo: 'CANCELAR', status: 'Iniciada',
    telefone_canonico: telefone_canonico || null, paciente_id: agendamento.paciente_id,
    medico_id: agendamento.medico_id || null, agendamento_id: agendamento.id,
    data: agendamento.data_agendamento, hora: agendamento.horario
  });
  await sr.entities.Agendamento.update(agendamento.id, {
    status: 'Cancelado',
    observacoes: motivo ? String(motivo).slice(0, 300) : agendamento.observacoes
  });
  await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Concluida', resultado: { agendamento_id: agendamento.id } });
  return ok({ agendamento_id: agendamento.id, idempotente: false });
}

// Remarcação: cria e valida a nova consulta primeiro; só então cancela a antiga.
// Se a nova falhar, a antiga permanece ativa (rollback obrigatório).
export async function rescheduleAppointmentCore(sr, { chave_idempotencia, agendamento_id, nova_data, nova_hora, telefone_canonico, paciente_id }) {
  if (!chave_idempotencia) return erroSeguro('CHAVE_OBRIGATORIA', 'chave_idempotencia é obrigatória.');
  const jaFeita = await operacaoPorChave(sr, chave_idempotencia);
  if (jaFeita && jaFeita.status === 'Concluida' && jaFeita.agendamento_id) {
    const nova = await sr.entities.Agendamento.get(jaFeita.agendamento_id);
    return ok({ agendamento: nova, idempotente: true });
  }
  const antigo = await sr.entities.Agendamento.get(agendamento_id);
  if (!antigo) return erroSeguro('AGENDAMENTO_NAO_ENCONTRADO', 'Agendamento não encontrado.');
  if (paciente_id && antigo.paciente_id !== paciente_id) {
    return erroSeguro('NAO_AUTORIZADO', 'Agendamento não pertence a este paciente.');
  }
  if (antigo.status === 'Cancelado') return erroSeguro('AGENDAMENTO_CANCELADO', 'Este agendamento já está cancelado.');

  const operacao = await sr.entities.GloriaOperacao.create({
    chave_idempotencia, tipo: 'REMARCAR', status: 'Iniciada',
    telefone_canonico: telefone_canonico || null, paciente_id: antigo.paciente_id,
    medico_id: antigo.medico_id || null, agendamento_anterior_id: antigo.id,
    data: nova_data, hora: nova_hora
  });

  const criacao = await createAppointmentCore(sr, {
    chave_idempotencia: chave_idempotencia + ':NOVO',
    medico_id: antigo.medico_id,
    data: nova_data,
    hora: nova_hora,
    paciente_id: antigo.paciente_id,
    paciente_nome: antigo.paciente_nome,
    tipo_servico: antigo.tipo_servico,
    duracao_minutos: antigo.duracao_minutos,
    categoria_preco_id: antigo.categoria_preco_id,
    procedimento_id: antigo.procedimento_id,
    valor_total: antigo.valor_total,
    valor_final: antigo.valor_final,
    telefone_canonico
  });
  if (!criacao.ok) {
    // Rollback: a consulta antiga continua ativa.
    await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Revertida', erro: criacao.codigo });
    return criacao;
  }

  const cancelamento = await cancelAppointmentCore(sr, {
    chave_idempotencia: chave_idempotencia + ':ANTIGO',
    agendamento_id: antigo.id,
    telefone_canonico,
    motivo: 'Remarcado para ' + nova_data + ' ' + nova_hora
  });
  if (!cancelamento.ok) {
    await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Falha', erro: cancelamento.codigo });
    return erroSeguro('REMARCACAO_PARCIAL', 'Nova consulta criada, mas a anterior não pôde ser cancelada. A recepção vai revisar.');
  }
  await sr.entities.GloriaOperacao.update(operacao.id, {
    status: 'Concluida',
    agendamento_id: criacao.agendamento.id,
    resultado: { novo_id: criacao.agendamento.id, antigo_id: antigo.id }
  });
  return ok({ agendamento: criacao.agendamento, antigo_id: antigo.id, idempotente: false });
}

export async function confirmAppointmentCore(sr, { chave_idempotencia, agendamento_id, paciente_id }) {
  const agendamento = await sr.entities.Agendamento.get(agendamento_id);
  if (!agendamento) return erroSeguro('AGENDAMENTO_NAO_ENCONTRADO', 'Agendamento não encontrado.');
  if (paciente_id && agendamento.paciente_id !== paciente_id) {
    return erroSeguro('NAO_AUTORIZADO', 'Agendamento não pertence a este paciente.');
  }
  if (agendamento.status === 'Cancelado') return erroSeguro('AGENDAMENTO_CANCELADO', 'Este agendamento está cancelado.');
  if (agendamento.status === 'Confirmado') return ok({ agendamento, idempotente: true });

  const chave = chave_idempotencia || 'CONFIRMAR:' + agendamento.id;
  const jaFeita = await operacaoPorChave(sr, chave);
  if (jaFeita && jaFeita.status === 'Concluida') return ok({ agendamento, idempotente: true });

  const operacao = await sr.entities.GloriaOperacao.create({
    chave_idempotencia: chave, tipo: 'CONFIRMAR', status: 'Iniciada',
    paciente_id: agendamento.paciente_id, agendamento_id: agendamento.id,
    data: agendamento.data_agendamento, hora: agendamento.horario
  });
  await sr.entities.Agendamento.update(agendamento.id, { status: 'Confirmado' });
  await sr.entities.GloriaOperacao.update(operacao.id, { status: 'Concluida' });
  const atualizado = await sr.entities.Agendamento.get(agendamento.id);
  return ok({ agendamento: atualizado, idempotente: false });
}

// ---------------------------------------------------------------- preços e orçamento

// Exatamente uma categoria ativa normalizada como "Particular"; se houver mais
// de uma, não escolhe arbitrariamente.
export async function categoriaParticular(sr) {
  const ativas = await sr.entities.CategoriaPreco.filter({ status: 'Ativo' });
  const particulares = ativas.filter((c) => normalizarTexto(c.nome) === 'particular');
  if (particulares.length === 1) return ok({ categoria: particulares[0] });
  return erroSeguro('CATEGORIA_AMBIGUA', 'Não foi possível determinar a tabela particular. Encaminhar para a recepção.');
}

async function precoDoProcedimento(sr, procedimento_id, categoria_id) {
  const tabelas = await sr.entities.TabelaPreco.filter({ procedimento_id, categoria_id });
  const validas = tabelas.filter((t) => typeof t.valor === 'number' && t.valor > 0);
  if (validas.length !== 1) return null;
  return validas[0].valor;
}

// Relação determinística entre consulta e médico/especialidade.
export async function precoConsultaCore(sr, { medico_id, especialidade }) {
  const cat = await categoriaParticular(sr);
  if (!cat.ok) return cat;
  let esp = especialidade;
  if (!esp && medico_id) {
    const medico = await sr.entities.Medico.get(medico_id);
    if (!medico) return erroSeguro('MEDICO_NAO_ENCONTRADO', 'Médico não encontrado.');
    esp = medico.especialidade || (medico.especialidades || [])[0];
  }
  if (!esp) return erroSeguro('ESPECIALIDADE_INDEFINIDA', 'Especialidade não identificada.');

  // Regra determinística: procedimento ativo de consulta cuja especialidade
  // cadastrada é exatamente a do médico. Se houver 0 ou mais de 1, não escolhe.
  const ativos = await sr.entities.Procedimento.filter({ status: 'Ativo' });
  const espNorm = normalizarTexto(esp);
  const candidatos = ativos.filter((p) =>
    normalizarTexto(p.especialidade) === espNorm &&
    normalizarTexto(p.nome).startsWith('consulta')
  );
  if (candidatos.length !== 1) {
    return erroSeguro('PRECO_INDETERMINADO', 'Valor não pôde ser determinado. Consultar na recepção.');
  }
  const valor = await precoDoProcedimento(sr, candidatos[0].id, cat.categoria.id);
  if (valor === null) return erroSeguro('PRECO_INDETERMINADO', 'Valor não cadastrado. Consultar na recepção.');
  return ok({ procedimento: { id: candidatos[0].id, nome: candidatos[0].nome }, valor, categoria_id: cat.categoria.id });
}

// Orçamento exato: soma somente itens encontrados com preço válido.
export async function orcamentoCore(sr, { itens }) {
  const cat = await categoriaParticular(sr);
  if (!cat.ok) return cat;
  const lista = Array.isArray(itens) ? itens : [];
  const ativos = await sr.entities.Procedimento.filter({ status: 'Ativo' });
  const exames = await sr.entities.Exame.filter({ status: 'Ativo' });
  const encontrados = [];
  const desconhecidos = [];

  for (const bruto of lista) {
    const alvo = normalizarTexto(bruto);
    if (!alvo) continue;
    const procs = ativos.filter((p) => normalizarTexto(p.nome) === alvo);
    if (procs.length === 1) {
      const valor = await precoDoProcedimento(sr, procs[0].id, cat.categoria.id);
      if (valor !== null) {
        encontrados.push({ nome: procs[0].nome, valor });
        continue;
      }
      desconhecidos.push(bruto);
      continue;
    }
    const ex = exames.filter((e) => normalizarTexto(e.nome) === alvo);
    if (ex.length === 1 && typeof ex[0].valor_particular === 'number' && ex[0].valor_particular > 0) {
      encontrados.push({ nome: ex[0].nome, valor: ex[0].valor_particular });
      continue;
    }
    desconhecidos.push(bruto);
  }

  const total = encontrados.reduce((soma, i) => soma + i.valor, 0);
  return ok({ itens: encontrados, desconhecidos, total, categoria_id: cat.categoria.id });
}