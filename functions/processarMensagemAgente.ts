import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { phoneNumber, messageText, senderName, pacienteId, mediaType, mediaUrl } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText, mediaType, mediaUrl });
    
    // Verificar se o contato está em atendimento humano
    const contatosCheck = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
    if (contatosCheck.length > 0 && contatosCheck[0].atendimento_humano) {
      console.log('⚠️ Contato em atendimento humano - ignorando IA');
      
      // Apenas salvar a mensagem no histórico sem responder com IA
      const contato = contatosCheck[0];
      const historicoAtual = contato.historico_mensagens || [];
      const timestamp = new Date().toISOString();
      
      historicoAtual.push({ role: 'user', content: messageText, timestamp });
      
      await base44.asServiceRole.entities.Contato.update(contato.id, {
        ultima_mensagem: messageText,
        historico_mensagens: historicoAtual.slice(-50),
        ultima_interacao: timestamp,
        total_mensagens: (contato.total_mensagens || 0) + 1,
        status: 'Lead',
        conversa_finalizada: false // Reativa conversa
      });
      
      return Response.json({ 
        success: true, 
        resposta: null,
        atendimento_humano: true,
        message: 'Mensagem salva - atendimento humano ativo'
      });
    }
    
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

    // Verificar se cliente quer resultado de exame
    const querResultado = /resultado|exame pronto|pegar|buscar resultado|retirar|laudo|meu exame|meus exames/i.test(messageText);
    let infoResultadoExame = '';
    let arquivoParaEnviar = null;
    
    if (querResultado) {
      console.log('📄 Cliente quer resultado de exame...');
      
      // Verificar se temos CPF na mensagem ou no histórico - aceita vários formatos
      const cpfMatch = messageText.match(/(\d{11}|\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})/);
      let cpfCliente = cpfMatch ? cpfMatch[0].replace(/\D/g, '') : null;
      
      // Se não achou na mensagem, procurar no histórico
      if (!cpfCliente && historicoConversa) {
        const cpfHistorico = historicoConversa.match(/(\d{11}|\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})/);
        if (cpfHistorico) {
          cpfCliente = cpfHistorico[0].replace(/\D/g, '');
        }
      }
      
      console.log('🔍 CPF detectado:', cpfCliente);
      
      if (cpfCliente && cpfCliente.length === 11) {
        // Buscar resultado pelo CPF
        try {
          console.log('🔎 Buscando resultados para CPF:', cpfCliente);
          const resultados = await base44.asServiceRole.entities.ResultadoExame.list();
          console.log('📊 Total de resultados no sistema:', resultados.length);
          
          // Filtrar pelo CPF (comparar sem formatação)
          const resultadosFiltrados = resultados.filter(r => {
            const cpfResultado = (r.paciente_cpf || '').replace(/\D/g, '');
            return cpfResultado === cpfCliente;
          });
          
          console.log('📊 Resultados encontrados para o CPF:', resultadosFiltrados.length);
          
          if (resultadosFiltrados.length > 0) {
            // Pegar o resultado mais recente
            const resultadoMaisRecente = resultadosFiltrados.sort((a, b) => 
              new Date(b.created_date) - new Date(a.created_date)
            )[0];
            
            arquivoParaEnviar = {
              url: resultadoMaisRecente.arquivo_url,
              nome: resultadoMaisRecente.nome_arquivo || 'Resultado_Exame.pdf',
              paciente: resultadoMaisRecente.paciente_nome,
              descricao: resultadoMaisRecente.descricao,
              data: resultadoMaisRecente.data_exame
            };
            
            infoResultadoExame = `\n\n✅ RESULTADO DE EXAME ENCONTRADO!
Paciente: ${resultadoMaisRecente.paciente_nome}
Exame: ${resultadoMaisRecente.descricao || 'Resultado de exame'}
Data: ${resultadoMaisRecente.data_exame || 'N/A'}
Arquivo: ${resultadoMaisRecente.nome_arquivo}

📎 O ARQUIVO SERÁ ENVIADO AUTOMATICAMENTE JUNTO COM ESTA MENSAGEM.

IMPORTANTE: Confirme que encontrou o resultado e informe que está enviando o arquivo PDF agora mesmo.`;
            
            console.log('✅ Resultado encontrado! Arquivo para enviar:', JSON.stringify(arquivoParaEnviar));
          } else {
            infoResultadoExame = `\n\n❌ RESULTADO NÃO ENCONTRADO
CPF informado: ${cpfCliente}

Não encontramos resultados de exames para este CPF no sistema.

Peça para o cliente:
1. Verificar se o CPF está correto
2. Informar se o exame foi realizado recentemente
3. Entrar em contato com a clínica pelo telefone para mais informações`;
          }
        } catch (e) {
          console.error('⚠️ Erro ao buscar resultado:', e.message);
          infoResultadoExame = `\n\n⚠️ Erro ao buscar resultado. Peça desculpas e solicite que o cliente entre em contato pelo telefone.`;
        }
      } else {
        // Não temos CPF ainda - instruir IA a pedir
        infoResultadoExame = `\n\n📋 CLIENTE QUER RESULTADO DE EXAME

Para localizar o resultado, você PRECISA do CPF do paciente.

PEÇA ao cliente:
1. Nome completo
2. CPF (apenas números, exemplo: 04252828481)

Exemplo de resposta:
"Para localizar seu resultado, preciso de algumas informações:
📝 Seu nome completo
📝 Seu CPF (apenas números)

Com esses dados, consigo verificar se o resultado já está disponível! 😊"`;
      }
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
        
        const promptExtracao = `Analise o histórico da conversa e extraia os dados do agendamento.

HISTÓRICO:
${historicoConversa}

ÚLTIMA MENSAGEM DO CLIENTE:
${messageText}

DATA DE HOJE: ${hoje.toISOString().split('T')[0]} (use ${anoAtual} como ano para datas de agendamento que não especificam ano)

EXTRAIA OS SEGUINTES DADOS (procure em todo o histórico):
- nome_paciente: nome completo do paciente (pode estar na última mensagem ou no histórico)
- data_nascimento: data de nascimento no formato DD/MM/YYYY
- medico_nome: nome ou parte do nome do médico mencionado (ex: "João", "Dr. João", "João Inocencio", etc)
- data_agendamento: data da consulta no formato YYYY-MM-DD (se o cliente disse "dia 14/01", converta para ${anoAtual}-01-14)
- horario: horário escolhido no formato HH:MM (ex: 14:00)

IMPORTANTE:
- Se a data de agendamento foi mencionada como "14/01" ou "dia 14", use ano ${anoAtual}
- Se o horário foi mencionado como "14h" ou "14:00", normalize para "14:00"
- Retorne dados_completos: true se conseguir extrair TODOS os 5 campos

Retorne um JSON com os dados encontrados.`;

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
                observacoes: 'Agendado pela Glória',
                agendado_por: 'Glória',
                agendado_por_tipo: 'chatbot'
              });

              console.log('✅ AGENDAMENTO CRIADO:', novoAgendamento.id);

              // Criar notificação para a equipe
              try {
                const dataObjNotif = new Date(extracao.data_agendamento + 'T12:00:00');
                const dataFormatadaNotif = dataObjNotif.toLocaleDateString('pt-BR');

                const notificacao = await base44.asServiceRole.entities.Notification.create({
                  type: 'novo_agendamento',
                  message: `🆕 ${extracao.nome_paciente} - ${medicoEncontrado.especialidade} com ${medicoEncontrado.nome} em ${dataFormatadaNotif} às ${extracao.horario}`,
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
                console.log('🔔 Notificação criada com sucesso:', notificacao?.id);
              } catch (notifError) {
                console.error('⚠️ Erro ao criar notificação:', notifError.message);
              }

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
    
    // Obter horário atual no fuso de Recife (America/Recife)
    const agoraRecife = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife' });
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Recife', hour: '2-digit', minute: '2-digit' });
    const horaNumero = parseInt(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Recife', hour: '2-digit', hour12: false }));
    
    let saudacaoHorario = 'Bom-dia';
    if (horaNumero >= 12 && horaNumero < 18) {
      saudacaoHorario = 'Boa-tarde';
    } else if (horaNumero >= 18 || horaNumero < 5) {
      saudacaoHorario = 'Boa-noite';
    }

    // Buscar procedimentos e exames disponíveis para orçamento
    let infoProcedimentosExames = '';
    
    // Carregar lista de procedimentos e exames para qualquer mensagem sobre orçamento/preço ou mídia
    // SEMPRE carregar quando mencionar preço, valor, exame específico, quanto custa, etc.
    const querOrcamento = /or[çc]amento|pre[çc]o|valor|quanto|custa|faz|realiza|exame|procedimento|requisição|pedido|hemograma|glicose|colesterol|triglice|vitamina|urina|fezes|sangue|tireoide|tsh|t4|psa|creatinina|ureia|tgo|tgp|ácido|acido/i.test(messageText);
    
    if (mediaType === 'image' || mediaType === 'document' || querOrcamento) {
      console.log('📋 Carregando lista de procedimentos e exames para orçamento...');
      
      try {
        const procedimentos = await base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' });
        const exames = await base44.asServiceRole.entities.Exame.filter({ status: 'Ativo' });
        const tabelaPrecos = await base44.asServiceRole.entities.TabelaPreco.list();
        
        if (procedimentos.length > 0 || exames.length > 0) {
          infoProcedimentosExames = `\n\n📋 BASE DE DADOS - PROCEDIMENTOS E EXAMES COM PREÇOS:\n`;
          
          if (procedimentos.length > 0) {
            infoProcedimentosExames += '\n🏥 PROCEDIMENTOS DISPONÍVEIS:\n';
            for (const proc of procedimentos) {
              const preco = tabelaPrecos.find(tp => tp.procedimento_id === proc.id);
              const valorNum = preco?.valor || 0;
              infoProcedimentosExames += `• ${proc.nome}${proc.especialidade ? ` (${proc.especialidade})` : ''} - R$ ${valorNum.toFixed(2)}\n`;
            }
          }
          
          if (exames.length > 0) {
            infoProcedimentosExames += '\n🔬 EXAMES DISPONÍVEIS:\n';
            for (const exame of exames) {
              const valorNum = exame.valor_particular || 0;
              infoProcedimentosExames += `• ${exame.nome}${exame.tipo ? ` (${exame.tipo})` : ''} - R$ ${valorNum.toFixed(2)}\n`;
            }
          }
          
          infoProcedimentosExames += `\n⚠️ REGRAS OBRIGATÓRIAS:
1. NUNCA INVENTE PREÇOS! Use APENAS os valores listados acima.
2. Se o cliente perguntar sobre um exame específico, PROCURE NA LISTA ACIMA o valor exato.
3. Se o exame NÃO estiver na lista, informe que não realizamos esse exame.
4. Para orçamentos de requisições médicas, use o formato:

📋 *ORÇAMENTO*
━━━━━━━━━━━━━━━━━━━━
✅ Itens que realizamos:
• [Nome do item] - R$ XX,XX (valor da lista)

❌ Itens que NÃO realizamos:
• [Nome do item]

━━━━━━━━━━━━━━━━━━━━
💰 *VALOR TOTAL: R$ XX,XX*
━━━━━━━━━━━━━━━━━━━━

5. SEMPRE inclua o VALOR TOTAL somando todos os itens
6. Pergunte se deseja agendar`;
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar procedimentos/exames:', e.message);
      }
    }

    // Instruções especiais para mídia
    let instrucoesMidia = '';
    if (mediaType === 'image') {
      instrucoesMidia = `\n\n📷 MÍDIA RECEBIDA: O cliente enviou uma IMAGEM.
      
ANALISE A IMAGEM cuidadosamente:
- Se for uma REQUISIÇÃO/PEDIDO MÉDICO: identifique os procedimentos/exames solicitados e FAÇA O ORÇAMENTO
- Se for um RESULTADO DE EXAME: descreva o que você observa
- Se for uma FOTO de algo relacionado à saúde: descreva o que vê

RESPOSTA PARA REQUISIÇÃO/PEDIDO:
1. Confirme que recebeu e analisou a imagem
2. Monte o ORÇAMENTO conforme formato das regras acima
3. SEMPRE inclua o VALOR TOTAL no final
4. Pergunte se deseja agendar`;
    } else if (mediaType === 'document') {
      instrucoesMidia = `\n\n📄 MÍDIA RECEBIDA: O cliente enviou um DOCUMENTO (PDF ou arquivo).
      
ANALISE O DOCUMENTO:
- Se for uma REQUISIÇÃO/PEDIDO MÉDICO: identifique os procedimentos/exames e FAÇA O ORÇAMENTO
- Se for um LAUDO/RESULTADO: descreva as informações relevantes

RESPOSTA PARA REQUISIÇÃO/PEDIDO:
1. Confirme que recebeu e analisou o documento
2. Monte o ORÇAMENTO conforme formato das regras acima
3. SEMPRE inclua o VALOR TOTAL no final
4. Pergunte se deseja agendar`;
    } else if (mediaType === 'audio') {
      instrucoesMidia = `\n\n🎤 MÍDIA RECEBIDA: O cliente enviou um ÁUDIO.
      
O áudio foi transcrito (se possível). Responda naturalmente ao conteúdo.
Se não conseguir entender, peça gentilmente para o cliente escrever a mensagem.`;
    } else if (mediaType === 'video') {
      instrucoesMidia = `\n\n🎥 MÍDIA RECEBIDA: O cliente enviou um VÍDEO.
      
Analise o conteúdo do vídeo se relevante para o atendimento.
Confirme o recebimento e pergunte como pode ajudar.`;
    }
    
    const promptCompleto = `${config.prompt_sistema}

---
INFORMAÇÃO DE HORÁRIO ATUAL (Fuso: Recife/Brasil):
- Horário atual: ${horaAtual}
- Saudação apropriada: ${saudacaoHorario}
- Use essa saudação APENAS se o histórico estiver vazio (primeira mensagem). Se já houver histórico, NÃO cumprimente novamente, vá direto ao ponto.

---
HISTÓRICO DA CONVERSA (últimas mensagens):
${historicoConversa || '(primeira mensagem)'}

---
NOVA MENSAGEM DO CLIENTE (${senderName}, telefone ${phoneNumber}):
${messageText}
${infoDisponibilidade}
${infoProcedimentosExames}
${instrucoesMidia}
${infoResultadoExame}

---
INSTRUÇÕES ADICIONAIS:
1. Se o cliente quer agendar e há disponibilidades acima, apresente as opções de forma clara e amigável.
2. Pergunte qual médico, dia e horário o cliente prefere.
3. Confirme os dados do paciente antes de finalizar (nome completo e data de nascimento).
4. Se o cliente já confirmou todos os dados (médico, data, horário, nome, nascimento), diga que está confirmando e peça para aguardar.
5. Responda de forma natural, seguindo o tom do prompt_sistema.`;

    // Preparar parâmetros do LLM
    const llmParams = {
      prompt: promptCompleto,
      add_context_from_internet: false
    };
    
    // Se tiver mídia (imagem/documento/vídeo), enviar para análise visual
    if (mediaUrl && (mediaType === 'image' || mediaType === 'document' || mediaType === 'video')) {
      llmParams.file_urls = [mediaUrl];
      console.log('🖼️ Enviando mídia para análise:', mediaUrl);
    }

    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM(llmParams);
    
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
          total_mensagens: (contato.total_mensagens || 0) + 2,
          status: contato.conversa_finalizada ? 'Lead' : contato.status,
          conversa_finalizada: false // Reativa conversa se cliente mandou mensagem
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
      conversationId: null,
      arquivoParaEnviar: arquivoParaEnviar
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});