import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    console.log('🔔 [ConfirmAppointment] Webhook received');
    
    const base44 = createClientFromRequest(req);
    
    // Parse body
    const body = await req.json();
    console.log('[ConfirmAppointment] Body:', JSON.stringify(body, null, 2));
    
    // Extrair código de confirmação do body
    // O chatbot pode enviar de várias formas, vamos aceitar diferentes formatos
    const codigo = body.codigo || body.confirmation_code || body.agendamento_id || body.id;
    
    if (!codigo) {
      console.error('[ConfirmAppointment] Código não fornecido');
      return Response.json({ 
        success: false, 
        error: 'Código de confirmação não fornecido' 
      }, { status: 400 });
    }
    
    console.log(`[ConfirmAppointment] Código recebido: ${codigo}`);
    
    // Buscar agendamento pelo ID
    let agendamento;
    try {
      agendamento = await base44.asServiceRole.entities.Agendamento.get(codigo);
    } catch (error) {
      console.error('[ConfirmAppointment] Agendamento não encontrado:', error);
      return Response.json({ 
        success: false, 
        error: 'Agendamento não encontrado' 
      }, { status: 404 });
    }
    
    // Verificar se o agendamento já está confirmado
    if (agendamento.status === 'Confirmado') {
      console.log('[ConfirmAppointment] Agendamento já estava confirmado');
      return Response.json({ 
        success: true, 
        message: 'Agendamento já estava confirmado',
        agendamento_id: agendamento.id
      });
    }
    
    // Atualizar status para Confirmado
    console.log('[ConfirmAppointment] Atualizando status para Confirmado...');
    await base44.asServiceRole.entities.Agendamento.update(agendamento.id, {
      status: 'Confirmado'
    });
    
    console.log('✅ [ConfirmAppointment] Agendamento confirmado com sucesso');
    
    // Criar notificação interna de confirmação recebida
    try {
      await base44.asServiceRole.entities.Notification.create({
        type: 'confirmacao_recebida',
        message: `✅ Confirmação recebida: ${agendamento.paciente_nome} confirmou presença para ${agendamento.data_agendamento} às ${agendamento.horario}`,
        data: {
          agendamentoId: agendamento.id,
          paciente_nome: agendamento.paciente_nome,
          data_agendamento: agendamento.data_agendamento,
          horario: agendamento.horario
        }
      });
    } catch (notifError) {
      console.warn('[ConfirmAppointment] Erro ao criar notificação (não crítico):', notifError);
    }
    
    return Response.json({ 
      success: true, 
      message: 'Agendamento confirmado com sucesso',
      agendamento_id: agendamento.id,
      paciente: agendamento.paciente_nome,
      data: agendamento.data_agendamento,
      horario: agendamento.horario
    });
    
  } catch (error) {
    console.error('❌ [ConfirmAppointment] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});