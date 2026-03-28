import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const TIME_ZONE = 'America/Sao_Paulo';

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
    case '1ª e 3ª Semana do Mês': return weekOfMonth === 1 || weekOfMonth === 3;
    case '2ª e 4ª Semana do Mês': return weekOfMonth === 2 || weekOfMonth === 4;
    case 'Apenas 1ª Semana do Mês': return weekOfMonth === 1;
    case 'Apenas 2ª Semana do Mês': return weekOfMonth === 2;
    case 'Apenas 3ª Semana do Mês': return weekOfMonth === 3;
    case 'Apenas 4ª Semana do Mês': return weekOfMonth === 4;
    default: return true;
  }
};

const getSchedulesForDate = (medico, cleanDate) => {
  const horariosAtendimento = medico.horarios_atendimento || [];
  const [year, month, day] = cleanDate.split('-').map(Number);
  const dataObj = new Date(Date.UTC(year, month - 1, day));
  const diaSemana = dataObj.getUTCDay();

  const horariosDataEspecifica = horariosAtendimento.filter(h => h.data_especifica === cleanDate);
  if (horariosDataEspecifica.some(h => h.bloqueado)) return [];
  if (horariosDataEspecifica.length > 0) return horariosDataEspecifica.filter(h => !h.bloqueado);

  const horariosRecorrentes = horariosAtendimento.filter(h =>
    Math.floor(h.dia_semana) === diaSemana && !h.data_especifica && !h.bloqueado &&
    checkRecorrencia(h.recorrencia, dataObj)
  );
  if (horariosRecorrentes.length > 0) return horariosRecorrentes;

  const horariosRecorrentesComData = horariosAtendimento.filter(h =>
    h.data_especifica && !h.bloqueado && Math.floor(h.dia_semana) === diaSemana &&
    h.recorrencia && h.recorrencia !== 'Apenas uma vez' &&
    checkRecorrencia(h.recorrencia, dataObj)
  );
  if (horariosRecorrentesComData.length === 0) return [];
  horariosRecorrentesComData.sort((a, b) => (b.data_especifica || '').localeCompare(a.data_especifica || ''));
  return [horariosRecorrentesComData[0]];
};

