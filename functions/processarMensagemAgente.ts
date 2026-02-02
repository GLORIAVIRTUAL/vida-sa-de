import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { phoneNumber, messageText, senderName, pacienteId, mediaType, mediaUrl, messageId } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText, mediaType, mediaUrl, messageId });
    
    // Verificação anti-duplicata: se já processamos este messageId, ignorar
    if (messageId) {
      try {
        const contatosVerif = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
        if (contatosVerif.length > 0) {
          const historicoVerif = contatosVerif[0].historico_mensagens || [];
          const jaProcessado = historicoVerif.some(m => m.messageId === messageId && m.role === 'assistant');
          if (jaProcessado) {
            console.log('⏭️ MessageId já processado com resposta - ignorando duplicata:', messageId);
            return Response.json({ success: true, status: 'duplicata_ignorada', resposta: null });
          }
        }
      } catch (e) {
        console.log('⚠️ Erro verificação duplicata:', e.message);
      }
    }
    
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
    
    // Buscar configuração do chatbot (com timeout)
    let config;
    try {
      const configs = await Promise.race([
        base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ChatbotConfig')), 5000))
      ]);
      config = configs[0];
    } catch (e) {
      console.error('⚠️ Erro ao buscar ChatbotConfig:', e.message);
      config = null;
    }
    
    if (!config) {
      console.log('❌ ChatbotConfig não encontrado');
      return Response.json({ 
        success: true, 
        resposta: 'Olá! Estou com dificuldades técnicas. Por favor, entre em contato pelo WhatsApp.',
        conversationId: null
      });
    }
    
    console.log('✅ Config encontrada:', config.nome, '| Modelo LLM:', config.modelo_llm);
    
    // Verificar se é uma nova conversa (conversa_finalizada = true no contato)
    let conversaFinalizada = false;
    if (contatosCheck.length > 0 && contatosCheck[0].conversa_finalizada) {
      conversaFinalizada = true;
      console.log('📝 Conversa anterior foi finalizada - iniciando nova conversa - LIMPANDO HISTÓRICO');
      // Limpar histórico imediatamente ao detectar conversa finalizada
      await base44.asServiceRole.entities.Contato.update(contatosCheck[0].id, {
        conversa_finalizada: false,
        historico_mensagens: [],
        ultima_mensagem: null,
        ultima_resposta: null
      });
    }
    
    // Buscar histórico de conversa
    let historicoConversa = '';
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      if (contatos.length > 0) {
        // Se a conversa foi finalizada ou histórico está vazio, tratar como primeira mensagem
        if (conversaFinalizada || !contatos[0].historico_mensagens || contatos[0].historico_mensagens.length === 0) {
          console.log('🗑️ Histórico vazio ou conversa finalizada - tratando como PRIMEIRA MENSAGEM');
          historicoConversa = '';
        } else {
          const ultimas = contatos[0].historico_mensagens.slice(-10);
          historicoConversa = ultimas.map(m => `${m.role === 'user' ? 'CLIENTE' : 'ASSISTENTE'}: ${m.content}`).join('\n');
        }
      }
    } catch (e) {
      console.log('⚠️ Não foi possível buscar histórico');
    }

    // Verificar se cliente quer verificar status do agendamento
    // FLUXO SEPARADO: VERIFICAÇÃO é completamente diferente de AGENDAMENTO
    const temPedidoVerificacaoNoHistorico = historicoConversa && 
      /verificar|consultar|checar|status|confirma|está confirmado|foi confirmado|meu agendamento/i.test(historicoConversa) &&
      !/agendar|marcar|nova consulta|qual especialidade/i.test(historicoConversa);

    const querVerificarAgendamento = 
      // Cliente está pedindo para verificar agora
      (/verificar|consultar|checar|status|confirma|está confirmado|foi confirmado|meu agendamento/i.test(messageText) && 
       !/cancelar|desmarcar|agendar|marcar|nova|novo/i.test(messageText)) ||
      // OU: já pediu verificação antes e agora está enviando dados (nome/data)
      (temPedidoVerificacaoNoHistorico && /(\d{1,2})\/(\d{1,2})\/(\d{4})|nascimento|nascido|me chamo/i.test(messageText));

    // Verificar se cliente quer cancelar agendamento
    const querCancelar = /cancelar|desmarcar|n[aã]o (vou|posso|irei)|remarcar|adiar|desistir/i.test(messageText) ||
                        /cancelar|desmarcar/i.test(historicoConversa || '');
    let infoCancelamento = '';
    let agendamentoCancelado = false;

    // ========== FLUXO DE VERIFICAÇÃO (SEPARADO) ==========
    if (querVerificarAgendamento) {
      console.log('🔍 Cliente quer VERIFICAR agendamento (fluxo separado)...');

      // Extrair nome e data de nascimento da conversa
      let nomeExtraido = null;
      let dataNascimentoExtraida = null;

      // Buscar nome na mensagem - múltiplos formatos
      const nomeMatch = messageText.match(/(?:nome[:\s]+|sou\s+o?\s*|me chamo\s+|é\s+)?([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+)/i);
      if (nomeMatch) {
        // Limpar nome - remover palavras comuns que não fazem parte do nome
        let nome = nomeMatch[1].trim();
        nome = nome.replace(/^(me chamo|sou|meu nome é|é)\s*/i, '');
        if (nome.split(' ').length >= 2) { // Nome deve ter pelo menos 2 partes
          nomeExtraido = nome;
        }
      }

      // Buscar data de nascimento
      const dataMatch = messageText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dataMatch) {
        dataNascimentoExtraida = `${dataMatch[3]}-${String(dataMatch[2]).padStart(2,'0')}-${String(dataMatch[1]).padStart(2,'0')}`;
      }

      console.log('📋 Dados extraídos para VERIFICAÇÃO:', { nomeExtraido, dataNascimentoExtraida });

      if (nomeExtraido && dataNascimentoExtraida) {
        // Chamar função de verificação
        try {
          const resultadoVerificacao = await base44.asServiceRole.functions.invoke('verificarAgendamento', {
            nome: nomeExtraido,
            data_nascimento: dataNascimentoExtraida
          });

          console.log('✅ Verificação realizada:', resultadoVerificacao.data);

          let respostaVerificacao = '';

          if (resultadoVerificacao.data?.sucesso && resultadoVerificacao.data?.agendamentos?.length > 0) {
            // Formatar resposta com agendamentos - MOSTRAR STATUS REAL
            respostaVerificacao = `📋 *Encontramos seus agendamentos:*\n\n`;

            resultadoVerificacao.data.agendamentos.forEach((ag, idx) => {
              // Emoji diferente por status
              let statusEmoji = '✅';
              let statusTexto = ag.status;
              if (ag.status === 'Cancelado') {
                statusEmoji = '❌';
                statusTexto = 'CANCELADO';
              } else if (ag.status === 'Agendado') {
                statusEmoji = '📅';
                statusTexto = 'Agendado (aguardando confirmação)';
              } else if (ag.status === 'Confirmado') {
                statusEmoji = '✅';
                statusTexto = 'CONFIRMADO';
              } else if (ag.status === 'Finalizado') {
                statusEmoji = '✔️';
                statusTexto = 'Finalizado';
              }

              respostaVerificacao += `${statusEmoji} *${ag.data_formatada}* às *${ag.horario}*\n`;
              respostaVerificacao += `👨‍⚕️ ${ag.medico_nome} (${ag.especialidade})\n`;
              respostaVerificacao += `🏥 ${ag.tipo_servico}\n`;
              respostaVerificacao += `📌 Status: *${statusTexto}*\n`;
              if (ag.observacoes) respostaVerificacao += `📝 ${ag.observacoes}\n`;
              respostaVerificacao += '\n';
            });

            // Mensagem final baseada nos status
            const temConfirmado = resultadoVerificacao.data.agendamentos.some(a => a.status === 'Confirmado' || a.status === 'Agendado');
            if (temConfirmado) {
              respostaVerificacao += '📍 *Endereço:* Tristão Monteiro, 580 – Zona Nova, Tramandaí/RS\n';
              respostaVerificacao += '⏰ Lembre-se de chegar 10 minutos antes!\n\nPosso ajudar em mais alguma coisa?';
            } else {
              respostaVerificacao += 'Posso ajudar em mais alguma coisa?';
            }
          } else {
            respostaVerificacao = `😔 Não encontramos agendamentos para *${nomeExtraido}* com data de nascimento *${dataMatch[1]}/${dataMatch[2]}/${dataMatch[3]}*.\n\nVerifique se os dados estão corretos ou, se preferir, posso agendar uma consulta para você! 😊`;
          }

          // Salvar no histórico
          try {
            const contatosCheck = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
            if (contatosCheck.length > 0) {
              const historicoAtual = contatosCheck[0].historico_mensagens || [];
              const timestamp = new Date().toISOString();

              historicoAtual.push(
                { role: 'user', content: messageText, timestamp },
                { role: 'assistant', content: respostaVerificacao, timestamp }
              );

              await base44.asServiceRole.entities.Contato.update(contatosCheck[0].id, {
                historico_mensagens: historicoAtual.slice(-50),
                ultima_interacao: timestamp
              });
            }
          } catch (e) {
            console.log('⚠️ Erro ao salvar histórico:', e.message);
          }

          // RETORNO IMEDIATO - NÃO CONTINUA PARA AGENDAMENTO
          return Response.json({ 
            success: true, 
            resposta: respostaVerificacao,
            verificado: true,
            fluxo: 'verificacao'
          });

        } catch (e) {
          console.error('❌ Erro ao verificar agendamento:', e.message);
        }
      } else {
        // Pedir dados faltantes - RETORNO IMEDIATO
        const respostaPedirDados = `Para verificar seu agendamento, preciso:\n\n📝 Seu nome completo\n📅 Sua data de nascimento (DD/MM/AAAA)\n\nEx: "Antonio Thiago Cavalcanti Alves 19/04/1982"`;

        // Salvar no histórico
        try {
          const contatosCheck = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
          if (contatosCheck.length > 0) {
            const historicoAtual = contatosCheck[0].historico_mensagens || [];
            const timestamp = new Date().toISOString();

            historicoAtual.push(
              { role: 'user', content: messageText, timestamp },
              { role: 'assistant', content: respostaPedirDados, timestamp }
            );

            await base44.asServiceRole.entities.Contato.update(contatosCheck[0].id, {
              historico_mensagens: historicoAtual.slice(-50),
              ultima_interacao: timestamp
            });
          }
        } catch (e) {
          console.log('⚠️ Erro ao salvar histórico:', e.message);
        }

        return Response.json({ 
          success: true, 
          resposta: respostaPedirDados,
          fluxo: 'verificacao'
        });
      }
    } // FIM VERIFICAÇÃO

      if (querCancelar) {
      console.log('❌ Cliente quer cancelar agendamento...');

      // Buscar agendamentos do contato - tentar múltiplas formas
      try {
        const hoje = new Date().toISOString().split('T')[0];
        let agendamentosFuturos = [];
        let nomePaciente = '';
        
        // 1. Primeiro buscar paciente pelo telefone (com timeout)
        let pacientes = [];
        try {
          pacientes = await Promise.race([
            base44.asServiceRole.entities.Paciente.filter({ telefone: phoneNumber }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Paciente')), 4000))
          ]);
        } catch (e) {
          console.warn('⚠️ Timeout ao buscar Paciente:', e.message);
        }
        
        if (pacientes.length > 0) {
          const paciente = pacientes[0];
          nomePaciente = paciente.nome;
          
          // Buscar agendamentos futuros do paciente
          const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            paciente_id: paciente.id,
            status: { $in: ['Agendado', 'Pago'] }
          });
          agendamentosFuturos = agendamentos.filter(ag => ag.data_agendamento >= hoje);
        }
        
        // 2. Se não encontrou pelo paciente_id, buscar pelo nome no campo paciente_nome
        if (agendamentosFuturos.length === 0 && pacientes.length > 0) {
          const todosAgendamentos = await base44.asServiceRole.entities.Agendamento.filter({
            status: { $in: ['Agendado', 'Pago'] }
          });
          
          // Filtrar por nome parcial e data futura
          const nomeLower = pacientes[0].nome.toLowerCase();
          agendamentosFuturos = todosAgendamentos.filter(ag => {
            const nomeAgLower = (ag.paciente_nome || '').toLowerCase();
            return ag.data_agendamento >= hoje && 
                   (nomeAgLower.includes(nomeLower.split(' ')[0]) || nomeLower.includes(nomeAgLower.split(' ')[0]));
          });
        }
        
        // 3. Se ainda não encontrou, buscar por nome mencionado no histórico/mensagem
        if (agendamentosFuturos.length === 0) {
          // Extrair possível nome do cliente da mensagem ou histórico
          const textoCompleto = messageText + ' ' + (historicoConversa || '');
          const nomeMatch = textoCompleto.match(/(?:nome[:\s]+|sou\s+o?\s*|me chamo\s+)([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)*)/i);
          
          if (nomeMatch) {
            const nomeBusca = nomeMatch[1].toLowerCase();
            const todosAgendamentos = await base44.asServiceRole.entities.Agendamento.filter({
              status: { $in: ['Agendado', 'Pago'] }
            });
            
            agendamentosFuturos = todosAgendamentos.filter(ag => {
              const nomeAgLower = (ag.paciente_nome || '').toLowerCase();
              return ag.data_agendamento >= hoje && nomeAgLower.includes(nomeBusca.split(' ')[0]);
            });
            
            if (agendamentosFuturos.length > 0) {
              nomePaciente = agendamentosFuturos[0].paciente_nome;
            }
          }
        }

        if (agendamentosFuturos.length > 0) {
          // Buscar médicos para mostrar nomes
          const medicos = await base44.asServiceRole.entities.Medico.list();
          const medicosMap = {};
          medicos.forEach(m => { medicosMap[m.id] = m; });

          infoCancelamento = `\n\n📋 AGENDAMENTOS ENCONTRADOS PARA CANCELAMENTO:
    O paciente ${nomePaciente || 'vinculado a este telefone'} tem os seguintes agendamentos:\n`;

          agendamentosFuturos.forEach((ag, idx) => {
            const medico = medicosMap[ag.medico_id];
            const dataObj = new Date(ag.data_agendamento + 'T12:00:00');
            const dataFormatada = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

            infoCancelamento += `\n${idx + 1}. ${ag.tipo_servico} - ${dataFormatada} às ${ag.horario}`;
            if (medico) infoCancelamento += ` com ${medico.nome} (${medico.especialidade})`;
            infoCancelamento += `\n   ID: ${ag.id}`;
          });

          infoCancelamento += `\n\n⚠️ INSTRUÇÕES PARA CANCELAMENTO:
    1. MOSTRE a lista acima ao cliente e pergunte QUAL deseja cancelar
    2. Quando o cliente confirmar (pelo número, nome do médico ou data), CANCELE IMEDIATAMENTE
    3. NÃO peça nome do paciente - já temos os dados
    4. NÃO peça motivo - apenas confirme e cancele
    5. Após o cliente indicar qual, informe que foi cancelado com sucesso`;
        } else {
          infoCancelamento = `\n\n❌ NENHUM AGENDAMENTO FUTURO ENCONTRADO
    Não encontramos agendamentos futuros para este telefone.
    Peça ao cliente para confirmar se o agendamento foi feito com este número de telefone.`;
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar agendamentos:', e.message);
      }
    }

    // Função auxiliar para executar o cancelamento
    const executarCancelamento = async (agendamentoId) => {
      console.log('🔧 executarCancelamento chamado com ID:', agendamentoId);
      try {
        // Buscar agendamento diretamente - filter por id pode não funcionar corretamente
        const todosAgendamentos = await base44.asServiceRole.entities.Agendamento.list();
        const agendamento = todosAgendamentos.find(ag => ag.id === agendamentoId);
        
        console.log('🔍 Agendamento encontrado:', agendamento ? 'SIM' : 'NÃO');
        
        if (agendamento) {
          
          // Buscar dados do médico para a notificação
          let medicoNome = 'Médico não identificado';
          let medicoEspecialidade = '';
          try {
            const medicos = await base44.asServiceRole.entities.Medico.filter({ id: agendamento.medico_id });
            if (medicos.length > 0) {
              medicoNome = medicos[0].nome;
              medicoEspecialidade = medicos[0].especialidade;
            }
          } catch (e) {}
          
          // Formatar data para notificação
          const dataObj = new Date(agendamento.data_agendamento + 'T12:00:00');
          const dataFormatada = dataObj.toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            day: '2-digit', 
            month: '2-digit'
          });
          
          // Cancelar o agendamento
          console.log('📝 Atualizando status para Cancelado...');
          await base44.asServiceRole.entities.Agendamento.update(agendamentoId, {
            status: 'Cancelado',
            observacoes: `Cancelado via WhatsApp pela Glória em ${new Date().toLocaleString('pt-BR')}`
          });
          console.log('✅ Status atualizado para Cancelado');

          // Atualizar contato para pipeline "Cancelou"
          try {
            const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
            if (contatos.length > 0) {
              await base44.asServiceRole.entities.Contato.update(contatos[0].id, {
                status: 'Cancelou'
              });
              console.log('✅ Pipeline do contato atualizado para Cancelou');
            }
          } catch (contatoError) {
            console.log('⚠️ Erro ao atualizar contato:', contatoError.message);
          }
          
          // Criar notificação de cancelamento para a equipe
          try {
            await base44.asServiceRole.entities.Notification.create({
              type: 'agendamento_cancelado',
              message: `❌ CANCELAMENTO: ${agendamento.paciente_nome || 'Paciente'} cancelou ${medicoEspecialidade} com ${medicoNome} - ${dataFormatada} às ${agendamento.horario}`,
              data: {
                agendamento_id: agendamentoId,
                paciente_nome: agendamento.paciente_nome,
                medico_nome: medicoNome,
                especialidade: medicoEspecialidade,
                data: agendamento.data_agendamento,
                horario: agendamento.horario,
                cancelado_por: 'WhatsApp - Glória'
              },
              is_read: false
            });
            console.log('🔔 Notificação de cancelamento criada');
          } catch (notifError) {
            console.error('⚠️ Erro ao criar notificação:', notifError.message);
          }

          console.log('✅ Agendamento cancelado com sucesso:', agendamentoId);
          return true;
        }
        console.log('❌ Agendamento não encontrado');
        return false;
      } catch (e) {
        console.error('❌ Erro ao cancelar:', e.message, e.stack);
        return false;
      }
    };

    // Verificar se o cliente está tentando indicar qual agendamento cancelar
    // Pode ser: número (1, 2), nome do médico, data (19/01), ou confirmação
    const contextoCancel = /cancelar|desmarcar|qual.*cancelar|gostaria de cancelar/i.test(historicoConversa || '');
    
    if (contextoCancel && historicoConversa) {
      console.log('🔍 Contexto de cancelamento detectado, analisando resposta do cliente...');
      console.log('📝 Mensagem do cliente:', messageText);
      
      // Buscar agendamentos futuros do paciente vinculado ao telefone
      const hoje = new Date().toISOString().split('T')[0];
      const pacientes = await base44.asServiceRole.entities.Paciente.filter({ telefone: phoneNumber });
      
      let agendamentosFuturos = [];
      
      if (pacientes.length > 0) {
        const paciente = pacientes[0];
        const agendamentos = await base44.asServiceRole.entities.Agendamento.filter({
          paciente_id: paciente.id,
          status: { $in: ['Agendado', 'Pago'] }
        });
        agendamentosFuturos = agendamentos.filter(ag => ag.data_agendamento >= hoje);
        console.log(`📋 Encontrados ${agendamentosFuturos.length} agendamentos futuros para ${paciente.nome}`);
      }
      
      if (agendamentosFuturos.length > 0) {
        // Buscar médicos
        const medicos = await base44.asServiceRole.entities.Medico.list();
        const medicosMap = {};
        medicos.forEach(m => { medicosMap[m.id] = m; });
        
        const msgLower = messageText.toLowerCase().trim();
        let agendamentoParaCancelar = null;
        
        // 1. Verificar se cliente disse número (1, 2, 3...)
        const numeroMatch = messageText.match(/^(\d)$/);
        if (numeroMatch) {
          const num = parseInt(numeroMatch[1]);
          if (num > 0 && num <= agendamentosFuturos.length) {
            agendamentoParaCancelar = agendamentosFuturos[num - 1].id;
            console.log(`✅ Cliente escolheu opção ${num}: ${agendamentoParaCancelar}`);
          }
        }
        
        // 2. Verificar se cliente mencionou nome do médico (douglas, rovani, etc)
        if (!agendamentoParaCancelar) {
          for (const ag of agendamentosFuturos) {
            const medico = medicosMap[ag.medico_id];
            if (medico) {
              const nomeMedicoLower = medico.nome.toLowerCase();
              const partesNome = nomeMedicoLower.split(' ').filter(p => p.length > 3);
              for (const parte of partesNome) {
                if (msgLower.includes(parte)) {
                  agendamentoParaCancelar = ag.id;
                  console.log(`✅ Cliente mencionou médico "${parte}": ${ag.id}`);
                  break;
                }
              }
            }
            if (agendamentoParaCancelar) break;
          }
        }
        
        // 3. Verificar se cliente mencionou data (19/01, dia 19)
        if (!agendamentoParaCancelar) {
          const dataMatch = messageText.match(/(\d{1,2})\/(\d{1,2})|dia\s*(\d{1,2})/i);
          if (dataMatch) {
            const dia = dataMatch[1] || dataMatch[3];
            const mes = dataMatch[2] || String(new Date().getMonth() + 1);
            const dataFormatada = `${new Date().getFullYear()}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
            
            for (const ag of agendamentosFuturos) {
              if (ag.data_agendamento === dataFormatada) {
                agendamentoParaCancelar = ag.id;
                console.log(`✅ Cliente mencionou data ${dataFormatada}: ${ag.id}`);
                break;
              }
            }
          }
        }
        
        // 4. Se só tem um agendamento e cliente confirmou
        if (!agendamentoParaCancelar && agendamentosFuturos.length === 1) {
          const confirmacao = /^(sim|s|ok|isso|confirmo|pode|certo|correto|cancela)$/i.test(msgLower);
          if (confirmacao) {
            agendamentoParaCancelar = agendamentosFuturos[0].id;
            console.log('✅ Cliente confirmou único agendamento:', agendamentoParaCancelar);
          }
        }
        
        // Executar cancelamento se encontrou qual
        if (agendamentoParaCancelar) {
          console.log('🎯 EXECUTANDO cancelamento do agendamento:', agendamentoParaCancelar);
          const cancelou = await executarCancelamento(agendamentoParaCancelar);
          if (cancelou) {
            agendamentoCancelado = true;
            console.log('✅ CANCELAMENTO EXECUTADO COM SUCESSO!');
          } else {
            console.log('❌ Falha ao executar cancelamento');
          }
        } else {
          console.log('⚠️ Não foi possível identificar qual agendamento cancelar');
        }
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
        // Buscar resultado pelo CPF (com timeout e cache)
        try {
          console.log('🔎 Buscando resultados para CPF:', cpfCliente);
          const resultados = await Promise.race([
            base44.asServiceRole.entities.ResultadoExame.list(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ResultadoExame')), 4000))
          ]);
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
            infoResultadoExame = `\n\n⏳ RESULTADO AINDA NÃO DISPONÍVEL
CPF informado: ${cpfCliente}

O resultado do exame ainda não está pronto no sistema.

RESPONDA AO CLIENTE de forma gentil:
- Informe que o resultado ainda não está disponível
- Diga que assim que ficar pronto, ele poderá solicitar novamente
- Sugira que entre em contato novamente em alguns dias
- Se preferir, pode ligar na clínica (51) 3661-5991 para mais informações

Exemplo de resposta:
"Verifiquei aqui e seu resultado ainda não está disponível no sistema. 📋 Assim que ficar pronto, você pode me chamar novamente que envio para você! Se preferir, pode também ligar na clínica: (51) 3661-5991. 😊"`;
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
    // Verificar se quer agendar na mensagem atual OU se já está em fluxo de agendamento no histórico
    const querAgendarMensagem = /agendar|marcar|consulta|atend|hor[áa]rio|dispon[íi]vel|vaga/i.test(messageText);
    const jaEmFluxoAgendamento = historicoConversa && /agendar|marcar|consulta|vamos agendar|seguir com o agendamento/i.test(historicoConversa);
    const querAgendar = querAgendarMensagem || jaEmFluxoAgendamento;
    
    // Se cliente está em fluxo de VERIFICAÇÃO, NÃO entrar em fluxo de AGENDAMENTO
    // NOTA: Se chegou aqui, verificação já retornou acima - este é um fallback de segurança
    if (querVerificarAgendamento) {
      console.log('ℹ️ Cliente em fluxo de VERIFICAÇÃO - pulando lógica de agendamento');
    } else {
      // Cliente quer AGENDAR - processar normalmente

      // Detectar especialidade mencionada - lista expandida com sinônimos
      const especialidades = [
      // Cardiologia
      'Cardiologia', 'Cardiologista', 'Cardio', 'Coração', 'Coracao', 'Arritmia', 'Pressão Alta', 'Pressao Alta', 'Hipertensão', 'Hipertensao',
      // Clínico Geral
      'Clínico Geral', 'Clinico Geral', 'Clínico', 'Clinico', 'Médico Geral', 'Medico Geral', 'Consulta Geral', 'Check-up', 'Checkup',
      // Dermatologia
      'Dermatologia', 'Dermatologista', 'Dermato', 'Pele', 'Acne', 'Manchas', 'Espinhas',
      // Endocrinologia
      'Endocrinologia', 'Endocrinologista', 'Endocrino', 'Tireoide', 'Tireóide', 'Diabetes', 'Hormônio', 'Hormonio', 'Metabolismo',
      // Ginecologia
      'Ginecologia', 'Ginecologista', 'Gineco', 'Preventivo', 'Papanicolau', 'Útero', 'Utero', 'Ovário', 'Ovario', 'Menstruação', 'Menstruacao',
      // Nutrição
      'Nutrição', 'Nutricao', 'Nutricionista', 'Nutri', 'Dieta', 'Emagrecer', 'Alimentação', 'Alimentacao', 'Peso',
      // Psicologia
      'Psicologia', 'Psicólogo', 'Psicologo', 'Psicóloga', 'Psicologa', 'Psico', 'Ansiedade', 'Depressão', 'Depressao',
      // Ortopedia
      'Ortopedia', 'Ortopedista', 'Orto', 'Osso', 'Ossos', 'Fratura', 'Coluna', 'Joelho', 'Ombro', 'Articulação', 'Articulacao',
      // Urologia
      'Urologia', 'Urologista', 'Uro', 'Próstata', 'Prostata', 'Rim', 'Rins', 'Bexiga', 'Urina',
      // Geriatria
      'Geriatria', 'Geriatra', 'Idoso', 'Idosos', 'Terceira Idade', 'Envelhecimento',
      // Gastroenterologia
      'Gastroenterologia', 'Gastro', 'Gastroenterologista', 'Estômago', 'Estomago', 'Intestino', 'Fígado', 'Figado', 'Digestão', 'Digestao', 'Azia', 'Refluxo',
      // Reumatologia
      'Reumatologia', 'Reumatologista', 'Reumato', 'Reumatismo', 'Artrite', 'Artrose', 'Lupus', 'Fibromialgia',
      // Psiquiatria
      'Psiquiatria', 'Psiquiatra', 'Remédio Controlado', 'Remedio Controlado', 'Medicação Psiquiátrica', 'Medicacao Psiquiatrica',
      // Fisioterapia
      'Fisioterapia', 'Fisioterapeuta', 'Fisio', 'RPG', 'Reabilitação', 'Reabilitacao', 'Dor nas Costas', 'Alongamento',
      // Ecografia/Ultrassom
      'Ecografia', 'Eco', 'Ultrassom', 'Ultrassonografia', 'Ultra', 'Ecografista',
      // Traumatologia
      'Traumatologia', 'Traumatologista', 'Trauma', 'Acidente', 'Lesão', 'Lesao',
      // Oftalmologia
      'Oftalmologia', 'Oftalmologista', 'Oftalmo', 'Olho', 'Olhos', 'Vista', 'Visão', 'Visao', 'Óculos', 'Oculos', 'Catarata', 'Glaucoma',
      // Otorrinolaringologia
      'Otorrinolaringologia', 'Otorrino', 'Otorrinolaringologista', 'Ouvido', 'Nariz', 'Garganta', 'Sinusite', 'Rinite', 'Amígdala', 'Amigdala',
      // Pediatria
      'Pediatria', 'Pediatra', 'Criança', 'Crianca', 'Crianças', 'Criancas', 'Bebê', 'Bebe', 'Infantil',
      // Pneumologia
      'Pneumologia', 'Pneumologista', 'Pneumo', 'Pulmão', 'Pulmao', 'Respiração', 'Respiracao', 'Asma', 'Bronquite', 'Tosse',
      // Neurologia
      'Neurologia', 'Neurologista', 'Neuro', 'Cérebro', 'Cerebro', 'Cabeça', 'Cabeca', 'Enxaqueca', 'Dor de Cabeça', 'Dor de Cabeca', 'Convulsão', 'Convulsao',
      // Quiropraxia
      'Quiropraxia', 'Quiropraxista', 'Quiro', 'Ajuste', 'Coluna Vertebral',
      // Massoterapia
      'Massoterapia', 'Massoterapeuta', 'Massagem', 'Relaxamento', 'Tensão Muscular', 'Tensao Muscular',
      // Optometria
      'Optometria', 'Optometrista', 'Grau', 'Lente', 'Lentes',
      // Hidroginástica/Hidroterapia/Pilates
      'Hidroginástica', 'Hidroginastica', 'Hidroterapia', 'Hidro', 'Pilates', 'Natação', 'Natacao', 'Piscina', 'Exercício na Água', 'Exercicio na Agua',
      // Psicopedagogia
      'Psicopedagoga', 'Psicopedagogia', 'Psicopedagogo', 'Aprendizagem', 'Dificuldade Escolar',
      // Odontologia
      'Odontologia', 'Odontologista', 'Dentista', 'Dentário', 'Dentario', 'Dente', 'Dentes', 'Ortodontia', 'Implante', 'Canal', 'Prótese Dentária', 'Protese Dentaria', 'Limpeza Dental', 'Extração', 'Extracao', 'Cárie', 'Carie',
      // Eletrocardiograma
      'Eletrocardiograma', 'ECG', 'Eletro'
      ];

    // Função para normalizar texto (remover acentos e converter para lowercase)
    const normalizarTexto = (texto) => {
      return (texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    };

    let especialidadeDetectada = null;
    let medicoEspecificoDetectado = null;
    const msgLower = normalizarTexto(messageText);
    const historicoLower = normalizarTexto(historicoConversa || '');
    const textoCompleto = msgLower + ' ' + historicoLower;

    // Primeiro verificar se mencionou nome de médico específico (com timeout)
    let todosMedicosParaDeteccao = [];
    try {
      todosMedicosParaDeteccao = await Promise.race([
        base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Medicos')), 3000))
      ]);
    } catch (e) {
      console.warn('⚠️ Timeout ao buscar médicos:', e.message);
    }
    
    for (const medico of todosMedicosParaDeteccao) {
      const nomeMedicoLower = medico.nome.toLowerCase();
      const partesNome = nomeMedicoLower.split(' ').filter(p => p.length > 3);
      
      // Verificar se alguma parte significativa do nome está na mensagem
      for (const parte of partesNome) {
        if (textoCompleto.includes(parte)) {
          medicoEspecificoDetectado = medico;
          especialidadeDetectada = medico.especialidade;
          console.log(`🎯 Médico específico detectado: ${medico.nome} (${medico.especialidade})`);
          break;
        }
      }
      if (medicoEspecificoDetectado) break;
    }

    // Se não encontrou médico específico, buscar por especialidade
     if (!medicoEspecificoDetectado) {
       for (const esp of especialidades) {
         const espNorm = normalizarTexto(esp);
         // Verifica se a mensagem ou histórico contém a especialidade (normalizado)
         if (textoCompleto.includes(espNorm)) {
           especialidadeDetectada = esp;
           console.log(`🎯 Especialidade detectada: ${esp}`);
           break;
         }
       }
     }
    
    // Só buscar disponibilidades se:
    // 1. Detectou médico específico OU especialidade específica, OU
    // 2. Já está em fluxo de agendamento com dados parciais no histórico, OU
    // 3. Cliente está confirmando horário/data (hoje, 8 horas, 13:00, etc.)
    const temEspecialidadeOuMedico = especialidadeDetectada || medicoEspecificoDetectado;
    const clienteEscolhendoHorario = /hoje|\d{1,2}[h:]?\s*(?:horas?)?|\d{1,2}:\d{2}|amanhã|segunda|terça|quarta|quinta|sexta|sábado/i.test(messageText);
    const deveBuscarDisponibilidades = querAgendar && (temEspecialidadeOuMedico || 
      (jaEmFluxoAgendamento && (/médico|doutor|dr\.|especialidade|horário|data/i.test(historicoConversa) || clienteEscolhendoHorario)));
    
    // REMOVIDO: Bloco de resposta automática para agendamento
    // Agora deixamos o LLM responder naturalmente e AGUARDAR o cliente dizer o que deseja
    
    if (deveBuscarDisponibilidades) {
      // Verificar se já mostramos disponibilidades recentemente
      const historico = historicoConversa || '';
      const jaShowouDisponibilidades = /disponibilidades? encontradas|Dr\.|👨‍⚕️/i.test(historico) && /data_formatada|horários?|14:00|15:00|16:00/i.test(historico);

      if (jaShowouDisponibilidades) {
        console.log('⏭️ Disponibilidades já foram mostradas - cliente está escolhendo');
          infoDisponibilidade = ''; // Não mostrar novamente
        } else if (!querVerificarAgendamento) {
          console.log('📅 Cliente quer agendar - buscando disponibilidades...');

      try {
        // Buscar médicos e disponibilidades diretamente
         let medicosParaBuscar = [];

         // Se detectou médico específico, usar apenas ele
         if (medicoEspecificoDetectado) {
           medicosParaBuscar = [medicoEspecificoDetectado];
           console.log(`🎯 Usando médico específico: ${medicoEspecificoDetectado.nome}`);
         } else {
           // Buscar todos os médicos ativos
           let todosMedicos = [];
           try {
             todosMedicos = await Promise.race([
               base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }),
               new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Medicos')), 3000))
             ]);
           } catch (e) {
             console.warn('⚠️ Timeout ao buscar médicos:', e.message);
             todosMedicos = [];
           }
        
          if (especialidadeDetectada) {
          const especialidadeLower = especialidadeDetectada.toLowerCase();

          // Mapeamento de sinônimos para especialidades (TUDO NORMALIZADO - sem acentos)
          // IMPORTANTE: NÃO usar termos muito genéricos que podem causar confusão
          const sinonimos = {
            'clinico geral': ['clinico geral', 'clinica geral', 'medico geral', 'consulta geral', 'check-up', 'checkup'],
            'nutricao': ['nutricao', 'nutricionista', 'dieta', 'emagrecer', 'alimentacao'],
            'fisioterapia': ['fisioterapia', 'fisioterapeuta', 'rpg', 'reabilitacao'],
            'psicologia': ['psicologia', 'psicologo', 'psicologa', 'terapeuta', 'ansiedade', 'depressao'],
            'geriatria': ['geriatria', 'geriatra', 'idoso', 'idosos', 'terceira idade'],
            'ortopedia': ['ortopedia', 'ortopedista', 'fratura', 'coluna', 'joelho', 'ombro', 'articulacao', 'traumatologia', 'traumatologista'],
            'ecocardiograma': ['ecocardiograma', 'eco cardiaco', 'ultrassom cardiaco'],
            'psiquiatria': ['psiquiatria', 'psiquiatra', 'remedio controlado'],
            'urologia': ['urologia', 'urologista', 'prostata', 'bexiga'],
            'cardiologia': ['cardiologia', 'cardiologista', 'coracao', 'arritmia', 'hipertensao'],
            'dermatologia': ['dermatologia', 'dermatologista', 'pele', 'acne', 'manchas'],
            'ginecologia': ['ginecologia', 'ginecologista', 'preventivo', 'papanicolau', 'utero', 'ovario'],
            'gastroenterologia': ['gastroenterologia', 'gastro', 'gastroenterologista', 'estomago', 'intestino', 'figado', 'azia', 'refluxo'],
            'neurologia': ['neurologia', 'neurologista', 'cerebro', 'enxaqueca', 'convulsao', 'neuropediatra'],
            'oftalmologia': ['oftalmologia', 'oftalmologista', 'olho', 'olhos', 'vista', 'visao', 'catarata', 'glaucoma'],
            'otorrinolaringologia': ['otorrinolaringologia', 'otorrino', 'otorrinolaringologista', 'ouvido', 'nariz', 'garganta', 'sinusite', 'rinite'],
            'pediatria': ['pediatria', 'pediatra', 'crianca', 'criancas', 'bebe', 'infantil'],
            'pneumologia': ['pneumologia', 'pneumologista', 'pulmao', 'asma', 'bronquite'],
            'reumatologia': ['reumatologia', 'reumatologista', 'reumatismo', 'artrite', 'artrose', 'fibromialgia'],
            'odontologia': ['odontologia', 'odontologista', 'dentista', 'dente', 'dentes', 'ortodontia', 'implante dentario', 'carie'],
            'endocrinologia': ['endocrinologia', 'endocrinologista', 'tireoide', 'diabetes', 'hormonio'],
            'quiropraxia': ['quiropraxia', 'quiropraxista', 'ajuste vertebral'],
            'massoterapia': ['massoterapia', 'massoterapeuta', 'massagem terapeutica', 'drenagem linfatica'],
            'optometria': ['optometria', 'optometrista', 'grau ocular', 'lente de contato'],
            'hidroginastica': ['hidroginastica', 'hidroterapia', 'natacao', 'piscina', 'aula experimental hidro'],
            'pilates': ['pilates', 'pilates aparelhos', 'pilates solo'],
            'psicopedagogia': ['psicopedagogia', 'psicopedagoga', 'psicopedagogo', 'aprendizagem', 'dificuldade escolar'],
            'eletrocardiograma': ['eletrocardiograma', 'ecg']
          };

          // Encontrar termos relacionados (usando texto normalizado)
          const especialidadeNorm = normalizarTexto(especialidadeLower);
          let termosRelacionados = [especialidadeNorm];
          for (const [key, valores] of Object.entries(sinonimos)) {
            const valoresNorm = valores.map(v => normalizarTexto(v));
            const keyNorm = normalizarTexto(key);
            if (valoresNorm.some(v => especialidadeNorm.includes(v) || v.includes(especialidadeNorm)) ||
                keyNorm.includes(especialidadeNorm) || especialidadeNorm.includes(keyNorm)) {
              termosRelacionados = [...termosRelacionados, keyNorm, ...valoresNorm];
            }
          }
          // Remover duplicatas
          termosRelacionados = [...new Set(termosRelacionados)];

          medicosParaBuscar = todosMedicos.filter(m => {
            // Verifica no campo principal 'especialidade' (NORMALIZADO)
            const espPrincipal = normalizarTexto(m.especialidade || '');

            // Match EXATO ou muito próximo - evitar falsos positivos
            const matchPrincipal = termosRelacionados.some(t => {
              const tNorm = normalizarTexto(t);
              // Match exato ou contém o termo completo (mínimo 5 chars para evitar "odonto" matchando "clínico")
              if (tNorm.length >= 5) {
                return espPrincipal.includes(tNorm) || tNorm.includes(espPrincipal);
              }
              // Para termos curtos, exigir match exato
              return espPrincipal === tNorm;
            });

            // Verifica no array 'especialidades' (NORMALIZADO)
            const matchArray = m.especialidades?.some(e => {
              const eLower = normalizarTexto(e);
              return termosRelacionados.some(t => {
                const tNorm = normalizarTexto(t);
                if (tNorm.length >= 5) {
                  return eLower.includes(tNorm) || tNorm.includes(eLower);
                }
                return eLower === tNorm;
              });
            });

            // NÃO verificar no nome do médico - isso causa falsos positivos
            return matchPrincipal || matchArray;
          });
          console.log(`🔍 Buscando por ${especialidadeDetectada} (termos: ${termosRelacionados.slice(0,5).join(', ')}): encontrados ${medicosParaBuscar.length} médicos`);

          // Se não encontrou nenhum médico para a especialidade, NÃO usar todos os médicos
          if (medicosParaBuscar.length === 0) {
            console.log(`❌ Nenhum médico encontrado para especialidade: ${especialidadeDetectada}`);
          }
          } else {
            // Só usa todos os médicos se NÃO detectou especialidade específica
            medicosParaBuscar = todosMedicos;
          }
          }

        const disponibilidadesEncontradas = [];
        const diasAfrente = 15;
        const diasSemanaMap = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

        // SEMPRE mostrar TODOS os médicos da especialidade escolhida (sem limite)
        const limitemedicos = medicosParaBuscar.length;

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
            // IMPORTANTE: converter dia_semana para inteiro pois pode vir como float (3.0)
            const horariosDoDia = horariosDataEspecifica.length > 0 
              ? horariosDataEspecifica 
              : horariosAtendimento.filter(h => Math.floor(h.dia_semana) === diaSemana && !h.data_especifica);

            if (horariosDoDia.length === 0) continue;

            // Buscar agendamentos com timeout
            let agendamentosExistentes = [];
            try {
              agendamentosExistentes = await Promise.race([
                base44.asServiceRole.entities.Agendamento.filter({
                  medico_id: medico.id,
                  data_agendamento: dataFormatada,
                  status: { $ne: 'Cancelado' }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Agendamentos')), 2000))
              ]);
            } catch (e) {
              console.warn(`⚠️ Timeout ao buscar agendamentos de ${medico.nome}:`, e.message);
            }

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

          // SEMPRE mostrar TODOS os médicos da especialidade
          for (const medico of disponibilidadesEncontradas) {
            infoDisponibilidade += `\n👨‍⚕️ ${medico.medico_nome} (${medico.especialidade}):\n`;
            infoDisponibilidade += `   ID do médico: ${medico.medico_id}\n`;

            // Mostrar mais dias e horários para cada médico
            for (const dia of medico.disponibilidades.slice(0, 3)) {
              infoDisponibilidade += `   • ${dia.data_formatada}: ${dia.horarios.slice(0, 5).join(', ')}\n`;
            }
          }

          if (disponibilidadesEncontradas.length > 1) {
            infoDisponibilidade += '\n⚠️ Há múltiplos profissionais disponíveis. MOSTRE TODOS ao cliente e pergunte qual médico e horário ele prefere.';
          }
          infoDisponibilidade += '\n⚠️ Para confirmar agendamento, preciso: nome completo e data de nascimento do paciente.';
          console.log('✅ Disponibilidades encontradas:', disponibilidadesEncontradas.length, 'médicos');
        } else if (medicosParaBuscar.length > 0 && disponibilidadesEncontradas.length === 0) {
          // Médicos da especialidade existem mas não têm horários nos próximos 15 dias
          // Buscar o PRIMEIRO horário disponível mesmo que seja além dos 15 dias (até 60 dias)
          console.log('⚠️ Buscando horários além dos 15 dias iniciais...');

          const diasAfrenteBuscaEstendida = 60;
          const disponibilidadesEstendidas = [];

          for (const medico of medicosParaBuscar.slice(0, 5)) {
            const horariosAtendimento = medico.horarios_atendimento || [];
            if (horariosAtendimento.length === 0) continue;

            let primeiraDisponibilidade = null;

            for (let i = 0; i < diasAfrenteBuscaEstendida && !primeiraDisponibilidade; i++) {
              const dataConsulta = new Date();
              dataConsulta.setHours(0, 0, 0, 0);
              dataConsulta.setDate(dataConsulta.getDate() + i);

              const dataFormatada = dataConsulta.toISOString().split('T')[0];
              const diaSemana = dataConsulta.getDay();

              // Verificar recorrência do horário
              const horariosDoDia = horariosAtendimento.filter(h => {
                if (h.data_especifica === dataFormatada) return true;
                if (h.data_especifica) return false;
                if (Math.floor(h.dia_semana) !== diaSemana) return false;

                // Verificar recorrência
                const recorrencia = h.recorrencia || 'Toda Semana';
                if (recorrencia === 'Toda Semana') return true;

                // Calcular semana do mês
                const primeiroDiaMes = new Date(dataConsulta.getFullYear(), dataConsulta.getMonth(), 1);
                const semanaMes = Math.ceil((dataConsulta.getDate() + primeiroDiaMes.getDay()) / 7);

                if (recorrencia === '1ª e 3ª Semana do Mês' && (semanaMes === 1 || semanaMes === 3)) return true;
                if (recorrencia === '2ª e 4ª Semana do Mês' && (semanaMes === 2 || semanaMes === 4)) return true;
                if (recorrencia === 'Apenas 1ª Semana do Mês' && semanaMes === 1) return true;
                if (recorrencia === 'Apenas 2ª Semana do Mês' && semanaMes === 2) return true;
                if (recorrencia === 'Apenas 3ª Semana do Mês' && semanaMes === 3) return true;
                if (recorrencia === 'Apenas 4ª Semana do Mês' && semanaMes === 4) return true;

                return false;
              });

              if (horariosDoDia.length === 0) continue;

              // Buscar agendamentos existentes
              let agendamentosExistentes = [];
              try {
                agendamentosExistentes = await base44.asServiceRole.entities.Agendamento.filter({
                  medico_id: medico.id,
                  data_agendamento: dataFormatada,
                  status: { $ne: 'Cancelado' }
                });
              } catch (e) {
                console.warn('⚠️ Erro ao buscar agendamentos:', e.message);
              }

              const horariosOcupados = agendamentosExistentes.map(ag => ag.horario);
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
                  const isPast = horarioDateTime < agora;

                  if (!isPast && !horariosOcupados.includes(horarioStr)) {
                    primeiraDisponibilidade = {
                      data: dataFormatada,
                      data_formatada: dataConsulta.toLocaleDateString('pt-BR', { 
                        weekday: 'long', 
                        day: '2-digit', 
                        month: '2-digit'
                      }),
                      horario: horarioStr
                    };
                    break;
                  }
                }
                if (primeiraDisponibilidade) break;
              }
            }

            if (primeiraDisponibilidade) {
              disponibilidadesEstendidas.push({
                medico_id: medico.id,
                medico_nome: medico.nome,
                especialidade: medico.especialidade,
                primeira_disponibilidade: primeiraDisponibilidade
              });
            }
          }

          if (disponibilidadesEstendidas.length > 0) {
            infoDisponibilidade = '\n\n📅 DISPONIBILIDADES ENCONTRADAS (próximos 60 dias):\n';

            for (const medico of disponibilidadesEstendidas) {
              infoDisponibilidade += `\n👨‍⚕️ ${medico.medico_nome} (${medico.especialidade}):\n`;
              infoDisponibilidade += `   ID do médico: ${medico.medico_id}\n`;
              infoDisponibilidade += `   • Primeiro horário: ${medico.primeira_disponibilidade.data_formatada} às ${medico.primeira_disponibilidade.horario}\n`;
            }

            infoDisponibilidade += '\n⚠️ Para confirmar agendamento, preciso: nome completo e data de nascimento do paciente.';
            console.log('✅ Disponibilidades estendidas encontradas:', disponibilidadesEstendidas.length, 'médicos');
          } else {
            // Realmente não há horários
            let infoMedicosEncontrados = '';
            for (const medico of medicosParaBuscar.slice(0, 3)) {
              const horariosAtendimento = medico.horarios_atendimento || [];
              if (horariosAtendimento.length > 0) {
                const diasSemanaMap = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
                const diasAtendimento = [...new Set(horariosAtendimento.map(h => diasSemanaMap[Math.floor(h.dia_semana)]))];
                infoMedicosEncontrados += `\n   - ${medico.nome}: atende ${diasAtendimento.join(', ')}`;
              }
            }

            infoDisponibilidade = `\n\n⚠️ AGENDA LOTADA:

        Encontramos profissionais de ${especialidadeDetectada}, mas todos os horários estão ocupados nos próximos 60 dias.
        ${infoMedicosEncontrados}

        Sugira ao cliente entrar em contato pelo telefone 51 3661-5991 para lista de espera.`;
          }
        } else if (medicosParaBuscar.length === 0 && especialidadeDetectada) {
          // Nenhum médico encontrado para a especialidade buscada
          console.log('❌ Nenhum médico cadastrado para a especialidade:', especialidadeDetectada);
          infoDisponibilidade = `\n\n❌ ESPECIALIDADE NÃO DISPONÍVEL: "${especialidadeDetectada}"

        Não temos profissionais de ${especialidadeDetectada} cadastrados no momento.

        Informe ao cliente que infelizmente a clínica não oferece essa especialidade atualmente e sugira entrar em contato pelo telefone 51 3661-5991 para mais informações.

        NÃO ofereça outras especialidades - apenas informe que não temos essa especialidade disponível.`;
        } else {
          console.log('⚠️ Nenhuma disponibilidade encontrada para a especialidade detectada');
          // Listar especialidades disponíveis com horários
          let especialidadesComHorario = [];
          for (const m of medicosParaBuscar) {
            if (m.horarios_atendimento && m.horarios_atendimento.length > 0) {
              especialidadesComHorario.push(`${m.nome} (${m.especialidade})`);
            }
          }
          if (especialidadesComHorario.length > 0) {
            infoDisponibilidade = `\n\n⚠️ Não encontrei disponibilidades para a especialidade buscada. Médicos encontrados mas sem horários disponíveis: ${especialidadesComHorario.join(', ')}`;
          } else {
            infoDisponibilidade = '\n\n⚠️ Não encontrei disponibilidades no momento para essa especialidade. Informe ao cliente que a clínica não possui horários disponíveis no momento para essa especialidade e sugira entrar em contato pelo telefone 51 3661-5991.';
          }
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar disponibilidades:', e.message);
      }
      }
      } // fim do if deveBuscarDisponibilidades
      } // FIM BLOCO DE AGENDAMENTO

    // Verificar no histórico se já temos médico, data e horário escolhidos
    let agendamentoCriado = false;
    let mensagemAgendamento = '';
    let dadosFaltantes = [];
    
    // Verificar se o cliente está no fluxo de agendamento (mencionou agendar ou já tem dados no histórico)
    const estaEmFluxoAgendamento = querAgendar || 
      (historicoConversa && /agendar|marcar|consulta|horário|data|nascimento|clínico|geral|doutor|dr\./i.test(historicoConversa));
    
    // Verificar se o cliente está escolhendo horário (pode ser hoje, 13 horas, etc.)
    const clienteEscolhendoHorarioAgora = /pode ser|quero|às?\s*\d|hoje|\d{1,2}[h:]|horário/i.test(messageText);
    
    if (estaEmFluxoAgendamento || historicoConversa || clienteEscolhendoHorarioAgora) {
      console.log('📝 Verificando dados para agendamento...', { estaEmFluxoAgendamento, clienteEscolhendoHorarioAgora });
      
      try {
        // Usar LLM para extrair dados do agendamento do histórico + mensagem atual
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1;
        const diaAtual = hoje.getDate();
        const dataHojeFormatada = hoje.toLocaleDateString('pt-BR', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        
        // Buscar médicos disponíveis para incluir na extração
        let medicosDisponiveis = '';
        try {
          const medicosAtivos = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });
          medicosDisponiveis = medicosAtivos.map(m => `- ${m.nome} (${m.especialidade}) [ID: ${m.id}]`).join('\n');
        } catch (e) {
          console.log('⚠️ Erro ao buscar médicos para extração');
        }

        const promptExtracao = `Você é inteligentíssimo em extrair dados de agendamento. Analise MUITO BEM o histórico E a última mensagem.

        ⚠️ REGRAS CRÍTICAS DE INTERPRETAÇÃO:
        1. Se cliente diz "João, 14 horas" = escolheu MÉDICO (João) E HORÁRIO (14:00)
        2. Se cliente diz "14 horas" ou "14h" ou "às 14" = está confirmando o HORÁRIO que foi oferecido
        3. Se cliente diz "segunda" ou "21/01" = está escolhendo a DATA
        4. Se cliente diz nome próprio em contexto de agendamento = é o NOME DO MÉDICO ou NOME DO PACIENTE (use contexto!)
        5. Se está no fluxo de agendamento (histórico menciona médicos/horários), interprete SEMPRE para preencher dados faltantes
        6. ⚠️ CRÍTICO: Se cliente envia "Nome Completo DD/MM/AAAA" (ex: "Antonio thiago cavalcanti 19/04/1982"), extraia:
           - nome_paciente = "Antonio Thiago Cavalcanti" (tudo antes da data, capitalize corretamente)
           - data_nascimento = "19/04/1982" (a data no final)

        HISTÓRICO DA CONVERSA:
        ${historicoConversa || '(sem histórico)'}

        ÚLTIMA MENSAGEM DO CLIENTE:
        ${messageText}

⚠️ DATA ATUAL: ${dataHojeFormatada} (${hoje.toISOString().split('T')[0]})

📋 MÉDICOS CADASTRADOS NO SISTEMA:
${medicosDisponiveis}

EXTRAIA OS DADOS QUE CONSEGUIR ENCONTRAR:
1. nome_paciente: nome completo (ex: "Antonio Thiago Cavalcanti Alves") - se vier junto com data, separe!
2. data_nascimento: formato DD/MM/YYYY (ex: "19/04/1982") - pode vir no final da mensagem junto com nome
3. medico_nome: nome EXATO do médico escolhido da lista acima (ex: "Dr. João Inocencio Rodrigues Gonçalves")
4. medico_id: ID do médico escolhido da lista acima (se encontrar)
5. data_agendamento: formato YYYY-MM-DD (converta "14/01" para "${anoAtual}-01-14", "hoje" para "${hoje.toISOString().split('T')[0]}")
6. horario: formato HH:MM (converta "17:30", "17h30", "às 17:30" para "17:30")

REGRAS CRÍTICAS:
- Se o cliente disse "hoje", use ${hoje.toISOString().split('T')[0]}
- Se disse apenas dia/mês (14/01), adicione ano ${anoAtual}
- Marque cada campo como null se NÃO encontrar
- dados_completos = true APENAS se TODOS os 6 campos forem preenchidos
- IMPORTANTE: Use o nome EXATO do médico que foi OFERECIDO no histórico da conversa
- Se o assistente ofereceu "Dr. Douglas Filipe Bianchi", use EXATAMENTE esse nome
- NÃO confunda médicos diferentes - verifique qual médico foi mencionado na conversa
- ⚠️ MUITO IMPORTANTE: Se o cliente enviou nome e data de nascimento juntos (ex: "Antonio thiago 19/04/1982"), EXTRAIA AMBOS! O nome é tudo antes da data, a data de nascimento é a data no formato DD/MM/AAAA.

Retorne JSON.`;

        const extracao = await Promise.race([
          base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: promptExtracao,
            add_context_from_internet: false,
            response_json_schema: {
              type: "object",
              properties: {
                dados_completos: { type: "boolean" },
                nome_paciente: { type: ["string", "null"] },
                data_nascimento: { type: ["string", "null"] },
                medico_nome: { type: ["string", "null"] },
                medico_id: { type: ["string", "null"] },
                data_agendamento: { type: ["string", "null"] },
                horario: { type: ["string", "null"] }
              }
            }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout LLM Extracao')), 8000))
        ]);

        console.log('📊 Extração de dados:', JSON.stringify(extracao));

        // Verificar quais dados faltam
            if (!extracao.nome_paciente) dadosFaltantes.push('nome completo');
            if (!extracao.data_nascimento) dadosFaltantes.push('data de nascimento');

        // Só adiciona médico/data/horário como faltantes se o cliente ainda não escolheu
        const jaEscolheuMedico = historicoConversa && /(Dr\.|👨‍⚕️|médico|doutor)/i.test(historicoConversa) && (extracao.medico_nome || extracao.medico_id);
        const jaEscolheuHorario = historicoConversa && /\d{1,2}[h:]|14:00|15:00|16:00|hora/i.test(historicoConversa) && extracao.horario;

        if (!extracao.medico_nome && !extracao.medico_id && !jaEscolheuMedico) dadosFaltantes.push('médico');
        if (!extracao.data_agendamento) dadosFaltantes.push('data da consulta');
        if (!extracao.horario && !jaEscolheuHorario) dadosFaltantes.push('horário');

        // Se temos TODOS os dados, criar agendamento IMEDIATAMENTE
        if (extracao.dados_completos && extracao.nome_paciente && extracao.data_nascimento && 
            (extracao.medico_nome || extracao.medico_id) && extracao.data_agendamento && extracao.horario) {
          
          console.log('✅ Todos os dados coletados, criando agendamento...');
          console.log('📋 Médico extraído:', extracao.medico_nome, '| ID:', extracao.medico_id);
          
          // Buscar médico - primeiro por ID se disponível, depois por nome (com timeout)
          let medicos = [];
          try {
            medicos = await Promise.race([
              base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Medicos')), 3000))
            ]);
          } catch (e) {
            console.warn('⚠️ Timeout ao buscar médicos:', e.message);
          }
          let medicoEncontrado = null;
          
          // Tentar primeiro pelo ID (mais preciso)
          if (extracao.medico_id) {
            medicoEncontrado = medicos.find(m => m.id === extracao.medico_id);
          }
          
          // Se não encontrou pelo ID, buscar pelo nome (mais flexível)
          if (!medicoEncontrado && extracao.medico_nome) {
            const nomeExtraidoLower = extracao.medico_nome.toLowerCase();
            
            // Primeiro tenta match exato
            medicoEncontrado = medicos.find(m => 
              m.nome.toLowerCase() === nomeExtraidoLower
            );
            
            // Se não encontrou, tenta match parcial mas mais rigoroso
            if (!medicoEncontrado) {
              medicoEncontrado = medicos.find(m => {
                const nomeMedicoLower = m.nome.toLowerCase();
                // Verifica se o nome extraído contém o nome completo do médico ou vice-versa
                return nomeMedicoLower.includes(nomeExtraidoLower) || 
                       nomeExtraidoLower.includes(nomeMedicoLower) ||
                       // Verifica também partes significativas do nome (mais de 2 palavras coincidindo)
                       nomeExtraidoLower.split(' ').filter(p => p.length > 2 && nomeMedicoLower.includes(p)).length >= 2;
              });
            }
          }
          
          console.log('🔍 Médico encontrado:', medicoEncontrado?.nome || 'NÃO ENCONTRADO');

          if (medicoEncontrado) {
            // Converter data de nascimento para formato ISO
            let dataNascimentoISO = null;
            if (extracao.data_nascimento) {
              const partes = extracao.data_nascimento.split('/');
              if (partes.length === 3) {
                dataNascimentoISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
              }
            }

            // Buscar ou criar paciente - busca por telefone OU por nome + data nascimento
            let paciente = null;
            
            // Primeiro tenta buscar por telefone
            let pacientesExistentes = await base44.asServiceRole.entities.Paciente.filter({ telefone: phoneNumber });
            
            // Se não encontrou por telefone, busca por nome + data de nascimento
            if (pacientesExistentes.length === 0 && extracao.nome_paciente && dataNascimentoISO) {
              console.log('🔍 Buscando paciente por nome e data de nascimento...');
              const todosPacientes = await base44.asServiceRole.entities.Paciente.list();
              const nomeLower = extracao.nome_paciente.toLowerCase().trim();
              
              pacientesExistentes = todosPacientes.filter(p => {
                const nomeMatch = p.nome && p.nome.toLowerCase().trim() === nomeLower;
                const dataNascMatch = p.data_nascimento === dataNascimentoISO;
                return nomeMatch && dataNascMatch;
              });
              
              if (pacientesExistentes.length > 0) {
                console.log('✅ Paciente encontrado por nome + data nascimento:', pacientesExistentes[0].nome);
              }
            }
            
            if (pacientesExistentes.length > 0) {
              paciente = pacientesExistentes[0];
              // Atualizar dados do paciente (incluindo telefone se não tinha)
              const updateData = {
                nome: extracao.nome_paciente,
                data_nascimento: dataNascimentoISO
              };
              if (!paciente.telefone || paciente.telefone === '') {
                updateData.telefone = phoneNumber;
              }
              await base44.asServiceRole.entities.Paciente.update(paciente.id, updateData);
              console.log('✅ Paciente existente atualizado:', paciente.id);
            } else {
              // Criar novo paciente
              console.log('🆕 Criando novo paciente:', extracao.nome_paciente);
              paciente = await base44.asServiceRole.entities.Paciente.create({
                nome: extracao.nome_paciente,
                telefone: phoneNumber,
                cpf: 'NÃO INFORMADO',
                data_nascimento: dataNascimentoISO,
                observacoes: 'Criado via WhatsApp pela Glória'
              });
              console.log('✅ Novo paciente criado:', paciente.id);
            }

            // Verificar se horário ainda está disponível (com timeout)
            let agendamentosExistentes = [];
            try {
              agendamentosExistentes = await Promise.race([
                base44.asServiceRole.entities.Agendamento.filter({
                  medico_id: medicoEncontrado.id,
                  data_agendamento: extracao.data_agendamento,
                  horario: extracao.horario,
                  status: { $ne: 'Cancelado' }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Agendamentos')), 2000))
              ]);
            } catch (e) {
              console.warn('⚠️ Timeout ao buscar agendamentos:', e.message);
            }

            if (agendamentosExistentes.length === 0) {
              // Buscar categoria "Particular" e valor da consulta
              let categoriaParticularId = null;
              let valorConsulta = 0;
              try {
                const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({ 
                  nome: 'Particular',
                  status: 'Ativo'
                });
                if (categorias.length > 0) {
                  categoriaParticularId = categorias[0].id;
                  
                  // Buscar valor da consulta na tabela de preços (com timeout)
                  // Procurar procedimento de consulta da especialidade do médico
                  try {
                    const [tabelaPrecos, procedimentos] = await Promise.all([
                      Promise.race([
                        base44.asServiceRole.entities.TabelaPreco.filter({ categoria_id: categoriaParticularId }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout TabelaPrecos')), 2000))
                      ]).catch(() => []),
                      Promise.race([
                        base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Procedimentos')), 2000))
                      ]).catch(() => [])
                    ]);
                    
                    // Buscar procedimento de consulta para a especialidade do médico
                    const especialidadeMedico = (medicoEncontrado.especialidade || '').toLowerCase();
                    let procedimentoConsulta = procedimentos.find(p => {
                      const nomeLower = (p.nome || '').toLowerCase();
                      const espLower = (p.especialidade || '').toLowerCase();
                      return (nomeLower.includes('consulta') || nomeLower.includes(especialidadeMedico)) &&
                             (espLower.includes(especialidadeMedico) || especialidadeMedico.includes(espLower));
                    });
                    
                    // Se não encontrou específico, buscar consulta genérica ou clínico geral
                    if (!procedimentoConsulta) {
                      procedimentoConsulta = procedimentos.find(p => {
                        const nomeLower = (p.nome || '').toLowerCase();
                        return nomeLower.includes('consulta') && (nomeLower.includes('clínico') || nomeLower.includes('clinico') || nomeLower.includes('geral'));
                      });
                    }
                    
                    if (procedimentoConsulta) {
                      const preco = tabelaPrecos.find(tp => tp.procedimento_id === procedimentoConsulta.id);
                      if (preco) {
                        valorConsulta = preco.valor || 0;
                        console.log(`💰 Valor da consulta encontrado: R$ ${valorConsulta}`);
                      }
                    }
                  } catch (precoError) {
                    console.log('⚠️ Erro ao buscar valor da consulta:', precoError.message);
                  }
                }
              } catch (e) {
                console.log('⚠️ Erro ao buscar categoria Particular:', e.message);
              }
              
              // Criar agendamento com valor
              const novoAgendamento = await base44.asServiceRole.entities.Agendamento.create({
                paciente_id: paciente.id,
                paciente_nome: extracao.nome_paciente,
                medico_id: medicoEncontrado.id,
                data_agendamento: extracao.data_agendamento,
                horario: extracao.horario,
                tipo_servico: 'Consulta',
                status: 'Agendado',
                categoria_preco_id: categoriaParticularId,
                valor_total: valorConsulta,
                valor_final: valorConsulta,
                observacoes: 'Agendado pela Glória',
                agendado_por: 'Glória',
                agendado_por_tipo: 'chatbot'
              });

              console.log('✅ AGENDAMENTO CRIADO:', novoAgendamento.id);

              // Criar notificação para a equipe
              try {
                const dataObjNotif = new Date(extracao.data_agendamento + 'T12:00:00');
                const dataFormatadaNotif = dataObjNotif.toLocaleDateString('pt-BR');

                await base44.asServiceRole.entities.Notification.create({
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
              
              mensagemAgendamento = `✅ Agendamento confirmado!\n\n📋 Resumo:\n• Paciente: ${extracao.nome_paciente}\n• Médico: ${medicoEncontrado.nome} (${medicoEncontrado.especialidade})\n• Data: ${dataFormatada}\n• Horário: ${extracao.horario}\n\n📍 Endereço: Tristão Monteiro, 580 – Zona Nova, Tramandaí/RS\n\n⚠️ Lembre-se de trazer documento original com foto.\n\nTe aguardamos! 😊`;
            } else {
              console.log('⚠️ Horário já ocupado');
              mensagemAgendamento = `😔 Poxa, esse horário acabou de ser preenchido. Vou verificar outras opções disponíveis para você!`;
            }
          } else {
            console.log('⚠️ Médico não encontrado:', extracao.medico_nome);
          }
        } else if (dadosFaltantes.length > 0 && dadosFaltantes.length < 5) {
          // Tem alguns dados mas faltam outros - informar ao LLM quais dados faltam
          console.log('📋 Dados faltantes para agendamento:', dadosFaltantes.join(', '));
        }
      } catch (extracaoError) {
        console.error('⚠️ Erro na extração:', extracaoError.message);
      }
    }

    // Verificar se cliente está confirmando agendamento (sim, ok, confirmo, etc.)
    const estaConfirmando = /^(sim|s|ok|certo|correto|confirmo|pode|isso|claro|beleza|tudo bem|confirm|yes)$/i.test(messageText.trim());

    if (estaConfirmando && historicoConversa && /Para confirmar o agendamento|data de nascimento|nome completo/i.test(historicoConversa)) {
      console.log('✅ Cliente confirmando - extrair dados finais do histórico');

      // Se confirmou, significa que já forneceu os dados - buscar no histórico
      if (!dadosFaltantes.includes('nome completo') && 
          !dadosFaltantes.includes('data de nascimento') &&
          !dadosFaltantes.includes('médico') &&
          !dadosFaltantes.includes('data da consulta') &&
          !dadosFaltantes.includes('horário')) {
        console.log('📊 Todos os dados já foram coletados! Criando agendamento...');
        // Deixar passar para lógica de criação automática abaixo
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
    // Primeira mensagem = conversa foi finalizada OU histórico está completamente vazio/inexistente
    // NÃO usar tamanho do texto como critério - verificar se realmente existe histórico
    const historicoVazio = !historicoConversa || historicoConversa.trim() === '';
    const ehPrimeiraMensagem = conversaFinalizada || historicoVazio;
    
    console.log('🔍 Verificação primeira mensagem:', { conversaFinalizada, historicoVazio, ehPrimeiraMensagem, historicoTamanho: historicoConversa?.length || 0 });

    // Buscar procedimentos e exames disponíveis para orçamento
    let infoProcedimentosExames = '';
    
    // Carregar lista de procedimentos e exames para qualquer mensagem sobre orçamento/preço ou mídia
    // SEMPRE carregar quando mencionar preço, valor, exame específico, quanto custa, etc.
    const querOrcamento = /or[çc]amento|pre[çc]o|valor|quanto|custa|faz|realiza|exame|procedimento|requisição|pedido|hemograma|glicose|colesterol|triglice|vitamina|urina|fezes|sangue|tireoide|tsh|t4|psa|creatinina|ureia|tgo|tgp|ácido|acido/i.test(messageText);
    
    if (mediaType === 'image' || mediaType === 'document' || querOrcamento) {
      console.log('📋 Carregando lista de procedimentos e exames para orçamento...');
      
      try {
        // Carregamento paralelo com timeout
        const [procedimentos, exames, tabelaPrecos] = await Promise.all([
          Promise.race([
            base44.asServiceRole.entities.Procedimento.filter({ status: 'Ativo' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Procedimentos')), 3000))
          ]).catch(e => {
            console.warn('⚠️ Erro procedimentos:', e.message);
            return [];
          }),
          Promise.race([
            base44.asServiceRole.entities.Exame.filter({ status: 'Ativo' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Exames')), 3000))
          ]).catch(e => {
            console.warn('⚠️ Erro exames:', e.message);
            return [];
          }),
          Promise.race([
            base44.asServiceRole.entities.TabelaPreco.list(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout TabelaPrecos')), 3000))
          ]).catch(e => {
            console.warn('⚠️ Erro tabela preços:', e.message);
            return [];
          })
        ]);
        
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

    🧠 CONTEXTO DO FLUXO DE AGENDAMENTO:
    ${historicoConversa && /disponibilidades? encontradas|Dr\.|👨‍⚕️/i.test(historicoConversa) ? 
      '✅ DISPONIBILIDADES JÁ FORAM MOSTRADAS ao cliente. Ele está ESCOLHENDO agora. NÃO REPITA disponibilidades novamente!' : 
      '❌ Disponibilidades ainda NÃO foram mostradas (ou foram há muito tempo). Se cliente quer agendar, MOSTRE as opções.'}
    ${dadosFaltantes.length > 0 ? `📋 DADOS QUE FALTAM: ${dadosFaltantes.join(', ')}` : ''}

    ⚠️ REGRAS CRÍTICAS DE SAUDAÇÃO - MUITO IMPORTANTE:
    
    🚨 ESTADO ATUAL: ${ehPrimeiraMensagem ? '🆕 PRIMEIRA MENSAGEM - USE A SAUDAÇÃO' : '🔄 CONVERSA EM ANDAMENTO - NÃO USE SAUDAÇÃO!'}
    
    ${ehPrimeiraMensagem ? `
    ✅ COMO É A PRIMEIRA MENSAGEM, você DEVE iniciar com:
    "${saudacaoHorario}, [NOME]! 👋 Eu sou a Glória, atendente do Centro Vida Saúde. Como posso te ajudar hoje? 😀"
    ` : `
    ❌ ATENÇÃO: JÁ EXISTE HISTÓRICO DE CONVERSA!
    - NÃO diga "Bom-dia", "Boa-tarde", "Boa-noite"
    - NÃO diga "Olá", "Oi", "Como posso ajudar"
    - NÃO se apresente novamente como Glória
    - VÁ DIRETO AO PONTO respondendo a pergunta do cliente
    - Se o cliente perguntou algo, RESPONDA DIRETAMENTE sem cumprimentos
    `}
    
    🚫 PROIBIDO: Repetir saudação/apresentação em qualquer momento após a primeira mensagem.

    ⚠️ REGRA CRÍTICA DE ORÇAMENTOS - MUITO IMPORTANTE - LEIA COM ATENÇÃO:
    - ANTES de enviar um orçamento, VERIFIQUE SE JÁ EXISTE UM ORÇAMENTO NO HISTÓRICO DA CONVERSA.
    - Se no histórico já existe uma mensagem sua com "ORÇAMENTO" e "VALOR TOTAL", NUNCA envie outro orçamento.
    - Se o cliente enviar a mesma requisição/imagem novamente, diga APENAS: "Já enviei o orçamento acima! Ficou alguma dúvida sobre os valores? 😊"
    - Se o cliente confirmar que quer agendar após o orçamento, apenas colete os dados necessários (nome, data de nascimento) SEM repetir valores.
    - NUNCA, em hipótese alguma, repita o orçamento completo - uma vez enviado, NÃO envie novamente.
    - Se o cliente mandar outra imagem igual ou similar, NÃO faça novo orçamento - apenas pergunte se ficou dúvida.
    - VERIFIQUE O HISTÓRICO: se já tem "📋 *ORÇAMENTO*" ou "VALOR TOTAL" nas suas mensagens anteriores, NÃO repita.

    ⚠️ REGRAS CRÍTICAS DE AGENDAMENTO - MUITO IMPORTANTE:
    1. NUNCA diga "aguarde", "um momento" ou "vou verificar" - você TEM os dados, use-os IMEDIATAMENTE.
    2. Quando o cliente fornecer um dado (nome, data nascimento, etc.), peça APENAS o PRÓXIMO dado faltante.
    3. NÃO repita dados que o cliente já forneceu.
    4. Dados necessários para agendar: nome completo, data de nascimento, médico, data e horário.
    5. ⚠️ IMPORTANTE: Se o cliente já escolheu médico E horário, NÃO peça novamente - passe a pedir NOME E DATA DE NASCIMENTO IMEDIATAMENTE.
    6. Mensagens ULTRA-CONCISAS no fluxo de agendamento (máx 1-2 linhas por pergunta).
    ${dadosFaltantes.length > 0 && dadosFaltantes.length < 5 ? `
    📋 DADOS FALTANTES PARA ESTE AGENDAMENTO: ${dadosFaltantes.join(', ')}
    👉 Peça APENAS o PRÓXIMO dado faltante. Máximo 1 frase, seja direto.` : ''}

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
1. 🔍 PRIMEIRO PERGUNTE A ESPECIALIDADE: Se o cliente disser "quero agendar uma consulta" sem especificar a especialidade, PERGUNTE: "Para qual especialidade você gostaria de agendar? Temos Clínico Geral, Cardiologia, Psicologia, Nutrição, entre outras. 😊"
   - NÃO mostre lista de médicos antes de saber a especialidade!
   - APENAS mostre horários quando o cliente ESPECIFICAR a especialidade ou médico.

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
      add_context_from_internet: false,
      model: config.modelo_llm || 'gpt-4o-mini'
    };
    
    // Se tiver mídia (imagem/documento/vídeo), enviar para análise visual
    if (mediaUrl && (mediaType === 'image' || mediaType === 'document' || mediaType === 'video')) {
      llmParams.file_urls = [mediaUrl];
      console.log('🖼️ Enviando mídia para análise:', mediaUrl);
    }

    // Chamar LLM com timeout
    let llmResponse;
    try {
      llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM(llmParams);
      console.log('✅ LLM respondeu');
    } catch (e) {
      console.error('❌ Erro LLM:', e.message);
      llmResponse = null;
    }
    

    // Identificar motivo do contato
    let motivoIdentificado = null;
    const msgLowerMotivo = messageText.toLowerCase();
    const historicoLowerMotivo = (historicoConversa || '').toLowerCase();
    const textoCompletoMotivo = msgLowerMotivo + ' ' + historicoLowerMotivo;

    if (textoCompletoMotivo.includes('cancelar') || textoCompletoMotivo.includes('desmarcar') || textoCompletoMotivo.includes('cancelamento')) {
      motivoIdentificado = 'Cancelamento';
    } else if (textoCompletoMotivo.includes('resultado') || textoCompletoMotivo.includes('laudo') || textoCompletoMotivo.includes('exame pronto')) {
      motivoIdentificado = 'Resultado de Exames';
    } else if (textoCompletoMotivo.includes('orçamento') || textoCompletoMotivo.includes('orcamento') || textoCompletoMotivo.includes('quanto custa') || textoCompletoMotivo.includes('preço') || textoCompletoMotivo.includes('valor')) {
      motivoIdentificado = 'Orçamento';
    } else if (textoCompletoMotivo.includes('cartão') || textoCompletoMotivo.includes('cartao') || textoCompletoMotivo.includes('mais vida')) {
      motivoIdentificado = 'Cartão Mais Vida';
    } else if (textoCompletoMotivo.includes('turma') || textoCompletoMotivo.includes('hidrogin') || textoCompletoMotivo.includes('pilates') || textoCompletoMotivo.includes('natação') || textoCompletoMotivo.includes('natacao')) {
      motivoIdentificado = 'Turmas';
    } else if (textoCompletoMotivo.includes('procedimento')) {
      motivoIdentificado = 'Procedimentos';
    } else if (textoCompletoMotivo.includes('agendar') || textoCompletoMotivo.includes('marcar') || textoCompletoMotivo.includes('consulta') || textoCompletoMotivo.includes('horário') || textoCompletoMotivo.includes('horario') || textoCompletoMotivo.includes('disponível') || textoCompletoMotivo.includes('disponivel')) {
      motivoIdentificado = 'Agendamento';
    }

    console.log('🏷️ Motivo identificado:', motivoIdentificado);

    // Salvar conversa no histórico
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      const timestamp = new Date().toISOString();

      if (contatos.length > 0) {
        const contato = contatos[0];
        const historicoAtual = contato.historico_mensagens || [];

        // Verificar duplicatas - orçamentos e outras mensagens repetidas
        const historicoCompleto = historicoAtual.filter(m => m.role === 'assistant');
        const ultimasRespostasAssistente = historicoCompleto.slice(-5);

        // Sem deduplicação agressiva - deixar a IA decidir
        // Apenas verificar se é a exata mesma resposta (palavra por palavra)
        const respostaExataIgual = ultimasRespostasAssistente.some(m => {
          if (!m.content || !llmResponse) return false;
          const msg1 = m.content.toLowerCase().replace(/\s+/g, ' ').trim();
          const msg2 = llmResponse.toLowerCase().replace(/\s+/g, ' ').trim();
          return msg1 === msg2 && msg1.length > 50; // Apenas bloqueia respostas idênticas longas
        });

        if (respostaExataIgual) {
          console.log('⚠️ Resposta idêntica já enviada - ignorando');
          return Response.json({ 
            success: true, 
            resposta: null,
            duplicado: true
          });
        }

        // Verificar se a mesma resposta já foi enviada recentemente (últimas 5 mensagens)
        const respostaExata = ultimasRespostasAssistente.some(m => {
          if (!m.content || !llmResponse) return false;
          // Normalizar para comparação
          const msg1 = m.content.toLowerCase().replace(/\s+/g, ' ').trim();
          const msg2 = llmResponse.toLowerCase().replace(/\s+/g, ' ').trim();
          return msg1 === msg2;
        });

        if (respostaExata) {
          console.log('⚠️ Resposta exata duplicada detectada - NÃO enviando');
          return Response.json({ 
            success: true, 
            resposta: null,
            duplicado: true,
            message: 'Resposta duplicada'
          });
        }

        // Verificar se a mensagem "Já enviei o orçamento" foi enviada recentemente
        const jaEnviouMsgOrcamento = ultimasRespostasAssistente.some(m => 
          m.content && /já enviei o orçamento/i.test(m.content)
        );

        if (jaEnviouMsgOrcamento && /já enviei o orçamento/i.test(llmResponse)) {
          console.log('⚠️ Mensagem "já enviei orçamento" duplicada - NÃO enviando');
          return Response.json({ 
            success: true, 
            resposta: null,
            duplicado: true,
            message: 'Mensagem duplicada'
          });
        }

        // Incluir URL da mídia no conteúdo se houver
        let conteudoUsuario = messageText;
        if (mediaUrl) {
          conteudoUsuario = `${messageText}\n${mediaUrl}`;
        }

        // Adicionar novas mensagens ao histórico (com mídia se houver)
        historicoAtual.push(
          { role: 'user', content: conteudoUsuario, timestamp, messageId, mediaType, mediaUrl },
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
        
        const updateData = {
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse,
          historico_mensagens: historicoParaSalvar,
          ultima_interacao: timestamp,
          total_mensagens: conversaFinalizada ? 2 : (contato.total_mensagens || 0) + 2,
          status: contato.conversa_finalizada ? 'Lead' : contato.status,
          conversa_finalizada: false // Reativa conversa se cliente mandou mensagem
        };

        // Adicionar motivo se identificado
        if (motivoIdentificado) {
          const interessesAtuais = contato.interesses || [];
          if (!interessesAtuais.includes(motivoIdentificado)) {
            updateData.interesses = [...interessesAtuais, motivoIdentificado];
          }
        }

        await base44.asServiceRole.entities.Contato.update(contato.id, updateData);
        console.log('✅ Contato atualizado:', contato.id.substring(0, 8));
      } else {
        // Criar novo contato
        const novoContatoData = {
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
        };

        // Adicionar motivo se identificado
        if (motivoIdentificado) {
          novoContatoData.interesses = [motivoIdentificado];
        }

        await base44.asServiceRole.entities.Contato.create(novoContatoData);
        console.log('✅ Novo contato criado');
      }
    } catch (e) {
      console.error('⚠️ Erro ao salvar histórico:', e.message);
    }
    
    // Se tem arquivo para enviar, adicionar ao histórico como mensagem separada
    if (arquivoParaEnviar && arquivoParaEnviar.url) {
      try {
        const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
        if (contatos.length > 0) {
          const contato = contatos[0];
          const historicoAtual = contato.historico_mensagens || [];
          const timestamp = new Date().toISOString();
          
          // Adicionar mensagem do arquivo enviado
          historicoAtual.push({
            role: 'assistant',
            content: `📄 ${arquivoParaEnviar.nome}: ${arquivoParaEnviar.url}`,
            timestamp,
            mediaType: 'document',
            mediaUrl: arquivoParaEnviar.url
          });
          
          await base44.asServiceRole.entities.Contato.update(contato.id, {
            historico_mensagens: historicoAtual.slice(-50)
          });
          console.log('✅ Arquivo adicionado ao histórico:', arquivoParaEnviar.nome);
        }
      } catch (e) {
        console.error('⚠️ Erro ao salvar arquivo no histórico:', e.message);
      }
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