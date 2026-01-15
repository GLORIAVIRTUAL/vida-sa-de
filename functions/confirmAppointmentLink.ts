import { createClient } from 'npm:@base44/sdk@0.8.6';

const base44 = createClient({
  appId: Deno.env.get('BASE44_APP_ID')
});

Deno.serve(async (req) => {
  try {
    console.log('🔗 [ConfirmLink] Requisição recebida');
    
    const url = new URL(req.url);
    
    // Tentar pegar código da query string primeiro, depois do body
    let codigo = url.searchParams.get('codigo');
    let confirmar = url.searchParams.get('confirmar');
    
    // Se não veio na query, tentar do body (para testes)
    if (!codigo && req.method === 'POST') {
      try {
        const body = await req.json();
        codigo = body.codigo;
        confirmar = body.confirmar;
      } catch (e) {
        // Ignora erro de parse
      }
    }
    
    console.log(`[ConfirmLink] Método: ${req.method}, Código: ${codigo}, URL: ${req.url}`);
    
    if (!codigo) {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Erro - Confirmação</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #dc3545; font-size: 48px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌</div>
            <h2>Código inválido</h2>
            <p>Por favor, use o link correto enviado no WhatsApp.</p>
          </div>
        </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    console.log(`[ConfirmLink] Código: ${codigo}`);
    
    // Buscar agendamento
    let agendamento;
    try {
      agendamento = await base44.asServiceRole.entities.Agendamento.get(codigo);
    } catch (error) {
      console.error('[ConfirmLink] Agendamento não encontrado:', error);
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Erro - Confirmação</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #dc3545; font-size: 48px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌</div>
            <h2>Agendamento não encontrado</h2>
            <p>Entre em contato com a clínica.</p>
          </div>
        </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    // Se não passou o parâmetro confirmar=sim, mostrar página de confirmação
    if (confirmar !== 'sim') {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Confirmar Presença</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 20px; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container { 
              background: white; 
              padding: 40px; 
              border-radius: 15px; 
              max-width: 400px; 
              margin: 0 auto; 
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            .icon { font-size: 64px; margin-bottom: 20px; }
            h2 { color: #333; margin: 20px 0; font-size: 24px; }
            .info { 
              background: #f8f9fa; 
              padding: 20px; 
              border-radius: 10px; 
              margin: 25px 0;
              text-align: left;
            }
            .info p { 
              margin: 12px 0; 
              color: #333;
              font-size: 16px;
            }
            .btn {
              background: #28a745;
              color: white;
              border: none;
              padding: 15px 40px;
              font-size: 18px;
              font-weight: bold;
              border-radius: 8px;
              cursor: pointer;
              width: 100%;
              margin-top: 20px;
              transition: background 0.3s;
            }
            .btn:hover {
              background: #218838;
            }
            .status-badge {
              display: inline-block;
              padding: 5px 12px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: bold;
              ${agendamento.status === 'Confirmado' ? 'background: #d4edda; color: #155724;' : 'background: #fff3cd; color: #856404;'}
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">📅</div>
            <h2>Confirmar sua Presença</h2>
            <div class="info">
              <p><strong>📋 Paciente:</strong><br>${agendamento.paciente_nome}</p>
              <p><strong>📅 Data:</strong><br>${new Date(agendamento.data_agendamento + 'T00:00:00').toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
              <p><strong>🕐 Horário:</strong><br>${agendamento.horario}</p>
              <p><strong>Status:</strong><br><span class="status-badge">${agendamento.status}</span></p>
            </div>
            ${agendamento.status === 'Confirmado' 
              ? '<p style="color: #28a745; font-weight: bold;">✅ Já confirmado anteriormente</p>'
              : `<a href="?codigo=${codigo}&confirmar=sim"><button class="btn">✅ Confirmar Presença</button></a>`
            }
          </div>
        </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    // Verificar se já confirmado
    if (agendamento.status === 'Confirmado') {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Já Confirmado</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .icon { color: #28a745; font-size: 64px; margin-bottom: 20px; }
            h2 { color: #333; margin: 20px 0; }
            .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .info p { margin: 5px 0; color: #0066cc; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✅</div>
            <h2>Consulta Já Confirmada</h2>
            <p>Sua consulta já estava confirmada anteriormente.</p>
            <div class="info">
              <p><strong>Paciente:</strong> ${agendamento.paciente_nome}</p>
              <p><strong>Data:</strong> ${new Date(agendamento.data_agendamento + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
              <p><strong>Horário:</strong> ${agendamento.horario}</p>
            </div>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Aguardamos você! 😊
            </p>
          </div>
        </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    // Confirmar agendamento
    console.log('[ConfirmLink] Confirmando agendamento...');
    await base44.asServiceRole.entities.Agendamento.update(agendamento.id, {
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
          metodo: 'link'
        }
      });
    } catch (notifError) {
      console.warn('[ConfirmLink] Erro ao criar notificação:', notifError);
    }
    
    console.log('✅ [ConfirmLink] Confirmado com sucesso');
    
    // Página de sucesso
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Confirmação Realizada</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container { 
            background: white; 
            padding: 40px; 
            border-radius: 15px; 
            max-width: 400px; 
            margin: 0 auto; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            color: #333;
          }
          .icon { 
            font-size: 80px;
            animation: bounce 1s;
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
          }
          h2 { 
            color: #28a745; 
            margin: 20px 0;
            font-size: 28px;
          }
          .info { 
            background: #e8f5e9; 
            padding: 20px; 
            border-radius: 10px; 
            margin: 25px 0;
            border-left: 4px solid #28a745;
          }
          .info p { 
            margin: 10px 0; 
            color: #2e7d32;
            font-size: 16px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #eee;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🎉</div>
          <h2>Consulta Confirmada!</h2>
          <p style="font-size: 18px; color: #555;">
            Sua presença foi confirmada com sucesso.
          </p>
          <div class="info">
            <p><strong>📋 Paciente:</strong> ${agendamento.paciente_nome}</p>
            <p><strong>📅 Data:</strong> ${new Date(agendamento.data_agendamento + 'T00:00:00').toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
            <p><strong>🕐 Horário:</strong> ${agendamento.horario}</p>
          </div>
          <div class="footer">
            <p><strong>Centro Vida Saúde</strong></p>
            <p>Aguardamos você! 😊</p>
          </div>
        </div>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
    
  } catch (error) {
    console.error('❌ [ConfirmLink] Error:', error);
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Erro</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .error { color: #dc3545; font-size: 48px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error">⚠️</div>
          <h2>Erro ao confirmar</h2>
          <p>Por favor, entre em contato com a clínica.</p>
          <p style="font-size: 12px; color: #999; margin-top: 20px;">${error.message}</p>
        </div>
      </body>
      </html>
    `, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
});