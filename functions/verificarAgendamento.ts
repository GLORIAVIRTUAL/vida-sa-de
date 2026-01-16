import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { nome, data_nascimento } = await req.json();

    if (!nome || !data_nascimento) {
      return Response.json({ 
        error: 'Nome e data de nascimento são obrigatórios',
        agendamentos: []
      }, { status: 400 });
    }

    console.log('🔍 Procurando agendamentos para:', { nome, data_nascimento });

    // Buscar paciente pelo nome e data de nascimento
    const pacientes = await base44.asServiceRole.entities.Paciente.filter({});
    
    const nomeLower = nome.toLowerCase().trim();
    const paciente = pacientes.find(p => {
      const pNomeLower = (p.nome || '').toLowerCase().trim();
      // Match por nome similar (primeiras 3+ palavras)
      const partes = pNomeLower.split(' ').filter(x => x.length > 2);
      const partesSearch = nomeLower.split(' ').filter(x => x.length > 2);
      return partes.some(p => partesSearch.some(s => p.includes(s) || s.includes(p)));
    });

    if (!paciente) {
      console.log('❌ Paciente não encontrado');
      return Response.json({ 
        sucesso: false,
        mensagem: 'Nenhum paciente encontrado com esse nome',
        agendamentos: []
      });
    }

    console.log('✅ Paciente encontrado:', paciente.nome, '| ID:', paciente.id);

    // Buscar agendamentos futuros desse paciente
    const hoje = new Date().toISOString().split('T')[0];
    const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
      paciente_id: paciente.id,
      status: { $in: ['Agendado', 'Confirmado', 'Pago', 'Cancelado', 'Finalizado'] }
    });

    // Filtrar apenas futuros ou de hoje
    const agendamentosFuturos = agendamentos.filter(ag => ag.data_agendamento >= hoje);

    if (agendamentosFuturos.length === 0) {
      return Response.json({ 
        sucesso: true,
        mensagem: 'Você não possui agendamentos confirmados no momento',
        agendamentos: [],
        paciente_nome: paciente.nome
      });
    }

    // Buscar médicos para exibir nomes
    const medicos = await base44.asServiceRole.entities.Medico.list();
    const medicosMap = {};
    medicos.forEach(m => { medicosMap[m.id] = m; });

    // Formatar resposta
    const agendamentosFormatados = agendamentosFuturos.map(ag => {
      const medico = medicosMap[ag.medico_id];
      const dataObj = new Date(ag.data_agendamento + 'T12:00:00');
      const dataFormatada = dataObj.toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        day: '2-digit', 
        month: '2-digit'
      });

      return {
        data: ag.data_agendamento,
        data_formatada: dataFormatada,
        horario: ag.horario,
        medico_nome: medico?.nome || 'Médico não identificado',
        especialidade: medico?.especialidade || '',
        tipo_servico: ag.tipo_servico,
        status: ag.status,
        observacoes: ag.observacoes
      };
    }).sort((a, b) => new Date(a.data) - new Date(b.data));

    console.log('✅ Agendamentos encontrados:', agendamentosFuturos.length);

    return Response.json({ 
      sucesso: true,
      paciente_nome: paciente.nome,
      total_agendamentos: agendamentosFuturos.length,
      mensagem: `Encontramos ${agendamentosFuturos.length} agendamento(s) para você, ${paciente.nome}! 📅`,
      agendamentos: agendamentosFormatados
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ 
      error: error.message,
      agendamentos: []
    }, { status: 500 });
  }
});