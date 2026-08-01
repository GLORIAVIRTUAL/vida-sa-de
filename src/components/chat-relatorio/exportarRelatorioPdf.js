const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (caractere) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[caractere]));

export default function exportarRelatorioPdf(data) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(iframe);
  const documento = iframe.contentDocument;
  if (!documento) {
    iframe.remove();
    return false;
  }
  const maiorTag = Math.max(...data.tags.map((tag) => tag.quantidade), 1);
  const barras = data.tags.slice(0, 12).map((tag) => `<div class="bar"><span>${escapar(tag.nome)}</span><i style="width:${Math.max((tag.quantidade / maiorTag) * 100, 2)}%"></i><b>${tag.quantidade}</b></div>`).join('');
  const tags = data.tags.map((tag) => `<tr><td>${escapar(tag.nome)}</td><td>${tag.quantidade}</td></tr>`).join('');
  const atendentes = data.atendentes.map((item, indice) => `<tr><td>${indice + 1}º</td><td>${escapar(item.nome)}</td><td>${item.quantidade}</td></tr>`).join('');
  documento.write(`<!doctype html><html><head><title>Relatório do Chat - Julho 2026</title><style>
    body{font-family:Arial,sans-serif;color:#172033;margin:28px}h1{margin:0}p{color:#667085}.cards{display:flex;gap:14px;margin:24px 0}.card{flex:1;border:1px solid #ddd;border-radius:10px;padding:16px}.card b{display:block;font-size:28px;color:#2563eb;margin-top:8px}.grid{display:grid;grid-template-columns:2fr 1fr;gap:22px}section{break-inside:avoid}h2{font-size:17px;margin-top:24px}.bar{display:grid;grid-template-columns:150px 1fr 34px;gap:8px;align-items:center;margin:8px 0;font-size:12px}.bar i{display:block;height:16px;background:#2563eb;border-radius:3px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border-bottom:1px solid #ddd;padding:7px;text-align:left}th:last-child,td:last-child{text-align:right}.note{font-size:10px}@media print{body{margin:12mm}}
  </style></head><body><h1>Relatório do Chat</h1><p>Dados de julho de 2026</p><div class="cards"><div class="card">Conversas únicas no mês<b>${data.conversas}</b></div><div class="card">Pacientes com tags<b>${data.pacientes_com_tags}</b></div><div class="card">Marcações de tags<b>${data.total_tags}</b></div></div><div class="grid"><section><h2>Tags mais marcadas</h2>${barras}</section><section><h2>Tags por atendente</h2><table><thead><tr><th>#</th><th>Atendente</th><th>Tags</th></tr></thead><tbody>${atendentes}</tbody></table><p class="note">${escapar(data.criterio_atendentes)}</p></section></div><section><h2>Quantidade por tag</h2><table><thead><tr><th>Tag</th><th>Pacientes</th></tr></thead><tbody>${tags}</tbody></table></section><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
  documento.close();
  setTimeout(() => iframe.remove(), 60000);
  return true;
}