import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let codigo;
    if (req.method === 'POST') {
      const body = await req.json();
      codigo = body.codigo;
    }
    
    if (!codigo) {
      return Response.json({ sucesso: false, erro: 'Código não informado.' });
    }
    
    console.log(`[BuscarAgendamento] Buscando código: ${codigo}`);
    
    // Buscar agendamento usando service role para acesso público
    let agendamento;
    try {
      agendamento = await base44.asServiceRole.entities.Agendamento.get(codigo);
    } catch (error) {
      console.error('[BuscarAgendamento] Erro ao buscar:', error);
      return Response.json({ sucesso: false, erro: 'Agendamento não encontrado.' });
    }
    
    if (!agendamento) {
      return Response.json({ sucesso: false, erro: 'Agendamento não encontrado.' });
    }
    
    // Buscar nome do médico
    let medicoNome = '';
    if (agendamento.medico_id) {
      try {
        const medico = await base44.asServiceRole.entities.Medico.get(agendamento.medico_id);
        medicoNome = medico?.nome || '';
      } catch (e) {
        console.warn('[BuscarAgendamento] Médico não encontrado');
      }
    }
    
    // Retornar apenas dados necessários (sem expor informações sensíveis)
    return Response.json({
      sucesso: true,
      agendamento: {
        id: agendamento.id,
        paciente_nome: agendamento.paciente_nome,
        data_agendamento: agendamento.data_agendamento,
        horario: agendamento.horario,
        status: agendamento.status,
        tipo_servico: agendamento.tipo_servico,
        medico_nome: medicoNome
      }
    });
    
  } catch (error) {
    console.error('[BuscarAgendamento] Erro:', error);
    return Response.json({ sucesso: false, erro: 'Erro interno do servidor.' }, { status: 500 });
  }
});