import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const TIME_ZONE = 'America/Sao_Paulo';
const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const STOPWORDS = new Set(['dr', 'dra', 'de', 'da', 'do', 'dos', 'das']);

const normalizeText = (value = '') => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const formatIsoInTz = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(date);

const getWeekOfMonth = (date) => {
  const adjustedDayOfMonth = date.getUTCDate();
  const dayOfWeekOfFirstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).getUTCDay();
  return Math.ceil((adjustedDayOfMonth + dayOfWeekOfFirstDay) / 7);
};

const checkRecorrencia = (recorrencia, date) => {
  if (!recorrencia || recorrencia === 'Toda Semana') return true;
  if (recorrencia === 'Apenas uma vez') return false;

  const weekOfMonth = getWeekOfMonth(date);
  switch (recorrencia) {
    case '1ª e 3ª Semana do Mês':
      return weekOfMonth === 1 || weekOfMonth === 3;
    case '2ª e 4ª Semana do Mês':
      return weekOfMonth === 2 || weekOfMonth === 4;
    case 'Apenas 1ª Semana do Mês':
      return weekOfMonth === 1;
    case 'Apenas 2ª Semana do Mês':
      return weekOfMonth === 2;
    case 'Apenas 3ª Semana do Mês':
      return weekOfMonth === 3;
    case 'Apenas 4ª Semana do Mês':
      return weekOfMonth === 4;
    default:
      return true;
  }
};

const resolveDateFromQuery = (queryText = '', explicitDate = null) => {
  if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return { date: explicitDate, reference_label: explicitDate };
  }

  const normalized = normalizeText(queryText);
  const todayIso = formatIsoInTz(new Date());
  const [baseYear, baseMonth, baseDay] = todayIso.split('-').map(Number);
  const baseDate = new Date(Date.UTC(baseYear, baseMonth - 1, baseDay));

  if (normalized.includes('amanha')) {
    const nextDate = new Date(baseDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    return { date: formatIsoInTz(nextDate), reference_label: 'amanhã' };
  }

  if (normalized.includes('hoje')) {
    return { date: todayIso, reference_label: 'hoje' };
  }

  const explicitDayMonth = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (explicitDayMonth) {
    const day = Number(explicitDayMonth[1]);
    const month = Number(explicitDayMonth[2]);
    const year = explicitDayMonth[3] ? Number(explicitDayMonth[3]) : baseYear;
    return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      reference_label: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
    };
  }

  const weekdayIndex = WEEKDAYS.findIndex((weekday) => normalized.includes(weekday));
  if (weekdayIndex >= 0) {
    const currentWeekday = baseDate.getUTCDay();
    let diff = weekdayIndex - currentWeekday;
    if (diff < 0) diff += 7;
    const targetDate = new Date(baseDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + diff);
    return { date: formatIsoInTz(targetDate), reference_label: WEEKDAYS[weekdayIndex] };
  }

  return { date: todayIso, reference_label: 'hoje' };
};

const getSchedulesForDate = (medico, cleanDate) => {
  const horariosAtendimento = medico.horarios_atendimento || [];
  const [year, month, day] = cleanDate.split('-').map(Number);
  const dataObj = new Date(Date.UTC(year, month - 1, day));
  const diaSemana = dataObj.getUTCDay();

  const horariosDataEspecifica = horariosAtendimento.filter((horario) => horario.data_especifica === cleanDate);
  const dataBloqueada = horariosDataEspecifica.some((horario) => horario.bloqueado === true);
  if (dataBloqueada) return [];

  if (horariosDataEspecifica.length > 0) {
    return horariosDataEspecifica.filter((horario) => !horario.bloqueado);
  }

  const horariosRecorrentes = horariosAtendimento.filter((horario) =>
    Math.floor(horario.dia_semana) === diaSemana &&
    !horario.data_especifica &&
    !horario.bloqueado &&
    checkRecorrencia(horario.recorrencia, dataObj)
  );

  if (horariosRecorrentes.length > 0) return horariosRecorrentes;

  const horariosRecorrentesComData = horariosAtendimento.filter((horario) =>
    horario.data_especifica &&
    !horario.bloqueado &&
    Math.floor(horario.dia_semana) === diaSemana &&
    horario.recorrencia &&
    horario.recorrencia !== 'Apenas uma vez' &&
    checkRecorrencia(horario.recorrencia, dataObj)
  );

  if (horariosRecorrentesComData.length === 0) return [];

  horariosRecorrentesComData.sort((a, b) => (b.data_especifica || '').localeCompare(a.data_especifica || ''));
  return [horariosRecorrentesComData[0]];
};

