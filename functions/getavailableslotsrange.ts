import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

const diasSemanaMap = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

// Helper para obter o número da semana no mês (1 a 4/5)
const getWeekOfMonth = (date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    // Adjust firstDay to be 0 for Sunday, 1 for Monday, etc. consistent with getDay()
    // getDay() returns 0 for Sunday, 6 for Saturday.
    // We want the position of the first day of the month in the current week representation
    // E.g., if month starts on a Wednesday (getDay()=3), then it occupies 3 empty slots before it.
    // (date.getDate() + firstDay -1) because we are counting days from 1, and firstDay is 0-indexed offset.
    // The previous implementation was `(date.getDate() + firstDay) / 7`.
    // Let's use a more standard way for week of month:
    // week = Math.floor((day_of_month + offset_for_first_day_of_month_in_week - 1) / 7) + 1
    const adjustedDayOfMonth = date.getDate();
    const dayOfWeekOfFirstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay(); // 0 for Sunday, 1 for Monday etc.
    return Math.ceil((adjustedDayOfMonth + dayOfWeekOfFirstDay) / 7);
};

// Helper para verificar a recorrência
const checkRecorrencia = (recorrencia, date) => {
    if (!recorrencia || recorrencia === "Toda Semana") {
        return true;
    }
    if (recorrencia === "Apenas uma vez") {
        return false; // Não deve aparecer em recorrências normais, só com data específica
    }
    const weekOfMonth = getWeekOfMonth(date);
    switch (recorrencia) {
        case "1ª e 3ª Semana do Mês":
            return weekOfMonth === 1 || weekOfMonth === 3;
        case "2ª e 4ª Semana do Mês":
            return weekOfMonth === 2 || weekOfMonth === 4;
        case "Apenas 1ª Semana do Mês":
            return weekOfMonth === 1;
        case "Apenas 2ª Semana do Mês":
            return weekOfMonth === 2;
        case "Apenas 3ª Semana do Mês":
            return weekOfMonth === 3;
        case "Apenas 4ª Semana do Mês":
            return weekOfMonth === 4;
        default:
            return true; // If recurrence is unknown, treat as 'Toda Semana' for now.
    }
};

// Helper to handle CORS preflight requests
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

// authenticateRequest and its usage are removed to make the function public.
// const authenticateRequest = async (base44, req) => {
//     const authHeader = req.headers.get('Authorization');
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//         return null;
//     }
//     const apiKey = authHeader.split(' ')[1];

//     const apiKeys = await base44.asServiceRole.entities.ApiKey.filter({ key: apiKey, status: 'Ativo' });

//     if (!apiKeys || apiKeys.length === 0) {
//         return null;
//     }
//     return apiKeys[0];
// };

