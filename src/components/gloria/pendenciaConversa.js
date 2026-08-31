// Regras de "conversa pendente" (marcação vermelha de não lida) no chat da Glória.
// Respostas simples de confirmação a um lembrete automático de consulta não são
// pendências de atendimento — o paciente apenas confirmou a presença.

const RESPOSTAS_CONFIRMACAO = [
  'sim', 'ok', 'okay', 'confirmo', 'confirmado', 'confirmada', 'confirmar',
  'sim confirmo', 'sim confirmado', 'certo', 'positivo', 'estarei la', 'estarei lá', '👍', '✅'
];

const normalizar = (texto) => String(texto || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s👍✅]/g, '')
  .trim();

// Identifica o texto de lembrete/confirmação de consulta enviado automaticamente.
export const ehLembreteConfirmacao = (mensagem) => {
  if (!mensagem || mensagem.role !== 'assistant') return false;
  const texto = normalizar(mensagem.content);
  return texto.includes('lembrete automatico') ||
    texto.includes('responda sim para confirmar') ||
    texto.includes('lembrar da sua consulta') ||
    texto.includes('lembrete da sua consulta') ||
    texto.includes('lembrar do seu agendamento');
};

// Resposta curta de confirmação do paciente.
export const ehRespostaConfirmacao = (mensagem) => {
  if (!mensagem || mensagem.role !== 'user') return false;
  if (mensagem.mediaUrl) return false;
  const texto = normalizar(mensagem.content);
  if (!texto || texto.length > 20) return false;
  return RESPOSTAS_CONFIRMACAO.includes(texto);
};

// True quando a última interação é apenas a confirmação de um lembrete automático.
export const ehConfirmacaoDeLembrete = (historico = []) => {
  const ultima = historico[historico.length - 1];
  if (!ehRespostaConfirmacao(ultima)) return false;
  // Procura o lembrete automático entre as mensagens anteriores recentes.
  const anteriores = historico.slice(-6, -1);
  return anteriores.some(ehLembreteConfirmacao);
};