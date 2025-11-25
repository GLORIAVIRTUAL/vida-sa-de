
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { PenTool, RotateCcw, FileCheck, Shield, MapPin, Clock, User, FileText, CheckCircle2, AlertTriangle, Save, Upload } from 'lucide-react';
import { AssinaturaDigital, Medico } from "@/entities/all";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Função para gerar hash SHA-256 
const generateHash = async (content) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Função para gerar código de verificação único
const generateVerificationCode = () => {
  return 'CVS-' + Math.random().toString(36).substring(2, 15).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
};

export default function CapturaAssinatura({ 
  aberto, 
  onFechar, 
  onAssinado,
  medico,
  paciente,
  prontuario,
  tipoDocumento,
  conteudoDocumento 
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [assinando, setAssinando] = useState(false);
  const [localizacao, setLocalizacao] = useState(null);
  const [assinaturaCapturada, setAssinaturaCapturada] = useState(false);
  
  // NOVOS estados para assinatura salva
  const [usarAssinaturaSalva, setUsarAssinaturaSalva] = useState(true);
  const [salvarAssinatura, setSalvarAssinatura] = useState(false);
  const [assinaturaSalvaCarregada, setAssinaturaSalvaCarregada] = useState(false);

  // NOVA função para carregar assinatura salva no canvas usando useCallback
  const carregarAssinaturaSalva = useCallback(() => {
    if (!medico.assinatura_digital || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Calculate aspect ratio to fit the image
      const aspectRatio = img.width / img.height;
      let drawWidth = canvas.width;
      let drawHeight = canvas.height;

      if (img.width > canvas.width) {
          drawWidth = canvas.width;
          drawHeight = drawWidth / aspectRatio;
      }
      if (drawHeight > canvas.height) {
          drawHeight = canvas.height;
          drawWidth = drawHeight * aspectRatio;
      }

      // Draw the image centered on the canvas
      const x = (canvas.width - drawWidth) / 2;
      const y = (canvas.height - drawHeight) / 2;
      ctx.drawImage(img, x, y, drawWidth, drawHeight);
      
      setAssinaturaCapturada(true);
      setAssinaturaSalvaCarregada(true);
    };
    
    img.src = medico.assinatura_digital;
  }, [medico.assinatura_digital]); // Dependency: medico.assinatura_digital

  useEffect(() => {
    // Capturar localização se disponível
    if (navigator.geolocation && aberto) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocalizacao({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.log("Localização não disponível:", error);
        }
      );
    }

    // NOVO: Carregar assinatura salva se existir e for a opção selecionada
    if (aberto && medico.assinatura_digital && usarAssinaturaSalva) {
      carregarAssinaturaSalva();
    } else if (aberto && !usarAssinaturaSalva && assinaturaSalvaCarregada) {
      // If user switches off "use saved signature" and a saved one was loaded, clear it.
      limparAssinatura();
    }
  }, [aberto, medico.assinatura_digital, usarAssinaturaSalva, carregarAssinaturaSalva, assinaturaSalvaCarregada]);

  const iniciarDesenho = (e) => {
    // Prevent drawing if saved signature is loaded and `usarAssinaturaSalva` is active
    if (usarAssinaturaSalva && assinaturaSalvaCarregada) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    
    setIsDrawing(true);
    ctx.beginPath();
    
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    ctx.moveTo(x, y);
    setAssinaturaCapturada(true);
    setAssinaturaSalvaCarregada(false); // New drawing, so not using the saved one anymore
  };

  const desenhar = (e) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const pararDesenho = () => {
    setIsDrawing(false);
  };

  const limparAssinatura = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setAssinaturaCapturada(false);
    setAssinaturaSalvaCarregada(false); // Reset this state
    setSalvarAssinatura(false); // Reset saving option
  };

  const capturarAssinatura = () => {
    const canvas = canvasRef.current;
    return canvas.toDataURL('image/png');
  };

  // NOVA função para salvar assinatura no perfil do médico
  const salvarAssinaturaNoProfile = async (assinaturaBase64) => {
    try {
      await Medico.update(medico.id, { assinatura_digital: assinaturaBase64 });
      // Optionally, update the local medico object to reflect the change immediately
      medico.assinatura_digital = assinaturaBase64;
    } catch (error) {
      console.error("Erro ao salvar assinatura no perfil:", error);
    }
  };

  const handleAssinarDocumento = async () => {
    if (!assinaturaCapturada) {
      alert("Por favor, desenhe sua assinatura ou use a assinatura salva."); // Updated alert
      return;
    }

    try {
      setAssinando(true);

      // Gerar hash do documento
      const hashDocumento = await generateHash(conteudoDocumento);
      
      // Capturar assinatura gráfica
      const assinaturaGrafica = capturarAssinatura();

      // NOVO: Salvar assinatura no perfil se solicitado e for uma nova assinatura
      if (salvarAssinatura && !assinaturaSalvaCarregada) {
        await salvarAssinaturaNoProfile(assinaturaGrafica);
      }
      
      // Gerar código de verificação
      const codigoVerificacao = generateVerificationCode();

      // Dados da assinatura
      const dadosAssinatura = {
        medico_id: medico.id,
        prontuario_id: prontuario.id,
        paciente_id: paciente.id,
        tipo_documento: tipoDocumento,
        hash_documento: hashDocumento,
        conteudo_original: conteudoDocumento,
        dados_medico: {
          nome: medico.nome,
          crm: medico.crm,
          especialidade: medico.especialidade
        },
        dados_paciente: {
          nome: paciente.nome,
          cpf: paciente.cpf
        },
        timestamp_assinatura: new Date().toISOString(),
        ip_assinatura: await obterIP(),
        localizacao: localizacao,
        user_agent: navigator.userAgent,
        assinatura_grafica: assinaturaGrafica,
        codigo_verificacao: codigoVerificacao,
        status: "valida"
      };

      // Salvar no banco
      const assinaturaSalva = await AssinaturaDigital.create(dadosAssinatura);

      // Callback de sucesso
      onAssinado(assinaturaSalva);
      
      onFechar();

    } catch (error) {
      console.error("Erro ao assinar documento:", error);
      alert("Erro ao processar a assinatura. Tente novamente.");
    } finally {
      setAssinando(false);
    }
  };

  const obterIP = async () => {
    try {
      // Em produção, você usaria um serviço para obter o IP real
      return "127.0.0.1"; // Placeholder
    } catch {
      return "IP não disponível";
    }
  };

  const tipoDocumentoLabels = {
    receituario_simples: "Receituário Simples",
    receituario_especial: "Receituário de Controle Especial", 
    solicitacao_exames: "Solicitação de Exames",
    laudo_medico: "Laudo Médico",
    atestado: "Atestado Médico"
  };

  if (!aberto) return null;

  return (
    <Dialog open={aberto} onOpenChange={onFechar}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-green-600" />
            Assinatura Eletrônica Avançada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações do documento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Dados do Documento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Badge className="bg-blue-100 text-blue-800 mb-2">
                    {tipoDocumentoLabels[tipoDocumento]}
                  </Badge>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span>Paciente: <strong>{paciente.nome}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>Data: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                    {localizacao && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <span>Localização capturada</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Médico Responsável:</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>{medico.nome}</strong></p>
                    <p>CRM: {medico.crm}</p>
                    <p>{medico.especialidade}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* NOVA seção de opções de assinatura */}
          {medico.assinatura_digital && (
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="py-3">
                <CardTitle className="text-base text-blue-800">Opções de Assinatura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="usar-salva"
                    checked={usarAssinaturaSalva}
                    onCheckedChange={(checked) => {
                      setUsarAssinaturaSalva(checked);
                      if (checked) {
                        carregarAssinaturaSalva();
                      } else {
                        limparAssinatura(); // Clear canvas if not using saved signature
                      }
                    }}
                  />
                  <label htmlFor="usar-salva" className="text-sm text-blue-800 cursor-pointer">
                    Usar minha assinatura salva
                  </label>
                </div>

                {usarAssinaturaSalva && medico.assinatura_digital && (
                  <div className="p-3 bg-white rounded border">
                    <p className="text-xs text-gray-600 mb-2">Sua assinatura salva:</p>
                    <img 
                      src={medico.assinatura_digital} 
                      alt="Assinatura salva" 
                      className="max-h-12 border rounded"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Área de assinatura */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PenTool className="w-5 h-5" />
                {usarAssinaturaSalva && medico.assinatura_digital && assinaturaSalvaCarregada ? "Assinatura Carregada" : "Desenhe sua Assinatura"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    className={`w-full ${!(usarAssinaturaSalva && medico.assinatura_digital && assinaturaSalvaCarregada) ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                    onMouseDown={iniciarDesenho}
                    onMouseMove={desenhar}
                    onMouseUp={pararDesenho}
                    onMouseLeave={pararDesenho}
                    onTouchStart={iniciarDesenho}
                    onTouchMove={desenhar}
                    onTouchEnd={pararDesenho}
                  />
                </div>
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex gap-3 items-center">
                    <Button
                      variant="outline"
                      onClick={limparAssinatura}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Limpar
                    </Button>
                    {assinaturaCapturada && (
                      <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        {assinaturaSalvaCarregada ? "Assinatura salva carregada" : "Nova assinatura capturada"}
                      </Badge>
                    )}
                  </div>

                  {/* NOVA opção para salvar assinatura */}
                  {!assinaturaSalvaCarregada && assinaturaCapturada && (
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="salvar-assinatura"
                        checked={salvarAssinatura}
                        onCheckedChange={setSalvarAssinatura}
                      />
                      <label htmlFor="salvar-assinatura" className="text-sm text-gray-700 cursor-pointer flex items-center gap-1">
                        <Save className="w-4 h-4" />
                        Salvar para usar em outros documentos
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Aviso de segurança */}
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800 mb-1">Importante - Assinatura Eletrônica</p>
                  <p className="text-yellow-700">
                    Ao assinar este documento, você confirma sua identidade e assume total responsabilidade pelo conteúdo. 
                    A assinatura terá validade jurídica equivalente à assinatura manuscrita.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botões de ação */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAssinarDocumento}
              disabled={!assinaturaCapturada || assinando}
              className="bg-green-600 hover:bg-green-700"
            >
              {assinando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processando Assinatura...
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4 mr-2" />
                  Assinar Documento
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
