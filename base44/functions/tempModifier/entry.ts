import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const code = Deno.readTextFileSync('functions/processarMensagemAgente.js');
    
    // Fazer a substituição
    let newCode = code.replace(
      'infoDisponibilidade = `\\n\\n📅 DISPONIBILIDADES ENCONTRADAS:\\n🚨HOJE=${_hojeI} AMANHÃ=${_amI}. Se perguntam "amanhã?" e ${_amI} NÃO está abaixo→"NÃO há amanhã, próximo é [1º abaixo]".\\n`;',
      'infoDisponibilidade = `\\n\\n📅 DISPONIBILIDADES ENCONTRADAS:\\n🚨HOJE=${_hojeI} AMANHÃ=${_amI}.\\n`;'
    );
    
    newCode = newCode.replace(
      'infoDisponibilidade=`\\n\\n📅 DISPONIBILIDADES ENCONTRADAS:\\n🚨HOJE=${_hojeI} AMANHÃ=${_amI2}.\\n`;',
      'infoDisponibilidade=`\\n\\n📅 DISPONIBILIDADES ENCONTRADAS:\\n🚨HOJE=${_hojeI} AMANHÃ=${_amI2}.\\n`;'
    );

    Deno.writeTextFileSync('functions/processarMensagemAgente.js', newCode);
    
    return Response.json({ success: true, message: 'Arquivo modificado com sucesso via script!' });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});