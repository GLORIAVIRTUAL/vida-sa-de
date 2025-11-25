import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Shield, CheckCircle2, XCircle, AlertTriangle, FileText, Clock, MapPin, User } from 'lucide-react';
import { AssinaturaDigital } from "@/entities/all";
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

export default function VerificadorIntegridade() {
  const [codigoVerificacao, setCodigoVerificacao] = useState('');
  const [resultado, setResultado] = useState(null);
  const [verificando, setVerificando] = useState(false);

  const verificarAssinatura = async () => {
    if (!codigoVerificacao.trim()) {
      alert("Digite o código de verificação");
      return;
    }

    try {
      setVerificando(true);
      setResultado(null);

      // Buscar assinatura pelo código
      const assinaturas = await AssinaturaDigital.filter({ 
        codigo_verificacao: codigoVerificacao.trim() 
      });

      if (assinaturas.length === 0) {
        setResultado({
          status: 'nao_encontrada',
          mensagem: 'Código de verificação não encontrado'
        });
        return;
      }

      const assinatura = assinaturas[0];

      // Verificar se a assinatura está ativa
      if (assinatura.status !== 'valida') {
        setResultado({
          status: 'invalidada',
          assinatura,
          mensagem: `Assinatura ${assinatura.status}`,
          motivo: assinatura.motivo_invalidacao
        });
        return;
      }

      // Verificar integridade do documento
      const hashAtual = await generateHash(assinatura.conteudo_original);
      const integridadeOk = hashAtual === assinatura.hash_documento;

      setResultado({
        status: integridadeOk ? 'valida' : 'alterada',
        assinatura,
        integridadeOk,
        mensagem: integridadeOk ? 
          'Documento válido e íntegro' : 
          'ATENÇÃO: Documento foi alterado após a assinatura'
      });

    } catch (error) {
      console.error("Erro ao verificar assinatura:", error);
      setResultado({
        status: 'erro',
        mensagem: 'Erro ao verificar assinatura'
      });
    } finally {
      setVerificando(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'valida': return 'bg-green-100 text-green-800 border-green-200';
      case 'alterada': case 'invalidada': return 'bg-red-100 text-red-800 border-red-200';
      case 'nao_encontrada': case 'erro': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'valida': return <CheckCircle2 className="w-5 h-5" />;
      case 'alterada': case 'invalidada': return <XCircle className="w-5 h-5" />;
      case 'nao_encontrada': case 'erro': return <AlertTriangle className="w-5 h-5" />;
      default: return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const tipoDocumentoLabels = {
    receituario_simples: "Receituário Simples",
    receituario_especial: "Receituário de Controle Especial", 
    solicitacao_exames: "Solicitação de Exames",
    laudo_medico: "Laudo Médico",
    atestado: "Atestado Médico"
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-600" />
          Verificador de Integridade
        </CardTitle>
        <p className="text-sm text-gray-600">
          Verifique a autenticidade e integridade de documentos assinados digitalmente
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-3">
          <Input
            placeholder="Digite o código de verificação (ex: CVS-ABC123-XYZ)"
            value={codigoVerificacao}
            onChange={(e) => setCodigoVerificacao(e.target.value.toUpperCase())}
            className="flex-1"
          />
          <Button 
            onClick={verificarAssinatura}
            disabled={verificando || !codigoVerificacao.trim()}
          >
            {verificando ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Verificando...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Verificar
              </>
            )}
          </Button>
        </div>

        {resultado && (
          <Card className={`border-2 ${getStatusColor(resultado.status)}`}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                {getStatusIcon(resultado.status)}
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg">{resultado.mensagem}</h3>
                    {resultado.motivo && (
                      <p className="text-sm mt-1">Motivo: {resultado.motivo}</p>
                    )}
                  </div>

                  {resultado.assinatura && (
                    <div className="space-y-4">
                      {/* Dados do documento */}
                      <div>
                        <h4 className="font-medium mb-2">Documento:</h4>
                        <Badge className="bg-blue-100 text-blue-800">
                          {tipoDocumentoLabels[resultado.assinatura.tipo_documento]}
                        </Badge>
                      </div>

                      {/* Dados da assinatura */}
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-500" />
                            <span>
                              <strong>Médico:</strong> {resultado.assinatura.dados_medico?.nome}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span>
                              <strong>CRM:</strong> {resultado.assinatura.dados_medico?.crm}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-500" />
                            <span>
                              <strong>Paciente:</strong> {resultado.assinatura.dados_paciente?.nome}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-500" />
                            <span>
                              <strong>Assinado em:</strong> {' '}
                              {format(new Date(resultado.assinatura.timestamp_assinatura), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-gray-500" />
                            <span>
                              <strong>IP:</strong> {resultado.assinatura.ip_assinatura}
                            </span>
                          </div>
                          {resultado.assinatura.localizacao && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-500" />
                              <span><strong>Localização:</strong> Capturada</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status de integridade */}
                      <div className="pt-3 border-t">
                        <div className="flex items-center gap-2">
                          {resultado.integridadeOk ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                          <span className="font-medium">
                            Integridade do documento: {' '}
                            {resultado.integridadeOk ? 'PRESERVADA' : 'COMPROMETIDA'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          Hash SHA-256: {resultado.assinatura.hash_documento}
                        </p>
                      </div>

                      {/* Assinatura gráfica */}
                      {resultado.assinatura.assinatura_grafica && (
                        <div className="pt-3 border-t">
                          <h4 className="font-medium mb-2">Assinatura Capturada:</h4>
                          <img 
                            src={resultado.assinatura.assinatura_grafica} 
                            alt="Assinatura" 
                            className="border rounded max-h-20"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}