Deno.serve(async (req) => {
    console.log('🚀 Função PÚBLICA getavailableslotsrange foi chamada!');
    
    const optionsResponse = handleOptions(req);
    if (optionsResponse) return optionsResponse;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };

    try {
        const base44 = createClientFromRequest(req);
        
        // Log do body completo removido para tornar a função pública e simplificar
        const bodyText = await req.text();
        // console.log('📝 Body RAW recebido:', bodyText);
        
        let body;
        try {
            body = JSON.parse(bodyText);
            // console.log('📋 Body parseado:', JSON.stringify(body, null, 2));
        } catch (e) {
            console.error('❌ Erro ao fazer parse do JSON:', e);
            return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { medico_id, dias_afrente = 15 } = body; // Aumentado para 15 dias
        console.log('🔍 Valores extraídos:', { medico_id, dias_afrente });

        // REMOVIDA A AUTENTICAÇÃO - Esta função agora é pública
        // let isAuthenticated = false;
        // try {
        //     if (await base44.auth.me()) isAuthenticated = true;
        //     console.log('✅ Autenticado via sessão de usuário');
        // } catch (_e) { 
        //     console.log('❌ Não autenticado via sessão');
        // }

        // if (!isAuthenticated) {
        //     const apiKeyResult = await authenticateRequest(base44, req);
        //     if (apiKeyResult) {
        //         isAuthenticated = true;
        //         console.log('✅ Autenticado via API Key');
        //     }
        // }
        
        // if (!isAuthenticated) {
        //     console.log('❌ Falha na autenticação final');
        //     return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        //         status: 401,
        //         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        //     });
        // }

        if (!medico_id) {
            console.log('❌ medico_id é obrigatório mas não foi fornecido');
            return new Response(JSON.stringify({ 
                error: 'medico_id é obrigatório',
                received_data: { medico_id, dias_afrente }
            }), { 
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Validar e limpar medico_id
        const cleanMedicoId = medico_id.replace(/[{}]/g, '');
        console.log('🧹 ID limpo:', cleanMedicoId);

        try {
            const medico = await base44.asServiceRole.entities.Medico.get(cleanMedicoId);
            console.log('👩‍⚕️ Médico encontrado:', medico?.nome || 'Nome não disponível');
            
            if (!medico) {
                console.log('❌ Médico não encontrado no banco');
                return new Response(JSON.stringify({ 
                    error: 'Médico não encontrado',
                    medico_id_recebido: medico_id,
                    medico_id_limpo: cleanMedicoId
                }), { 
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            if (medico.status !== 'Ativo') {
                console.log('⚠️ Médico não está ativo:', medico.status);
                return new Response(JSON.stringify({ 
                    available_slots: [],
                    message: 'Médico não está disponível',
                    medico_info: {
                        nome: medico.nome,
                        status: medico.status
                    }
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const horariosAtendimento = medico.horarios_atendimento || [];
            console.log('⏰ Horários de atendimento configurados:', horariosAtendimento);
            
            if (horariosAtendimento.length === 0) {
                console.log('❌ Médico não tem horários configurados');
                return new Response(JSON.stringify({
                    available_slots: [],
                    message: 'Médico não tem horários de atendimento configurados'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const resultado = [];
            const hoje = new Date(); // Keep `hoje` for the period_consultado at the end
            console.log('📅 Processando disponibilidade para os próximos', dias_afrente, 'dias');
            
            // Loop pelos próximos X dias
            for (let i = 0; i < dias_afrente; i++) {
                const dataConsulta = new Date(); // Start fresh for each day
                dataConsulta.setHours(0, 0, 0, 0); // Zera a hora para evitar problemas de fuso
                dataConsulta.setDate(dataConsulta.getDate() + i);
                
                const dataFormatada = dataConsulta.toISOString().split('T')[0]; // YYYY-MM-DD
                const diaSemana = dataConsulta.getDay(); // 0=Domingo, 1=Segunda...
                
                console.log(`📆 Processando dia ${i + 1}: ${dataFormatada} (${diasSemanaMap[diaSemana]})`);
                
                // Verificar se há horários com data específica para este dia
                const horariosDataEspecifica = horariosAtendimento.filter(h => h.data_especifica === dataFormatada);
                
                // Se houver horários com data específica, usar eles; senão, usar horários recorrentes
                const horariosDoDia = horariosDataEspecifica.length > 0 
                    ? horariosDataEspecifica 
                    : horariosAtendimento.filter(h => 
                        h.dia_semana === diaSemana && 
                        !h.data_especifica && 
                        checkRecorrencia(h.recorrencia, dataConsulta)
                    );
                
                if (horariosDoDia.length === 0) {
                    console.log(`  ⏭️ Médico não atende ${diasSemanaMap[diaSemana]} ou fora da recorrência`);
                    continue; // Pula para o próximo dia
                }
                
                console.log(`  📋 Horários encontrados (${horariosDataEspecifica.length > 0 ? 'data específica' : 'recorrentes'}):`, horariosDoDia);

                console.log(`  ✅ Médico atende ${diasSemanaMap[diaSemana]} com recorrência válida:`, horariosDoDia);

                // Buscar agendamentos existentes para este dia
                const agendamentosExistentes = await base44.asServiceRole.entities.Agendamento.filter({
                    medico_id: cleanMedicoId,
                    data_agendamento: dataFormatada,
                    status: { $ne: 'Cancelado' }
                });

                console.log(`  📋 Agendamentos existentes: ${agendamentosExistentes.length}`);

                const horariosOcupados = agendamentosExistentes.map(ag => ag.horario);
                const horariosDisponiveis = [];
                const tempoConsulta = medico.tempo_consulta_minutos || 30;
                const tipoAtendimento = medico.tipo_atendimento || "Horários Marcados";

                console.log(`  🕐 Tipo atendimento: ${tipoAtendimento}, Tempo: ${tempoConsulta}min`);

                if (tipoAtendimento === "Ordem de Chegada") {
                    const limiteVagas = medico.limite_ordem_chegada || 1;
                    // For "Ordem de Chegada", we take the first available period's start time as the general time slot.
                    // This assumes that there's only one "horario_inicio" for "Ordem de Chegada" or that all start times are valid.
                    // If multiple periods exist for "Ordem de Chegada", this might need refinement.
                    // For now, let's just consider the first period's start time.
                    const horarioInicio = horariosDoDia[0]?.horario_inicio; 

                    if (horarioInicio) {
                        const vagasOcupadas = agendamentosExistentes.filter(ag => ag.horario === horarioInicio).length;
                        
                        console.log(`  🚶 Ordem de chegada - Vagas: ${vagasOcupadas}/${limiteVagas}`);
                        
                        // Check if it's the current day AND the slot is in the past
                        const agora = new Date();
                        const horarioDateTime = new Date(`${dataFormatada}T${horarioInicio}:00`);
                        const isPast = (dataConsulta.toDateString() === agora.toDateString() && horarioDateTime < agora);

                        if (!isPast && vagasOcupadas < limiteVagas) {
                            horariosDisponiveis.push(horarioInicio);
                        }
                    }
                } else {
                    // Horários Marcados
                    for (const periodo of horariosDoDia) {
                        const [inicioH, inicioM] = periodo.horario_inicio.split(':').map(Number);
                        const [fimH, fimM] = periodo.horario_fim.split(':').map(Number);
                        
                        const inicioMinutos = inicioH * 60 + inicioM;
                        const fimMinutos = fimH * 60 + fimM;

                        console.log(`    🕒 Processando período: ${periodo.horario_inicio} às ${periodo.horario_fim}`);

                        for (let minutos = inicioMinutos; minutos < fimMinutos; minutos += tempoConsulta) {
                            const horas = Math.floor(minutos / 60);
                            const mins = minutos % 60;
                            const horario = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

                            // Verificar se o horário é futuro (para o dia de hoje)
                            const agora = new Date(); // Get current time for comparison
                            const horarioDateTime = new Date(`${dataFormatada}T${horario}:00`);
                            
                            // Check if it's the current day AND the slot is in the past
                            const isPast = (dataConsulta.toDateString() === agora.toDateString() && horarioDateTime < agora);

                            if (!isPast && !horariosOcupados.includes(horario)) {
                                horariosDisponiveis.push(horario);
                            }
                        }
                    }
                }

                // Se tem horários disponíveis neste dia, adicionar ao resultado
                if (horariosDisponiveis.length > 0) {
                    resultado.push({
                        data: dataFormatada,
                        data_formatada: dataConsulta.toLocaleDateString('pt-BR', { 
                            weekday: 'long', 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric' 
                        }),
                        dia_semana: diaSemana,
                        dia_semana_nome: diasSemanaMap[diaSemana],
                        horarios_disponiveis: horariosDisponiveis.sort(),
                        total_slots: horariosDisponiveis.length
                    });
                    console.log(`  ✅ Dia ${dataFormatada} adicionado com ${horariosDisponiveis.length} slots`);
                } else {
                    console.log(`  ❌ Nenhum slot disponível em ${dataFormatada}`);
                }
            }

            console.log(`🎯 Resultado final: ${resultado.length} dias com disponibilidade`);

            return new Response(JSON.stringify({
                medico_info: {
                    nome: medico.nome,
                    especialidade: medico.especialidade,
                    tipo_atendimento: medico.tipo_atendimento || "Horários Marcados"
                },
                periodo_consultado: {
                    dias_afrente: dias_afrente,
                    data_inicio: hoje.toISOString().split('T')[0],
                    data_fim: new Date(hoje.getTime() + (dias_afrente - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                },
                disponibilidades: resultado,
                resumo: {
                    total_dias_disponiveis: resultado.length,
                    total_slots_disponiveis: resultado.reduce((sum, dia) => sum + dia.total_slots, 0),
                    proximo_disponivel: resultado.length > 0 ? {
                        data: resultado[0].data,
                        data_formatada: resultado[0].data_formatada,
                        primeiro_horario: resultado[0].horarios_disponiveis[0]
                    } : null
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

        } catch (entityError) {
            console.error('❌ Erro ao buscar médico:', entityError);
            return new Response(JSON.stringify({ 
                error: 'Médico não encontrado ou erro ao acessar dados',
                details: entityError.message,
                medico_id_recebido: medico_id,
                medico_id_limpo: cleanMedicoId
            }), { 
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

    } catch (error) {
        console.error('❌ Erro geral:', error);
        return new Response(JSON.stringify({ 
            error: 'Erro interno do servidor',
            details: error.message
        }), { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});