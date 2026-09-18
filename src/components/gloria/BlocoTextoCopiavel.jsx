import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, Download } from "lucide-react";

export default function BlocoTextoCopiavel({ titulo, texto, nomeArquivo }) {
  const conteudo = texto || "(vazio)";

  const copiar = () => navigator.clipboard.writeText(conteudo);

  const baixar = () => {
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border rounded-lg bg-white">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="font-semibold text-gray-800">{titulo}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copiar}>
            <Copy className="w-4 h-4 mr-1" /> Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={baixar}>
            <Download className="w-4 h-4 mr-1" /> Baixar
          </Button>
        </div>
      </div>
      <pre className="p-4 text-xs whitespace-pre-wrap font-mono text-gray-700 max-h-[500px] overflow-y-auto">
        {conteudo}
      </pre>
    </div>
  );
}