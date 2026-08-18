import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { garantirLancamentoReceita } from '../../shared/garantirLancamentoReceita.ts';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        if (req.method !== 'POST') {
            return Response.json({ error: 'Method not allowed' }, { status: 405 });
        }

        const payload = await req.json();
        console.log('🔔 Webhook Recebido (OS):', JSON.stringify(payload));

        // Log inicial
        const callbackLog = await base44.asServiceRole.entities.WebhookLog.create({
            endpoint: 'callbackOrdemServico:EvoluServices',
            method: 'POST',
            body: JSON.stringify(payload),
            status: 'processing',
            response_sent: 'Callback recebido; buscando a Ordem de Serviço correspondente'
        });

        // Extração robusta de dados conforme documentação
        const transactionId = payload.remoteTransactionId || payload.transactionNumber || payload.transactionId || payload.transaction?.transactionId || payload.transaction?.id;
        const status = payload.status || payload.transaction?.status;
        const nsu = payload.NSU || payload.nsu || payload.transaction?.nsu;
        const authorizationCode = payload.authorizationNumber || payload.authorizationCode || payload.authorization || payload.transaction?.authorizationCode;
        const valorPayload = payload.value || payload.amount || payload.transaction?.value || payload.transaction?.amount;

        let ordemServico = null;

        // 1) Tentar casar pelo transaction_id
        if (transactionId) {
            const osList = await base44.asServiceRole.entities.OrdemServico.filter({
                transaction_id: transactionId
            });
            ordemServico = osList[0] || null;
        }

        // 2) Fallback: casar pela OS de cartão Pendente mais recente com o mesmo valor
        // (o transactionId notificado pode diferir do mascarado salvo na criação)
        if (!ordemServico) {
            const pendentes = await base44.asServiceRole.entities.OrdemServico.filter(
                { status_pagamento: 'Pendente' },
                '-created_date',
                50
            );
            const valorNum = valorPayload != null ? parseFloat(valorPayload) : null;
            ordemServico = pendentes.find(os => {
                const partesCartao = (os.pagamentos_detalhados || []).filter(p => String(p.forma || '').startsWith('Cartão'));
                const ehCartao = os.forma_pagamento === 'Cartão Crédito'
                    || os.forma_pagamento === 'Cartão Débito'
                    || (os.forma_pagamento === 'Múltiplas Formas' && partesCartao.length > 0);
                if (!ehCartao) return false;
                if (valorNum == null) return true; // sem valor no payload: pega a mais recente de cartão pendente

                // Valores que a maquininha pode ter cobrado: total da OS, cada parte no cartão ou a soma delas
                const candidatos = [Number(os.valor_final)];
                partesCartao.forEach(p => candidatos.push(Number(p.valor || 0)));
                if (partesCartao.length > 1) {
                    candidatos.push(partesCartao.reduce((s, p) => s + Number(p.valor || 0), 0));
                }
                // Tolerância para juros de parcelamento somados ao valor enviado à maquininha (até 25%)
                return candidatos.some(v => v > 0 && (Math.abs(v - valorNum) < 0.01 || (valorNum > v && valorNum <= v * 1.25)));
            }) || null;
            if (ordemServico) {
                console.log('⚠️ OS casada por fallback (valor/pendente):', ordemServico.id);
            }
        }

        if (!ordemServico) {
            console.error('❌ OS não encontrada. transactionId:', transactionId, 'valor:', valorPayload);
            await base44.asServiceRole.entities.WebhookLog.update(callbackLog.id, {
                status: 'error',
                response_sent: JSON.stringify({
                    resultado: 'OS não encontrada',
                    transaction_id: transactionId || null,
                    valor: valorPayload || null
                })
            });
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }

        // Mapear status
        let novoStatus = ordemServico.status_pagamento;
        const statusUpper = String(status || '').toUpperCase();
        
        // Mapeamento atualizado com status da documentação (APPROVED, COMPLETE, etc)
        if (['CONFIRMED', 'APPROVED', 'SUCESSO', 'PAID', 'CAPTURED', 'AUTHORIZED', 'COMPLETED', 'COMPLETE', 'PRE_APPROVED'].includes(statusUpper)) {
            novoStatus = 'Pago';
        } else if (['CANCELLED', 'DENIED', 'FAILED', 'VOIDED', 'REFUNDED', 'REVERSED', 'ABORTED', 'ABORTED_BY_MERCHANT'].includes(statusUpper)) {
            novoStatus = 'Cancelado';
        }

        await base44.asServiceRole.entities.OrdemServico.update(ordemServico.id, {
            status_pagamento: novoStatus,
            data_pagamento: novoStatus === 'Pago' ? new Date().toISOString() : ordemServico.data_pagamento,
            nsu: nsu || ordemServico.nsu,
            autorizacao: authorizationCode || ordemServico.autorizacao,
            observacoes: (ordemServico.observacoes || '') + `\n[Webhook]: Status atualizado para ${status}`
        });

        // Ao confirmar o pagamento, refletir o status no agendamento vinculado
        // (para que o card deixe de aparecer como "Agendado" e mostre a OS)
        // Ao confirmar o pagamento, gerar a receita no fluxo de caixa
        if (novoStatus === 'Pago') {
            try {
                const resLanc = await garantirLancamentoReceita(base44, ordemServico);
                console.log('💰 Lançamento de receita:', JSON.stringify(resLanc));
            } catch (e) {
                console.error('⚠️ Falha ao criar lançamento de receita:', e.message);
            }
        }

        if (novoStatus === 'Pago' && ordemServico.agendamento_id) {
            try {
                await base44.asServiceRole.entities.Agendamento.update(ordemServico.agendamento_id, {
                    status: 'Pago'
                });
            } catch (e) {
                console.error('⚠️ Não foi possível atualizar o agendamento:', e.message);
            }
        }

        await base44.asServiceRole.entities.WebhookLog.update(callbackLog.id, {
            status: 'success',
            response_sent: JSON.stringify({
                resultado: 'OS atualizada',
                ordem_servico_id: ordemServico.id,
                numero_os: ordemServico.numero_os || null,
                transaction_id: transactionId || null,
                status_recebido: status || null,
                status_pagamento: novoStatus,
                nsu: nsu || null,
                autorizacao: authorizationCode || null
            })
        });

        return Response.json({ success: true });

    } catch (error) {
        console.error('❌ Erro Webhook:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});