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

        const isCartao = forma_pagamento === 'Cartão Crédito' || forma_pagamento === 'Cartão Débito';
        // Integração EvoluServices ativa para pagamentos com cartão.
        const isPagamentoIntegrado = isCartao;
        if (isPagamentoIntegrado && !bandeira_cartao) {
            await base44.asServiceRole.entities.WebhookLog.create({
                endpoint: 'createOrdemServico:EvoluServices',
                method: 'POST',
                body: JSON.stringify({
                    etapa: 'validacao_envio_maquininha',
                    forma_pagamento,
                    valor: Number(valor_final) || 0,
                    paciente_nome: nomePaciente,
                    usuario: user.email
                }),
                status: 'error',
                response_sent: 'Pagamento não enviado: bandeira do cartão não informada'
            });
            return Response.json({
                success: false,
                error: 'Selecione a bandeira do cartão para enviar o pagamento à maquininha.'
            }, { status: 400 });
        }

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
        
        // Segurança: se o pagamento envolve PIX (puro ou em múltiplas formas),
        // o status só pode ser confirmado pelo webhook do Sicredi
        const envolvePix = forma_pagamento === 'PIX' ||
            (Array.isArray(body.pagamentos_detalhados) && body.pagamentos_detalhados.some(p => p?.forma === 'PIX'));
        if (envolvePix) {
            dadosOS.status_pagamento = 'Pendente';
            dadosOS.data_pagamento = null;
        }

        console.log('💾 Criando OS com valores:', {
            numero_os: dadosOS.numero_os,
            valor_final: dadosOS.valor_final,
            valor_total: dadosOS.valor_total
        });
        
        const novaOS = await base44.asServiceRole.entities.OrdemServico.create(dadosOS);
        console.log('✅ OS criada com ID:', novaOS.id);

        // Integração EvoluServices (maquininha de produção) para pagamentos com cartão.
        let transactionResponse = null;
        let pagamentoLog = null;

        if (isPagamentoIntegrado) {
            console.log('💳 Iniciando transação na EvoluServices (maquininha)...');
            pagamentoLog = await base44.asServiceRole.entities.WebhookLog.create({
                endpoint: 'createOrdemServico:EvoluServices',
                method: 'POST',
                body: JSON.stringify({
                    etapa: 'envio_maquininha_producao',
                    ordem_servico_id: novaOS.id,
                    numero_os: novaOS.numero_os,
                    forma_pagamento,
                    bandeira_cartao,
                    parcelas: Number(parcelas) || 1,
                    valor: Number(valor_final) || 0,
                    paciente_nome: nomePaciente
                }),
                status: 'processing',
                response_sent: 'Preparando autenticação e envio para a maquininha de produção'
            });

            // Forçar status Pendente — só o callback da EvoluServices confirma o pagamento
            await base44.asServiceRole.entities.OrdemServico.update(novaOS.id, {
                status_pagamento: 'Pendente',
                data_pagamento: null
            });

            // A EvoluServices aceita a callbackUrl no subdomínio público do app (*.base44.app).
            // Apontamos para a função callbackOrdemServico, que concilia o pagamento de verdade.
            const appId = Deno.env.get("BASE44_APP_ID");
            const callbackUrl = `https://${appId}.base44.app/api/apps/${appId}/functions/callbackOrdemServico`;

            try {
                // PRODUÇÃO EvoluServices — credenciais do estabelecimento Glória Virtual
                const EVOLU_BASE = 'https://api.evoluservices.com';
                const merchantId = '70b017c7-8eab-40a5-a277-abc56e930862';

                // Obter Bearer token de produção (expira, então geramos a cada transação)
                const tokenResp = await fetch(`${EVOLU_BASE}/remote/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ auth: { username: 'gloriavirtual', apiKey: 'gput096geXHC0DGR' } })
                });
                const tokenData = await tokenResp.json();
                const bearerToken = tokenData.Bearer;
                if (!tokenResp.ok || !bearerToken) throw new Error('Falha na autenticação com a EvoluServices (produção)');

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

                const resp = await fetch(`${EVOLU_BASE}/remote/transaction`, {
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

                await base44.asServiceRole.entities.WebhookLog.update(pagamentoLog.id, {
                    status: resp.ok && success && txId ? 'success' : 'error',
                    response_sent: JSON.stringify({
                        http_status: resp.status,
                        success,
                        transaction_id: txId || null,
                        resposta: transactionResponse
                    })
                });

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
                if (pagamentoLog?.id) {
                    await base44.asServiceRole.entities.WebhookLog.update(pagamentoLog.id, {
                        status: 'error',
                        response_sent: JSON.stringify({ etapa: 'erro_envio_maquininha', erro: err.message })
                    });
                }
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