const getAvailableSlots = (medico, periods, appointments, targetDate) => {
  const occupied = appointments.map(a => a.horario);
  const tempoConsulta = medico.tempo_consulta_minutos || 30;
  const tipoAtendimento = medico.tipo_atendimento || 'Horários Marcados';

  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
  const isToday = targetDate === todayIso;
  const timeStr = new Date().toLocaleTimeString('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
  const [curH, curM] = timeStr.split(':').map(Number);
  const currentMinutes = curH * 60 + curM;

  if (tipoAtendimento === 'Ordem de Chegada') {
    const horarioInicio = periods[0]?.horario_inicio;
    if (!horarioInicio) return [];
    if (isToday) {
      const [h, m] = horarioInicio.split(':').map(Number);
      if (h * 60 + m <= currentMinutes) return [];
    }
    const limite = medico.limite_ordem_chegada || 1;
    const ocupadas = appointments.filter(a => a.horario === horarioInicio).length;
    return ocupadas < limite ? [horarioInicio] : [];
  }

  const slots = new Set();
  for (const period of periods) {
    const [startH, startM] = period.horario_inicio.split(':').map(Number);
    const [endH, endM] = period.horario_fim.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    for (let minute = start; minute <= end - tempoConsulta; minute += tempoConsulta) {
      if (isToday && minute <= currentMinutes) continue;
      const slot = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      if (!occupied.includes(slot)) slots.add(slot);
    }
  }
  return Array.from(slots).sort();
};

const getUnifiedAppointments = async (base44, medico, date) => {
  const allMedicos = await base44.asServiceRole.entities.Medico.filter({});
  const nomeNorm = medico.nome.toUpperCase().trim();
  const idsRelacionados = allMedicos.filter(m => m.nome.toUpperCase().trim() === nomeNorm).map(m => m.id);
  
  let appointments = [];
  for (const id of idsRelacionados) {
    const ags = await base44.asServiceRole.entities.Agendamento.filter({
      medico_id: id, data_agendamento: date, status: { $ne: 'Cancelado' }
    });
    appointments = appointments.concat(ags);
  }
  return appointments;
};

const MEDICO_NAME_FILTER = /(cart[aã]o\s*mais\s*vida|dr\.?\s*exame\b|exame\s*laborat|eletrocardio)/i;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { acao, especialidade, medico_id, data, horario, paciente_nome, paciente_telefone, paciente_cpf } = await req.json();
    
    console.log('📨 Chatbot Agendamento:', { acao, especialidade, medico_id, data, horario });

    // AÇÃO 1: Listar médicos por especialidade
    if (acao === 'listar_medicos') {
      const medicosRaw = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
      let medicos = medicosRaw.filter(m => !MEDICO_NAME_FILTER.test(m.nome || ''));
      
      if (especialidade) {
        const espLower = especialidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        medicos = medicos.filter(m => {
          const espPrincipal = (m.especialidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const espsArray = (m.especialidades || []).map(e => e.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          return espPrincipal.includes(espLower) || espLower.includes(espPrincipal) ||
                 espsArray.some(e => e.includes(espLower) || espLower.includes(e));
        });
      }
      
      return Response.json({ 
        success: true, 
        medicos: medicos.map(m => ({
          id: m.id, nome: m.nome, especialidade: m.especialidade,
          especialidades: m.especialidades || [], tempo_consulta: m.tempo_consulta_minutos || 30
        })),
        total: medicos.length
      });
    }

    // AÇÃO 2: Buscar próximos horários disponíveis
    if (acao === 'buscar_horarios') {
      if (!medico_id && !especialidade) {
        return Response.json({ error: 'Informe medico_id ou especialidade' }, { status: 400 });
      }

      let medicosParaBuscar = [];
      if (medico_id) {
        const medico = await base44.asServiceRole.entities.Medico.get(medico_id.replace(/[{}]/g, ''));
        if (medico && medico.status === 'Ativo') medicosParaBuscar.push(medico);
      } else if (especialidade) {
        const medicosRaw = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
        const espLower = especialidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        medicosParaBuscar = medicosRaw.filter(m => {
          if (MEDICO_NAME_FILTER.test(m.nome || '')) return false;
          const espP = (m.especialidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const espsA = (m.especialidades || []).map(e => e.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          return espP.includes(espLower) || espLower.includes(espP) || espsA.some(e => e.includes(espLower) || espLower.includes(e));
        });
      }

      if (medicosParaBuscar.length === 0) {
        return Response.json({ success: true, message: 'Nenhum médico encontrado', disponibilidades: [] });
      }

      const resultado = [];
      const diasAfrente = 30;

      for (const medico of medicosParaBuscar) {
        const disponibilidadesMedico = [];
        for (let i = 0; i < diasAfrente && disponibilidadesMedico.length < 5; i++) {
          const dc = new Date(); dc.setDate(dc.getDate() + i);
          const df = dc.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
          
          const periods = getSchedulesForDate(medico, df);
          if (periods.length === 0) continue;
          
          const appointments = await getUnifiedAppointments(base44, medico, df);
          const slots = getAvailableSlots(medico, periods, appointments, df);
          
          if (slots.length > 0) {
            disponibilidadesMedico.push({
              data: df,
              data_formatada: dc.toLocaleDateString('pt-BR', { timeZone: TIME_ZONE, weekday: 'long', day: '2-digit', month: '2-digit' }),
              horarios: slots.slice(0, 5)
            });
          }
        }

        if (disponibilidadesMedico.length > 0) {
          resultado.push({
            medico_id: medico.id, medico_nome: medico.nome, especialidade: medico.especialidade,
            disponibilidades: disponibilidadesMedico,
            proximo_disponivel: {
              data: disponibilidadesMedico[0].data,
              data_formatada: disponibilidadesMedico[0].data_formatada,
              horario: disponibilidadesMedico[0].horarios[0]
            }
          });
        }
      }

      return Response.json({ success: true, disponibilidades: resultado, total_medicos: resultado.length });
    }

    // AÇÃO 3: Criar agendamento
    if (acao === 'criar_agendamento') {
      if (!medico_id || !data || !horario || !paciente_nome || !paciente_telefone) {
        return Response.json({ error: 'Dados incompletos. Necessário: medico_id, data, horario, paciente_nome, paciente_telefone' }, { status: 400 });
      }

      const cleanMedicoId = medico_id.replace(/[{}]/g, '');
      const medico = await base44.asServiceRole.entities.Medico.get(cleanMedicoId);
      if (!medico) return Response.json({ error: 'Médico não encontrado' }, { status: 404 });

      // Validar horário no sistema
      const periods = getSchedulesForDate(medico, data);
      if (periods.length === 0) {
        return Response.json({ success: false, error: 'Médico não atende nesta data' });
      }

      const appointments = await getUnifiedAppointments(base44, medico, data);
      const slotsDisponiveis = getAvailableSlots(medico, periods, appointments, data);
      
      if (!slotsDisponiveis.includes(horario)) {
        return Response.json({ 
          success: false, error: 'Horário não disponível',
          message: `Este horário não está disponível. Horários livres: ${slotsDisponiveis.slice(0, 5).join(', ') || 'nenhum'}`
        });
      }

      // Buscar ou criar paciente — prioriza CPF, depois telefone
      let paciente = null;
      let telefoneNorm = paciente_telefone.replace(/\D/g, '');
      if (!telefoneNorm.startsWith('55') && telefoneNorm.length >= 10) telefoneNorm = '55' + telefoneNorm;

      if (paciente_cpf && paciente_cpf !== 'NÃO INFORMADO') {
        const cpfLimpo = paciente_cpf.replace(/\D/g, '');
        const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
        paciente = todosPacientes.find(p => (p.cpf || '').replace(/\D/g, '') === cpfLimpo);
      }

      if (!paciente) {
        const variantes = [telefoneNorm];
        if (telefoneNorm.startsWith('55') && telefoneNorm.length >= 12) variantes.push(telefoneNorm.slice(2));
        for (const v of variantes) {
          const found = await base44.asServiceRole.entities.Paciente.filter({ telefone: v });
          if (found.length > 0) { paciente = found[0]; break; }
        }
      }

      if (!paciente && paciente_cpf && paciente_cpf !== 'NÃO INFORMADO') {
        const cpfLimpo = paciente_cpf.replace(/\D/g, '');
        const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
        const nomeLower = paciente_nome.toLowerCase().trim();
        paciente = todosPacientes.find(p => p.nome && p.nome.toLowerCase().trim() === nomeLower && (p.cpf || '').replace(/\D/g, '') === cpfLimpo);
      }

      if (paciente) {
        const updateData = { nome: paciente_nome };
        if (!paciente.telefone) updateData.telefone = telefoneNorm;
        if (paciente_cpf && paciente_cpf !== 'NÃO INFORMADO' && (!paciente.cpf || paciente.cpf === 'NÃO INFORMADO')) {
          updateData.cpf = paciente_cpf.replace(/\D/g, '');
        }
        await base44.asServiceRole.entities.Paciente.update(paciente.id, updateData);
      } else {
        paciente = await base44.asServiceRole.entities.Paciente.create({
          nome: paciente_nome, telefone: telefoneNorm,
          cpf: paciente_cpf ? paciente_cpf.replace(/\D/g, '') : 'NÃO INFORMADO',
          como_conheceu: 'WhatsApp', observacoes: 'Cadastrado via chatbot Glória'
        });
      }

      // Buscar preço particular
      let categoriaParticularId = null;
      let valorConsulta = 0;
      try {
        const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({ nome: 'Particular', status: 'Ativo' });
        if (categorias.length > 0) {
          categoriaParticularId = categorias[0].id;
          const [tabelaPrecos, procedimentos] = await Promise.all([
            base44.asServiceRole.entities.TabelaPreco.filter({ categoria_id: categoriaParticularId }),
            base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' })
          ]);
          const espMedico = (medico.especialidade || '').toLowerCase();
          let proc = procedimentos.find(p => {
            const n = (p.nome || '').toLowerCase();
            const e = (p.especialidade || '').toLowerCase();
            return (n.includes('consulta') || n.includes(espMedico)) && (e.includes(espMedico) || espMedico.includes(e));
          });
          if (!proc) proc = procedimentos.find(p => (p.nome || '').toLowerCase().includes('consulta') && ((p.nome || '').toLowerCase().includes('clínico') || (p.nome || '').toLowerCase().includes('clinico')));
          if (proc) { const preco = tabelaPrecos.find(tp => tp.procedimento_id === proc.id); if (preco) valorConsulta = preco.valor || 0; }
        }
      } catch (e) { console.warn('Preço não encontrado:', e.message); }

      const agendamento = await base44.asServiceRole.entities.Agendamento.create({
        paciente_id: paciente.id, paciente_nome: paciente_nome, medico_id: cleanMedicoId,
        data_agendamento: data, horario: horario, tipo_servico: 'Consulta', status: 'Agendado',
        categoria_preco_id: categoriaParticularId, valor_total: valorConsulta, valor_final: valorConsulta,
        observacoes: 'Agendado via chatbot Glória', agendado_por: 'Glória', agendado_por_tipo: 'chatbot'
      });

      // Notificação interna
      try {
        const dataObj = new Date(data + 'T12:00:00');
        const dataFmt = dataObj.toLocaleDateString('pt-BR');
        await base44.asServiceRole.entities.Notification.create({
          type: 'novo_agendamento',
          message: `🆕 ${paciente_nome} - ${medico.especialidade} com ${medico.nome} em ${dataFmt} às ${horario}`,
          data: { agendamento_id: agendamento.id, paciente_nome, medico_nome: medico.nome, especialidade: medico.especialidade, data, horario, agendado_por: 'Glória', agendado_por_tipo: 'chatbot' },
          is_read: false
        });
      } catch (e) {}

      return Response.json({ 
        success: true, message: 'Agendamento realizado com sucesso!',
        agendamento: { id: agendamento.id, paciente: paciente_nome, medico: medico.nome, especialidade: medico.especialidade, data, horario }
      });
    }

    return Response.json({ error: 'Ação não reconhecida. Use: listar_medicos, buscar_horarios, criar_agendamento' }, { status: 400 });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});