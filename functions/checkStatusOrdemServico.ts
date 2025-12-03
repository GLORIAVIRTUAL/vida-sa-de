import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { os_id } = await req.json();
        if (!os_id) {
            return Response.json({ error: 'OS ID required' }, { status: 400 });
        }

        // 2. Buscar OS
        const os = await base44.asServiceRole.entities.OrdemServico.get(os_id);
        if (!os || !os.transaction_id) {
            return Response.json({ error: 'OS not found or no transaction ID' }, { status: 404 });
        }

        // 3. Configuração API
        let API_URL = Deno.env.get("EVOLUSERVICES_API_URL");
        const API_TOKEN = Deno.env.get("EVOLUSERVICES_TOKEN");

        if (!API_URL || !API_TOKEN) {
            return Response.json({ error: 'Missing API config' }, { status: 500 });
        }

        API_URL = API_URL.trim();
        if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
        if (API_URL.endsWith('/remote/transaction')) API_URL = API_URL.replace('/remote/transaction', '');

        console.log(`🔍 Consultando status da transação: ${os.transaction_id}`);

        // 4. Consultar EvoluServices (Tentativa de GET)
        console.log(`📡 GET ${API_URL}/remote/transaction/${os.transaction_id}`);
        
        const resp = await fetch(`${API_URL}/remote/transaction/${os.transaction_id}`, {
            method: 'GET',
            headers: {
                'bearer': API_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            console.error('❌ Erro ao consultar API:', errorText);
            // Retornar 200 com success:false para o frontend exibir o erro ao invés de cair no catch genérico
            return Response.json({ 
                success: false, 
                error: `Erro na maquininha: ${resp.status} - ${errorText.substring(0, 100)}` 
            });
        }

        const data = await resp.json();
        console.log('📥 Dados recebidos:', JSON.stringify(data));

        // 5. Atualizar OS se necessário
        const status = data.status || data.transaction?.status;
        const statusUpper = String(status || '').toUpperCase();
        let novoStatus = os.status_pagamento;
        let updated = false;

        if (['CONFIRMED', 'APPROVED', 'SUCESSO', 'PAID', 'CAPTURED', 'AUTHORIZED', 'COMPLETED'].includes(statusUpper)) {
            novoStatus = 'Pago';
            updated = true;
        } else if (['CANCELLED', 'DENIED', 'FAILED', 'VOIDED', 'REFUNDED', 'REVERSED'].includes(statusUpper)) {
            novoStatus = 'Cancelado';
            updated = true;
        }

        if (updated && novoStatus !== os.status_pagamento) {
            await base44.asServiceRole.entities.OrdemServico.update(os.id, {
                status_pagamento: novoStatus,
                nsu: data.nsu || data.transaction?.nsu || os.nsu,
                autorizacao: data.authorizationCode || data.transaction?.authorizationCode || os.autorizacao,
                observacoes: (os.observacoes || '') + `\n[CheckManual]: Status atualizado para ${status}`
            });
            return Response.json({ success: true, status: novoStatus, updated: true });
        }

        return Response.json({ success: true, status: os.status_pagamento, updated: false, remoteStatus: status });

    } catch (error) {
        console.error('❌ Erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});