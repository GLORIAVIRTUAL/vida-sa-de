import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Senha de cancelamento configurada
const SENHA_CANCELAMENTO = Deno.env.get('SENHA_CANCELAMENTO_CARTAO') || '123123';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { venda_id, senha } = await req.json();

    console.log('🔐 Tentativa de cancelamento de venda:', venda_id);

    // Validar campos obrigatórios
    if (!venda_id || !senha) {
      return Response.json({ 
        error: 'venda_id e senha são obrigatórios' 
      }, { status: 400 });
    }

    // Validar senha
    if (senha !== SENHA_CANCELAMENTO) {
      console.log('❌ Senha incorreta fornecida');
      return Response.json({ 
        error: 'Senha incorreta',
        success: false 
      }, { status: 403 });
    }

    console.log('✅ Senha correta, procedendo com cancelamento...');

    // Buscar venda
    const venda = await base44.asServiceRole.entities.VendaCartao.get(venda_id);
    
    if (!venda) {
      return Response.json({ 
        error: 'Venda não encontrada' 
      }, { status: 404 });
    }

    // Verificar se já está cancelada
    if (venda.status === 'Cancelado') {
      return Response.json({ 
        error: 'Esta venda já está cancelada' 
      }, { status: 400 });
    }

    // Cancelar a venda
    await base44.asServiceRole.entities.VendaCartao.update(venda_id, {
      status: 'Cancelado'
    });

    console.log('✅ Venda cancelada com sucesso');

    return Response.json({
      success: true,
      message: 'Venda cancelada com sucesso',
      venda_id: venda_id
    });

  } catch (error) {
    console.error('❌ Erro ao cancelar venda:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});