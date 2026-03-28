import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { nome, data_nascimento, cpf } = await req.json();

    if (!nome && !cpf) {
      return Response.json({ 
        error: 'Nome ou CPF são obrigatórios',
        agendamentos: []
      }, { status: 400 });
    }

    console.log('🔍 Procurando agendamentos para:', { nome, cpf, data_nascimento });

    let paciente = null;

    // Prioridade 1: Buscar por CPF (mais confiável)
    if (cpf) {
      const cpfLimpo = cpf.replace(/\D/g, '');
      if (cpfLimpo.length === 11) {
        const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
        paciente = todosPacientes.find(p => (p.cpf || '').replace(/\D/g, '') === cpfLimpo);
      }
    }

    // Prioridade 2: Buscar por nome + data_nascimento (fallback)
    if (!paciente && nome && data_nascimento) {
      const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
      const nomeLower = nome.toLowerCase().trim();
      
      paciente = todosPacientes.find(p => {
        if (!p.nome) return false;
        const pNomeLower = p.nome.toLowerCase().trim();
        const nomeMatch = pNomeLower === nomeLower || 
          pNomeLower.split(' ').filter(x => x.length > 2).some(part => 
            nomeLower.split(' ').filter(s => s.length > 2).some(s => part.includes(s) || s.includes(part))
          );
        const dataNascMatch = p.data_nascimento === data_nascimento;
        return nomeMatch && dataNascMatch;
      });
    }

    // Prioridade 3: Buscar só por nome (menos confiável)
    if (!paciente && nome) {
      const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 500);
      const nomeLower = nome.toLowerCase().trim();
      const partesNomeBusca = nomeLower.split(' ').filter(x => x.length > 2);
      
      paciente = todosPacientes.find(p => {
        if (!p.nome) return false;
        const pNomeLower = p.nome.toLowerCase().trim();
        const partesNomePaciente = pNomeLower.split(' ').filter(x => x.length > 2);
        // Exigir pelo menos 2 partes correspondentes ou match exato
        const matches = partesNomeBusca.filter(s => partesNomePaciente.some(p => p === s));
        return matches.length >= 2 || pNomeLower === nomeLower;
      });
    }

    if (!paciente) {
      console.log('❌ Paciente não encontrado');
      return Response.json({ 
        sucesso: false,
        mensagem: 'Nenhum paciente encontrado',
        agendamentos: []
      });
    }

    console.log('✅ Paciente encontrado:', paciente.nome, '| ID:', paciente.id);

    // Buscar agendamentos futuros
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
      paciente_id: paciente.id
    });

    const agendamentosFuturos = agendamentos.filter(ag => ag.data_agendamento >= hoje);

    if (agendamentosFuturos.length === 0) {
      return Response.json({ 
        sucesso: true,
        mensagem: 'Você não possui agendamentos futuros no momento',
        agendamentos: [],
        paciente_nome: paciente.nome
      });
    }

    // Buscar médicos
    const medicos = await base44.asServiceRole.entities.Medico.list();
    const medicosMap = {};
    medicos.forEach(m => { medicosMap[m.id] = m; });

    const agendamentosFormatados = agendamentosFuturos.map(ag => {
      const medico = medicosMap[ag.medico_id];
      const dataObj = new Date(ag.data_agendamento + 'T12:00:00');
      return {
        data: ag.data_agendamento,
        data_formatada: dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }),
        horario: ag.horario,
        medico_nome: medico?.nome || 'Médico não identificado',
        especialidade: medico?.especialidade || '',
        tipo_servico: ag.tipo_servico,
        status: ag.status,
        observacoes: ag.observacoes
      };
    }).sort((a, b) => new Date(a.data) - new Date(b.data));

    return Response.json({ 
      sucesso: true,
      paciente_nome: paciente.nome,
      total_agendamentos: agendamentosFuturos.length,
      mensagem: `Encontramos ${agendamentosFuturos.length} agendamento(s) para você, ${paciente.nome}! 📅`,
      agendamentos: agendamentosFormatados
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message, agendamentos: [] }, { status: 500 });
  }
});