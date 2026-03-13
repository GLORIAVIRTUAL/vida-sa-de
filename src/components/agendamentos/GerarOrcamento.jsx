import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const normalizeString = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

export function gerarOrcamento({ formData, pacientesEncontrados, medicos, procedimentos, exames, categorias }) {
  const dataAtual = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const dataAgendamento = formData.data_agendamento ? format(new Date(formData.data_agendamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR }) : 'N/A';
  const paciente = pacientesEncontrados.find(p => p.id === formData.paciente_id);
  const medico = medicos.find(m => m.id === formData.medico_id);
  const categoria = categorias.find(c => c.id === formData.categoria_preco_id);
  let itensHtml = '';
  if (formData.tipo_servico === 'Consulta' && medico) {
    itensHtml += `<tr><td>Consulta - ${medico.especialidade}</td><td style="text-align:center;">1</td><td style="text-align:right;">R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.',',')}</td><td style="text-align:right;">R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.',',')}</td></tr>`;
  } else if (formData.tipo_servico === 'Procedimento' && formData.procedimento_id) {
    const proc = procedimentos.find(p => p.id === formData.procedimento_id);
    if (proc) itensHtml += `<tr><td>${proc.nome}</td><td style="text-align:center;">1</td><td style="text-align:right;">R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.',',')}</td><td style="text-align:right;">R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.',',')}</td></tr>`;
  } else if (formData.tipo_servico === 'Exame' && formData.exames_ids.length > 0) {
    const particularCategory = categorias.find(c => normalizeString(c.nome) === 'PARTICULAR');
    const isParticular = formData.categoria_preco_id === particularCategory?.id;
    formData.exames_ids.forEach(exameId => {
      const exame = exames.find(e => e.id === exameId);
      if (exame) {
        const valor = isParticular ? (exame.valor_particular || 0) : (exame.valor_convenio || exame.valor_particular || 0);
        itensHtml += `<tr><td>${exame.nome}</td><td style="text-align:center;">1</td><td style="text-align:right;">R$ ${valor.toFixed(2).replace('.',',')}</td><td style="text-align:right;">R$ ${valor.toFixed(2).replace('.',',')}</td></tr>`;
      }
    });
  } else if (formData.tipo_servico === 'Retorno') {
    itensHtml += `<tr><td>Retorno - ${medico?.especialidade || 'Consulta'}</td><td style="text-align:center;">1</td><td style="text-align:right;">R$ 0,00</td><td style="text-align:right;">R$ 0,00</td></tr>`;
  }
  const css = `@media print{@page{margin:8mm;size:A4}body{margin:0}}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:10px;color:#333;font-size:11px;line-height:1.3}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #10b981;padding-bottom:8px;margin-bottom:10px}.logo-section{display:flex;align-items:center;gap:8px}.logo{width:50px;height:50px;object-fit:contain}.clinic-name{font-size:16px;font-weight:bold;color:#10b981;margin:0}.clinic-details{font-size:9px;color:#666;margin-top:2px}.document-type{text-align:right}.document-type-label{font-size:20px;font-weight:bold;color:#10b981;margin:0}.document-date{font-size:9px;color:#666;margin-top:2px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.info-box{border:1px solid #d1d5db;border-radius:4px;padding:8px}.info-box-title{font-size:10px;font-weight:bold;color:#10b981;text-transform:uppercase;margin-bottom:4px;border-bottom:1px solid #10b981;padding-bottom:3px}.info-line{display:flex;justify-content:space-between;padding:2px 0;font-size:10px}.info-line .label{color:#6b7280}.info-line .value{font-weight:600}.items-table{width:100%;border-collapse:collapse;margin:8px 0}.items-table th{background-color:#10b981;color:white;padding:5px 8px;text-align:left;font-size:10px;font-weight:600}.items-table td{padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:10px}.items-table tr:nth-child(even){background-color:#f9fafb}.total-bar{background:#10b981;color:white;padding:10px 15px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;margin:10px 0;font-size:16px;font-weight:bold}.validade{background-color:#fef3c7;border-left:3px solid #f59e0b;padding:6px 10px;font-size:9px;font-weight:bold;color:#92400e;margin:8px 0}.obs-box{border:1px solid #d1d5db;border-radius:4px;padding:6px 8px;margin:8px 0;font-size:10px}.obs-box strong{color:#10b981;font-size:10px}.footer{margin-top:10px;padding-top:6px;border-top:1px solid #e5e7eb;text-align:center;font-size:8px;color:#9ca3af}`;
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Orçamento - Centro Vida Saúde</title><style>${css}</style></head><body>
<div class="header"><div class="logo-section"><img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo" class="logo" /><div><h1 class="clinic-name">CENTRO VIDA SAÚDE</h1><div class="clinic-details">Tristão Monteiro, 580 – Zona Nova, Tramandaí/RS • Tel: (51) 3661-5991</div></div></div><div class="document-type"><p class="document-type-label">ORÇAMENTO</p><p class="document-date">${dataAtual}</p></div></div>
<div class="info-grid"><div class="info-box"><div class="info-box-title">Paciente</div><div class="info-line"><span class="label">Nome:</span><span class="value">${paciente?.nome || 'A definir'}</span></div>${paciente?.telefone ? `<div class="info-line"><span class="label">Telefone:</span><span class="value">${paciente.telefone}</span></div>` : ''}</div><div class="info-box"><div class="info-box-title">Agendamento</div><div class="info-line"><span class="label">Data:</span><span class="value">${dataAgendamento}</span></div><div class="info-line"><span class="label">Horário:</span><span class="value">${formData.horario || 'A definir'}</span></div>${medico ? `<div class="info-line"><span class="label">Prof.:</span><span class="value">Dr(a). ${medico.nome}</span></div>` : ''}<div class="info-line"><span class="label">Categoria:</span><span class="value">${categoria?.nome || 'N/A'}</span></div></div></div>
<table class="items-table"><thead><tr><th>Descrição</th><th style="text-align:center;width:40px;">Qtd</th><th style="text-align:right;width:80px;">Valor Unit.</th><th style="text-align:right;width:80px;">Total</th></tr></thead><tbody>${itensHtml}</tbody></table>
<div class="total-bar"><span>VALOR TOTAL:</span><span>R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.',',')}</span></div>
<div class="validade">⏰ Orçamento válido por 30 dias a partir da data de emissão</div>
${formData.observacoes ? `<div class="obs-box"><strong>Observações:</strong> ${formData.observacoes}</div>` : ''}
<div class="footer"><strong>CENTRO VIDA SAÚDE</strong> • Desenvolvido por Glória Virtual – gloriavirtual.com</div></body></html>`;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.onload = () => { printWindow.print(); };
}