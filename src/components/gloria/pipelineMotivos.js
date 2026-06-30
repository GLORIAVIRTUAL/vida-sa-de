import {
  Calendar, FlaskConical, XCircle, DollarSign, CreditCard,
  FileText as FileTextIcon, Stethoscope, Dumbbell, HelpCircle, MessageCircle
} from 'lucide-react';

// Colunas do Pipeline / Motivos da conversa (compartilhado entre Chat e Pipeline)
export const motivosColunas = [
  { id: 'agendamento_consulta', nome: 'Agendamento Consulta', cor: 'bg-blue-500', icon: Calendar },
  { id: 'agendamento_exame', nome: 'Agendamento Exame', cor: 'bg-cyan-500', icon: FlaskConical },
  { id: 'cancelamento', nome: 'Cancelamento', cor: 'bg-red-500', icon: XCircle },
  { id: 'orcamento', nome: 'Orçamento', cor: 'bg-yellow-500', icon: DollarSign },
  { id: 'cartao_mais_vida', nome: 'Cartão Mais Vida', cor: 'bg-purple-500', icon: CreditCard },
  { id: 'resultado_exames', nome: 'Resultado Exames', cor: 'bg-green-500', icon: FileTextIcon },
  { id: 'procedimentos', nome: 'Procedimentos', cor: 'bg-orange-500', icon: Stethoscope },
  { id: 'turmas', nome: 'Turmas', cor: 'bg-teal-500', icon: Dumbbell },
  { id: 'informacoes', nome: 'Informações Gerais', cor: 'bg-indigo-500', icon: HelpCircle },
  { id: 'outros', nome: 'Outros', cor: 'bg-gray-500', icon: MessageCircle },
];

// Mapa do id da coluna para o texto de interesse gravado no contato
export const motivoInteresseMap = {
  agendamento_consulta: 'Agendamento de Consulta',
  agendamento_exame: 'Agendamento de Exame',
  cancelamento: 'Cancelamento',
  orcamento: 'Orçamento',
  cartao_mais_vida: 'Cartão Mais Vida',
  resultado_exames: 'Resultado de Exames',
  procedimentos: 'Procedimentos',
  turmas: 'Turmas (Hidroginástica/Pilates)',
  informacoes: 'Informações Gerais',
  outros: 'Outro',
};

export function classificarMotivo(contato) {
  const interesse = (contato.interesses?.[contato.interesses.length - 1] || '').toLowerCase();

  if (interesse.includes('consulta') || (interesse.includes('agendamento') && !interesse.includes('exame'))) return 'agendamento_consulta';
  if (interesse.includes('exame') && (interesse.includes('agendamento') || interesse.includes('agendar') || interesse.includes('marcar'))) return 'agendamento_exame';
  if (interesse.includes('cancelamento') || interesse.includes('cancelar') || interesse.includes('desmarcar')) return 'cancelamento';
  if (interesse.includes('orçamento') || interesse.includes('orcamento') || interesse.includes('preço') || interesse.includes('valor')) return 'orcamento';
  if (interesse.includes('cartão') || interesse.includes('cartao') || interesse.includes('mais vida')) return 'cartao_mais_vida';
  if (interesse.includes('resultado') || interesse.includes('laudo')) return 'resultado_exames';
  if (interesse.includes('procedimento')) return 'procedimentos';
  if (interesse.includes('turma') || interesse.includes('hidrogin') || interesse.includes('pilates')) return 'turmas';
  if (interesse.includes('informaç') || interesse.includes('informac') || interesse.includes('dúvida') || interesse.includes('duvida')) return 'informacoes';
  return 'outros';
}