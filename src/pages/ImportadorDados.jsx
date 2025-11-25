
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, Loader2, CheckCircle, XCircle, CreditCard, User } from "lucide-react";
import { bulkAddProceduresWithPrices } from "@/functions/bulkAddProceduresWithPrices";
import ProtectedRoute from "../components/auth/ProtectedRoute";

export default function ImportadorDados() {
  const [dadosParticular, setDadosParticular] = useState(`ACUPUNTURA (SESSÃO) — R$ 90,00
CONSULTA CARDIOLOGISTA — R$ 250,00
CONSULTA CLÍNICO GERAL — R$ 120,00
CONSULTA GERIATRA — R$ 250,00
CONSULTA PSIQUIATRA — R$ 250,00
CONSULTA UROLOGISTA — R$ 200,00
CONSULTA TRAUMATOLOGISTA — R$ 250,00
CONSULTA GINECOLOGISTA — R$ 250,00
CONSULTA NEURO PEDIATRA — R$ 350,00
CONSULTA NEUROLOGISTA — R$ 300,00
CONSULTA OTORRINO — R$ 250,00
CONSULTA PEDIATRA — R$ 250,00
CONSULTA PSICÓLOGA — R$ 140,00
CONSULTA PSICOPEDAGOGA — R$ 140,00
CONSULTA PSICANÁLISE — R$ 140,00
CONSULTA NUTRICIONISTA — R$ 140,00
HIDROTERAPIA — R$ 110,00
FISIOTERAPIA — R$ 90,00
FISIO PILATES 1X — R$ 145,00
FISIO PILATES 2X — R$ 245,00
FISIO PILATES 3X — R$ 345,00
MASSOTERAPIA — R$ 100,00
CONSULTA ODONTOLÓGICA — R$ 90,00
CONSULTA OPTOMETRISTA — R$ 120,00
PREVENTIVO — R$ 90,00
ECOGRAFIA DE ABDOMEN INFERIOR — R$ 160,00
ECOGRAFIA DE ABDOMEN SUPERIOR — R$ 160,00
ECOGRAFIA DE ABDOMEN TOTAL — R$ 220,00
ECOGRAFIA DE ARTICULAÇÃO — R$ 140,00
ECOGRAFIA DE BEXIGA — R$ 140,00
ECOGRAFIA DE BOLSA ESCROTAL/TESTÍCULOS — R$ 140,00
ECOGRAFIA DE COURO CABELUDO — R$ 140,00
ECOGRAFIA DE GLÂNDULAS SALIVARES — R$ 140,00
ECOGRAFIA DE HIPOCÔNDRIO — R$ 140,00
ECOGRAFIA DE PAREDE ABDOMINAL — R$ 140,00
ECOGRAFIA DE PARTES MOLES — R$ 140,00
ECOGRAFIA DE PESCOÇO — R$ 140,00
ECOGRAFIA DE PRÓSTATA ABDOMINAL — R$ 140,00
ECOGRAFIA DE REGIÃO AXILAR — R$ 140,00
ECOGRAFIA DE REGIÃO INGUINAL — R$ 140,00
ECOGRAFIA DE REGIÃO NASAL — R$ 140,00
ECOGRAFIA DE RINS — R$ 140,00
ECOGRAFIA DE TIREÓIDE — R$ 140,00
ECOGRAFIA DE VIAS BILIARES — R$ 140,00
ECOGRAFIA DE VIAS URINÁRIAS — R$ 140,00
ECOGRAFIA DOPPLER MORFOLÓGICA 2 FETOS — R$ 900,00
ECOGRAFIA DOPPLER TRANSLUCÊNCIA NUCAL — R$ 380,00
ECOGRAFIA DOPPLER ABDOMEN TOTAL — R$ 340,00
ECOGRAFIA DOPPLER ARTERIAL E VENOSA 1 MEMBRO — R$ 500,00
ECOGRAFIA DOPPLER ARTERIAL E VENOSA 2 MEMBROS — R$ 950,00
ECOGRAFIA DOPPLER ARTERIAL OU VENOSA 1 MEMBRO — R$ 260,00
ECOGRAFIA DOPPLER ARTERIAL OU VENOSA 2 MEMBROS — R$ 520,00
ECOGRAFIA DOPPLER CARÓTIDAS E VERTEBRAIS — R$ 260,00
ECOGRAFIA DOPPLER CERVICAL — R$ 260,00
ECOGRAFIA DOPPLER COLORIDA ARTICULAÇÃO — R$ 260,00
ECOGRAFIA DOPPLER COLORIDO ARTERIAL MEMBRO INFERIOR DIREITO OU ESQUERDO — R$ 260,00
ECOGRAFIA DOPPLER COLORIDO ARTERIAL MEMBRO SUPERIOR DIREITO OU ESQUERDO — R$ 260,00
ECOGRAFIA DOPPLER COLORIDO DE BOLSA ESCROTAL — R$ 250,00
ECOGRAFIA DOPPLER COLORIDO DE TIREÓIDE — R$ 260,00
ECOGRAFIA DOPPLER COLORIDO DE VIAS URINÁRIAS — R$ 260,00
ECOGRAFIA DOPPLER COLORIDO VENOSO MEMBRO INFERIOR DIREITO OU ESQUERDO — R$ 260,00
ECOGRAFIA DOPPLER COLORIDO VENOSO MEMBRO SUPERIOR DIREITO OU ESQUERDO — R$ 260,00
ECOGRAFIA DOPPLER ESTRUTURA ISOLADA — R$ 149,95
ECOGRAFIA DOPPLER MORFOLÓGICA 1 FETO — R$ 500,00
ECOGRAFIA DOPPLER OBSTÉTRICA — R$ 260,00
ECOGRAFIA DOPPLER RENAL — R$ 260,00
ECOGRAFIA DOPPLER TESTICULAR/BOLSA ESCROTAL — R$ 260,00
ECOGRAFIA DOPPLER TRANSVAGINAL — R$ 250,00
ECOGRAFIA MAMÁRIA — R$ 150,00
ECOGRAFIA MAMÁRIA BILATERAL — R$ 170,00
ECOGRAFIA MORFOLÓGICA 1 FETO — R$ 260,00
ECOGRAFIA MORFOLÓGICA 2 FETOS — R$ 5.400,00
ECOGRAFIA OBSTÉTRICA 1 FETO — R$ 140,00
ECOGRAFIA OBSTÉTRICA 2 FETO — R$ 260,00
ECOGRAFIA PAREDE ABDOMINAL — R$ 14,00
ECOGRAFIA PÉLVICA — R$ 140,00
ECOGRAFIA REGIÃO CERVICAL — R$ 140,00
ECOGRAFIA REGIÃO PEITORAL — R$ 150,00
ECOGRAFIA TÓRAX — R$ 150,00
ECOGRAFIA TRANSFONTANELA — R$ 230,00
ECOGRAFIA TRANSLUCÊNCIA NUCAL (CADA FETO) — R$ 260,00
ECOGRAFIA TRANSVAGINAL — R$ 140,00
ELETROCARDIOGRAMA — R$ 65,00
HIDROGINÁSTICA 2X — R$ 220,00
HIDROGINÁSTICA 3X — R$ 240,00
LAVAGEM OUVIDO — R$ 120,00
LIMPEZA ODONTOLÓGICA — R$ 75,00
NASOFIBROLARINGOSCOPIA — R$ 200,00
PACOTE CHECK UP 15 — R$ 200,00
TESTE WISC — R$ 250,00
RAIO X ADENOIDES — R$ 20,00
RAIO X ANTEBRAÇO — R$ 20,00
RAIO X ARTICULAÇÃO ESCÁPULO-UMERAL — R$ 25,00
RAIO X BRAÇO — R$ 20,00
RAIO X CLAVÍCULA — R$ 20,00
RAIO X COLUNA CERVICAL — R$ 20,00
RAIO X COLUNA DORSAL — R$ 20,00
RAIO X COSTELA — R$ 20,00
RAIO X COTOVELO — R$ 20,00
RAIO X CRÂNIO — R$ 20,00
RAIO X LOMBO-SACRA — R$ 20,00
RESSONÂNCIA ABDOMEN SUPERIOR C/C — R$ 150,00
RESSONÂNCIA ABDOMEN SUPERIOR S/C — R$ 100,00
RESSONÂNCIA ABDOMEN TOTAL — R$ 300,00
RESSONÂNCIA COLUNA C/C — R$ 150,00
RESSONÂNCIA COLUNA S/C — R$ 100,00
RESSONÂNCIA CRÂNIO C/C — R$ 150,00
RESSONÂNCIA CRÂNIO S/C — R$ 100,00
RESSONÂNCIA PELVE C/C — R$ 150,00
RESSONÂNCIA PELVE S/C — R$ 100,00
RESSONÂNCIA TÓRAX C/C — R$ 150,00
RESSONÂNCIA TÓRAX S/C — R$ 100,00`);

  const [dadosCartaoMaisVida, setDadosCartaoMaisVida] = useState('');
  const [loadingParticular, setLoadingParticular] = useState(false);
  const [loadingCartao, setLoadingCartao] = useState(false);
  const [resultadoParticular, setResultadoParticular] = useState(null);
  const [resultadoCartao, setResultadoCartao] = useState(null);

  const [dadosPrefeituraImbe, setDadosPrefeituraImbe] = useState('');
  const [loadingPrefeituraImbe, setLoadingPrefeituraImbe] = useState(false);
  const [resultadoPrefeituraImbe, setResultadoPrefeituraImbe] = useState(null);

  const [dadosPrefeituraPinhal, setDadosPrefeituraPinhal] = useState('');
  const [loadingPrefeituraPinhal, setLoadingPrefeituraPinhal] = useState(false);
  const [resultadoPrefeituraPinhal, setResultadoPrefeituraPinhal] = useState(null);

  const [dadosPrefeituraTramandai, setDadosPrefeituraTramandai] = useState('');
  const [loadingPrefeituraTramandai, setLoadingPrefeituraTramandai] = useState(false);
  const [resultadoPrefeituraTramandai, setResultadoPrefeituraTramandai] = useState(null);

  const [dadosSmec, setDadosSmec] = useState('');
  const [loadingSmec, setLoadingSmec] = useState(false);
  const [resultadoSmec, setResultadoSmec] = useState(null);

  const [dadosFumam, setDadosFumam] = useState('');
  const [loadingFumam, setLoadingFumam] = useState(false);
  const [resultadoFumam, setResultadoFumam] = useState(null);

  const parseData = (rawData) => {
    const lines = rawData.split('\n');
    return lines.map(line => {
      const match = line.match(/(.+)\s*—\s*R\$\s*([0-9.,]+)/);
      if (match) {
        const name = match[1].trim();
        const price = parseFloat(match[2].replace(',', '.'));
        
        // Determinar especialidade baseada no nome
        let specialty = 'Geral';
        if (name.includes('CONSULTA') || name.includes('CONSULT')) {
          if (name.includes('CARDIOLOGISTA')) specialty = 'Cardiologia';
          else if (name.includes('CLÍNICO')) specialty = 'Clínico Geral';
          else if (name.includes('GERIATRA')) specialty = 'Clínico Geral';
          else if (name.includes('PSIQUIATRA')) specialty = 'Psiquiatria';
          else if (name.includes('UROLOGISTA')) specialty = 'Urologia';
          else if (name.includes('TRAUMATOLOGISTA')) specialty = 'Traumatologia';
          else if (name.includes('GINECOLOGISTA')) specialty = 'Ginecologia';
          else if (name.includes('NEURO')) specialty = 'Neurologia';
          else if (name.includes('NEUROLOGISTA')) specialty = 'Neurologia';
          else if (name.includes('OTORRINO')) specialty = 'Otorrinolaringologia';
          else if (name.includes('PEDIATRA')) specialty = 'Pediatria';
          else if (name.includes('PSICÓLOGA') || name.includes('PSICANÁLISE')) specialty = 'Psicologia';
          else if (name.includes('PSICOPEDAGOGA')) specialty = 'Psicopedagoga';
          else if (name.includes('NUTRICIONISTA')) specialty = 'Nutricionista';
          else if (name.includes('ODONTOLÓGICA')) specialty = 'Odontologia';
          else if (name.includes('OPTOMETRISTA')) specialty = 'Oftalmologia';
        } else if (name.includes('FISIOTERAPIA') || name.includes('FISIO')) specialty = 'Fisioterapeuta';
        else if (name.includes('HIDROTERAPIA') || name.includes('HIDROGINÁSTICA')) specialty = 'Hidroterapia';
        else if (name.includes('MASSOTERAPIA')) specialty = 'Massoterapia';
        else if (name.includes('PILATES')) specialty = 'Pilates';
        else if (name.includes('ACUPUNTURA')) specialty = 'Fisioterapeuta';
        
        return { name, price, specialty };
      }
      return null;
    }).filter(Boolean);
  };

  const handleImport = async (categoria, dados, setLoading, setResultado) => {
    setLoading(true);
    setResultado(null);
    
    try {
      const parsedData = parseData(dados);
      if (parsedData.length === 0) {
        throw new Error('Nenhum procedimento válido encontrado nos dados');
      }

      const response = await bulkAddProceduresWithPrices({
        categoryName: categoria,
        items: parsedData
      });

      setResultado({
        sucesso: true,
        ...response
      });
    } catch (error) {
      setResultado({
        sucesso: false,
        message: `Erro na importação: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Importador de Dados</h1>
          <p className="text-gray-600">Ferramenta para importar procedimentos e preços em lote para diferentes categorias.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Importador Particular */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Procedimentos Particulares
              </CardTitle>
              <p className="text-sm text-gray-600">
                Importar procedimentos e preços para a categoria "Particular"
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dados para Importação:</label>
                <Textarea
                  value={dadosParticular}
                  onChange={(e) => setDadosParticular(e.target.value)}
                  placeholder="Cole aqui os dados no formato: NOME DO PROCEDIMENTO — R$ 00,00"
                  className="h-40 text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formato esperado: "NOME DO PROCEDIMENTO — R$ VALOR"
                </p>
              </div>

              {resultadoParticular && (
                <Alert className={resultadoParticular.sucesso ? "border-green-500" : "border-red-500"}>
                  {resultadoParticular.sucesso ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>{resultadoParticular.sucesso ? "Importação Concluída!" : "Erro na Importação"}</AlertTitle>
                  <AlertDescription className="mt-2 space-y-1">
                    {resultadoParticular.sucesso ? (
                      <>
                        <p>✅ {resultadoParticular.createdProcedures} procedimentos criados</p>
                        <p>⚠️ {resultadoParticular.skippedProcedures} procedimentos já existentes</p>
                        <p>💰 {resultadoParticular.createdPrices} preços adicionados</p>
                        <p>⏭️ {resultadoParticular.skippedPrices} preços já existentes</p>
                        {resultadoParticular.errors?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600">Ver erros ({resultadoParticular.errors.length})</summary>
                            <ul className="text-xs mt-1 text-red-700">
                              {resultadoParticular.errors.map((error, i) => <li key={i}>• {error}</li>)}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-red-700">{resultadoParticular.message}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => handleImport('Particular', dadosParticular, setLoadingParticular, setResultadoParticular)}
                disabled={loadingParticular || !dadosParticular.trim()}
                className="w-full"
              >
                {loadingParticular ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Procedimentos Particulares
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Importador Cartão Mais Vida */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-green-600" />
                Cartão Mais Vida
              </CardTitle>
              <p className="text-sm text-gray-600">
                Importar procedimentos e preços para a categoria "Cartão Mais Vida"
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dados para Importação:</label>
                <Textarea
                  value={dadosCartaoMaisVida}
                  onChange={(e) => setDadosCartaoMaisVida(e.target.value)}
                  placeholder="Cole aqui os dados no formato: NOME DO PROCEDIMENTO — R$ 00,00"
                  className="h-40 text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formato esperado: "NOME DO PROCEDIMENTO — R$ VALOR"
                </p>
              </div>

              {resultadoCartao && (
                <Alert className={resultadoCartao.sucesso ? "border-green-500" : "border-red-500"}>
                  {resultadoCartao.sucesso ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>{resultadoCartao.sucesso ? "Importação Concluída!" : "Erro na Importação"}</AlertTitle>
                  <AlertDescription className="mt-2 space-y-1">
                    {resultadoCartao.sucesso ? (
                      <>
                        <p>✅ {resultadoCartao.createdProcedures} procedimentos criados</p>
                        <p>⚠️ {resultadoCartao.skippedProcedures} procedimentos já existentes</p>
                        <p>💰 {resultadoCartao.createdPrices} preços adicionados</p>
                        <p>⏭️ {resultadoCartao.skippedPrices} preços já existentes</p>
                        {resultadoCartao.errors?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600">Ver erros ({resultadoCartao.errors.length})</summary>
                            <ul className="text-xs mt-1 text-red-700">
                              {resultadoCartao.errors.map((error, i) => <li key={i}>• {error}</li>)}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-red-700">{resultadoCartao.message}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => handleImport('Cartão Mais Vida', dadosCartaoMaisVida, setLoadingCartao, setResultadoCartao)}
                disabled={loadingCartao || !dadosCartaoMaisVida.trim()}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {loadingCartao ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Cartão Mais Vida
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Importador Prefeitura de Imbé */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {/* Custom SVG for a city/government building icon */}
                <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-6a1 1 0 00-1-1H9a1 1 0 00-1 1v6a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
                Prefeitura de Imbé
              </CardTitle>
              <p className="text-sm text-gray-600">
                Importar procedimentos e preços para a categoria "Prefeitura de Imbé"
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dados para Importação:</label>
                <Textarea
                  value={dadosPrefeituraImbe}
                  onChange={(e) => setDadosPrefeituraImbe(e.target.value)}
                  placeholder="Cole aqui os dados no formato: NOME DO PROCEDIMENTO — R$ 00,00"
                  className="h-40 text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formato esperado: "NOME DO PROCEDIMENTO — R$ VALOR"
                </p>
              </div>

              {resultadoPrefeituraImbe && (
                <Alert className={resultadoPrefeituraImbe.sucesso ? "border-green-500" : "border-red-500"}>
                  {resultadoPrefeituraImbe.sucesso ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>{resultadoPrefeituraImbe.sucesso ? "Importação Concluída!" : "Erro na Importação"}</AlertTitle>
                  <AlertDescription className="mt-2 space-y-1">
                    {resultadoPrefeituraImbe.sucesso ? (
                      <>
                        <p>✅ {resultadoPrefeituraImbe.createdProcedures} procedimentos criados</p>
                        <p>⚠️ {resultadoPrefeituraImbe.skippedProcedures} procedimentos já existentes</p>
                        <p>💰 {resultadoPrefeituraImbe.createdPrices} preços adicionados</p>
                        <p>⏭️ {resultadoPrefeituraImbe.skippedPrices} preços já existentes</p>
                        {resultadoPrefeituraImbe.errors?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600">Ver erros ({resultadoPrefeituraImbe.errors.length})</summary>
                            <ul className="text-xs mt-1 text-red-700">
                              {resultadoPrefeituraImbe.errors.map((error, i) => <li key={i}>• {error}</li>)}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-red-700">{resultadoPrefeituraImbe.message}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => handleImport('Prefeitura de Imbé', dadosPrefeituraImbe, setLoadingPrefeituraImbe, setResultadoPrefeituraImbe)}
                disabled={loadingPrefeituraImbe || !dadosPrefeituraImbe.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {loadingPrefeituraImbe ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Prefeitura de Imbé
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Importador Prefeitura de Pinhal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-cyan-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-6a1 1 0 00-1-1H9a1 1 0 00-1 1v6a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
                Prefeitura de Pinhal
              </CardTitle>
              <p className="text-sm text-gray-600">
                Importar procedimentos e preços para a categoria "Prefeitura de Pinhal"
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dados para Importação:</label>
                <Textarea
                  value={dadosPrefeituraPinhal}
                  onChange={(e) => setDadosPrefeituraPinhal(e.target.value)}
                  placeholder="Cole aqui os dados no formato: NOME DO PROCEDIMENTO — R$ 00,00"
                  className="h-40 text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formato esperado: "NOME DO PROCEDIMENTO — R$ VALOR"
                </p>
              </div>

              {resultadoPrefeituraPinhal && (
                <Alert className={resultadoPrefeituraPinhal.sucesso ? "border-green-500" : "border-red-500"}>
                  {resultadoPrefeituraPinhal.sucesso ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>{resultadoPrefeituraPinhal.sucesso ? "Importação Concluída!" : "Erro na Importação"}</AlertTitle>
                  <AlertDescription className="mt-2 space-y-1">
                    {resultadoPrefeituraPinhal.sucesso ? (
                      <>
                        <p>✅ {resultadoPrefeituraPinhal.createdProcedures} procedimentos criados</p>
                        <p>⚠️ {resultadoPrefeituraPinhal.skippedProcedures} procedimentos já existentes</p>
                        <p>💰 {resultadoPrefeituraPinhal.createdPrices} preços adicionados</p>
                        <p>⏭️ {resultadoPrefeituraPinhal.skippedPrices} preços já existentes</p>
                        {resultadoPrefeituraPinhal.errors?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600">Ver erros ({resultadoPrefeituraPinhal.errors.length})</summary>
                            <ul className="text-xs mt-1 text-red-700">
                              {resultadoPrefeituraPinhal.errors.map((error, i) => <li key={i}>• {error}</li>)}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-red-700">{resultadoPrefeituraPinhal.message}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => handleImport('Prefeitura de Pinhal', dadosPrefeituraPinhal, setLoadingPrefeituraPinhal, setResultadoPrefeituraPinhal)}
                disabled={loadingPrefeituraPinhal || !dadosPrefeituraPinhal.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
              >
                {loadingPrefeituraPinhal ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Prefeitura de Pinhal
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Importador Prefeitura de Tramandaí */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-6a1 1 0 00-1-1H9a1 1 0 00-1 1v6a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
                Prefeitura de Tramandaí
              </CardTitle>
              <p className="text-sm text-gray-600">
                Importar procedimentos e preços para a categoria "Prefeitura de Tramandaí"
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dados para Importação:</label>
                <Textarea
                  value={dadosPrefeituraTramandai}
                  onChange={(e) => setDadosPrefeituraTramandai(e.target.value)}
                  placeholder="Cole aqui os dados no formato: NOME DO PROCEDIMENTO — R$ 00,00"
                  className="h-40 text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formato esperado: "NOME DO PROCEDIMENTO — R$ VALOR"
                </p>
              </div>

              {resultadoPrefeituraTramandai && (
                <Alert className={resultadoPrefeituraTramandai.sucesso ? "border-green-500" : "border-red-500"}>
                  {resultadoPrefeituraTramandai.sucesso ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>{resultadoPrefeituraTramandai.sucesso ? "Importação Concluída!" : "Erro na Importação"}</AlertTitle>
                  <AlertDescription className="mt-2 space-y-1">
                    {resultadoPrefeituraTramandai.sucesso ? (
                      <>
                        <p>✅ {resultadoPrefeituraTramandai.createdProcedures} procedimentos criados</p>
                        <p>⚠️ {resultadoPrefeituraTramandai.skippedProcedures} procedimentos já existentes</p>
                        <p>💰 {resultadoPrefeituraTramandai.createdPrices} preços adicionados</p>
                        <p>⏭️ {resultadoPrefeituraTramandai.skippedPrices} preços já existentes</p>
                        {resultadoPrefeituraTramandai.errors?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600">Ver erros ({resultadoPrefeituraTramandai.errors.length})</summary>
                            <ul className="text-xs mt-1 text-red-700">
                              {resultadoPrefeituraTramandai.errors.map((error, i) => <li key={i}>• {error}</li>)}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-red-700">{resultadoPrefeituraTramandai.message}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => handleImport('Prefeitura de Tramandaí', dadosPrefeituraTramandai, setLoadingPrefeituraTramandai, setResultadoPrefeituraTramandai)}
                disabled={loadingPrefeituraTramandai || !dadosPrefeituraTramandai.trim()}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                {loadingPrefeituraTramandai ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Prefeitura de Tramandaí
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Importador SMEC */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-6a1 1 0 00-1-1H9a1 1 0 00-1 1v6a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
                SMEC
              </CardTitle>
              <p className="text-sm text-gray-600">
                Importar procedimentos e preços para a categoria "SMEC"
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dados para Importação:</label>
                <Textarea
                  value={dadosSmec}
                  onChange={(e) => setDadosSmec(e.target.value)}
                  placeholder="Cole aqui os dados no formato: NOME DO PROCEDIMENTO — R$ 00,00"
                  className="h-40 text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formato esperado: "NOME DO PROCEDIMENTO — R$ VALOR"
                </p>
              </div>

              {resultadoSmec && (
                <Alert className={resultadoSmec.sucesso ? "border-green-500" : "border-red-500"}>
                  {resultadoSmec.sucesso ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>{resultadoSmec.sucesso ? "Importação Concluída!" : "Erro na Importação"}</AlertTitle>
                  <AlertDescription className="mt-2 space-y-1">
                    {resultadoSmec.sucesso ? (
                      <>
                        <p>✅ {resultadoSmec.createdProcedures} procedimentos criados</p>
                        <p>⚠️ {resultadoSmec.skippedProcedures} procedimentos já existentes</p>
                        <p>💰 {resultadoSmec.createdPrices} preços adicionados</p>
                        <p>⏭️ {resultadoSmec.skippedPrices} preços já existentes</p>
                        {resultadoSmec.errors?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600">Ver erros ({resultadoSmec.errors.length})</summary>
                            <ul className="text-xs mt-1 text-red-700">
                              {resultadoSmec.errors.map((error, i) => <li key={i}>• {error}</li>)}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-red-700">{resultadoSmec.message}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => handleImport('SMEC', dadosSmec, setLoadingSmec, setResultadoSmec)}
                disabled={loadingSmec || !dadosSmec.trim()}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                {loadingSmec ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar SMEC
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Importador FUMAM */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-6a1 1 0 00-1-1H9a1 1 0 00-1 1v6a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
                FUMAM
              </CardTitle>
              <p className="text-sm text-gray-600">
                Importar procedimentos e preços para a categoria "FUMAM"
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dados para Importação:</label>
                <Textarea
                  value={dadosFumam}
                  onChange={(e) => setDadosFumam(e.target.value)}
                  placeholder="Cole aqui os dados no formato: NOME DO PROCEDIMENTO — R$ 00,00"
                  className="h-40 text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Formato esperado: "NOME DO PROCEDIMENTO — R$ VALOR"
                </p>
              </div>

              {resultadoFumam && (
                <Alert className={resultadoFumam.sucesso ? "border-green-500" : "border-red-500"}>
                  {resultadoFumam.sucesso ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <AlertTitle>{resultadoFumam.sucesso ? "Importação Concluída!" : "Erro na Importação"}</AlertTitle>
                  <AlertDescription className="mt-2 space-y-1">
                    {resultadoFumam.sucesso ? (
                      <>
                        <p>✅ {resultadoFumam.createdProcedures} procedimentos criados</p>
                        <p>⚠️ {resultadoFumam.skippedProcedures} procedimentos já existentes</p>
                        <p>💰 {resultadoFumam.createdPrices} preços adicionados</p>
                        <p>⏭️ {resultadoFumam.skippedPrices} preços já existentes</p>
                        {resultadoFumam.errors?.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600">Ver erros ({resultadoFumam.errors.length})</summary>
                            <ul className="text-xs mt-1 text-red-700">
                              {resultadoFumam.errors.map((error, i) => <li key={i}>• {error}</li>)}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-red-700">{resultadoFumam.message}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => handleImport('FUMAM', dadosFumam, setLoadingFumam, setResultadoFumam)}
                disabled={loadingFumam || !dadosFumam.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
              >
                {loadingFumam ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar FUMAM
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

        </div>

        {/* Instruções */}
        <Card>
          <CardHeader>
            <CardTitle>Como usar:</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Cole a lista de procedimentos no formato: <code>NOME DO PROCEDIMENTO — R$ VALOR</code></li>
              <li>Cada linha deve conter um procedimento</li>
              <li>O sistema irá identificar automaticamente a especialidade baseada no nome</li>
              <li>Procedimentos duplicados serão ignorados, apenas os preços serão atualizados</li>
              <li>Clique em "Importar" para processar os dados</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
