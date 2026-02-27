import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Admin utility to persist institutional information into ChatbotConfig.informacoes_institucionais
// Usage: invoke with no payload; it will upsert the active config with the embedded text below.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Validate auth if present (allow internal/service invocations too)
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (user && !(user.role === 'admin' || user.app_role === 'admin')) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const infoText = `SOBRE A CLÍNICA\n\nClínica que oferece consultas médicas, exames de imagem, odontologia, fisioterapia, pilates, hidroginástica, natação infantil.\n\nHorário: 08:00 às 19:00, segunda a sexta\nTelefones: (51) 98550-5991 / (51) 3661-5991\nEndereço: Tristão Monteiro, 580 – Bairro Zona Nova, Tramandaí/RS – CEP: 95590-000 (próximo ao fórum)\n\nLocalização: https://www.google.com/maps/place/29%C2%B059'49.5%22S+50%C2%B008'34.3%22W/@-29.997081,-50.1454402,976m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d-29.997081!4d-50.1428653?entry=ttu\nSite: centrovidasaude.com.br\nRedes sociais: @centrovidasaude\n\n---\n\nPROFISSIONAIS\n- Maikel Charlos — Natação; Hidroginástica\n- ELETROCARDIO CLINICA — Cardiologia\n- Tania Regina Leal Pretto — Psicopedagoga\n- Dra. Elise Pimentel — Otorrinolaringologia\n- Rogério Hidro — Hidroginástica\n- Dr. Diego Rahde Fialho — Otorrinolaringologia\n- Aula Experimental Hidroginástica — Hidroginástica\n- Rafaela — Massoterapia\n- Andresa Oliveira — Fisioterapeuta\n- Andria Ehlers Reis — Optometrista\n- Daniela Cunha — Fisioterapeuta\n- Dr. Ramão de Souza — Odontologia\n- Dra. Lidiane Goldani — Odontologia\n- Eletrocardiograma Altamiro — Eletrocardiograma\n- Fabiana Aldrighi Bohmer — Psicologia\n- Dr. Marco Antônio Delazeri — Neuropediatra; Neurologia\n- Dr. Antuan Neder — Clínico Geral\n- Dr. João Inocêncio Rodrigues Gonçalves — Clínico Geral\n- Dr. Antônio Antunes da Costa — Urologia\n- Maria Rosa — Psicopedagoga\n- Dr. Altamiro Reis da Costa — Cardiologia\n- Dr. Marco Faviero — Traumatologia\n- Luis Xavier — Nutricionista\n- Dr. Gustavo Pesenatto — Otorrinolaringologia\n- Dr. Ruben Hurtado — Clínico Geral; Pediatria\n- Dr. Cassiano Brunetto — Psiquiatria\n- Joeci de Oliveira — Psicologia\n\n---\n\nEXAMES\nEletrocardiograma:\n- Todos os dias das 8:30 às 19:00, laudado, sem agendamento\n\nExame Laboratorial:\n- Todos os dias das 8:00 às 19h\n- Pagamento na clínica, coleta no LABORATÓRIO PARCEIRO\n- NÃO precisa agendamento\n\nExame Toxicológico:\n- Das 8:00 às 19h, sem agendamento\n- Requisito: ter pelos (braços, pernas, peito, axila, púbis)\n- Mulher: pode ser pelo cabelo (mínimo 4cm)\n\nRaio X, Ressonância, Tomografia:\n- Pagamento na clínica, exame na clínica parceira\n\nEcocardiograma (ecografia):\n- Agendar na agenda do Dr. Douglas Filipe Bianchi\n- Se direcionado pela prefeitura, precisa autorização\n\n---\n\nHIDROGINÁSTICA\n- 2x/semana: R$ 220,00 particular | R$ 200,00 Cartão Mais Vida\n- 3x/semana: R$ 240,00 particular | R$ 220,00 Cartão Mais Vida\n- SEMPRE mostre TODAS as opções ao cliente\n- Hidroterapia é DIFERENTE de hidroginástica\n\nAULAS EXPERIMENTAIS\n- Natação: R$ 60,00\n- Hidroginástica: R$ 60,00\n\nPILATES\n- Tem 3 opções de dias por semana com preços diferentes\n- Forneça AS 3 OPÇÕES ao cliente\n\nCARTÃO MAIS VIDA\nPLANOS:\n- Individual: R$ 24,90/mês (12x sem juros) ou à vista R$ 273,90\n- Familiar (até 5 pessoas): R$ 39,90/mês (12x sem juros) ou à vista R$ 438,90\n- Grupo (até 10 pessoas): R$ 59,90/mês (12x sem juros) ou à vista R$ 658,90\n\nBENEFÍCIOS:\n- Consultas presenciais a partir de R$ 15,00\n- Desconto em consultas e exames\n- Telemedicina e tele atendimento veterinário\n- Clube de vantagens (farmácias, óticas, lojas)\n- Auxílio funeral completo para titular\n\nCARÊNCIAS:\n- 30 dias para desconto com parceiros\n- 120 dias para auxílio funeral\n- Consultas e exames SEM carência\n\nPara fazer: documento com foto e CPF\n\nAUXÍLIO FUNERAL (Serviços incluídos)\n- Urna mortuária de madeira envernizada sextavada com alça varão e visor\n- 1 coroa de flores em nome da CONTRATANTE\n- Providências administrativas\n- Veículo para remoção dentro do município\n- Veículo fúnebre para cortejo dentro do município\n- Veículo para traslado estadual/interestadual sem limite de km\n- Traslado aéreo nacional a critério da CONTRATADA\n- Aluguel de velório no município\n- Taxa de sepultamento em cemitério municipal\n- Cremação em local definido pela CONTRATADA\n\nLOJAS PARCEIRAS DO CARTÃO MAIS VIDA\nDroga Raia, Pague Menos, Magalu, Americanas, Óticas Diniz, Shoptime, Renner, Casas Bahia, Netshoes, Dafiti, Ponto Frio, Submarino, Hering, C&A, Riachuelo, Senac\n\nRETORNOS MÉDICOS\n- Gratuito em até 15 dias após a consulta original\n- DEVE ser com o MESMO médico\n- Se passou mais de 15 dias, não é mais retorno gratuito\n\nCOLETA DE SANGUE\nA coleta de sangue NUNCA é agendada — é só chegar na clínica.\n\nAULAS EXPERIMENTAIS DE HIDRO/NATAÇÃO\nPara agendar aula experimental:\n1. Informe que custa R$ 60,00\n2. Horário: terça e quinta às 14:30 até 15:30\n3. Verifique vagas disponíveis\n4. Peça nome completo e data de nascimento\n5. Realize o agendamento`;

    // Upsert active ChatbotConfig
    let configs = [];
    try {
      configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
    } catch (_) {}

    if (configs.length === 0) {
      const created = await base44.asServiceRole.entities.ChatbotConfig.create({
        nome: 'Padrão',
        ativo: true,
        modelo_llm: 'gpt-4o-mini',
        prompt_sistema: 'Você é a Glória, atendente virtual do Centro Vida Saúde. Seja clara, acolhedora e objetiva.',
        informacoes_institucionais: infoText
      });
      return Response.json({ ok: true, created_id: created.id });
    } else {
      const cfg = configs[0];
      await base44.asServiceRole.entities.ChatbotConfig.update(cfg.id, {
        informacoes_institucionais: infoText
      });
      return Response.json({ ok: true, updated_id: cfg.id });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});