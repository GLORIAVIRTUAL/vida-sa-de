import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { phoneNumber, messageText, senderName, pacienteId, mediaType, mediaUrl, messageId } = await req.json();
    
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
    
    // Verificar se é uma nova conversa (conversa_finalizada = true no contato)
    let conversaFinalizada = false;
    if (contatosCheck.length > 0 && contatosCheck[0].conversa_finalizada) {
      conversaFinalizada = true;
      console.log('📝 Conversa anterior foi finalizada - iniciando nova conversa');
    }
    
    // Buscar histórico de conversa
    let historicoConversa = '';
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      if (contatos.length > 0 && contatos[0].historico_mensagens) {
        // Se a conversa foi finalizada, NÃO usar o histórico antigo
        if (conversaFinalizada) {
          console.log('🗑️ Ignorando histórico antigo - conversa finalizada');
          historicoConversa = '';
        } else {
          const ultimas = contatos[0].historico_mensagens.slice(-10);
          historicoConversa = ultimas.map(m => `${m.role === 'user' ? 'CLIENTE' : 'ASSISTENTE'}: ${m.content}`).join('\n');
        }
      }
    } catch (e) {
      console.log('⚠️ Não foi possível buscar histórico');
    }

    // Verificar se cliente quer cancelar agendamento
    const querCancelar = /cancelar|desmarcar|n[aã]o (vou|posso|irei)|remarcar|adiar|desistir/i.test(messageText);
    let infoCancelamento = '';
    let agendamentoCancelado = false;

    if (querCancelar) {
      console.log('❌ Cliente quer cancelar agendamento...');

      // Buscar agendamentos do contato
      try {
        // Primeiro buscar paciente pelo telefone
        const pacientes = await base44.asServiceRole.entities.Paciente.filter({ telefone: phoneNumber });

        if (pacientes.length > 0) {
          const paciente = pacientes[0];

          // Buscar agendamentos futuros do paciente
          const hoje = new Date().toISOString().split('T')[0];
          const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            paciente_id: paciente.id,
            status: { $in: ['Agendado', 'Pago'] }
          });

          // Filtrar apenas agendamentos futuros
          const agendamentosFuturos = agendamentos.filter(ag => ag.data_agendamento >= hoje);

          if (agendamentosFuturos.length > 0) {
            // Buscar médicos para mostrar nomes
            const medicos = await base44.asServiceRole.entities.Medico.list();
            const medicosMap = {};
            medicos.forEach(m => { medicosMap[m.id] = m; });

            infoCancelamento = `\n\n📋 AGENDAMENTOS ENCONTRADOS PARA CANCELAMENTO:
    O paciente ${paciente.nome} tem os seguintes agendamentos:\n`;

            agendamentosFuturos.forEach((ag, idx) => {
              const medico = medicosMap[ag.medico_id];
              const dataObj = new Date(ag.data_agendamento + 'T12:00:00');
              const dataFormatada = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

              infoCancelamento += `\n${idx + 1}. ${ag.tipo_servico} - ${dataFormatada} às ${ag.horario}`;
              if (medico) infoCancelamento += ` com ${medico.nome} (${medico.especialidade})`;
              infoCancelamento += `\n   ID: ${ag.id}`;
            });

            infoCancelamento += `\n\n⚠️ PARA CANCELAR:
    1. Confirme QUAL agendamento o cliente deseja cancelar
    2. Pergunte o MOTIVO do cancelamento
    3. Quando confirmado, responda EXATAMENTE no formato:
    [CANCELAR_AGENDAMENTO:ID_DO_AGENDAMENTO:MOTIVO]
    Exemplo: [CANCELAR_AGENDAMENTO:abc123:paciente viajou]
    4. Após cancelar, informe que o agendamento foi cancelado com sucesso`;
          } else {
            infoCancelamento = `\n\n❌ NENHUM AGENDAMENTO FUTURO ENCONTRADO
    O paciente ${paciente.nome} não possui agendamentos futuros para cancelar.
    Informe isso gentilmente ao cliente.`;
          }
        } else {
          infoCancelamento = `\n\n📋 CANCELAMENTO DE AGENDAMENTO
    O cliente quer cancelar um agendamento mas não encontramos cadastro pelo telefone.
    Peça o NOME COMPLETO do paciente para localizar o agendamento.`;
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar agendamentos:', e.message);
      }
    }

    // Verificar se a resposta anterior contém comando de cancelamento
    const comandoCancelar = messageText.match(/\[CANCELAR_AGENDAMENTO:([^:]+):([^\]]+)\]/i);
    if (comandoCancelar) {
      const agendamentoId = comandoCancelar[1];
      const motivoCancelamento = comandoCancelar[2];

      try {
        const agendamento = await base44.asServiceRole.entities.Agendamento.filter({ id: agendamentoId });
        if (agendamento.length > 0) {
          await base44.asServiceRole.entities.Agendamento.update(agendamentoId, {
            status: 'Cancelado',
            observacoes: `Cancelado via WhatsApp. Motivo: ${motivoCancelamento}`
          });

          // Atualizar contato para pipeline "Cancelou"
          const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
          if (contatos.length > 0) {
            await base44.asServiceRole.entities.Contato.update(contatos[0].id, {
              status: 'Cancelou'
            });
          }

          agendamentoCancelado = true;
          console.log('✅ Agendamento cancelado:', agendamentoId);
        }
      } catch (e) {
        console.error('⚠️ Erro ao cancelar:', e.message);
      }
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

        // Se tiver mais de um médico da mesma especialidade, mostrar todos (sem limite)
        // Se for uma busca geral, limitar a 5
        const limitemedicos = especialidadeDetectada && medicosParaBuscar.length > 1 ? medicosParaBuscar.length : 5;

        for (const medico of medicosParaBuscar.slice(0, limitemedicos)) {
          const horariosAtendimento = medico.horarios_atendimento || [];
          if (horariosAtendimento.length === 0) continue;

          const disponibilidadesMedico = [];

          for (let i = 0; i < diasAfrente; i++) {
            const dataConsulta = new Date();
            dataConsulta.setHours(0, 0, 0, 0);
            dataConsulta.setDate(dataConsulta.getDate() + i);
            
            const dataFormatada = dataConsulta.toISOString().split('T')[0];
            const diaSemana = dataConsulta.getDay();

            // Verificar se há horários com data específica para este dia
            const horariosDataEspecifica = horariosAtendimento.filter(h => h.data_especifica === dataFormatada);
            
            // Se houver horários com data específica, usar eles; senão, usar horários recorrentes
            const horariosDoDia = horariosDataEspecifica.length > 0 
              ? horariosDataEspecifica 
              : horariosAtendimento.filter(h => h.dia_semana === diaSemana && !h.data_especifica);

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
          
          // Se há mais de um médico da mesma especialidade, mostrar TODOS
          const limiteMostrar = especialidadeDetectada && disponibilidadesEncontradas.length > 1 
            ? disponibilidadesEncontradas.length 
            : 3;
          
          for (const medico of disponibilidadesEncontradas.slice(0, limiteMostrar)) {
            infoDisponibilidade += `\n👨‍⚕️ ${medico.medico_nome} (${medico.especialidade}):\n`;
            infoDisponibilidade += `   ID do médico: ${medico.medico_id}\n`;
            
            for (const dia of medico.disponibilidades.slice(0, 2)) {
              infoDisponibilidade += `   • ${dia.data_formatada}: ${dia.horarios.slice(0, 3).join(', ')}\n`;
            }
          }
          
          if (disponibilidadesEncontradas.length > 1) {
            infoDisponibilidade += '\n⚠️ Há múltiplos profissionais disponíveis. Pergunte qual médico o paciente prefere.';
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
        const mesAtual = hoje.getMonth() + 1; // 0-11, então +1
        const diaAtual = hoje.getDate();
        const dataHojeFormatada = hoje.toLocaleDateString('pt-BR', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        
        const promptExtracao = `Analise o histórico da conversa e extraia os dados do agendamento.

HISTÓRICO:
${historicoConversa}

ÚLTIMA MENSAGEM DO CLIENTE:
${messageText}

⚠️ INFORMAÇÃO CRÍTICA - DATA ATUAL:
- HOJE É: ${dataHojeFormatada}
- DATA NO FORMATO ISO: ${hoje.toISOString().split('T')[0]}
- ANO ATUAL: ${anoAtual}
- MÊS ATUAL: ${mesAtual}
- DIA ATUAL: ${diaAtual}

IMPORTANTE: Se o cliente mencionar "dia 14/11" ou apenas "14/11" ou "novembro", você DEVE converter para ${anoAtual}. 
Se a data mencionada já passou no ano atual, considere o PRÓXIMO ano (${anoAtual + 1}).
Por exemplo: se hoje é janeiro de 2026 e o cliente disse "14/11", a data correta é 2026-11-14.

EXTRAIA OS SEGUINTES DADOS (procure em todo o histórico):
- nome_paciente: nome completo do paciente (pode estar na última mensagem ou no histórico)
- data_nascimento: data de nascimento no formato DD/MM/YYYY
- medico_nome: nome ou parte do nome do médico mencionado (ex: "João", "Dr. João", "João Inocencio", etc)
- data_agendamento: data da consulta no formato YYYY-MM-DD
- horario: horário escolhido no formato HH:MM (ex: 14:00)

REGRAS DE CONVERSÃO DE DATA (CRÍTICO):
1. Se o cliente disse "14/11" ou "novembro", e hoje é ${diaAtual}/${mesAtual}/${anoAtual}:
   - Se o mês mencionado (11) >= mês atual (${mesAtual}), use ${anoAtual}
   - Se o mês mencionado (11) < mês atual (${mesAtual}), use ${anoAtual + 1}
   - Exemplo: hoje é janeiro/2026, cliente disse "14/11" → converta para 2026-11-14
2. Se mencionou apenas dia ("dia 14"), use o mês atual (${mesAtual}) e ano atual (${anoAtual})
3. Se mencionou dia/mês ("14/01"), verifique se já passou no ano atual
4. Horários: "14h", "14:00", "às 14" → normalize para "14:00"
5. Retorne dados_completos: true se conseguir extrair TODOS os 5 campos

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
              // Buscar categoria "Particular"
              let categoriaParticularId = null;
              try {
                const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({ 
                  nome: 'Particular',
                  status: 'Ativo'
                });
                if (categorias.length > 0) {
                  categoriaParticularId = categorias[0].id;
                }
              } catch (e) {
                console.log('⚠️ Erro ao buscar categoria Particular:', e.message);
              }
              
              // Criar agendamento
              const novoAgendamento = await base44.asServiceRole.entities.Agendamento.create({
                paciente_id: paciente.id,
                paciente_nome: extracao.nome_paciente,
                medico_id: medicoEncontrado.id,
                data_agendamento: extracao.data_agendamento,
                horario: extracao.horario,
                tipo_servico: 'Consulta',
                status: 'Agendado',
                categoria_preco_id: categoriaParticularId,
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

    // Data completa formatada para o prompt
    const dataAtualCompleta = new Date().toLocaleDateString('pt-BR', { 
      timeZone: 'America/Recife',
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const dataAtualISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' }); // formato YYYY-MM-DD

    let saudacaoHorario = 'Bom-dia';
    if (horaNumero >= 12 && horaNumero < 18) {
      saudacaoHorario = 'Boa-tarde';
    } else if (horaNumero >= 18 || horaNumero < 5) {
      saudacaoHorario = 'Boa-noite';
    }

    // Determinar se é primeira mensagem da conversa atual (para saudação)
    const ehPrimeiraMensagem = !historicoConversa || historicoConversa.trim() === '' || historicoConversa === '(primeira mensagem)' || conversaFinalizada;
    
    console.log('📊 Estado da conversa:', { conversaFinalizada, ehPrimeiraMensagem, historicoTamanho: historicoConversa?.length || 0 });

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
    
    // Preparar histórico para o prompt - se conversa foi finalizada, limpar histórico mas mencionar que há histórico anterior
    let historicoParaPrompt = historicoConversa || '(primeira mensagem)';
    let contextoPreviousConversation = '';

    if (conversaFinalizada && historicoConversa) {
      contextoPreviousConversation = `\n\n📜 CONTEXTO: Esta é uma NOVA CONVERSA. A conversa anterior foi finalizada pelo atendente.
    Se o cliente mencionar algo da conversa anterior, você pode consultar o histórico abaixo para contexto, 
    mas trate esta interação como uma NOVA conversa - cumprimente novamente e foque no novo assunto.

    HISTÓRICO DA CONVERSA ANTERIOR (apenas para referência se necessário):
    ${historicoConversa}
    ---`;
      historicoParaPrompt = '(nova conversa - conversa anterior foi finalizada)';
    }

    const promptCompleto = `${config.prompt_sistema}

    ---
    ⏰ DATA E HORÁRIO ATUAL (Fuso: Recife/Brasil):
    - 📅 HOJE É: ${dataAtualCompleta}
    - 📅 DATA (ISO): ${dataAtualISO}
    - 🕐 Horário atual: ${horaAtual}
    - Saudação apropriada: ${saudacaoHorario}

    ⚠️ REGRAS CRÍTICAS DE SAUDAÇÃO:
    1. PRIMEIRA MENSAGEM DA CONVERSA (${ehPrimeiraMensagem ? 'SIM - É PRIMEIRA MENSAGEM' : 'NÃO - JÁ HÁ HISTÓRICO'}):
       - Se for primeira mensagem: use "${saudacaoHorario}, [NOME]! 👋 Eu sou a Glória, atendente do Centro Vida Saúde. Como posso te ajudar hoje? 😀"
       - Se NÃO for primeira mensagem: NÃO cumprimente, NÃO diga bom-dia/boa-tarde/boa-noite. Vá DIRETO ao ponto.

    2. NUNCA repita saudação no meio da conversa, mesmo que mude de assunto.

    ⚠️ REGRA CRÍTICA DE ORÇAMENTOS:
    - Quando você já enviou um orçamento ao cliente, NÃO repita o orçamento na próxima mensagem.
    - Se o cliente confirmar que quer agendar após o orçamento, apenas colete os dados necessários (nome, data de nascimento) SEM repetir valores.
    - Verifique no histórico se você JÁ enviou um orçamento. Se sim, prossiga com o próximo passo (agendamento, mais informações, etc.).

    ⚠️ IMPORTANTE: Quando o cliente mencionar datas de agendamento (ex: "dia 14/11", "novembro"), use o ANO CORRETO (${dataAtualISO.split('-')[0]}) e verifique se a data ainda não passou.
    ${contextoPreviousConversation}
    ---
    HISTÓRICO DA CONVERSA ATUAL (últimas mensagens):
    ${historicoParaPrompt}

    ---
    NOVA MENSAGEM DO CLIENTE (${senderName}, telefone ${phoneNumber}):
    ${messageText}
    ${infoDisponibilidade}
    ${infoProcedimentosExames}
    ${instrucoesMidia}
    ${infoResultadoExame}
    ${infoCancelamento}

---
🎯 INSTRUÇÕES CRÍTICAS SOBRE AGENDAMENTOS E HORÁRIOS:

📋 RETORNOS MÉDICOS:
- Retorno é uma consulta GRATUITA que o paciente tem direito em até 15 dias após a consulta original
- O retorno DEVE ser com o MESMO MÉDICO da consulta anterior
- Ao agendar retorno, use tipo_servico: "Retorno" (valor será R$ 0,00)
- Se o paciente mencionar "retorno", pergunte: qual médico foi a consulta anterior e quando foi realizada
- Se passou mais de 15 dias, informe que não é mais possível agendar como retorno gratuito

📋 DISPONIBILIDADES REAIS DA AGENDA:
${infoDisponibilidade ? '✅ As disponibilidades acima são REAIS e vêm diretamente da agenda dos médicos.' : '❌ Nenhuma disponibilidade foi carregada.'}

⚠️ REGRAS OBRIGATÓRIAS:
1. 🔍 CONSULTA DE MÉDICOS: Quando o cliente perguntar por uma especialidade, a lista acima mostra TODOS os profissionais disponíveis com seus horários REAIS.

2. 📅 HORÁRIOS DISPONÍVEIS: Os horários listados acima são os ÚNICOS disponíveis. NUNCA sugira horários que não estejam na lista.

3. 👨‍⚕️ MÚLTIPLOS PROFISSIONAIS: Se houver mais de um médico da mesma especialidade na lista, APRESENTE TODOS eles com seus respectivos horários ao cliente. Deixe o cliente escolher.

4. 🎯 PRECISÃO TOTAL: JAMAIS invente, sugira ou ofereça datas/horários que não aparecem na seção "DISPONIBILIDADES ENCONTRADAS" acima.

5. 📝 CONFIRMAÇÃO: Para agendar, você DEVE coletar:
   - Nome completo do paciente
   - Data de nascimento (DD/MM/YYYY)
   - Qual médico preferido (se houver múltiplos)
   - Qual data e horário da lista acima

6. ❌ SE NÃO HOUVER DISPONIBILIDADES: Se a lista acima estiver vazia ou não mostrar horários, informe que não há disponibilidade no momento e sugira contato telefônico com a clínica.

7. ✅ INTEGRAÇÃO TOTAL: Você está TOTALMENTE integrado à agenda dos médicos. A lista acima é a fonte da verdade. Confie nela completamente.

---
INSTRUÇÕES GERAIS:
1. Apresente as opções de forma clara, organizada e amigável
2. Se houver múltiplos médicos, mostre TODOS com seus horários
3. Responda de forma natural, seguindo o tom do prompt_sistema
4. Seja preciso e nunca invente informações`;

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

        // Verificar se a resposta já foi enviada recentemente (últimas 10 mensagens)
        const ultimasRespostas = historicoAtual.filter(m => m.role === 'assistant').slice(-10);
        
        // Verificar duplicata por conteúdo similar (especialmente para orçamentos)
        const respostaJaEnviada = ultimasRespostas.some(m => {
          if (!m.content || !llmResponse) return false;
          
          // Verificação exata
          if (m.content === llmResponse) return true;
          
          // Verificação por início similar (para mensagens longas como orçamentos)
          if (llmResponse.length > 100 && m.content.length > 100) {
            const inicio1 = m.content.substring(0, 150).toLowerCase().replace(/\s+/g, ' ');
            const inicio2 = llmResponse.substring(0, 150).toLowerCase().replace(/\s+/g, ' ');
            if (inicio1 === inicio2) return true;
          }
          
          // Verificação específica para orçamentos (contém ORÇAMENTO e VALOR TOTAL similar)
          if (llmResponse.includes('ORÇAMENTO') && m.content.includes('ORÇAMENTO')) {
            const valorTotal1 = m.content.match(/VALOR TOTAL[:\s]*R\$\s*([\d.,]+)/i);
            const valorTotal2 = llmResponse.match(/VALOR TOTAL[:\s]*R\$\s*([\d.,]+)/i);
            if (valorTotal1 && valorTotal2 && valorTotal1[1] === valorTotal2[1]) {
              console.log('⚠️ Orçamento duplicado detectado (mesmo valor total)');
              return true;
            }
          }
          
          // Verificação para mensagens "processando" ou de espera
          const msgProcessando = /processando|aguarde|momento|analisando|verificando/i;
          if (msgProcessando.test(llmResponse) && msgProcessando.test(m.content)) {
            // Verificar se foi enviada nos últimos 30 segundos
            const timestampMsg = new Date(m.timestamp).getTime();
            const agora = Date.now();
            if (agora - timestampMsg < 30000) {
              console.log('⚠️ Mensagem de processamento duplicada detectada');
              return true;
            }
          }
          
          return false;
        });

        if (respostaJaEnviada) {
            console.log('⚠️ Resposta duplicada detectada - gerando nova resposta');
            // Em vez de bloquear, vamos permitir que a IA gere uma resposta diferente
            // Apenas logamos o aviso mas continuamos o fluxo
          }

        // Adicionar novas mensagens ao histórico
        historicoAtual.push(
          { role: 'user', content: messageText, timestamp, messageId },
          { role: 'assistant', content: llmResponse, timestamp }
        );
        
        // Manter apenas as últimas 50 mensagens
        const historicoLimitado = historicoAtual.slice(-50);
        
        // Se a conversa estava finalizada, limpar o histórico antigo e começar do zero
        let historicoParaSalvar = historicoLimitado;
        if (conversaFinalizada) {
          console.log('🔄 Limpando histórico antigo - nova conversa');
          historicoParaSalvar = [
            { role: 'user', content: messageText, timestamp, messageId },
            { role: 'assistant', content: llmResponse, timestamp }
          ];
        }
        
        await base44.asServiceRole.entities.Contato.update(contato.id, {
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse,
          historico_mensagens: historicoParaSalvar,
          ultima_interacao: timestamp,
          total_mensagens: conversaFinalizada ? 2 : (contato.total_mensagens || 0) + 2,
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
            { role: 'user', content: messageText, timestamp, messageId },
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