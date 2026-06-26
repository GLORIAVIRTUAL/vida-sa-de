import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        console.log('📥 Dados recebidos para criar OS');
        console.log('📥 valor_final:', body.valor_final, 'tipo:', typeof body.valor_final);
        console.log('📥 valor_total:', body.valor_total, 'tipo:', typeof body.valor_total);
        
        const {
            paciente_id,
            paciente_nome, // Nome já vem do frontend
            valor_final,
            forma_pagamento,
            bandeira_cartao,
            parcelas
        } = body;

        // Usar nome que veio do frontend para evitar chamada extra
        let nomePaciente = paciente_nome || 'Paciente';
        
        console.log('👤 Nome do paciente:', nomePaciente);
        console.log('💰 Valor final:', valor_final);

        // 4. Criar Ordem de Serviço (Inicialmente Pendente)
        console.log('💾 Criando OS...');
        // Garantir que paciente_nome seja salvo se o campo existir na entidade (usuário pode ter adicionado)
        // Gerar Numero OS
        const now = new Date();
        const dateStr = now.toISOString().replace(/[-T:]/g, '').slice(0, 12); // YYYYMMDDHHMM
        const randomStr = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const numero_os = `${dateStr}-${randomStr}`;

        // Construir dados da OS de forma segura - garantir tipos corretos
        const dadosOS = { 
            ...body, 
            paciente_nome: nomePaciente,
            numero_os: numero_os,
            // Garantir que valores numéricos sejam números
            valor_final: Number(valor_final) || 0,
            valor_total: Number(body.valor_total) || 0,
            desconto: Number(body.desconto) || 0,
            juros: Number(body.juros) || 0,
            valor_repasse_medico: Number(body.valor_repasse_medico) || 0,
            valor_repasse_laboratorio: Number(body.valor_repasse_laboratorio) || 0,
            valor_clinica: Number(body.valor_clinica) || 0,
            parcelas: Number(body.parcelas) || 1
        };
        
        console.log('💾 Criando OS com valores:', {
            numero_os: dadosOS.numero_os,
            valor_final: dadosOS.valor_final,
            valor_total: dadosOS.valor_total
        });
        
        const novaOS = await base44.asServiceRole.entities.OrdemServico.create(dadosOS);
        console.log('✅ OS criada com ID:', novaOS.id);

        // Integração EvoluServices (maquininha) — restrita ao usuário de teste por enquanto
        const EMAILS_TESTE_CARTAO = ['dmpetrolina@gmail.com'];
        const usuarioPodeTestarCartao = user.email && EMAILS_TESTE_CARTAO.includes(user.email.toLowerCase().trim());
        const isCartao = (forma_pagamento === 'Cartão Crédito' || forma_pagamento === 'Cartão Débito') && bandeira_cartao;
        const isPagamentoIntegrado = usuarioPodeTestarCartao && isCartao;
        let transactionResponse = null;

        if (isPagamentoIntegrado) {
            console.log('💳 Iniciando transação na EvoluServices (maquininha)...');

            // Forçar status Pendente — só o callback da EvoluServices confirma o pagamento
            await base44.asServiceRole.entities.OrdemServico.update(novaOS.id, {
                status_pagamento: 'Pendente',
                data_pagamento: null
            });

            const host = req.headers.get("host") || "";
            const appId = Deno.env.get("BASE44_APP_ID");
            const callbackUrl = `https://${host}/api/apps/${appId}/functions/callbackOrdemServico`;

            try {
                // Bearer token já emitido pela EvoluServices (armazenado nas secrets)
                const bearerToken = Deno.env.get('EVOLUSERVICES_TOKEN');
                const merchantId = 'bcc1614f-431e-43cd-bf28-69020191c4dc';
                if (!bearerToken) throw new Error('Token EvoluServices não configurado');

                // Criar a transação na maquininha
                const payloadEvolu = {
                    transaction: {
                        merchantId,
                        value: parseFloat(valor_final).toFixed(2),
                        installments: Number(parcelas) || 1,
                        paymentBrand: bandeira_cartao,
                        callbackUrl,
                        clientName: nomePaciente
                    }
                };

                const resp = await fetch('https://sandbox.evoluservices.com/remote/transaction', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'bearer': bearerToken
                    },
                    body: JSON.stringify(payloadEvolu)
                });

                const respText = await resp.text();
                try { transactionResponse = JSON.parse(respText); } catch { transactionResponse = { raw: respText }; }
                console.log('📥 Resposta EvoluServices:', resp.status, respText);

                const txId = transactionResponse.transactionId || transactionResponse.transaction?.transactionId;
                const success = transactionResponse.success === "true" || transactionResponse.success === true;

                if (txId) {
                    // Apenas guarda o transactionId. Status permanece Pendente até o callback aprovar.
                    await base44.asServiceRole.entities.OrdemServico.update(novaOS.id, {
                        transaction_id: txId
                    });
                    console.log(`💾 OS aguardando pagamento na maquininha. TransactionID: ${txId}`);
                }

                if (!resp.ok || !success || !txId) {
                    await base44.asServiceRole.entities.OrdemServico.update(novaOS.id, {
                        observacoes: (novaOS.observacoes || '') + `\n[Erro Pagamento]: ${transactionResponse.error || respText || 'Falha na comunicação com a maquininha'}`
                    });
                    return Response.json({
                        success: false,
                        error: 'Não foi possível enviar para a maquininha. Verifique o terminal e tente novamente.',
                        os: novaOS,
                        transaction: transactionResponse
                    });
                }
            } catch (err) {
                console.error('Erro na chamada EvoluServices:', err);
                await base44.asServiceRole.entities.OrdemServico.update(novaOS.id, {
                    observacoes: (novaOS.observacoes || '') + `\n[Erro Pagamento]: ${err.message}`
                });
                return Response.json({
                    success: false,
                    error: 'Erro ao comunicar com a maquininha: ' + err.message,
                    os: novaOS
                });
            }
        }

        return Response.json({
            success: true,
            message: isPagamentoIntegrado ? 'Solicitação enviada para a maquininha' : 'Ordem de Serviço criada com sucesso',
            aguardando_cartao: isPagamentoIntegrado,
            os: novaOS,
            transaction: transactionResponse
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});