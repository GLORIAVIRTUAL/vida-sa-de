import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        console.log('[VendaCartao] Function Started');
        const base44 = createClientFromRequest(req);
        
        // 1. Autenticação
        const user = await base44.auth.me();
        if (!user) {
            console.log('[VendaCartao] Unauthorized access attempt');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.log('[VendaCartao] Authenticated user:', user.email);

        // 2. Verificar Segredos
        let API_URL = Deno.env.get("EVOLUSERVICES_API_URL");
        const API_TOKEN = Deno.env.get("EVOLUSERVICES_TOKEN");
        const MERCHANT_ID = Deno.env.get("EVOLUSERVICES_MERCHANT_ID");

        if (!API_URL || !API_TOKEN || !MERCHANT_ID) {
            console.error('[VendaCartao] Missing Payment Secrets');
            return Response.json({ 
                error: 'Configuração de pagamento incompleta. Verifique os segredos da EvoluServices.' 
            }, { status: 500 });
        }

        // Sanitizar URL
        API_URL = API_URL.trim();
        if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
        if (API_URL.endsWith('/remote/transaction')) API_URL = API_URL.replace('/remote/transaction', '');

        // 3. Parse Body
        let body;
        try {
            body = await req.json();
        } catch (e) {
            console.error('[VendaCartao] Invalid JSON body:', e);
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        console.log('[VendaCartao] Body received, processing...');
        
        const {
            tipo_plano,
            titular,
            dependentes = [],
            forma_pagamento,
            valor_total,
            observacoes,
            bandeira_cartao
        } = body;

        // Helper para limpar datas vazias e objetos para o schema VendaCartao
        const prepareTitularForVenda = (t) => {
            const res = {
                nome: t.nome,
                cpf: t.cpf,
                telefone: t.telefone || "",
                endereco: t.endereco || {}
            };
            if (t.data_nascimento && typeof t.data_nascimento === 'string' && t.data_nascimento.trim() !== '') {
                res.data_nascimento = t.data_nascimento;
            }
            return res;
        };

        const prepareDependenteForVenda = (d) => {
            const res = {
                nome: d.nome,
                cpf: d.cpf
            };
            if (d.data_nascimento && typeof d.data_nascimento === 'string' && d.data_nascimento.trim() !== '') {
                res.data_nascimento = d.data_nascimento;
            }
            return res;
        };

        // Preparar objetos limpos para salvar na Venda (sem campos extras como email/beneficio)
        const titularVenda = prepareTitularForVenda(titular);
        const dependentesVenda = (dependentes && Array.isArray(dependentes)) 
            ? dependentes.map(prepareDependenteForVenda) 
            : [];

        // Para criação do PACIENTE, usamos o objeto original (que pode ter email, etc)
        // mas limpamos a data se estiver vazia para evitar erro
        if (titular.data_nascimento === '') delete titular.data_nascimento;
        if (dependentes && Array.isArray(dependentes)) {
            dependentes.forEach(d => {
                if (d.data_nascimento === '') delete d.data_nascimento;
            });
        }

        // Validação de campos obrigatórios
        if (!tipo_plano || !titular || !titular.nome || !titular.cpf || !forma_pagamento) {
            console.error('[VendaCartao] Missing required fields in body');
            return Response.json({ error: 'Campos obrigatórios faltando.' }, { status: 400 });
        }

        // 4. Buscar Categoria
        const categorias = await base44.asServiceRole.entities.CategoriaPreco.list();
        const categoriaCartao = categorias.find(c => 
            c.nome && c.nome.toLowerCase().includes('cartão') && c.nome.toLowerCase().includes('mais')
        ) || categorias[0];
        const nomeConvenio = categoriaCartao ? categoriaCartao.nome : 'Cartão Mais Vida';

        // 5. Criar Pacientes
        console.log('[VendaCartao] Creating Patients...');
        let pacienteTitular;
        try {
            pacienteTitular = await base44.asServiceRole.entities.Paciente.create({
                nome: titular.nome,
                cpf: titular.cpf,
                data_nascimento: titular.data_nascimento,
                telefone: titular.telefone || "", 
                endereco: titular.endereco || {},
                convenio: nomeConvenio,
                observacoes: `Cliente do Cartão Mais Vida - ${tipo_plano}`
            });
        } catch (err) {
            console.error('[VendaCartao] Error creating titular:', err);
            throw new Error(`Erro ao criar paciente titular: ${err.message}`);
        }

        const dependentesIds = [];
        if (dependentes && dependentes.length > 0) {
            for (const dep of dependentes) {
                try {
                    const pacienteDep = await base44.asServiceRole.entities.Paciente.create({
                        nome: dep.nome,
                        cpf: dep.cpf,
                        data_nascimento: dep.data_nascimento,
                        telefone: titular.telefone || "",
                        endereco: titular.endereco || {},
                        convenio: nomeConvenio,
                        observacoes: `Dependente de ${titular.nome}`
                    });
                    dependentesIds.push(pacienteDep.id);
                } catch (err) {
                    console.error('[VendaCartao] Error creating dependente:', err);
                    // Continue or fail? Let's continue but log
                }
            }
        }

        // 6. Preparar Venda
        const numeroVenda = `CMV-${Date.now()}`;
        const dataVenda = body.data_venda || new Date().toISOString().split('T')[0];
        let validadeCartao = body.validade_cartao;
        if (!validadeCartao) {
            const data = new Date();
            data.setFullYear(data.getFullYear() + 1);
            validadeCartao = data.toISOString().split('T')[0];
        }

        const isPagamentoIntegrado = forma_pagamento.includes('Cartão') && bandeira_cartao;
        const statusInicial = isPagamentoIntegrado ? 'Pendente' : 'Ativo';

        console.log(`[VendaCartao] Creating Sale Record (Status: ${statusInicial})`);
        
        const novaVenda = await base44.asServiceRole.entities.VendaCartao.create({
            numero_venda: numeroVenda,
            tipo_plano,
            titular: titularVenda,
            dependentes: dependentesVenda,
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

        // 7. Integração EvoluServices
        if (isPagamentoIntegrado) {
            console.log('[VendaCartao] Starting Payment Integration...');
            
            const host = req.headers.get("host") || ""; 
            const callbackUrl = `https://${host}/functions/callbackVendaCartao`;
            
            const payloadEvolu = {
                transaction: {
                    merchantId: MERCHANT_ID,
                    value: parseFloat(valor_total).toFixed(2),
                    installments: body.numero_parcelas || 1,
                    paymentBrand: bandeira_cartao,
                    callbackUrl: callbackUrl,
                    clientName: titular.nome
                }
            };

            console.log('[VendaCartao] Sending to API:', API_URL + '/remote/transaction');
            
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
                console.log('[VendaCartao] Payment Response:', transactionResponse);

                if (resp.ok && transactionResponse.success === "true") {
                    const status = transactionResponse.status || transactionResponse.transaction?.status;
                    const statusUpper = String(status || '').toUpperCase();
                    let novoStatus = 'Pendente';
                    if (['CONFIRMED', 'APPROVED', 'SUCESSO', 'PAID', 'CAPTURED', 'AUTHORIZED', 'COMPLETED'].includes(statusUpper)) {
                        novoStatus = 'Ativo';
                    }

                    await base44.asServiceRole.entities.VendaCartao.update(novaVenda.id, {
                        transaction_id: transactionResponse.transactionId,
                        status: novoStatus,
                        nsu: transactionResponse.nsu || transactionResponse.transaction?.nsu,
                        autorizacao: transactionResponse.authorizationCode || transactionResponse.transaction?.authorizationCode
                    });
                } else {
                    const errorMsg = transactionResponse.error || 'Erro desconhecido na maquininha';
                    console.error('[VendaCartao] Payment Failed:', errorMsg);
                    
                    await base44.asServiceRole.entities.VendaCartao.update(novaVenda.id, {
                        status: 'Falha Pagamento',
                        observacoes: `Erro na integração: ${errorMsg}`
                    });
                    
                    return Response.json({
                        success: true,
                        message: 'Venda registrada, mas erro na maquininha: ' + errorMsg,
                        venda: novaVenda,
                        transaction: transactionResponse
                    });
                }
            } catch (err) {
                console.error('[VendaCartao] Payment API Error:', err);
                await base44.asServiceRole.entities.VendaCartao.update(novaVenda.id, {
                    status: 'Falha Pagamento',
                    observacoes: `Erro de comunicação: ${err.message}`
                });
                return Response.json({
                    success: true,
                    message: 'Venda registrada, mas erro de comunicação: ' + err.message,
                    venda: novaVenda,
                    transaction: null
                });
            }
        }

        console.log('[VendaCartao] Success');
        return Response.json({
            success: true,
            message: isPagamentoIntegrado ? 'Solicitação enviada para a maquininha' : 'Venda registrada com sucesso',
            venda: novaVenda,
            transaction: transactionResponse
        });

    } catch (error) {
        console.error('[VendaCartao] FATAL ERROR:', error);
        return Response.json({ 
            success: false, 
            error: error.message || 'Erro interno no servidor' 
        }, { status: 500 });
    }
});