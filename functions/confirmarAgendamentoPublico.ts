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
    
    console.log(`[ConfirmarAgendamento] Confirmando código: ${codigo}`);
    
    // Buscar agendamento
    let agendamento;
    try {
      agendamento = await base44.asServiceRole.entities.Agendamento.get(codigo);
    } catch (error) {
      console.error('[ConfirmarAgendamento] Erro ao buscar:', error);
      return Response.json({ sucesso: false, erro: 'Agendamento não encontrado.' });
    }
    
    if (!agendamento) {
      return Response.json({ sucesso: false, erro: 'Agendamento não encontrado.' });
    }
    
    // Verificar se já está confirmado
    if (agendamento.status === 'Confirmado') {
      return Response.json({ sucesso: true, mensagem: 'Agendamento já estava confirmado.' });
    }
    
    // Atualizar status para confirmado
    await base44.asServiceRole.entities.Agendamento.update(codigo, {
      status: 'Confirmado'
    });
    
    // Criar notificação interna
    try {
      await base44.asServiceRole.entities.Notification.create({
        type: 'confirmacao_recebida',
        message: `✅ Confirmação via link: ${agendamento.paciente_nome} confirmou presença para ${agendamento.data_agendamento} às ${agendamento.horario}`,
        data: {
          agendamentoId: agendamento.id,
          paciente_nome: agendamento.paciente_nome,
          data_agendamento: agendamento.data_agendamento,
          horario: agendamento.horario,
          metodo: 'link_publico'
        }
      });
    } catch (notifError) {
      console.warn('[ConfirmarAgendamento] Erro ao criar notificação:', notifError);
    }
    
    console.log(`[ConfirmarAgendamento] ✅ Confirmado com sucesso: ${codigo}`);
    
    return Response.json({ sucesso: true, mensagem: 'Presença confirmada com sucesso!' });
    
  } catch (error) {
    console.error('[ConfirmarAgendamento] Erro:', error);
    return Response.json({ sucesso: false, erro: 'Erro interno do servidor.' }, { status: 500 });
  }
});