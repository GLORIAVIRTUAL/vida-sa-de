import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProtectedRoute from '../components/auth/ProtectedRoute';
import { Loader2, AlertCircle, BarChart3, TrendingUp, FileText, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { safeApiCall } from '@/components/shared/apiThrottle';

import DashboardFinanceiro from '../components/financeiro/DashboardFinanceiro';
import FluxoCaixa from '../components/financeiro/FluxoCaixa';
import DRE from '../components/financeiro/DRE';
import Repasses from '../components/financeiro/Repasses'; // This component will be replaced in the TabContent
import RepasseMedicos from '../components/financeiro/RepasseMedicos'; // New component to be used
import FormularioLancamento from '../components/financeiro/FormularioLancamento';
import Faturas from '../components/financeiro/Faturas'; // New component import
import { Lancamento, OrdemServico, Medico, Paciente, Procedimento, Exame, CategoriaPreco } from '@/entities/all';

export default function Financeiro() {
  const [data, setData] = useState({
    lancamentos: [],
    ordensServico: [],
    medicos: [],
    pacientes: [],
    procedimentos: [],
    exames: [],
    categoriasPreco: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [lancamentoModal, setLancamentoModal] = useState(false);
  const [lancamentoEditar, setLancamentoEditar] = useState(null);

  const carregarDados = async () => {
    setLoading(true);
    setError(null);
    console.log("🔄 [Financeiro] Iniciando carregamento de dados...");

    try {
      const [
        lancamentosData,
        ordensServicoData,
        medicosData,
        pacientesData,
        procedimentosData,
        examesData,
        categoriasPrecoData,
      ] = await safeApiCall(async () => Promise.all([
        Lancamento.list('-data_lancamento', 2000),
        OrdemServico.list('-created_date', 2000),
        Medico.list(),
        Paciente.list('nome', 2000),
        Procedimento.list(),
        Exame.list(),
        CategoriaPreco.list()
      ]));

      setData({
        lancamentos: lancamentosData || [],
        ordensServico: ordensServicoData || [],
        medicos: medicosData || [],
        pacientes: pacientesData || [],
        procedimentos: procedimentosData || [],
        exames: examesData || [],
        categoriasPreco: categoriasPrecoData || [],
      });
      
      console.log("✅ [Financeiro] Dados carregados com sucesso.");

    } catch (e) {
      console.error("❌ Erro ao carregar dados financeiros:", e);
      setError("Não foi possível carregar os dados financeiros. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const handleNovoLancamento = () => {
    setLancamentoEditar(null);
    setLancamentoModal(true);
  };

  const handleSalvarLancamento = async (lancamentoData) => {
    try {
      if (lancamentoData.id) {
        await Lancamento.update(lancamentoData.id, lancamentoData);
        console.log(`✅ Lançamento #${lancamentoData.id} atualizado.`);
      } else {
        await Lancamento.create(lancamentoData);
        console.log("✅ Lançamento criado.");
      }
      setLancamentoModal(false);
      setLancamentoEditar(null);
      await carregarDados();
    } catch (error) {
      console.error("❌ Erro ao salvar lançamento:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] flex-col gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-lg text-gray-600">Carregando dados financeiros...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro de Carregamento</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { lancamentos, ordensServico, medicos, pacientes } = data;

  return (
    <ProtectedRoute 
      requiredRole="admin" 
      fallbackMessage="Apenas administradores podem acessar o módulo financeiro."
    >
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestão Financeira</h1>
            <p className="text-gray-600">
              Controle completo das finanças da clínica
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-8"> {/* Changed grid-cols-4 to grid-cols-5 */}
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="fluxo" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Fluxo de Caixa
              </TabsTrigger>
              <TabsTrigger value="dre" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                DRE
              </TabsTrigger>
              <TabsTrigger value="repasses" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Repasses
              </TabsTrigger>
              <TabsTrigger value="faturas" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Faturas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <DashboardFinanceiro 
                lancamentos={lancamentos}
                ordensServico={ordensServico}
                medicos={medicos}
                loading={false}
              />
            </TabsContent>

            <TabsContent value="fluxo">
              <FluxoCaixa 
                lancamentos={lancamentos}
                ordensServico={ordensServico}
                pacientes={pacientes}
                onNovoLancamento={handleNovoLancamento}
                onUpdate={carregarDados}
              />
            </TabsContent>

            <TabsContent value="dre">
              <DRE 
                lancamentos={lancamentos}
                ordensServico={ordensServico}
                loading={false}
              />
            </TabsContent>

            <TabsContent value="repasses">
              <RepasseMedicos 
                ordensServico={ordensServico}
                medicos={medicos}
                pacientes={pacientes}
                onRepasseRealizado={carregarDados}
              />
            </TabsContent>

            <TabsContent value="faturas">
              <Faturas 
                ordensServico={ordensServico}
                pacientes={pacientes}
                medicos={medicos}
                procedimentos={data.procedimentos}
                exames={data.exames}
                categorias={data.categoriasPreco}
              />
            </TabsContent>
          </Tabs>

          {lancamentoModal && (
            <FormularioLancamento
              lancamento={lancamentoEditar}
              medicos={medicos}
              ordensServico={ordensServico}
              open={lancamentoModal}
              onClose={() => {
                setLancamentoModal(false);
                setLancamentoEditar(null);
              }}
              onSalvar={handleSalvarLancamento}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}