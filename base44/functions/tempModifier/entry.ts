import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const code = Deno.readTextFileSync('functions/processarMensagemAgente');
    
    const findStr = `    // Injetar status de funcionamento da clínica calculado pelo CÓDIGO (não pelo LLM)
    promptCompleto += \`\\n\\n🚨🚨 REGRA ABSOLUTA - STATUS DA CLÍNICA HOJE (calculado pelo sistema, NÃO pela IA):\\n\${statusClinicaHoje}\\n⚠️ NUNCA contradiga esta informação. Se o sistema diz que está ABERTA, ela está ABERTA. Se diz FECHADA, está FECHADA. Não tente adivinhar o dia da semana - CONFIE nesta informação.\`;`;

    const replaceStr = `    // Injetar status de funcionamento da clínica calculado pelo CÓDIGO (não pelo LLM)
    promptCompleto += \`\\n\\n🕒 INFORMAÇÃO DE TEMPO REAL (HORÁRIO DE BRASÍLIA):
- Hoje é: \${dataAtualCompleta} (Formato ISO: \${dataAtualISO})
- Horário atual: \${horaAtual}
🚨 REGRA DE TEMPO: Use esta data como referência absoluta. Se o cliente pedir para "amanhã", calcule o dia seguinte a \${dataAtualCompleta}. Se o próximo horário disponível cair na data de amanhã, responda que TEM horário para amanhã.\`;

    promptCompleto += \`\\n\\n🚨🚨 REGRA ABSOLUTA - STATUS DA CLÍNICA HOJE (calculado pelo sistema, NÃO pela IA):\\n\${statusClinicaHoje}\\n⚠️ NUNCA contradiga esta informação. Se o sistema diz que está ABERTA, ela está ABERTA. Se diz FECHADA, está FECHADA. Não tente adivinhar o dia da semana - CONFIE nesta informação.\`;`;

    if (code.includes(findStr)) {
      const newCode = code.replace(findStr, replaceStr);
      Deno.writeTextFileSync('functions/processarMensagemAgente', newCode);
      return Response.json({ success: true, message: 'Arquivo modificado com sucesso!' });
    } else {
      return Response.json({ success: false, message: 'String de busca não encontrada no arquivo.' });
    }
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});