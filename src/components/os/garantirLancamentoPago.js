import { base44 } from "@/api/base44Client";

const categoriasPorServico = {
  Consulta: "Receita Consultas",
  Procedimento: "Receita Procedimentos",
  Exame: "Receita Exames"
};

export default async function garantirLancamentoPago(os, atualizacoes) {
  const existentes = await base44.entities.Lancamento.filter({
    ordem_servico_id: os.id,
    tipo: "Entrada"
  });

  if (existentes.some((lancamento) => lancamento.status !== "Cancelado")) return;

  const valor = Number(atualizacoes.valor_final) || 0;
  await base44.entities.Lancamento.create({
    tipo: "Entrada",
    categoria: categoriasPorServico[os.tipo_servico] || "Outros",
    descricao: `Receita: ${os.tipo_servico} de ${os.paciente_nome || "Paciente Não Identificado"}`,
    valor,
    data_lancamento: os.data_execucao || new Date().toISOString().split("T")[0],
    forma_pagamento: atualizacoes.forma_pagamento,
    ordem_servico_id: os.id,
    status: "Realizado"
  });
}