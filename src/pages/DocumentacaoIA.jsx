import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import BlocoTextoCopiavel from "@/components/gloria/BlocoTextoCopiavel";

const ETAPAS_PROGRAMACAO = [
  { nome: "Recebimento da mensagem (WhatsApp)", desc: "O webhook da Z-API recebe texto, áudio, imagem ou documento, ignora grupos e mensagens enviadas pela própria clínica, salva mídia de forma permanente e registra a mensagem na fila (com controle de duplicidade por ID de mensagem)." },
  { nome: "Fila e agrupamento (debounce de 5s)", desc: "Mensagens do mesmo contato enviadas em sequência aguardam 5 segundos e são processadas juntas, em um único turno, para a IA entender o contexto completo." },
  { nome: "Transcrição de áudio", desc: "Áudios recebidos são transcritos automaticamente em texto antes de chegar à IA." },
  { nome: "Bloqueio de atendimento humano", desc: "Se a conversa está em modo 'atendimento humano', a Glória não responde. Ela só entra quando o atendente desativa o modo manual. O primeiro atendimento de cada cliente é sempre humano." },
  { nome: "Máquina de estados da conversa", desc: "Cada conversa tem um estado explícito (ocioso, agendamento por especialidade/médico/data/horário, identificação de nome e CPF, confirmação, cancelamento, remarcação, resultado de exame, orçamento, preço/convênio, aguardando humano) com prazo de expiração." },
  { nome: "Prompt do sistema + informações institucionais", desc: "A cada turno a IA recebe o prompt de comportamento, as informações institucionais da clínica, a data/hora atual do Brasil, o histórico da conversa e a agenda real disponível." },
  { nome: "Consulta de agenda real", desc: "Horários oferecidos vêm da agenda dos profissionais (horários de atendimento, recorrências, bloqueios, encaixes e limite de ordem de chegada). A Glória nunca inventa horário e nunca promete encaixe." },
  { nome: "Operações determinísticas", desc: "Agendar, cancelar, remarcar e confirmar passam por operações com chave de idempotência e trava de horário, evitando agendamento duplicado no mesmo slot." },
  { nome: "Preços e orçamentos", desc: "Valores vêm da tabela de preços por categoria/convênio. Se o cliente pede 'orçamento' sem dizer o que quer, a Glória pergunta os itens; após 3 tentativas sem resolver, encaminha para humano." },
  { nome: "Envio da resposta", desc: "A resposta gerada fica pronta na fila e é enviada pela Z-API, com registro no histórico da conversa, controle de reenvio e novas tentativas em caso de falha." },
  { nome: "Lembretes e notificações", desc: "Lembretes de consulta 24h antes usam o mesmo texto das notificações manuais (sem link) e são registrados no histórico do chat. Confirmações do paciente não marcam a conversa como pendente." },
  { nome: "Limites e segurança", desc: "Limite diário de mensagens, tempo máximo de conversa, travas de processamento por contato (para não responder duas vezes) e registro de erros sem expor dados sensíveis." }
];

export default function DocumentacaoIA() {
  const [config, setConfig] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    base44.entities.ChatbotConfig.list().then((lista) => {
      setConfig(lista?.[0] || null);
      setCarregando(false);
    });
  }, []);

  if (carregando) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Documentação do Chat com IA (Glória)</h1>
        <p className="text-gray-500">Todo o prompt em uso e o resumo completo da programação do atendimento automático.</p>
      </div>

      <BlocoTextoCopiavel
        titulo="Prompt do sistema (comportamento da Glória)"
        texto={config?.prompt_sistema}
        nomeArquivo="gloria-prompt-sistema.txt"
      />

      <BlocoTextoCopiavel
        titulo="Informações institucionais (base de conhecimento)"
        texto={config?.informacoes_institucionais}
        nomeArquivo="gloria-informacoes-institucionais.txt"
      />

      <Card>
        <CardHeader>
          <CardTitle>Como a programação funciona, etapa por etapa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ETAPAS_PROGRAMACAO.map((etapa, i) => (
            <div key={etapa.nome} className="border-l-2 border-blue-200 pl-4">
              <p className="font-semibold text-gray-800">{i + 1}. {etapa.nome}</p>
              <p className="text-sm text-gray-600">{etapa.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuração atual</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-1">
          <p>Nome: {config?.nome || "-"}</p>
          <p>Modelo de IA: {config?.modelo_llm || "-"}</p>
          <p>Atendimento automático global: {config?.ativo ? "Ativo" : "Inativo (ativação manual por conversa)"}</p>
          <p>Tempo limite de conversa: {config?.timeout_conversa_minutos || "-"} minutos</p>
          <p>Limite de mensagens por dia: {config?.limite_mensagens_dia || "-"}</p>
        </CardContent>
      </Card>
    </div>
  );
}