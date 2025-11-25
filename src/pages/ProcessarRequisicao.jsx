import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Image as ImageIcon } from "lucide-react";
import { UploadFile, ExtractDataFromUploadedFile } from "@/integrations/Core";
import { Exame, Paciente, Medico } from "@/entities/all";

import ProtectedRoute from "../components/auth/ProtectedRoute";
import RevisorDados from "../components/requisicao/RevisorDados";

export default function ProcessarRequisicao() {
  const [arquivo, setArquivo] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [dadosExtraidos, setDadosExtraidos] = useState(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [examesDisponiveis, setExamesDisponiveis] = useState([]);
  const [medicosSistema, setMedicosSistema] = useState([]);

  React.useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const [exames, medicos] = await Promise.all([
        Exame.list().catch(error => {
          console.error("Erro ao carregar exames:", error);
          return [];
        }),
        Medico.list().catch(error => {
          console.error("Erro ao carregar médicos:", error);
          return [];
        })
      ]);
      setExamesDisponiveis(Array.isArray(exames) ? exames : []);
      setMedicosSistema(Array.isArray(medicos) ? medicos : []);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      setExamesDisponiveis([]);
      setMedicosSistema([]);
    }
  };

  const handleArquivoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Verificar se é PDF ou imagem
      const tiposAceitos = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (tiposAceitos.includes(file.type)) {
        setArquivo(file);
        setErro("");
      } else {
        setErro("Apenas arquivos PDF, PNG ou JPG são aceitos.");
        setArquivo(null);
      }
    }
  };

  const processarArquivo = async () => {
    if (!arquivo) return;

    setProcessando(true);
    setErro("");
    setSucesso("");

    try {
      // 1. Fazer upload do arquivo
      const { file_url } = await UploadFile({ file: arquivo });

      // 2. Definir o schema para extração dos dados
      const schema = {
        type: "object",
        properties: {
          paciente: {
            type: "object",
            properties: {
              nome: { type: "string" },
              cpf: { type: "string" },
              telefone: { type: "string" },
              data_nascimento: { type: "string" },
              convenio: { type: "string" }
            }
          },
          medico_solicitante: {
            type: "object", 
            properties: {
              nome: { type: "string" },
              crm: { type: "string" },
              especialidade: { type: "string" }
            }
          },
          exames_solicitados: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string" },
                codigo: { type: "string" },
                observacoes: { type: "string" }
              }
            }
          },
          data_solicitacao: { type: "string" },
          observacoes_gerais: { type: "string" }
        }
      };

      // 3. Extrair dados do arquivo (PDF ou imagem)
      const resultado = await ExtractDataFromUploadedFile({
        file_url: file_url,
        json_schema: schema
      });

      if (resultado.status === "error") {
        throw new Error(resultado.details || "Erro ao processar o arquivo");
      }

      const dadosProcessados = {
        ...resultado.output,
        arquivo_original: arquivo.name,
        file_url: file_url,
        // Garantir que arrays existam
        exames_solicitados: Array.isArray(resultado.output?.exames_solicitados) 
          ? resultado.output.exames_solicitados 
          : [],
        paciente: resultado.output?.paciente || {},
        medico_solicitante: resultado.output?.medico_solicitante || {}
      };

      setDadosExtraidos(dadosProcessados);

    } catch (error) {
      console.error("Erro ao processar arquivo:", error);
      setErro("Erro ao processar o arquivo: " + error.message);
    } finally {
      setProcessando(false);
    }
  };

  const handleDadosConfirmados = (dadosFinais) => {
    setSucesso("Orçamento/Agendamento criado com sucesso!");
    setDadosExtraidos(null);
    setArquivo(null);
    // Reset do input
    const input = document.getElementById('arquivo-input');
    if (input) input.value = '';
  };

  // Função para obter o ícone correto baseado no tipo de arquivo
  const getFileIcon = () => {
    if (!arquivo) return FileText;
    
    if (arquivo.type === 'application/pdf') {
      return FileText;
    } else if (arquivo.type.startsWith('image/')) {
      return ImageIcon;
    }
    return FileText;
  };

  // Função para obter o tipo de arquivo para exibição
  const getFileTypeDisplay = () => {
    if (!arquivo) return "";
    
    if (arquivo.type === 'application/pdf') {
      return "PDF";
    } else if (arquivo.type.startsWith('image/')) {
      return "Imagem";
    }
    return "Arquivo";
  };

  return (
    <ProtectedRoute requiredRole={["admin", "user"]}>
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-8 h-8 text-blue-600" />
              Processar Requisição de Exames
            </h1>
            <p className="text-gray-600 mt-1">
              Faça upload de uma requisição médica em PDF ou imagem (PNG/JPG) para gerar automaticamente orçamentos e agendamentos
            </p>
          </div>

          {!dadosExtraidos && (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" />
                  Upload da Requisição Médica
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="arquivo-input">Selecione o arquivo da requisição</Label>
                  <Input
                    id="arquivo-input"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleArquivoChange}
                    className="mt-2"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Formatos aceitos: PDF, PNG, JPG (máximo 10MB)
                  </p>
                </div>

                {arquivo && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3">
                      {React.createElement(getFileIcon(), { className: "w-5 h-5 text-blue-600" })}
                      <div>
                        <p className="font-medium text-blue-900">{arquivo.name}</p>
                        <p className="text-sm text-blue-700">
                          {getFileTypeDisplay()} • {(arquivo.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Button 
                  onClick={processarArquivo}
                  disabled={!arquivo || processando}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {processando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando arquivo...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Processar Requisição
                    </>
                  )}
                </Button>

                {erro && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-700">
                      {erro}
                    </AlertDescription>
                  </Alert>
                )}

                {sucesso && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">
                      {sucesso}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="font-medium text-amber-800 mb-2">💡 Dica para melhores resultados:</h3>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>• Certifique-se de que o texto esteja nítido e legível</li>
                    <li>• Para imagens, use boa iluminação e evite sombras</li>
                    <li>• PDFs digitais têm melhor precisão que documentos escaneados</li>
                    <li>• Inclua todas as informações: dados do paciente, médico e exames solicitados</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {dadosExtraidos && (
            <RevisorDados
              dados={dadosExtraidos}
              examesDisponiveis={examesDisponiveis}
              medicosSistema={medicosSistema}
              onConfirmar={handleDadosConfirmados}
              onCancelar={() => {
                setDadosExtraidos(null);
                setArquivo(null);
              }}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}