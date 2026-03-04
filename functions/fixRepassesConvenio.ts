import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('Iniciando correção de repasses...');

        // Buscar todos os médicos
        const medicos = await base44.asServiceRole.entities.Medico.list();
        const medicosMap = {};
        medicos.forEach(m => {
            medicosMap[m.id] = m;
        });

        // Buscar todas as categorias
        const categorias = await base44.asServiceRole.entities.CategoriaPreco.list();
        const categoriasMap = {};
        categorias.forEach(c => {
            categoriasMap[c.id] = c;
        });

        // Buscar todos os procedimentos
        const procedimentos = await base44.asServiceRole.entities.Procedimento.list();
        const procedimentosMap = {};
        procedimentos.forEach(p => {
            procedimentosMap[p.id] = p;
        });

        // Buscar ordens de serviço (paginando)
        let todasOrdens = [];
        let skip = 0;
        const limit = 500;
        while (true) {
            const batch = await base44.asServiceRole.entities.OrdemServico.list('-created_date', limit, skip);
            if (!batch || batch.length === 0) break;
            todasOrdens = [...todasOrdens, ...batch];
            if (batch.length < limit) break;
            skip += limit;
        }

        console.log(`Total de OS encontradas: ${todasOrdens.length}`);

        let atualizadas = 0;
        let erros = 0;
        const detalhes = [];

        for (const os of todasOrdens) {
            // Ignorar OS sem médico ou sem categoria
            if (!os.medico_id || !os.categoria_preco_id) continue;

            const medicoAtual = medicosMap[os.medico_id];
            if (!medicoAtual) continue;

            const categoria = categoriasMap[os.categoria_preco_id];
            if (!categoria) continue;

            const categoriaNome = categoria.nome || '';
            const categoriaNormalizada = categoriaNome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
            const isParticular = categoriaNormalizada === 'PARTICULAR';
            const isCartaoMaisVida = categoriaNormalizada.includes('CARTAO') && categoriaNormalizada.includes('MAIS') && categoriaNormalizada.includes('VIDA');
            const isentoImposto = isParticular || isCartaoMaisVida;

            // Buscar configuração específica por categoria
            const repasseEspecifico = medicoAtual.repasses_por_categoria?.find(
                r => r.categoria_id === os.categoria_preco_id
            );

            let repasseFixo = 0;
            let percentual = 0;
            const tipoRepasse = medicoAtual.tipo_repasse || 'percentual';

            if (os.tipo_servico === 'Procedimento' && os.procedimento_id) {
                const procedimento = procedimentosMap[os.procedimento_id];
                
                if (procedimento && procedimento.valor_repasse_medico > 0) {
                    repasseFixo = procedimento.valor_repasse_medico;
                } else if (repasseEspecifico && (repasseEspecifico.valor_procedimento > 0 || repasseEspecifico.tipo_repasse === 'valor_fixo')) {
                    if (repasseEspecifico.tipo_repasse === 'valor_fixo') {
                        repasseFixo = repasseEspecifico.valor_procedimento || 0;
                    } else {
                        percentual = repasseEspecifico.valor_procedimento || 0;
                    }
                } else if (tipoRepasse === 'valor_fixo') {
                    repasseFixo = isParticular
                        ? (medicoAtual.valor_repasse_fixo_procedimento || medicoAtual.valor_repasse_fixo || 0)
                        : (medicoAtual.valor_repasse_fixo_procedimento_convenio || medicoAtual.valor_repasse_fixo_convenio || 0);
                } else {
                    percentual = isParticular
                        ? (medicoAtual.percentual_repasse_procedimento || medicoAtual.percentual_repasse || 0)
                        : (medicoAtual.percentual_repasse_procedimento_convenio || medicoAtual.percentual_repasse_convenio || 0);
                }
            } else {
                // Consultas
                if (repasseEspecifico) {
                    if (repasseEspecifico.tipo_repasse === 'valor_fixo') {
                        repasseFixo = repasseEspecifico.valor || 0;
                    } else {
                        percentual = repasseEspecifico.valor || 0;
                    }
                } else if (tipoRepasse === 'valor_fixo') {
                    repasseFixo = isParticular
                        ? (medicoAtual.valor_repasse_fixo || 0)
                        : (medicoAtual.valor_repasse_fixo_convenio || 0);
                } else {
                    percentual = isParticular
                        ? (medicoAtual.percentual_repasse || 0)
                        : (medicoAtual.percentual_repasse_convenio || medicoAtual.percentual_repasse || 0);
                }
            }

            let novoRepasseMedico = 0;

            if (repasseFixo > 0) {
                novoRepasseMedico = repasseFixo;
            } else if (percentual > 0) {
                const valorFinalVenda = (os.valor_total || 0) - (os.desconto || 0) + (os.acrescimo_manual || 0);
                const bruto = valorFinalVenda * (percentual / 100);
                novoRepasseMedico = isentoImposto ? bruto : bruto * 0.90;
            }

            // Arredondar para 2 casas decimais para evitar problemas de precisão
            novoRepasseMedico = Math.round(novoRepasseMedico * 100) / 100;
            const repasseAtual = Math.round((os.valor_repasse_medico || 0) * 100) / 100;

            // Se o valor calculado for diferente do atual, atualizar
            if (Math.abs(novoRepasseMedico - repasseAtual) > 0.01) {
                try {
                    const novoValorClinica = Math.round(((os.valor_final || 0) - novoRepasseMedico - (os.valor_repasse_laboratorio || 0)) * 100) / 100;
                    
                    await base44.asServiceRole.entities.OrdemServico.update(os.id, {
                        valor_repasse_medico: novoRepasseMedico,
                        valor_clinica: novoValorClinica
                    });
                    
                    // Adicionar pequeno delay para evitar rate limit
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    atualizadas++;
                    detalhes.push({
                        os_id: os.id,
                        paciente: os.paciente_nome,
                        medico: medicoAtual.nome,
                        categoria: categoriaNome,
                        valor_antigo: repasseAtual,
                        valor_novo: novoRepasseMedico,
                        data: os.data_execucao
                    });
                } catch (e) {
                    erros++;
                    console.error(`Erro ao atualizar OS ${os.id}:`, e);
                    // Em caso de erro (ex: rate limit), esperar mais tempo
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        return Response.json({ 
            success: true, 
            message: `Processo concluído. ${atualizadas} OSs atualizadas.`,
            atualizadas,
            erros,
            detalhes
        });
    } catch (error) {
        console.error('Erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});