const getAvailableSlots = (medico, periods, appointments) => {
  const occupied = appointments.map((appointment) => appointment.horario);
  const tempoConsulta = medico.tempo_consulta_minutos || 30;
  const tipoAtendimento = medico.tipo_atendimento || 'Horários Marcados';

  if (tipoAtendimento === 'Ordem de Chegada') {
    const horarioInicio = periods[0]?.horario_inicio;
    const limite = medico.limite_ordem_chegada || 1;
    const ocupadas = appointments.filter((appointment) => appointment.horario === horarioInicio).length;
    return ocupadas < limite && horarioInicio ? [horarioInicio] : [];
  }

  const slots = new Set();
  for (const period of periods) {
    const [startHour, startMinute] = period.horario_inicio.split(':').map(Number);
    const [endHour, endMinute] = period.horario_fim.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;

    for (let minute = start; minute <= end - tempoConsulta; minute += tempoConsulta) {
      const slot = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      if (!occupied.includes(slot)) slots.add(slot);
    }
  }

  return Array.from(slots).sort();
};

const matchesDoctorQuery = (queryText, medico) => {
  const normalizedQuery = normalizeText(queryText);
  if (!normalizedQuery) return false;

  const nameParts = normalizeText(medico.nome)
    .split(' ')
    .filter((part) => part.length > 3 && !STOPWORDS.has(part));
  const nameMatches = nameParts.filter((part) => normalizedQuery.includes(part));
  if (nameMatches.length >= 2 || nameMatches.some((part) => part.length >= 6)) return true;

  const specialties = [medico.especialidade, ...(medico.especialidades || [])]
    .filter(Boolean)
    .map((specialty) => normalizeText(specialty));

  return specialties.some((specialty) => specialty && normalizedQuery.includes(specialty));
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { queryText = '', date = null } = await req.json();

    const { date: targetDate, reference_label } = resolveDateFromQuery(queryText, date);
    const medicos = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
    const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
      data_agendamento: targetDate,
      status: { $ne: 'Cancelado' }
    });

    const nomePorMedicoId = Object.fromEntries(medicos.map((medico) => [medico.id, normalizeText(medico.nome)]));
    const medicosFiltradosPorConsulta = medicos.filter((medico) => matchesDoctorQuery(queryText, medico));
    const medicosBase = medicosFiltradosPorConsulta.length > 0 ? medicosFiltradosPorConsulta : medicos;

    const doctors = medicosBase
      .map((medico) => {
        const periods = getSchedulesForDate(medico, targetDate);
        if (periods.length === 0) return null;

        const medicoKey = normalizeText(medico.nome);
        const relatedAppointments = agendamentos.filter((agendamento) => nomePorMedicoId[agendamento.medico_id] === medicoKey);
        const availableSlots = getAvailableSlots(medico, periods, relatedAppointments);

        return {
          medico_id: medico.id,
          nome: medico.nome,
          especialidade: medico.especialidade || null,
          agenda_do_dia: periods.map((period) => ({
            inicio: period.horario_inicio,
            fim: period.horario_fim,
            recorrencia: period.recorrencia || 'Toda Semana'
          })),
          horarios_disponiveis: availableSlots,
          total_horarios_disponiveis: availableSlots.length,
          total_agendamentos: relatedAppointments.length
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return Response.json({
      date: targetDate,
      reference_label,
      doctors
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});