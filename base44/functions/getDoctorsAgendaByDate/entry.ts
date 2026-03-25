import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const TIME_ZONE = 'America/Sao_Paulo';
const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const STOPWORDS = new Set(['dr', 'dra', 'de', 'da', 'do', 'dos', 'das', 'clinica', 'centro', 'vida', 'saude', 'exames', 'eletrocardio']);

const formatIsoUtc = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const addDaysToIso = (isoDate, days) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoUtc(date);
};

const nextWeekdayFromIso = (isoDate, targetWeekday) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const currentWeekday = date.getUTCDay();
  let diff = targetWeekday - currentWeekday;
  if (diff < 0) diff += 7;
  date.setUTCDate(date.getUTCDate() + diff);
  return formatIsoUtc(date);
};

const shouldTryDoctorNameFilter = (normalizedQuery) => {
  if (/\b(dr|dra|doutor|doutora)\b/.test(normalizedQuery)) return true;
  if (/\b(quem|quais|profissionais|medicos|clinica)\b/.test(normalizedQuery)) return false;
  return /\b(atende|atender|agenda|horario|manha|tarde|noite|hoje|amanha)\b/.test(normalizedQuery);
};

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
  const [baseYear] = todayIso.split('-').map(Number);

  if (normalized.includes('amanha')) {
    return { date: addDaysToIso(todayIso, 1), reference_label: 'amanhã' };
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
    return { date: nextWeekdayFromIso(todayIso, weekdayIndex), reference_label: WEEKDAYS[weekdayIndex] };
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

const getAvailableSlots = (medico, periods, appointments, targetDate) => {
  const occupied = appointments.map((appointment) => appointment.horario);
  const tempoConsulta = medico.tempo_consulta_minutos || 30;
  const tipoAtendimento = medico.tipo_atendimento || 'Horários Marcados';
  
  const todayIso = formatIsoInTz(new Date());
  const isToday = targetDate === todayIso;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (tipoAtendimento === 'Ordem de Chegada') {
    const horarioInicio = periods[0]?.horario_inicio;
    if (!horarioInicio) return [];
    
    if (isToday) {
      const [h, m] = horarioInicio.split(':').map(Number);
      if (h * 60 + m <= currentMinutes) return [];
    }
    
    const limite = medico.limite_ordem_chegada || 1;
    const ocupadas = appointments.filter((appointment) => appointment.horario === horarioInicio).length;
    return ocupadas < limite ? [horarioInicio] : [];
  }

  const slots = new Set();
  for (const period of periods) {
    const [startHour, startMinute] = period.horario_inicio.split(':').map(Number);
    const [endHour, endMinute] = period.horario_fim.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;

    for (let minute = start; minute <= end - tempoConsulta; minute += tempoConsulta) {
      if (isToday && minute <= currentMinutes) continue;
      
      const slot = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      if (!occupied.includes(slot)) slots.add(slot);
    }
  }

  return Array.from(slots).sort();
};

const matchesDoctorQuery = (queryText, medico) => {
  const normalizedQuery = normalizeText(queryText);
  if (!normalizedQuery) return false;

  const specialties = [medico.especialidade, ...(medico.especialidades || [])]
    .filter(Boolean)
    .map((specialty) => normalizeText(specialty));
  const specialtyMatch = specialties.some((specialty) => specialty && normalizedQuery.includes(specialty));
  if (specialtyMatch) return true;

  if (!shouldTryDoctorNameFilter(normalizedQuery)) return false;

  const nameParts = normalizeText(medico.nome)
    .split(' ')
    .filter((part) => part.length > 3 && !STOPWORDS.has(part));
  const nameMatches = nameParts.filter((part) => normalizedQuery.includes(part));
  return nameMatches.length >= 2 || nameMatches.some((part) => part.length >= 6);
};

const shouldUseBookedDoctorsOnly = (queryText = '') => {
  const normalizedQuery = normalizeText(queryText);
  const timeWords = 'amanha|amanhã|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo';
  return new RegExp(`(quem|quais).*(vai|vao|vão|est[aã]o|estar|tem|t[eê]m).*(atender|atendendo|na clinica|ai na clinica|agenda|hor[aá]rio)`).test(normalizedQuery)
    || new RegExp(`(medicos|m[eé]dicos|profissionais).*(vai|vao|vão|est[aã]o|estar|tem|t[eê]m).*(${timeWords}|agenda|hor[aá]rio)`).test(normalizedQuery)
    || new RegExp(`(vai|vao|vão|est[aã]o|estar).*(ter\\s+)?(medicos|m[eé]dicos|profissionais).*(atender|atendendo|${timeWords})`).test(normalizedQuery)
    || new RegExp(`(tem|vai ter).*(medico|m[eé]dico|profissional).*(atendendo|${timeWords}|agenda|hor[aá]rio)`).test(normalizedQuery)
    || new RegExp(`(quais|qual).*(medico|m[eé]dico|profissional).*(atende|atendem|atendendo|${timeWords})`).test(normalizedQuery);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { queryText = '', date = null } = await req.json();

    const { date: targetDate, reference_label } = resolveDateFromQuery(queryText, date);
    const medicosRaw = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
    const medicos = medicosRaw.filter((medico) => !/(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i.test(medico.nome || ''));
    const agendamentosRaw = await base44.asServiceRole.entities.Agendamento.filter({
      data_agendamento: targetDate
    });
    const agendamentos = agendamentosRaw.filter(a => a.status !== 'Cancelado');

    const nomePorMedicoId = Object.fromEntries(medicos.map((medico) => [medico.id, normalizeText(medico.nome)]));
    const medicosFiltradosPorConsulta = medicos.filter((medico) => matchesDoctorQuery(queryText, medico));
    const medicosBase = medicosFiltradosPorConsulta.length > 0 ? medicosFiltradosPorConsulta : medicos;

    const doctors = medicosBase
      .map((medico) => {
        const periods = getSchedulesForDate(medico, targetDate);
        if (periods.length === 0) return null;

        const medicoKey = normalizeText(medico.nome);
        const relatedAppointments = agendamentos.filter((agendamento) => nomePorMedicoId[agendamento.medico_id] === medicoKey);
        const availableSlots = getAvailableSlots(medico, periods, relatedAppointments, targetDate);

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

    const bookedDoctors = doctors.filter((doctor) => doctor.total_agendamentos > 0);
    const doctorsToReturn = shouldUseBookedDoctorsOnly(queryText) && bookedDoctors.length > 0 ? bookedDoctors : doctors;

    return Response.json({
      date: targetDate,
      reference_label,
      doctors: doctorsToReturn
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});