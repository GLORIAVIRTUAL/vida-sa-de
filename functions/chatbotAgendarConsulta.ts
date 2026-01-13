import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const diasSemanaMap = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { acao, especialidade, medico_id, data, horario, paciente_nome, paciente_telefone, paciente_cpf } = await req.json();
    
    console.log('📨 Chatbot Agendamento:', { acao, especialidade, medico_id });

    // AÇÃO 1: Listar médicos por especialidade
    if (acao === 'listar_medicos') {
      const medicos = await base44.asServiceRole.entities.Medico.filter({ 
        status: 'Ativo',
        ...(especialidade ? { especialidade } : {})
      });
      
      const lista = medicos.map(m => ({
        id: m.id,
        nome: m.nome,
        especialidade: m.especialidade,
        tempo_consulta: m.tempo_consulta_minutos || 30
      }));
      
      return Response.json({ 
        success: true, 
        medicos: lista,
        total: lista.length
      });
    }

    // AÇÃO 2: Buscar próximos horários disponíveis
    if (acao === 'buscar_horarios') {
      if (!medico_id && !especialidade) {
        return Response.json({ error: 'Informe medico_id ou especialidade' }, { status: 400 });
      }

      let medicosParaBuscar = [];
      
      if (medico_id) {
        const medico = await base44.asServiceRole.entities.Medico.get(medico_id);
        if (medico && medico.status === 'Ativo') {
          medicosParaBuscar.push(medico);
        }
      } else if (especialidade) {
        medicosParaBuscar = await base44.asServiceRole.entities.Medico.filter({ 
          status: 'Ativo',
          especialidade 
        });
      }

      if (medicosParaBuscar.length === 0) {
        return Response.json({ 
          success: true, 
          message: 'Nenhum médico encontrado',
          disponibilidades: []
        });
      }

      const resultado = [];
      const hoje = new Date();
      const diasAfrente = 15;

      for (const medico of medicosParaBuscar) {
        const horariosAtendimento = medico.horarios_atendimento || [];
        if (horariosAtendimento.length === 0) continue;

        const disponibilidadesMedico = [];

        for (let i = 0; i < diasAfrente; i++) {
          const dataConsulta = new Date();
          dataConsulta.setHours(0, 0, 0, 0);
          dataConsulta.setDate(dataConsulta.getDate() + i);
          
          const dataFormatada = dataConsulta.toISOString().split('T')[0];
          const diaSemana = dataConsulta.getDay();

          // Filtrar horários do dia
          const horariosDataEspecifica = horariosAtendimento.filter(h => h.data_especifica === dataFormatada);
          const horariosDoDia = horariosDataEspecifica.length > 0 
            ? horariosDataEspecifica 
            : horariosAtendimento.filter(h => h.dia_semana === diaSemana && !h.data_especifica);

          if (horariosDoDia.length === 0) continue;

          // Buscar agendamentos existentes
          const agendamentosExistentes = await base44.asServiceRole.entities.Agendamento.filter({
            medico_id: medico.id,
            data_agendamento: dataFormatada,
            status: { $ne: 'Cancelado' }
          });

          const horariosOcupados = agendamentosExistentes.map(ag => ag.horario);
          const horariosDisponiveis = [];
          const tempoConsulta = medico.tempo_consulta_minutos || 30;

          for (const periodo of horariosDoDia) {
            const [inicioH, inicioM] = periodo.horario_inicio.split(':').map(Number);
            const [fimH, fimM] = periodo.horario_fim.split(':').map(Number);
            
            const inicioMinutos = inicioH * 60 + inicioM;
            const fimMinutos = fimH * 60 + fimM;

            for (let minutos = inicioMinutos; minutos < fimMinutos; minutos += tempoConsulta) {
              const horas = Math.floor(minutos / 60);
              const mins = minutos % 60;
              const horario = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

              const agora = new Date();
              const horarioDateTime = new Date(`${dataFormatada}T${horario}:00`);
              const isPast = (dataConsulta.toDateString() === agora.toDateString() && horarioDateTime < agora);

              if (!isPast && !horariosOcupados.includes(horario)) {
                horariosDisponiveis.push(horario);
              }
            }
          }

          if (horariosDisponiveis.length > 0) {
            disponibilidadesMedico.push({
              data: dataFormatada,
              data_formatada: dataConsulta.toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                day: '2-digit', 
                month: '2-digit'
              }),
              dia_semana: diasSemanaMap[diaSemana],
              horarios: horariosDisponiveis.sort().slice(0, 5) // Limita a 5 horários por dia
            });

            // Limitar a 3 dias por médico
            if (disponibilidadesMedico.length >= 3) break;
          }
        }

        if (disponibilidadesMedico.length > 0) {
          resultado.push({
            medico_id: medico.id,
            medico_nome: medico.nome,
            especialidade: medico.especialidade,
            disponibilidades: disponibilidadesMedico,
            proximo_disponivel: {
              data: disponibilidadesMedico[0].data,
              data_formatada: disponibilidadesMedico[0].data_formatada,
              horario: disponibilidadesMedico[0].horarios[0]
            }
          });
        }
      }

      return Response.json({ 
        success: true, 
        disponibilidades: resultado,
        total_medicos: resultado.length
      });
    }

    // AÇÃO 3: Criar agendamento
    if (acao === 'criar_agendamento') {
      if (!medico_id || !data || !horario || !paciente_nome || !paciente_telefone) {
        return Response.json({ 
          error: 'Dados incompletos. Necessário: medico_id, data, horario, paciente_nome, paciente_telefone' 
        }, { status: 400 });
      }

      // Verificar se médico existe
      const medico = await base44.asServiceRole.entities.Medico.get(medico_id);
      if (!medico) {
        return Response.json({ error: 'Médico não encontrado' }, { status: 404 });
      }

      // Buscar ou criar paciente
      let paciente;
      const pacientesExistentes = await base44.asServiceRole.entities.Paciente.filter({ 
        telefone: paciente_telefone 
      });

      if (pacientesExistentes.length > 0) {
        paciente = pacientesExistentes[0];
      } else {
        // Criar novo paciente
        paciente = await base44.asServiceRole.entities.Paciente.create({
          nome: paciente_nome,
          telefone: paciente_telefone,
          cpf: paciente_cpf || 'NÃO INFORMADO',
          como_conheceu: 'WhatsApp',
          observacoes: 'Cadastrado via chatbot'
        });
      }

      // Verificar se horário ainda está disponível
      const agendamentosExistentes = await base44.asServiceRole.entities.Agendamento.filter({
        medico_id: medico_id,
        data_agendamento: data,
        horario: horario,
        status: { $ne: 'Cancelado' }
      });

      if (agendamentosExistentes.length > 0) {
        return Response.json({ 
          success: false, 
          error: 'Horário já ocupado',
          message: 'Este horário foi ocupado. Por favor, escolha outro.'
        });
      }

      // Criar agendamento
      const agendamento = await base44.asServiceRole.entities.Agendamento.create({
        paciente_id: paciente.id,
        paciente_nome: paciente.nome,
        medico_id: medico_id,
        data_agendamento: data,
        horario: horario,
        tipo_servico: 'Consulta',
        status: 'Agendado',
        observacoes: 'Agendado via chatbot WhatsApp'
      });

      return Response.json({ 
        success: true, 
        message: 'Agendamento realizado com sucesso!',
        agendamento: {
          id: agendamento.id,
          paciente: paciente.nome,
          medico: medico.nome,
          especialidade: medico.especialidade,
          data: data,
          horario: horario
        }
      });
    }

    return Response.json({ error: 'Ação não reconhecida. Use: listar_medicos, buscar_horarios, criar_agendamento' }, { status: 400 });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});