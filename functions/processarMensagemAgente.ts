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
        // Buscar horários disponíveis
        const resultadoHorarios = await base44.asServiceRole.functions.invoke('chatbotAgendarConsulta', {
          acao: 'buscar_horarios',
          especialidade: especialidadeDetectada
        });

        if (resultadoHorarios.data?.disponibilidades?.length > 0) {
          const disps = resultadoHorarios.data.disponibilidades;
          infoDisponibilidade = '\n\n📅 DISPONIBILIDADES ENCONTRADAS:\n';
          
          for (const medico of disps.slice(0, 3)) {
            infoDisponibilidade += `\n👨‍⚕️ ${medico.medico_nome} (${medico.especialidade}):\n`;
            infoDisponibilidade += `   ID do médico: ${medico.medico_id}\n`;
            
            for (const dia of medico.disponibilidades.slice(0, 2)) {
              infoDisponibilidade += `   • ${dia.data_formatada}: ${dia.horarios.slice(0, 3).join(', ')}\n`;
            }
          }
          
          infoDisponibilidade += '\n⚠️ Para confirmar agendamento, preciso: nome completo e data de nascimento do paciente.';
        } else {
          infoDisponibilidade = '\n\n⚠️ Não encontrei disponibilidades no momento. Solicite que o cliente entre em contato pelo WhatsApp.';
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar disponibilidades:', e.message);
      }
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