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
                error: 'Configuração de pagamento incompleta. Contate o suporte para configurar os segredos da EvoluServices.' 
            }, { status: 500 });
        }

        // Sanitizar URL
        API_URL = API_URL.trim();
        if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
        if (API_URL.endsWith('/remote/transaction')) API_URL = API_URL.replace('/remote/transaction', '');

        const body = await req.json();
        
        // 3. Validação básica
        const {
            tipo_plano,
            titular,
            dependentes = [],
            forma_pagamento,
            valor_total,
            observacoes,
            bandeira_cartao // Obrigatório para transação remota
        } = body;

        if (!tipo_plano || !titular || !titular.nome || !titular.cpf || !forma_pagamento) {
            return Response.json({ 
                error: 'Campos obrigatórios faltando.' 
            }, { status: 400 });
        }

        // 4. Buscar categoria "Cartão Mais Vida"
        const categorias = await base44.asServiceRole.entities.CategoriaPreco.list();
        const categoriaCartao = categorias.find(c => 
            c.nome.toLowerCase().includes('cartão') && 
            c.nome.toLowerCase().includes('mais')
        ) || categorias[0]; // Fallback

        const nomeConvenio = categoriaCartao ? categoriaCartao.nome : 'Cartão Mais Vida';

        // 5. Criar Pacientes (Titular e Dependentes)
        console.log('👤 Criando pacientes...');
        const pacienteTitular = await base44.asServiceRole.entities.Paciente.create({
            nome: titular.nome,
            cpf: titular.cpf,
            data_nascimento: titular.data_nascimento,
            telefone: titular.telefone,
            endereco: titular.endereco,
            convenio: nomeConvenio,
            observacoes: `Cliente do Cartão Mais Vida - ${tipo_plano}`
        });

        const dependentesIds = [];
        if (dependentes.length > 0) {
            for (const dep of dependentes) {
                const pacienteDep = await base44.asServiceRole.entities.Paciente.create({
                    nome: dep.nome,
                    cpf: dep.cpf,
                    data_nascimento: dep.data_nascimento,
                    telefone: titular.telefone,
                    endereco: titular.endereco,
                    convenio: nomeConvenio,
                    observacoes: `Dependente de ${titular.nome}`
                });
                dependentesIds.push(pacienteDep.id);
            }
        }

        // 6. Preparar dados da venda
        const numeroVenda = `CMV-${Date.now()}`;
        const dataVenda = body.data_venda || new Date().toISOString().split('T')[0];
        let validadeCartao = body.validade_cartao;
        if (!validadeCartao) {
            const data = new Date();
            data.setFullYear(data.getFullYear() + 1);
            validadeCartao = data.toISOString().split('T')[0];
        }

        // 7. Criar VendaCartao (Status PENDENTE)
        const isPagamentoIntegrado = forma_pagamento.includes('Cartão') && bandeira_cartao;
        const statusInicial = isPagamentoIntegrado ? 'Pendente' : 'Ativo';

        console.log('💾 Criando registro da venda (Status:', statusInicial, ')');
        
        const novaVenda = await base44.asServiceRole.entities.VendaCartao.create({
            numero_venda: numeroVenda,
            tipo_plano,
            titular,
            dependentes,
            paciente_titular_id: pacienteTitular.id,
            pacientes_dependentes_ids: dependentesIds,
            quantidade_cartoes: body.quantidade_cartoes || 1,
            valor_cartoes: body.valor_cartoes || 0,
            valor_plano: body.valor_plano || 0,
            valor_total: parseFloat(valor_total),
            forma_pagamento,
            numero_parcelas: body.numero_parcelas || 1,
            valor_parcela: body.valor_parcela || 0,
            data_venda: dataVenda,
            validade_cartao,
            status: statusInicial,
            observacoes: observacoes || '',
            bandeira_cartao: bandeira_cartao || ''
        });

        let transactionResponse = null;

        // 8. Se for Pagamento Integrado, chamar EvoluServices
        if (isPagamentoIntegrado) {
            console.log('💳 Iniciando transação na EvoluServices...');
            
            const host = req.headers.get("host") || ""; 
            const callbackUrl = `https://${host}/functions/callbackVendaCartao`;
            console.log('🔗 Callback URL:', callbackUrl);

            const payloadEvolu = {
                auth: {
                    username: "gloria",
                    apiKey: "keygloria"
                },
                transaction: {
                    merchantId: MERCHANT_ID,
                    value: parseFloat(valor_total).toFixed(2),
                    installments: body.numero_parcelas || 1,
                    paymentBrand: bandeira_cartao,
                    callbackUrl: callbackUrl,
                    clientName: titular.nome,
                    clientDocument: titular.cpf.replace(/\D/g, ''),
                    clientEmail: titular.email,
                    installmentsCanChange: false
                }
            };

            console.log('📤 Enviando para API:', API_URL + '/remote/transaction');
            
            try {
                const resp = await fetch(`${API_URL}/remote/transaction`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_TOKEN}`
                    },
                    body: JSON.stringify(payloadEvolu)
                });

                transactionResponse = await resp.json();
                console.log('📥 Resposta EvoluServices:', transactionResponse);

                if (resp.ok && transactionResponse.success === "true") {
                    // Salvar transaction_id na venda
                    await base44.asServiceRole.entities.VendaCartao.update(novaVenda.id, {
                        transaction_id: transactionResponse.transactionId
                    });
                } else {
                    // Se falhar na API, marcar venda como cancelada ou falha
                    await base44.asServiceRole.entities.VendaCartao.update(novaVenda.id, {
                        status: 'Falha Pagamento',
                        observacoes: `Erro na integração: ${transactionResponse.error || 'Erro desconhecido'}`
                    });
                    // Não lançar erro, mas retornar aviso
                    return Response.json({
                        success: true,
                        message: 'Venda registrada, mas houve erro ao comunicar com a maquininha: ' + (transactionResponse.error || 'Erro desconhecido'),
                        venda: novaVenda,
                        transaction: transactionResponse
                    });
                }
            } catch (err) {
                console.error('Erro na chamada API:', err);
                await base44.asServiceRole.entities.VendaCartao.update(novaVenda.id, {
                    status: 'Falha Pagamento',
                    observacoes: `Erro na integração: ${err.message}`
                });
                return Response.json({
                    success: true,
                    message: 'Venda registrada, mas erro de comunicação: ' + err.message,
                    venda: novaVenda,
                    transaction: null
                });
            }
        }

        return Response.json({
            success: true,
            message: isPagamentoIntegrado ? 'Transação iniciada no terminal' : 'Venda registrada com sucesso',
            venda: novaVenda,
            transaction: transactionResponse
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});