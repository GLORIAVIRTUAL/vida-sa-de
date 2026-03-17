import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const handleOptions = (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
};

Deno.serve(async (req) => {
    console.log('🚀 [createappointment] Iniciando criação de agendamento via API');

    const optionsResponse = handleOptions(req);
    if (optionsResponse) return optionsResponse;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };

    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        
        console.log('📦 [createappointment] Body recebido:', JSON.stringify(body, null, 2));

        let {
            medico_id,
            data_agendamento,
            horario,
            nomepaciente,
            telefonepaciente,
            cpfpaciente,
            emailpaciente,
            tipo_servico = 'Consulta',
            categoria_preco_id,
            observacoes
        } = body;

        // Extrair dados de paciente_novo se existir
        if (body.paciente_novo) {
            console.log('👤 [createappointment] Extraindo dados de paciente_novo');
            nomepaciente = body.paciente_novo.nomepaciente || nomepaciente;
            telefonepaciente = body.paciente_novo.telefonepaciente || telefonepaciente;
            cpfpaciente = body.paciente_novo.cpfpaciente || cpfpaciente;
            emailpaciente = body.paciente_novo.emailpaciente || emailpaciente;
        }

        console.log('⏰ [createappointment] Horário recebido:', horario);

        // Normalizar horário
        if (horario) {
            if (horario.includes('T')) {
                horario = horario.split('T')[1].substring(0, 5);
            } else if (horario.includes(':')) {
                const partes = horario.split(':');
                horario = `${partes[0].padStart(2, '0')}:${partes[1].padStart(2, '0')}`;
            }
        }

        console.log('✅ [createappointment] Horário normalizado:', horario);

        // Validações
        if (!medico_id || !data_agendamento || !horario || !nomepaciente || !telefonepaciente) {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Dados obrigatórios faltando',
                dados: { medico_id, data_agendamento, horario, nomepaciente, telefonepaciente }
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
        }

        // Buscar ou criar paciente
        console.log('🔍 [createappointment] Buscando paciente...');
        let paciente = null;

        if (cpfpaciente) {
            const cpfLimpo = cpfpaciente.replace(/\D/g, '');
            const pacientesPorCpf = await base44.asServiceRole.entities.Paciente.filter({ cpf: cpfLimpo });
            if (pacientesPorCpf.length > 0) {
                paciente = pacientesPorCpf[0];
                console.log('✅ [createappointment] Paciente encontrado por CPF');
            }
        }

        if (!paciente && telefonepaciente) {
            const telefoneLimpo = telefonepaciente.replace(/\D/g, '');
            const pacientesPorTelefone = await base44.asServiceRole.entities.Paciente.filter({ telefone: telefoneLimpo });
            if (pacientesPorTelefone.length > 0) {
                paciente = pacientesPorTelefone[0];
                console.log('✅ [createappointment] Paciente encontrado por telefone');
            }
        }

        if (!paciente) {
            console.log('➕ [createappointment] Criando novo paciente...');
            paciente = await base44.asServiceRole.entities.Paciente.create({
                nome: nomepaciente,
                telefone: telefonepaciente.replace(/\D/g, ''),
                cpf: cpfpaciente ? cpfpaciente.replace(/\D/g, '') : null,
                email: emailpaciente || null,
                convenio: 'Particular'
            });
            console.log('✅ [createappointment] Paciente criado:', paciente.id);
        }

        // Buscar médico
        const medico = await base44.asServiceRole.entities.Medico.get(medico_id);
        if (!medico) {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Médico não encontrado'
            }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
        }

        console.log('👨‍⚕️ [createappointment] Médico encontrado:', medico.nome);

        // Buscar categoria Particular se não foi especificada
        let categoriaId = categoria_preco_id;
        if (!categoriaId) {
            const categorias = await base44.asServiceRole.entities.CategoriaPreco.list();
            const particular = categorias.find(c => c.nome.toUpperCase().includes('PARTICULAR'));
            if (particular) {
                categoriaId = particular.id;
                console.log('✅ [createappointment] Categoria PARTICULAR encontrada:', categoriaId);
            }
        }

        // Buscar procedimento de consulta para esta especialidade
        console.log('🔍 [createappointment] Buscando procedimento de consulta...');
        let valorTotal = 120; // Valor padrão
        let procedimentoId = null;

        try {
            const procedimentos = await base44.asServiceRole.entities.Procedimento.list();
            const especialidadeNorm = medico.especialidade.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            // Buscar procedimento que contém "CONSULTA" e a especialidade
            const procedimentoConsulta = procedimentos.find(p => {
                const nomeNorm = p.nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return nomeNorm.includes('CONSULTA') && 
                       (nomeNorm.includes(especialidadeNorm) || p.especialidade === medico.especialidade);
            });

            if (procedimentoConsulta) {
                procedimentoId = procedimentoConsulta.id;
                console.log('✅ [createappointment] Procedimento encontrado:', procedimentoConsulta.nome);

                // Buscar valor na tabela de preços
                if (categoriaId) {
                    const tabelaPrecos = await base44.asServiceRole.entities.TabelaPreco.list();
                    const preco = tabelaPrecos.find(tp => 
                        tp.procedimento_id === procedimentoId && 
                        tp.categoria_id === categoriaId
                    );
                    
                    if (preco) {
                        valorTotal = preco.valor;
                        console.log('💰 [createappointment] Valor da tabela:', valorTotal);
                    } else {
                        console.log('⚠️  [createappointment] Preço não encontrado na tabela, usando valor padrão');
                    }
                }
            } else {
                console.log('⚠️  [createappointment] Procedimento de consulta não encontrado, usando valor padrão');
            }
        } catch (error) {
            console.error('❌ [createappointment] Erro ao buscar procedimento:', error.message);
        }

        // CRIAR AGENDAMENTO COM PROCEDIMENTO_ID
        const dadosAgendamento = {
            paciente_id: paciente.id,
            medico_id: medico_id,
            data_agendamento: data_agendamento,
            horario: horario,
            tipo_servico: tipo_servico,
            procedimento_id: procedimentoId, // IMPORTANTE: incluir o ID do procedimento
            categoria_preco_id: categoriaId,
            valor_total: valorTotal,
            status: 'Agendado',
            forma_pagamento: 'A definir',
            observacoes: observacoes || 'Agendamento via API'
        };

        console.log('💾 [createappointment] Criando agendamento:', JSON.stringify(dadosAgendamento, null, 2));

        const novoAgendamento = await base44.asServiceRole.entities.Agendamento.create(dadosAgendamento);

        console.log('🎉 [createappointment] Agendamento criado:', novoAgendamento.id);
        console.log('🎉 [createappointment] Horário registrado:', novoAgendamento.horario);

        // Criar notificação
        try {
            await base44.asServiceRole.entities.Notification.create({
                type: 'novo_agendamento',
                message: `Novo agendamento: ${nomepaciente} com ${medico.nome} em ${data_agendamento} às ${horario}`,
                data: {
                    agendamentoId: novoAgendamento.id,
                    paciente_nome: nomepaciente,
                    medico_nome: medico.nome,
                    data_agendamento: data_agendamento,
                    horario: horario
                }
            });
        } catch (e) {
            console.log('⚠️ [createappointment] Erro ao criar notificação (não crítico)');
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Agendamento criado! ${nomepaciente} está agendado com ${medico.nome} em ${data_agendamento} às ${horario}.`,
            agendamento: {
                id: novoAgendamento.id,
                paciente_nome: nomepaciente,
                paciente_telefone: telefonepaciente,
                medico_nome: medico.nome,
                especialidade: medico.especialidade,
                data: data_agendamento,
                horario: novoAgendamento.horario,
                valor: valorTotal,
                status: 'Agendado',
                procedimento_id: procedimentoId
            }
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('❌ [createappointment] Erro:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: 'Erro ao criar agendamento',
            details: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});