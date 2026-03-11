import React from 'react';
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";

const formatDateForCsv = (dateString) => {
  if (!dateString) return '';
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '';
  }
};

const escapeCsvValue = (value) => {
  const stringValue = value == null ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

export default function RelatorioZeloButton({ vendas = [] }) {
  const handleExport = () => {
    const rows = [
      [
        'Numero da Venda',
        'Tipo',
        'Nome',
        'CPF',
        'Data de Nascimento',
        'Data de Registro'
      ]
    ];

    vendas.forEach((venda) => {
      rows.push([
        venda.numero_venda || '',
        'Titular',
        venda.titular?.nome || '',
        venda.titular?.cpf || '',
        formatDateForCsv(venda.titular?.data_nascimento),
        formatDateForCsv(venda.created_date)
      ]);
    });

    const csvContent = rows
      .map((row) => row.map(escapeCsvValue).join(';'))
      .join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-zelo-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <Button
      onClick={handleExport}
      size="lg"
      variant="outline"
      className="border-emerald-600 text-emerald-600 hover:bg-emerald-50"
    >
      <FileSpreadsheet className="w-5 h-5 mr-2" />
      Relatório Zelo
    </Button>
  );
}