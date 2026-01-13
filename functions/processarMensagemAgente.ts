import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { phoneNumber, messageText, senderName, pacienteId } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText });
    
    // Buscar configuração do chatbot
    const configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
    const config = configs[0];
    
    if (!config) {
      console.log('❌ ChatbotConfig não encontrado');
      return Response.json({ 
        success: true, 
        resposta: 'Olá! Estou com dificuldades técnicas. Por favor, entre em contato pelo WhatsApp.',
        conversationId: null
      });
    }
    
    console.log('✅ Config encontrada:', config.nome);
    
    // Buscar histórico de conversa
    let historicoConversa = '';
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      if (contatos.length > 0 && contatos[0].historico_mensagens) {
        const ultimas = contatos[0].historico_mensagens.slice(-10);
        historicoConversa = ultimas.map(m => `${m.role === 'user' ? 'CLIENTE' : 'ASSISTENTE'}: ${m.content}`).join('\n');
      }
    } catch (e) {
      console.log('⚠️ Não foi possível buscar histórico');
    }

    // Verificar se cliente quer agendar - buscar disponibilidades
    let infoDisponibilidade = '';
    const querAgendar = /agendar|marcar|consulta|atend|hor[áa]rio|dispon[íi]vel|vaga/i.test(messageText);
    
    if (querAgendar) {
      console.log('📅 Cliente quer agendar - buscando disponibilidades...');
      
      // Detectar especialidade mencionada
      const especialidades = [
        'Cardiologia', 'Clínico Geral', 'Dermatologia', 'Endocrinologia', 
        'Ginecologia', 'Nutrição', 'Psicologia', 'Ortopedia', 'Urologia',
        'Geriatria', 'Gastroenterologia', 'Reumatologia'
      ];
      
      let especialidadeDetectada = null;
      for (const esp of especialidades) {
        if (messageText.toLowerCase().includes(esp.toLowerCase().split(' ')[0])) {
          especialidadeDetectada = esp;
          break;
        }
      }

      try {
        // Buscar médicos e disponibilidades diretamente
        let medicosParaBuscar = [];
        
        if (especialidadeDetectada) {
          medicosParaBuscar = await base44.asServiceRole.entities.Medico.filter({ 
            status: 'Ativo',
            especialidade: especialidadeDetectada 
          });
        } else {
          medicosParaBuscar = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
        }

        const disponibilidadesEncontradas = [];
        const diasAfrente = 15;
        const diasSemanaMap = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

        for (const medico of medicosParaBuscar.slice(0, 5)) {
          const horariosAtendimento = medico.horarios_atendimento || [];
          if (horariosAtendimento.length === 0) continue;

          const disponibilidadesMedico = [];

          for (let i = 0; i < diasAfrente; i++) {
            const dataConsulta = new Date();
            dataConsulta.setHours(0, 0, 0, 0);
            dataConsulta.setDate(dataConsulta.getDate() + i);
            
            const dataFormatada = dataConsulta.toISOString().split('T')[0];
            const diaSemana = dataConsulta.getDay();

            const horariosDoDia = horariosAtendimento.filter(h => 
              h.dia_semana === diaSemana && !h.data_especifica
            );

            if (horariosDoDia.length === 0) continue;

            const agendamentosExistentes = await base44.asServiceRole.entities.Agendamento.filter({
              medico_id: medico.id,
              data_agendamento: dataFormatada,
              status: { $ne: 'Cancelado' }
            });

            const horariosOcupados = agendamentosExistentes.map(ag => ag.horario);
            const horariosDisponiveis = [];
            const tempoConsulta = medico.tempo_consulta_minutos || 30;

            for (const periodo of horariosDoDia) {
              const [inicioH, inicioM] = periodo.horario_inicio.split(':').map(Number);
              const [fimH, fimM] = periodo.horario_fim.split(':').map(Number);
              
              const inicioMinutos = inicioH * 60 + inicioM;
              const fimMinutos = fimH * 60 + fimM;

              for (let minutos = inicioMinutos; minutos < fimMinutos; minutos += tempoConsulta) {
                const horas = Math.floor(minutos / 60);
                const mins = minutos % 60;
                const horarioStr = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

                const agora = new Date();
                const horarioDateTime = new Date(`${dataFormatada}T${horarioStr}:00`);
                const isPast = (dataConsulta.toDateString() === agora.toDateString() && horarioDateTime < agora);

                if (!isPast && !horariosOcupados.includes(horarioStr)) {
                  horariosDisponiveis.push(horarioStr);
                }
              }
            }

            if (horariosDisponiveis.length > 0) {
              disponibilidadesMedico.push({
                data: dataFormatada,
                data_formatada: dataConsulta.toLocaleDateString('pt-BR', { 
                  weekday: 'long', 
                  day: '2-digit', 
                  month: '2-digit'
                }),
                horarios: horariosDisponiveis.sort().slice(0, 5)
              });

              if (disponibilidadesMedico.length >= 3) break;
            }
          }

          if (disponibilidadesMedico.length > 0) {
            disponibilidadesEncontradas.push({
              medico_id: medico.id,
              medico_nome: medico.nome,
              especialidade: medico.especialidade,
              disponibilidades: disponibilidadesMedico
            });
          }
        }

        if (disponibilidadesEncontradas.length > 0) {
          infoDisponibilidade = '\n\n📅 DISPONIBILIDADES ENCONTRADAS:\n';
          
          for (const medico of disponibilidadesEncontradas.slice(0, 3)) {
            infoDisponibilidade += `\n👨‍⚕️ ${medico.medico_nome} (${medico.especialidade}):\n`;
            infoDisponibilidade += `   ID do médico: ${medico.medico_id}\n`;
            
            for (const dia of medico.disponibilidades.slice(0, 2)) {
              infoDisponibilidade += `   • ${dia.data_formatada}: ${dia.horarios.slice(0, 3).join(', ')}\n`;
            }
          }
          
          infoDisponibilidade += '\n⚠️ Para confirmar agendamento, preciso: nome completo e data de nascimento do paciente.';
          console.log('✅ Disponibilidades encontradas:', disponibilidadesEncontradas.length, 'médicos');
        } else {
          infoDisponibilidade = '\n\n⚠️ Não encontrei disponibilidades no momento. Solicite que o cliente entre em contato pelo WhatsApp.';
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar disponibilidades:', e.message);
      }
    }

    // Verificar se cliente está confirmando agendamento (tem data de nascimento no formato dd/mm/yyyy)
    const regexDataNascimento = /(\d{2}\/\d{2}\/\d{4})/;
    const matchNascimento = messageText.match(regexDataNascimento);
    
    // Verificar no histórico se já temos médico, data e horário escolhidos
    let agendamentoCriado = false;
    let mensagemAgendamento = '';
    
    if (matchNascimento && historicoConversa) {
      console.log('📝 Detectada data de nascimento, verificando se pode criar agendamento...');
      
      try {
        // Usar LLM para extrair dados do agendamento do histórico
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        
        const promptExtracao = `Analise o histórico da conversa e extraia os dados do agendamento se TODOS estiverem presentes.

HISTÓRICO:
${historicoConversa}

ÚLTIMA MENSAGEM DO CLIENTE:
${messageText}

DATA DE HOJE: ${hoje.toISOString().split('T')[0]} (use ${anoAtual} como ano para datas de agendamento)

Extraia APENAS se TODOS os dados estiverem claros:
- nome_paciente: nome completo do paciente (pode ser o nome usado na conversa)
- data_nascimento: data de nascimento (formato DD/MM/YYYY)
- medico_nome: nome do médico escolhido
- data_agendamento: data da consulta (formato YYYY-MM-DD, use ano ${anoAtual})
- horario: horário escolhido (formato HH:MM)

Retorne um JSON com os dados ou null se faltarem dados.`;

        const extracao = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: promptExtracao,
          add_context_from_internet: false,
          response_json_schema: {
            type: "object",
            properties: {
              dados_completos: { type: "boolean" },
              nome_paciente: { type: "string" },
              data_nascimento: { type: "string" },
              medico_nome: { type: "string" },
              data_agendamento: { type: "string" },
              horario: { type: "string" }
            }
          }
        });

        console.log('📊 Extração:', JSON.stringify(extracao));

        if (extracao && extracao.dados_completos && extracao.nome_paciente && extracao.data_agendamento && extracao.horario) {
          // Buscar médico pelo nome
          const medicos = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
          const medicoEncontrado = medicos.find(m => 
            m.nome.toLowerCase().includes(extracao.medico_nome?.toLowerCase() || '') ||
            extracao.medico_nome?.toLowerCase().includes(m.nome.toLowerCase())
          );

          if (medicoEncontrado) {
            // Converter data de nascimento para formato ISO
            let dataNascimentoISO = null;
            if (extracao.data_nascimento) {
              const partes = extracao.data_nascimento.split('/');
              if (partes.length === 3) {
                dataNascimentoISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
              }
            }

            // Buscar ou criar paciente
            let paciente = null;
            const pacientesExistentes = await base44.asServiceRole.entities.Paciente.filter({ telefone: phoneNumber });
            
            if (pacientesExistentes.length > 0) {
              paciente = pacientesExistentes[0];
              // Atualizar dados se necessário
              await base44.asServiceRole.entities.Paciente.update(paciente.id, {
                nome: extracao.nome_paciente,
                data_nascimento: dataNascimentoISO
              });
            } else {
              paciente = await base44.asServiceRole.entities.Paciente.create({
                nome: extracao.nome_paciente,
                telefone: phoneNumber,
                cpf: 'NÃO INFORMADO',
                data_nascimento: dataNascimentoISO,
                observacoes: 'Criado via WhatsApp'
              });
            }

            // Verificar se horário ainda está disponível
            const agendamentosExistentes = await base44.asServiceRole.entities.Agendamento.filter({
              medico_id: medicoEncontrado.id,
              data_agendamento: extracao.data_agendamento,
              horario: extracao.horario,
              status: { $ne: 'Cancelado' }
            });

            if (agendamentosExistentes.length === 0) {
              // Criar agendamento
              const novoAgendamento = await base44.asServiceRole.entities.Agendamento.create({
                paciente_id: paciente.id,
                paciente_nome: extracao.nome_paciente,
                medico_id: medicoEncontrado.id,
                data_agendamento: extracao.data_agendamento,
                horario: extracao.horario,
                tipo_servico: 'Consulta',
                status: 'Agendado',
                observacoes: 'Agendado via WhatsApp',
                agendado_por: 'Glória',
                agendado_por_tipo: 'chatbot'
              });

              console.log('✅ AGENDAMENTO CRIADO:', novoAgendamento.id);

              // Criar notificação para a equipe
              const dataObj = new Date(extracao.data_agendamento + 'T12:00:00');
              const dataFormatadaNotif = dataObj.toLocaleDateString('pt-BR');

              await base44.asServiceRole.entities.Notification.create({
                type: 'novo_agendamento',
                message: `${extracao.nome_paciente} - ${medicoEncontrado.especialidade} com ${medicoEncontrado.nome} em ${dataFormatadaNotif} às ${extracao.horario} (Agendado pela Glória)`,
                data: {
                  agendamento_id: novoAgendamento.id,
                  paciente_nome: extracao.nome_paciente,
                  medico_nome: medicoEncontrado.nome,
                  especialidade: medicoEncontrado.especialidade,
                  data: extracao.data_agendamento,
                  horario: extracao.horario,
                  agendado_por: 'Glória',
                  agendado_por_tipo: 'chatbot'
                },
                is_read: false
              });

              console.log('🔔 Notificação criada para novo agendamento');
              agendamentoCriado = true;
              
              // Formatar data para exibição
              const dataObj = new Date(extracao.data_agendamento + 'T12:00:00');
              const dataFormatada = dataObj.toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                day: '2-digit', 
                month: '2-digit',
                year: 'numeric'
              });
              
              mensagemAgendamento = `✅ Agendamento confirmado!\n\n📋 Resumo:\n• Paciente: ${extracao.nome_paciente}\n• Médico: ${medicoEncontrado.nome} (${medicoEncontrado.especialidade})\n• Data: ${dataFormatada}\n• Horário: ${extracao.horario}\n\n📍 Endereço: Av. Isabel, 29 – Sobreloja, Santa Cruz, Rio de Janeiro – RJ\n\n⚠️ Lembre-se de trazer documento original com foto.\n\nTe aguardamos! 😊`;
            } else {
              console.log('⚠️ Horário já ocupado');
              mensagemAgendamento = `😔 Poxa, esse horário acabou de ser preenchido. Vou verificar outras opções disponíveis para você!`;
            }
          }
        }
      } catch (extracaoError) {
        console.error('⚠️ Erro na extração:', extracaoError.message);
      }
    }

    // Se agendamento foi criado, retornar mensagem de confirmação
    if (agendamentoCriado) {
      console.log('🎉 Retornando confirmação de agendamento');
      
      // Salvar no histórico
      try {
        const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
        const timestamp = new Date().toISOString();
        
        if (contatos.length > 0) {
          const contato = contatos[0];
          const historicoAtual = contato.historico_mensagens || [];
          historicoAtual.push(
            { role: 'user', content: messageText, timestamp },
            { role: 'assistant', content: mensagemAgendamento, timestamp }
          );
          
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            ultima_mensagem: messageText,
            ultima_resposta: mensagemAgendamento,
            historico_mensagens: historicoAtual.slice(-50),
            ultima_interacao: timestamp,
            total_mensagens: (contato.total_mensagens || 0) + 2,
            agendamentos_realizados: (contato.agendamentos_realizados || 0) + 1
          });
        }
      } catch (e) {
        console.error('⚠️ Erro ao salvar histórico:', e.message);
      }
      
      return Response.json({ 
        success: true, 
        resposta: mensagemAgendamento,
        conversationId: null,
        agendamento_criado: true
      });
    }

    // Usar InvokeLLM diretamente para gerar resposta
    console.log('🤖 Chamando LLM...');
    
    const promptCompleto = `${config.prompt_sistema}

---
HISTÓRICO DA CONVERSA (últimas mensagens):
${historicoConversa || '(primeira mensagem)'}

---
NOVA MENSAGEM DO CLIENTE (${senderName}, telefone ${phoneNumber}):
${messageText}
${infoDisponibilidade}

---
INSTRUÇÕES ADICIONAIS:
1. Se o cliente quer agendar e há disponibilidades acima, apresente as opções de forma clara e amigável.
2. Pergunte qual médico, dia e horário o cliente prefere.
3. Confirme os dados do paciente antes de finalizar (nome completo e data de nascimento).
4. Se o cliente já confirmou todos os dados (médico, data, horário, nome, nascimento), diga que está confirmando e peça para aguardar.
5. Responda de forma natural, seguindo o tom do prompt_sistema.`;

    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: promptCompleto,
      add_context_from_internet: false
    });
    
    console.log('✅ LLM respondeu');
    
    // Salvar conversa no histórico
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      const timestamp = new Date().toISOString();
      
      if (contatos.length > 0) {
        const contato = contatos[0];
        const historicoAtual = contato.historico_mensagens || [];
        
        // Adicionar novas mensagens ao histórico
        historicoAtual.push(
          { role: 'user', content: messageText, timestamp },
          { role: 'assistant', content: llmResponse, timestamp }
        );
        
        // Manter apenas as últimas 50 mensagens
        const historicoLimitado = historicoAtual.slice(-50);
        
        await base44.asServiceRole.entities.Contato.update(contato.id, {
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse,
          historico_mensagens: historicoLimitado,
          ultima_interacao: timestamp,
          total_mensagens: (contato.total_mensagens || 0) + 2
        });
        console.log('✅ Contato atualizado:', contato.id.substring(0, 8));
      } else {
        // Criar novo contato
        await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: phoneNumber,
          paciente_id: pacienteId,
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse,
          historico_mensagens: [
            { role: 'user', content: messageText, timestamp },
            { role: 'assistant', content: llmResponse, timestamp }
          ],
          ultima_interacao: timestamp,
          total_mensagens: 2,
          origem: 'WhatsApp',
          status: 'Novo'
        });
        console.log('✅ Novo contato criado');
      }
    } catch (e) {
      console.error('⚠️ Erro ao salvar histórico:', e.message);
    }
    
    return Response.json({ 
      success: true, 
      resposta: llmResponse,
      conversationId: null
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});