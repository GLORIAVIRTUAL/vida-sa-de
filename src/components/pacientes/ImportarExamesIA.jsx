import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, Sparkles, Eye, Trash2, CheckCircle2, AlertCircle, Camera } from "lucide-react";
import { ResultadoExame } from "@/entities/all";
import { UploadFile, InvokeLLM, ExtractDataFromUploadedFile } from "@/integrations/Core";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ImportarExamesIA({ paciente }) {
  const [exames, setExames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [arquivoSelecionado, setArquivoSelecionado] = useState(null);

  const carregarExames = async () => {
    if (!paciente?.id) return;
    setLoading(true);
    try {
      const data = await ResultadoExame.filter({ paciente_id: paciente.id }, '-created_date');
      setExames(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Erro ao carregar exames:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarExames();
  }, [paciente?.id]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) setArquivoSelecionado(file);
  };

  const processarArquivo = async () => {
    if (!arquivoSelecionado || !paciente?.id) return;

    setProcessando(true);
    setStatusMsg('Enviando arquivo...');

    try {
      // 1. Upload do arquivo
      const { file_url } = await UploadFile({ file: arquivoSelecionado });
      setStatusMsg('Arquivo enviado. Lendo laudo com IA...');

      const isPDF = arquivoSelecionado.type === 'application/pdf' || arquivoSelecionado.name.toLowerCase().endsWith('.pdf');

      // 2. Extrair conteúdo estruturado via IA
      let resultadoIA = {
        tipo_exame: '',
        data_exame: '',
        transcricao: '',
        achados_principais: ''
      };

      const schema = {
        type: "object",
        properties: {
          tipo_exame: { type: "string", description: "Tipo do exame (ex: Hemograma, Ecografia, Raio-X, Eletrocardiograma)" },
          data_exame: { type: "string", description: "Data do exame no formato YYYY-MM-DD, se identificável" },
          transcricao: { type: "string", description: "Transcrição completa e literal do conteúdo do laudo, mantendo todos os detalhes técnicos, valores, medidas e conclusões" },
          achados_principais: { type: "string", description: "Resumo objetivo dos principais achados clínicos relevantes (3-5 linhas)" }
        },
        required: ["transcricao"]
      };

      const prompt = `Você é um assistente médico especializado em análise de laudos. Analise o documento de exame fornecido e extraia as informações de forma fiel e completa.

INSTRUÇÕES:
1. Transcreva o laudo INTEGRALMENTE, mantendo terminologia médica, valores numéricos, unidades e referências.
2. Identifique o tipo do exame e a data, se presentes.
3. Resuma os achados principais de forma clínica e objetiva.
4. NÃO invente informações. Se algo não estiver legível, indique "[ilegível]".
5. Mantenha a estrutura original do laudo (cabeçalho, descrição, conclusão).

Retorne os dados no schema solicitado.`;

      if (isPDF) {
        // Para PDF: usar ExtractDataFromUploadedFile primeiro para obter texto estruturado
        try {
          const extracted = await ExtractDataFromUploadedFile({
            file_url,
            json_schema: schema
          });
          if (extracted?.status === 'success' && extracted.output) {
            resultadoIA = { ...resultadoIA, ...extracted.output };
          }
        } catch (err) {
          console.warn("Falha na extração direta, tentando InvokeLLM:", err);
        }

        // Se não conseguiu transcrição, tentar via InvokeLLM com file_urls
        if (!resultadoIA.transcricao) {
          const llmResp = await InvokeLLM({
            prompt,
            file_urls: [file_url],
            response_json_schema: schema
          });
          if (llmResp && typeof llmResp === 'object') {
            resultadoIA = { ...resultadoIA, ...llmResp };
          }
        }
      } else {
        // Imagens: usar InvokeLLM com vision
        const llmResp = await InvokeLLM({
          prompt,
          file_urls: [file_url],
          response_json_schema: schema
        });
        if (llmResp && typeof llmResp === 'object') {
          resultadoIA = { ...resultadoIA, ...llmResp };
        }
      }

      setStatusMsg('Salvando no prontuário...');

      // 3. Salvar como ResultadoExame
      await ResultadoExame.create({
        paciente_nome: paciente.nome,
        paciente_cpf: paciente.cpf || '',
        paciente_id: paciente.id,
        arquivo_url: file_url,
        nome_arquivo: arquivoSelecionado.name,
        descricao: resultadoIA.tipo_exame || 'Exame importado',
        data_exame: resultadoIA.data_exame || null,
        tipo_exame_ia: resultadoIA.tipo_exame || '',
        transcricao_ia: resultadoIA.transcricao || '',
        achados_principais: resultadoIA.achados_principais || ''
      });

      setStatusMsg('✓ Exame importado e transcrito com sucesso!');
      setArquivoSelecionado(null);
      // Limpar input file
      const inputFile = document.getElementById('exame-arquivo-ia');
      if (inputFile) inputFile.value = '';
      
      await carregarExames();
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (error) {
      console.error("Erro ao processar:", error);
      setStatusMsg(`✗ Erro: ${error.message || 'Falha ao processar arquivo'}`);
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluir = async (exame) => {
    if (!confirm(`Excluir exame "${exame.descricao || exame.nome_arquivo}"?`)) return;
    try {
      await ResultadoExame.delete(exame.id);
      await carregarExames();
    } catch (e) {
      alert("Erro ao excluir: " + e.message);
    }
  };

  if (!paciente?.id) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
        Salve o paciente primeiro para poder importar exames.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Área de upload */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-blue-700">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-semibold">Importação de Exames com IA</h3>
          </div>
          <p className="text-sm text-gray-600">
            Envie imagens (JPG, PNG) ou PDFs de laudos de exames. A IA fará a leitura, transcrição completa e extrairá os achados principais automaticamente para o prontuário do paciente.
          </p>

          <div className="space-y-2">
            <div>
              <Label htmlFor="exame-arquivo-ia">Selecione o arquivo (imagem ou PDF)</Label>
              <Input
                id="exame-arquivo-ia"
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                disabled={processando}
              />
            </div>

            {/* Input oculto para captura via câmera (iPhone e Android) */}
            <input
              id="exame-camera-ia"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              disabled={processando}
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('exame-camera-ia')?.click()}
                disabled={processando}
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                <Camera className="w-4 h-4 mr-2" />
                Tirar Foto do Exame
              </Button>
              <Button
                type="button"
                onClick={processarArquivo}
                disabled={!arquivoSelecionado || processando}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {processando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Enviar e Transcrever
                  </>
                )}
              </Button>
            </div>

            {arquivoSelecionado && (
              <p className="text-xs text-gray-600">
                📎 <strong>Selecionado:</strong> {arquivoSelecionado.name}
              </p>
            )}
          </div>

          {statusMsg && (
            <div className={`flex items-center gap-2 p-2 rounded text-sm ${
              statusMsg.startsWith('✓') ? 'bg-green-100 text-green-800' :
              statusMsg.startsWith('✗') ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {statusMsg.startsWith('✓') ? <CheckCircle2 className="w-4 h-4" /> :
               statusMsg.startsWith('✗') ? <AlertCircle className="w-4 h-4" /> :
               <Loader2 className="w-4 h-4 animate-spin" />}
              {statusMsg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de exames já importados */}
      <div>
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Exames do Paciente
          {exames.length > 0 && <Badge variant="secondary">{exames.length}</Badge>}
        </h3>

        {loading ? (
          <div className="text-center py-4 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : exames.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Nenhum exame importado ainda.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {exames.map(exame => (
              <ExameItem key={exame.id} exame={exame} onExcluir={handleExcluir} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExameItem({ exame, onExcluir }) {
  const [expandido, setExpandido] = useState(false);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="font-medium text-sm truncate">{exame.descricao || exame.nome_arquivo}</span>
              {exame.tipo_exame_ia && (
                <Badge variant="outline" className="text-xs">{exame.tipo_exame_ia}</Badge>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {exame.data_exame ? format(new Date(exame.data_exame + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : 'Data não informada'}
              {exame.created_date && ` • Importado em ${format(new Date(exame.created_date), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`}
            </div>

            {exame.achados_principais && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                <strong className="text-amber-800">Achados principais:</strong>
                <p className="text-gray-700 mt-1 whitespace-pre-wrap">{exame.achados_principais}</p>
              </div>
            )}

            {exame.transcricao_ia && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setExpandido(!expandido)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {expandido ? '▲ Ocultar transcrição' : '▼ Ver transcrição completa'}
                </button>
                {expandido && (
                  <div className="mt-2 p-3 bg-gray-50 border rounded text-xs whitespace-pre-wrap text-gray-800 max-h-64 overflow-y-auto">
                    {exame.transcricao_ia}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 flex-shrink-0">
            {exame.arquivo_url && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => window.open(exame.arquivo_url, '_blank')}
                title="Visualizar arquivo"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onExcluir(exame)}
              className="text-red-600 hover:bg-red-50"
              title="Excluir"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}