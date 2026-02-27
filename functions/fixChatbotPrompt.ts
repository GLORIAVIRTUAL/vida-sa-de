import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
        
        if (configs.length > 0) {
            let config = configs[0];
            let prompt = config.prompt_sistema;
            
            // Replace the hardcoded menu in the JSON string
            prompt = prompt.replace(
                /"menu": "Posso te ajudar com:\\\\n1️⃣ Agendamento de consulta\\\\n2️⃣ Valores de consultas ou exames\\\\n3️⃣ Informações sobre exames\\\\n4️⃣ Verificar meu agendamento\\\\n5️⃣ Cartão Mais Vida\\\\n6️⃣ Endereço da clínica"/g,
                '"menu": "NÃO ENVIAR MENU. Apenas pergunte: \'Como posso te ajudar hoje?\'"'
            );
            
            await base44.asServiceRole.entities.ChatbotConfig.update(config.id, {
                prompt_sistema: prompt
            });
            
            return Response.json({ success: true, message: "Menu removido do banco de dados." });
        }
        
        return Response.json({ success: false, message: "Nenhuma configuração ativa encontrada." });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});