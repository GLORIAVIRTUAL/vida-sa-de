import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Verificar Segredos
        let API_URL = Deno.env.get("EVOLUSERVICES_API_URL");
        const API_TOKEN = Deno.env.get("EVOLUSERVICES_TOKEN");
        const MERCHANT_ID = Deno.env.get("EVOLUSERVICES_MERCHANT_ID");

        if (!API_URL || !API_TOKEN || !MERCHANT_ID) {
            return Response.json({ 
                error: 'Configuração de pagamento incompleta.' 
            }, { status: 500 });
        }

        // Sanitizar URL
        API_URL = API_URL.trim();
        if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
        if (API_URL.endsWith('/remote/transaction')) API_URL = API_URL.replace('/remote/transaction', '');

        const body = await req.json();
        const {
            paciente_id,
            valor_final,
            forma_pagamento,
            bandeira_cartao,
            parcelas
        } = body;

        // 3. Buscar Paciente para dados
        const paciente = await base44.asServiceRole.entities.Paciente.get(paciente_id);
        if (!paciente) {
            return Response.json({ error: 'Paciente não encontrado' }, { status: 404 });
        }
        
        console.log('👤 Paciente encontrado:', paciente.nome);

        // 4. Criar Ordem de Serviço (Inicialmente Pendente)
        console.log('💾 Criando OS...');
        // Garantir que paciente_nome seja salvo se o campo existir na entidade (usuário pode ter adicionado)
        const dadosOS = { ...body, paciente_nome: paciente.nome };
        const novaOS = await base44.asServiceRole.entities.OrdemServico.create(dadosOS);

        const isPagamentoIntegrado = (forma_pagamento === 'Cartão Crédito' || forma_pagamento === 'Cartão Débito') && bandeira_cartao;
        let transactionResponse = null;

        if (isPagamentoIntegrado) {
            console.log('💳 Iniciando transação na EvoluServices...');
            
            const host = req.headers.get("host") || "";
            const callbackUrl = `https://${host}/functions/callbackOrdemServico`;
            
            const payloadEvolu = {
                transaction: {
                    merchantId: MERCHANT_ID,
                    value: parseFloat(valor_final).toFixed(2),
                    installments: parcelas || 1,
                    paymentBrand: bandeira_cartao,
                    callbackUrl: callbackUrl,
                    clientName: paciente.nome
                }
            };

            console.log('📤 Enviando para API:', API_URL + '/remote/transaction');

            try {
                const resp = await fetch(`${API_URL}/remote/transaction`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'bearer': API_TOKEN
                    },
                    body: JSON.stringify(payloadEvolu)
                });

                transactionResponse = await resp.json();
                console.log('📥 Resposta EvoluServices:', transactionResponse);

                const txId = transactionResponse.transactionId || transactionResponse.transaction?.transactionId;
                const success = transactionResponse.success === "true" || transactionResponse.success === true;

                // Salvar Transaction ID sempre que disponível, mesmo se success for false (para debug/consulta futura)
                if (txId) {
                    const status = transactionResponse.status || transactionResponse.transaction?.status;
                    const statusUpper = String(status || '').toUpperCase();
                    
                    let novoStatus = 'Pendente';
                    if (success && ['CONFIRMED', 'APPROVED', 'SUCESSO', 'PAID', 'CAPTURED', 'AUTHORIZED', 'COMPLETED'].includes(statusUpper)) {
                        novoStatus = 'Pago';
                    }

                    console.log(`💾 Atualizando OS com TransactionID: ${txId} | Status: ${novoStatus}`);

                    await base44.asServiceRole.entities.OrdemServico.update(novaOS.id, {
                        transaction_id: txId,
                        status_pagamento: novoStatus,
                        nsu: transactionResponse.nsu || transactionResponse.transaction?.nsu,
                        autorizacao: transactionResponse.authorizationCode || transactionResponse.transaction?.authorizationCode,
                        data_pagamento: novoStatus === 'Pago' ? new Date().toISOString() : null,
                        observacoes: (novaOS.observacoes || '') + (success ? '' : `\n[Alerta]: API retornou success=false mas gerou ID. Status: ${status}`)
                    });
                }

                if (resp.ok && success) {
                    // Sucesso confirmado
                } else {
                    await base44.asServiceRole.entities.OrdemServico.update(novaOS.id, {
                        observacoes: (novaOS.observacoes || '') + `\n[Erro Pagamento]: ${transactionResponse.error || 'Falha na comunicação'}`
                    });
                    // Não lançar erro para não perder a OS, mas retornar alerta
                    return Response.json({
                        success: true,
                        message: 'OS criada, mas houve erro ao comunicar com a maquininha. Verifique o status.',
                        os: novaOS,
                        transaction: transactionResponse
                    });
                }
            } catch (err) {
                console.error('Erro na chamada API:', err);
                await base44.asServiceRole.entities.OrdemServico.update(novaOS.id, {
                    observacoes: (novaOS.observacoes || '') + `\n[Erro Pagamento]: ${err.message}`
                });
            }
        }

        return Response.json({
            success: true,
            message: isPagamentoIntegrado ? 'Solicitação enviada para a maquininha' : 'Ordem de Serviço criada com sucesso',
            os: novaOS,
            transaction: transactionResponse
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});