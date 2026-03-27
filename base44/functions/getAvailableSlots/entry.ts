import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const diasSemanaMap = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

// Helper para obter o número da semana no mês (1 a 4/5)
const getWeekOfMonth = (date) => {
    const adjustedDayOfMonth = date.getUTCDate();
    const dayOfWeekOfFirstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).getUTCDay();
    return Math.ceil((adjustedDayOfMonth + dayOfWeekOfFirstDay) / 7);
};

// Helper para verificar a recorrência
const checkRecorrencia = (recorrencia, date) => {
    if (!recorrencia || recorrencia === "Toda Semana") {
        return true;
    }
    if (recorrencia === "Apenas uma vez") {
        return false;
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
            return true;
    }
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { medico_id, data } = await req.json();

        console.log('🔍 Recebido:', { medico_id, data });

        if (!medico_id || !data) {
            return Response.json({ 
                error: 'medico_id e data são obrigatórios' 
            }, { status: 400 });
        }

        // Validar se medico_id tem formato válido (remover possíveis {{ }})
        const cleanMedicoId = medico_id.replace(/[{}]/g, '');
        const cleanData = data.replace(/[{}]/g, '');

        console.log('🧹 IDs limpos:', { cleanMedicoId, cleanData });

        try {
            const medico = await base44.asServiceRole.entities.Medico.get(cleanMedicoId);
            console.log('👩‍⚕️ Médico encontrado:', medico?.nome || 'N/A');
            
            if (!medico) {
                return Response.json({ 
                    error: 'Médico não encontrado',
                    medico_id_recebido: medico_id,
                    medico_id_limpo: cleanMedicoId,
                    sugestao: 'Verifique se o ID está correto e não contém caracteres extras como {{ }}'
                }, { status: 404 });
            }

            if (medico.status !== 'Ativo') {
                return Response.json({ 
                    available_slots: [],
                    message: 'Médico não está disponível',
                    medico_info: {
                        nome: medico.nome,
                        status: medico.status
                    }
                });
            }

            // IMPORTANTE: Buscar TODOS os registros de médicos com o mesmo nome (para agendas unificadas)
            const todosOsMedicos = await base44.asServiceRole.entities.Medico.filter({});
            const medicoNomeNormalizado = medico.nome.toUpperCase().trim();
            const medicosRelacionados = todosOsMedicos.filter(m => 
                m.nome.toUpperCase().trim() === medicoNomeNormalizado
            );
            const idsRelacionados = medicosRelacionados.map(m => m.id);
            console.log(`👥 Médicos relacionados (mesma agenda): ${idsRelacionados.length}`);

            // Validar formato da data
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(cleanData)) {
                return Response.json({ 
                    error: 'Formato de data inválido. Use YYYY-MM-DD' 
                }, { status: 400 });
            }

            // CORREÇÃO: Usar UTC para evitar problemas de fuso horário
            const [year, month, day] = cleanData.split('-').map(Number);
            const dataObj = new Date(Date.UTC(year, month - 1, day));
            const diaSemana = dataObj.getUTCDay(); // 0=Domingo, 1=Segunda, ...

            console.log('📅 Processando data:', { cleanData, diaSemana });

            const horariosAtendimento = medico.horarios_atendimento || [];
            console.log('⏰ Horários configurados:', horariosAtendimento);

            // Verificar se há horários com data específica para este dia
            const horariosDataEspecifica = horariosAtendimento.filter(h => h.data_especifica === cleanData);
            
            // Verificar se a data está BLOQUEADA (feriado/clínica fechada)
            const dataBloqueada = horariosDataEspecifica.some(h => h.bloqueado === true);
            if (dataBloqueada) {
                return Response.json({ 
                    available_slots: [],
                    message: 'Clínica fechada nesta data (feriado/bloqueio)',
                    bloqueado: true
                });
            }
            
            // Se houver horários com data específica EXATA para este dia, usar eles prioritariamente.
            // Senão, usar horários recorrentes (incluindo os que têm data_especifica mas recorrência != "Apenas uma vez",
            // pois esses representam padrões recorrentes com referência de data inicial)
            let horariosDoDia;
            if (horariosDataEspecifica.length > 0) {
                horariosDoDia = horariosDataEspecifica.filter(h => !h.bloqueado);
            } else {
                // Horários sem data_especifica que batem com o dia da semana
                const horariosRecorrentes = horariosAtendimento.filter(h => 
                    Math.floor(h.dia_semana) === diaSemana && 
                    !h.data_especifica && 
                    !h.bloqueado &&
                    checkRecorrencia(h.recorrencia, dataObj)
                );
                
                if (horariosRecorrentes.length > 0) {
                    horariosDoDia = horariosRecorrentes;
                } else {
                    // FALLBACK: Horários com data_especifica E recorrência != "Apenas uma vez"
                    // que batem com o mesmo dia da semana (ex: médico com data_especifica preenchida
                    // mas recorrência "Toda Semana" — padrão de agenda semanal com referência de data)
                    const horariosRecorrentesComData = horariosAtendimento.filter(h =>
                        h.data_especifica &&
                        !h.bloqueado &&
                        Math.floor(h.dia_semana) === diaSemana &&
                        h.recorrencia && h.recorrencia !== 'Apenas uma vez' &&
                        checkRecorrencia(h.recorrencia, dataObj)
                    );
                    // Usar o horário mais recente como referência (último cadastrado)
                    if (horariosRecorrentesComData.length > 0) {
                        // Pegar o que tem data_especifica mais recente
                        horariosRecorrentesComData.sort((a, b) => (b.data_especifica || '').localeCompare(a.data_especifica || ''));
                        horariosDoDia = [horariosRecorrentesComData[0]];
                        console.log('🔄 Usando fallback: horário recorrente com data_especifica como referência');
                    } else {
                        horariosDoDia = [];
                    }
                }
            }
            
            console.log('📋 Horários filtrados:', {
                data_especifica_encontrada: horariosDataEspecifica.length > 0,
                horarios_do_dia: horariosDoDia
            });

            if (horariosDoDia.length === 0) {
                return Response.json({ 
                    available_slots: [],
                    message: 'Médico não atende neste dia da semana',
                    info_debug: {
                        dia_semana_solicitado: diaSemana,
                        dia_semana_nome: diasSemanaMap[diaSemana],
                        dias_que_atende: horariosAtendimento.map(h => h.dia_semana),
                        horarios_completos: horariosAtendimento
                    }
                });
            }

            // Buscar agendamentos de TODOS os médicos relacionados (agenda unificada)
            let agendamentosExistentes = [];
            for (const idRelacionado of idsRelacionados) {
                const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
                    medico_id: idRelacionado,
                    data_agendamento: cleanData,
                    status: { $ne: 'Cancelado' }
                });
                agendamentosExistentes = agendamentosExistentes.concat(agendamentos);
            }

            console.log('📅 Agendamentos existentes:', agendamentosExistentes.length);

            const horariosOcupados = agendamentosExistentes.map(ag => ag.horario);
            const horariosDisponiveis = [];
            const tempoConsulta = medico.tempo_consulta_minutos || 30;
            const tipoAtendimento = medico.tipo_atendimento || "Horários Marcados";
            
            // Obter hora atual em São Paulo para filtrar horários passados
            const _hojeI = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const isToday = cleanData === _hojeI;
            const timeStr = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
            const [curH, curM] = timeStr.split(':').map(Number);
            const currentMinutes = curH * 60 + curM;

            console.log('⚙️ Configurações:', { tempoConsulta, tipoAtendimento, isToday, currentMinutes, timeStr });

            if (tipoAtendimento === "Ordem de Chegada") {
                const limiteVagas = medico.limite_ordem_chegada || 1;
                const horarioInicio = horariosDoDia[0].horario_inicio;
                const vagasOcupadas = agendamentosExistentes.filter(ag => ag.horario === horarioInicio).length;
                
                if (vagasOcupadas < limiteVagas) {
                    horariosDisponiveis.push(horarioInicio);
                }

                console.log('👥 Ordem de chegada:', { vagasOcupadas, limiteVagas, horarioInicio });
            } else {
                for (const periodo of horariosDoDia) {
                    const [inicioH, inicioM] = periodo.horario_inicio.split(':').map(Number);
                    const [fimH, fimM] = periodo.horario_fim.split(':').map(Number);
                    
                    const inicioMinutos = inicioH * 60 + inicioM;
                    const fimMinutos = fimH * 60 + fimM;

                    for (let minutos = inicioMinutos; minutos <= fimMinutos - tempoConsulta; minutos += tempoConsulta) {
                        if (isToday && minutos <= currentMinutes) continue;
                        
                        const horas = Math.floor(minutos / 60);
                        const mins = minutos % 60;
                        const horario = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

                        if (!horariosOcupados.includes(horario)) {
                            horariosDisponiveis.push(horario);
                        }
                    }
                }
            }

            console.log('✅ Horários disponíveis gerados:', horariosDisponiveis);

            return Response.json({ 
                available_slots: horariosDisponiveis.sort(),
                medico_info: {
                    nome: medico.nome,
                    especialidade: medico.especialidade,
                    tipo_atendimento: medico.tipo_atendimento || "Horários Marcados",
                    tempo_consulta: tempoConsulta
                },
                debug_info: {
                    dia_semana: diaSemana,
                    dia_semana_nome: diasSemanaMap[diaSemana],
                    horarios_atendimento: horariosDoDia,
                    agendamentos_existentes: agendamentosExistentes.length,
                    horarios_ocupados: horariosOcupados
                }
            });

        } catch (entityError) {
            console.error('❌ Erro ao buscar médico:', entityError);
            return Response.json({ 
                error: 'Médico não encontrado ou erro ao acessar dados',
                details: entityError.message,
                medico_id_recebido: medico_id,
                medico_id_limpo: cleanMedicoId
            }, { status: 404 });
        }

    } catch (error) {
        console.error('❌ Erro geral:', error);
        return Response.json({ 
            error: 'Erro interno do servidor',
            details: error.message,
            sugestao: 'Verifique se o JSON está correto e se os IDs não contêm caracteres extras como {{ }}'
        }, { status: 500 });
    }
});