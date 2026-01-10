import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, FileText, Download, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import jsPDF from 'jspdf';

export default function OrcamentoExames() {
  const [searchType, setSearchType] = useState('nome'); // 'nome' ou 'cpf'
  const [searchValue, setSearchValue] = useState('');
  const [pacienteEncontrado, setPacienteEncontrado] = useState(null);
  const [examesOrcamentos, setExamesOrcamentos] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [exames, setExames] = useState([]);
  const { toast } = useToast();

  // Carregar exames ao montar
  useEffect(() => {
    const carregarExames = async () => {
      try {
        const dados = await base44.entities.Exame.list();
        setExames(Array.isArray(dados) ? dados : []);
      } catch (error) {
        console.error('Erro ao carregar exames:', error);
      }
    };
    carregarExames();
  }, []);

  const buscarPaciente = async () => {
    if (!searchValue.trim()) {
      toast({
        title: 'Campo vazio',
        description: 'Digite um nome ou CPF para buscar',
        variant: 'destructive'
      });
      return;
    }

    setBuscando(true);
    try {
      let pacientes;
      
      if (searchType === 'cpf') {
        const cpfLimpo = searchValue.replace(/\D/g, '');
        pacientes = await base44.entities.Paciente.filter({ cpf: cpfLimpo });
      } else {
        // Busca por nome (aproximada)
        const allPacientes = await base44.entities.Paciente.list();
        pacientes = Array.isArray(allPacientes) 
          ? allPacientes.filter(p => 
              p.nome?.toLowerCase().includes(searchValue.toLowerCase())
            )
          : [];
      }

      if (Array.isArray(pacientes) && pacientes.length > 0) {
        setPacienteEncontrado(pacientes[0]);
        toast({
          title: 'Paciente encontrado!',
          description: `${pacientes[0].nome} - CPF: ${pacientes[0].cpf}`
        });
      } else {
        setPacienteEncontrado(null);
        toast({
          title: 'Nenhum resultado',
          description: 'Paciente não encontrado',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao buscar:', error);
      toast({
        title: 'Erro na busca',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setBuscando(false);
    }
  };

  const gerarOrcamentoExames = async () => {
    if (!pacienteEncontrado) {
      toast({
        title: 'Erro',
        description: 'Selecione um paciente primeiro',
        variant: 'destructive'
      });
      return;
    }

    // Simular busca de exames recomendados
    const examesRecomendados = exames.slice(0, 5); // Exemplo
    setExamesOrcamentos(examesRecomendados);
    
    toast({
      title: 'Orçamento gerado!',
      description: `${examesRecomendados.length} exame(s) listado(s)`
    });
  };

  const gerarPDFOrcamento = () => {
    if (!pacienteEncontrado || examesOrcamentos.length === 0) {
      toast({
        title: 'Erro',
        description: 'Nenhum orçamento para gerar',
        variant: 'destructive'
      });
      return;
    }

    const doc = new jsPDF();
    const dataAtual = format(new Date(), 'dd/MM/yyyy HH:mm');
    
    // Cabeçalho
    doc.setFontSize(20);
    doc.text('ORÇAMENTO DE EXAMES', 20, 20);
    
    // Informações do paciente
    doc.setFontSize(12);
    doc.text(`Paciente: ${pacienteEncontrado.nome}`, 20, 40);
    doc.text(`CPF: ${pacienteEncontrado.cpf}`, 20, 50);
    doc.text(`Data: ${dataAtual}`, 20, 60);

    // Tabela de exames
    doc.setFontSize(10);
    let yPosition = 80;
    let total = 0;

    doc.text('EXAMES SOLICITADOS', 20, yPosition);
    yPosition += 10;

    examesOrcamentos.forEach((exame, index) => {
      doc.text(`${index + 1}. ${exame.nome}`, 25, yPosition);
      doc.text(`R$ ${exame.valor_particular?.toFixed(2)}`, 180, yPosition);
      total += exame.valor_particular || 0;
      yPosition += 8;
    });

    // Total
    yPosition += 5;
    doc.setFontSize(12);
    doc.text(`TOTAL: R$ ${total.toFixed(2)}`, 20, yPosition);

    // Rodapé
    doc.setFontSize(8);
    doc.text('Centro Vida Saúde - Sistema de Orçamentos', 20, 280);

    // Salvar
    doc.save(`orcamento-exames-${pacienteEncontrado.nome.replace(/\s+/g, '-')}.pdf`);
    
    toast({
      title: 'PDF gerado!',
      description: 'Orçamento baixado com sucesso'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-8 h-8 text-blue-600" />
            Orçamento de Exames
          </h1>
          <p className="text-gray-600 mt-2">Busque um paciente e gere orçamentos personalizados</p>
        </div>

        {/* Busca de Paciente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Buscar Paciente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Buscar por:</Label>
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                  className="mt-1 w-full border rounded px-3 py-2"
                >
                  <option value="nome">Nome</option>
                  <option value="cpf">CPF</option>
                </select>
              </div>
              <div>
                <Label>Valor:</Label>
                <Input
                  placeholder={searchType === 'cpf' ? '000.000.000-00' : 'Digite o nome...'}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && buscarPaciente()}
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={buscarPaciente}
                  disabled={buscando}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {buscando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Paciente Encontrado */}
        {pacienteEncontrado && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-900">✅ Paciente Encontrado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>Nome:</strong> {pacienteEncontrado.nome}</p>
              <p><strong>CPF:</strong> {pacienteEncontrado.cpf}</p>
              <p><strong>Telefone:</strong> {pacienteEncontrado.telefone}</p>
              <p><strong>Convênio:</strong> {pacienteEncontrado.convenio}</p>
            </CardContent>
          </Card>
        )}

        {/* Geração de Orçamento */}
        {pacienteEncontrado && (
          <Card>
            <CardHeader>
              <CardTitle>Gerar Orçamento</CardTitle>
              <CardDescription>Selecione os exames para incluir no orçamento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={gerarOrcamentoExames}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                Gerar Orçamento de Exames
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Orçamento Gerado */}
        {examesOrcamentos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Exames Orçados</CardTitle>
              <CardDescription>{examesOrcamentos.length} exame(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {examesOrcamentos.map((exame, index) => (
                  <div key={exame.id} className="flex justify-between p-3 border rounded-lg bg-gray-50">
                    <span className="font-medium">{index + 1}. {exame.nome}</span>
                    <span className="font-bold text-green-600">R$ {exame.valor_particular?.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">TOTAL:</span>
                  <span className="text-2xl font-bold text-blue-600">
                    R$ {examesOrcamentos.reduce((sum, e) => sum + (e.valor_particular || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Botão de Download */}
              <Button 
                onClick={gerarPDFOrcamento}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar PDF
              </Button>
            </CardContent>
          </Card>
        )}

        {!pacienteEncontrado && (
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              Comece buscando um paciente para gerar um orçamento de exames.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}