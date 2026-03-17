import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let codigo = url.searchParams.get('codigo');
    let confirmar = url.searchParams.get('confirmar');
    
    // Se não veio na query, tentar do body (para testes)
    if (!codigo && req.method === 'POST') {
      try {
        const body = await req.clone().json();
        codigo = body.codigo;
        confirmar = body.confirmar;
      } catch (e) {}
    }
    
    // Limpar código
    if (codigo) {
      codigo = codigo.trim();
    }

    if (!codigo) {
      return htmlResponse(renderErrorPage('Código inválido', 'Por favor, use o link correto enviado no WhatsApp.'));
    }
    
    // Criar cliente
    const base44 = createClientFromRequest(req);
    
    // Buscar agendamento usando service role
    let agendamento = null;
    try {
      const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({ id: codigo });
      if (agendamentos && agendamentos.length > 0) {
        agendamento = agendamentos[0];
      }
    } catch (e1) {
      console.log('Erro filter:', e1.message);
      // Tentar listar
      try {
        const lista = await base44.asServiceRole.entities.Agendamento.list('-created_date', 200);
        agendamento = lista.find(a => a.id === codigo);
      } catch (e2) {
        console.log('Erro list:', e2.message);
      }
    }

    if (!agendamento) {
      return htmlResponse(renderErrorPage(
        'Agendamento não encontrado',
        'Não conseguimos localizar o agendamento. Entre em contato com a clínica.'
      ));
    }
    
    // Mostrar página de confirmação
    if (confirmar !== 'sim') {
      return htmlResponse(renderConfirmPage(agendamento, codigo));
    }
    
    // Já confirmado?
    if (agendamento.status === 'Confirmado') {
      return htmlResponse(renderSuccessPage(agendamento, true));
    }
    
    // Confirmar agendamento
    await base44.asServiceRole.entities.Agendamento.update(agendamento.id, { status: 'Confirmado' });
    
    // Notificação (opcional)
    try {
      await base44.asServiceRole.entities.Notification.create({
        type: 'confirmacao_recebida',
        message: `✅ ${agendamento.paciente_nome} confirmou presença para ${agendamento.data_agendamento} às ${agendamento.horario}`,
        data: { agendamentoId: agendamento.id }
      });
    } catch (e) {}
    
    return htmlResponse(renderSuccessPage(agendamento, false));
    
  } catch (error) {
    console.log('Erro geral:', error.message);
    return htmlResponse(renderErrorPage('Erro ao processar', error.message), 500);
  }
});

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function renderConfirmPage(ag, codigo) {
  const dataFormatada = formatDate(ag.data_agendamento);
  const jaConfirmado = ag.status === 'Confirmado';
  
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Confirmar Presença</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;padding:40px 30px;border-radius:20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
    .logo{font-size:50px;margin-bottom:15px}
    h1{color:#333;font-size:22px;margin-bottom:25px}
    .info{background:#f8f9fa;padding:20px;border-radius:12px;margin:20px 0;text-align:left}
    .info-row{display:flex;align-items:flex-start;margin:12px 0;font-size:15px;color:#444}
    .info-row span:first-child{min-width:30px;margin-right:10px}
    .btn{display:block;width:100%;background:#28a745;color:#fff;border:none;padding:16px;font-size:18px;font-weight:600;border-radius:12px;cursor:pointer;text-decoration:none;margin-top:20px;transition:all .3s}
    .btn:hover{background:#218838;transform:translateY(-2px)}
    .badge{display:inline-block;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;${jaConfirmado?'background:#d4edda;color:#155724':'background:#fff3cd;color:#856404'}}
    .confirmed-msg{color:#28a745;font-weight:600;margin-top:20px}
  </style>
</head><body>
  <div class="card">
    <div class="logo">📅</div>
    <h1>Confirmar Presença</h1>
    <div class="info">
      <div class="info-row"><span>👤</span><span><strong>Paciente:</strong><br>${ag.paciente_nome || 'Não informado'}</span></div>
      <div class="info-row"><span>📅</span><span><strong>Data:</strong><br>${dataFormatada}</span></div>
      <div class="info-row"><span>🕐</span><span><strong>Horário:</strong><br>${ag.horario}</span></div>
      <div class="info-row"><span>📋</span><span><strong>Serviço:</strong><br>${ag.tipo_servico || 'Consulta'}</span></div>
      <div class="info-row"><span>📌</span><span><strong>Status:</strong><br><span class="badge">${ag.status}</span></span></div>
    </div>
    ${jaConfirmado 
      ? '<p class="confirmed-msg">✅ Sua presença já está confirmada!</p>'
      : `<a href="?codigo=${codigo}&confirmar=sim" class="btn">✅ Confirmar Minha Presença</a>`}
  </div>
</body></html>`;
}

function renderSuccessPage(ag, jaConfirmado) {
  const dataFormatada = formatDate(ag.data_agendamento);
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Presença Confirmada!</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;padding:40px 30px;border-radius:20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
    .icon{font-size:70px;margin-bottom:15px;animation:bounce 1s}
    @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
    h1{color:#28a745;font-size:24px;margin-bottom:10px}
    .subtitle{color:#666;margin-bottom:25px}
    .info{background:#e8f5e9;padding:20px;border-radius:12px;border-left:4px solid #28a745;text-align:left}
    .info p{margin:10px 0;color:#2e7d32;font-size:15px}
    .footer{margin-top:30px;color:#888;font-size:14px}
  </style>
</head><body>
  <div class="card">
    <div class="icon">🎉</div>
    <h1>${jaConfirmado ? 'Já Confirmado!' : 'Presença Confirmada!'}</h1>
    <p class="subtitle">${jaConfirmado ? 'Sua consulta já estava confirmada.' : 'Recebemos sua confirmação com sucesso!'}</p>
    <div class="info">
      <p>👤 <strong>${ag.paciente_nome}</strong></p>
      <p>📅 ${dataFormatada}</p>
      <p>🕐 ${ag.horario}</p>
    </div>
    <div class="footer">
      <p><strong>Centro Vida Saúde</strong></p>
      <p>Aguardamos você! 😊</p>
    </div>
  </div>
</body></html>`;
}

function renderErrorPage(titulo, mensagem) {
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Erro</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;padding:40px;border-radius:20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
    .icon{font-size:60px;margin-bottom:20px}
    h2{color:#dc3545;margin-bottom:15px}
    p{color:#666;line-height:1.6}
    .contact{margin-top:25px;padding:15px;background:#e3f2fd;border-radius:10px}
    .contact a{color:#1976d2;text-decoration:none;font-weight:600}
  </style>
</head><body>
  <div class="card">
    <div class="icon">😕</div>
    <h2>${titulo}</h2>
    <p>${mensagem}</p>
    <div class="contact">
      <p>Entre em contato conosco:</p>
      <p>📞 <a href="https://wa.me/5551985505991">WhatsApp: 51 98550-5991</a></p>
    </div>
  </div>
</body></html>`;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}