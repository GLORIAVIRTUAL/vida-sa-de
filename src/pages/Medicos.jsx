
import React, { useState, useEffect } from "react";
import { Medico, CategoriaPreco } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

import ListaMedicos from "../components/medicos/ListaMedicos";
import FormularioMedico from "../components/medicos/FormularioMedico";
import FiltrosMedicos from "../components/medicos/FiltrosMedicos";
import ConfirmacaoExclusao from "../components/shared/ConfirmacaoExclusao";
import { syncMedicoPrices } from "@/functions/syncMedicoPrices";

export default function Medicos() {
  const [medicos, setMedicos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false); // New state for synchronization
  const [mostrarForm, setMostrarForm] = useState(false);
  const [medicoSelecionado, setMedicoSelecionado] = useState(null);
  const [medicoParaExcluir, setMedicoParaExcluir] = useState(null);
  const [filtros, setFiltros] = useState({
    busca: "",
    especialidade: "todas",
    status: "todos"
  });
  const { toast } = useToast(); // Initialize toast

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const [dataMedicos, dataCategorias] = await Promise.all([
          Medico.list("-created_date"),
          CategoriaPreco.list()
      ]);
      setMedicos(dataMedicos);
      setCategorias(dataCategorias);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar a lista de médicos ou categorias.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSincronizarPrecos = async () => {
    setSyncing(true);
    try {
      console.log('🔄 Iniciando sincronização de preços...');
      const response = await syncMedicoPrices();
      
      console.log('📊 Resposta da sincronização:', response);
      
      if (response.data.success) {
        toast({
          title: "✅ Sincronização Concluída!",
          description: `${response.data.medicosAtualizados} médico(s) atualizado(s) com sucesso.`,
          variant: "default",
        });
        
        if (response.data.erros && response.data.erros.length > 0) {
          console.warn('⚠️ Alguns erros ocorreram:', response.data.erros);
          toast({
            title: "⚠️ Atenção",
            description: `${response.data.erros.length} médico(s) com problemas. Verifique o console.`,
            variant: "destructive",
          });
        }
        
        await carregarDados(); // Reload data after successful sync
      } else {
        // If success is false but no explicit error message is provided
        throw new Error(response.data.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('❌ Erro na sincronização:', error);
      toast({
        title: "❌ Erro na Sincronização",
        description: error.message || "Não foi possível sincronizar os preços.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      console.log('🗑️ Deletando médico:', id);
      await Medico.delete(id);
      
      toast({
        title: "Sucesso!",
        description: "Médico deletado com sucesso!"
      });
      
      // Recarregar lista
      await carregarDados(); 
    } catch (error) {
      console.error("❌ Erro ao deletar médico:", error);
      toast({
        title: "Erro",
        description: "Erro ao deletar médico: " + error.message,
        variant: "destructive"
      });
    }
  };

  const handleEditarMedico = (medico) => {
    console.log('✏️ Editando médico:', medico);
    setMedicoSelecionado(medico);
    setMostrarForm(true);
  };

  // This function might become unused if ListaMedicos directly calls handleDelete.
  // However, as per instructions to preserve other functionality not explicitly removed, it remains.
  const handleExcluirMedico = async () => {
    if (!medicoParaExcluir) return;
    
    try {
      await Medico.delete(medicoParaExcluir.id);
      setMedicoParaExcluir(null);
      carregarDados();
      toast({
        title: "✅ Médico Excluído",
        description: `O médico "${medicoParaExcluir.nome}" foi excluído com sucesso.`,
        variant: "default",
      });
    } catch (error) {
      console.error("Erro ao excluir médico:", error);
      toast({
        title: "❌ Erro ao Excluir",
        description: `Não foi possível excluir o médico "${medicoParaExcluir.nome}".`,
        variant: "destructive",
      });
    }
  };

  const handleFecharForm = () => {
    console.log('❌ Fechando formulário');
    setMostrarForm(false);
    setMedicoSelecionado(null);
  };

  const handleAtualizarDados = () => {
    console.log('🔄 Atualizando lista de médicos');
    carregarDados();
  };

  const medicosFiltrados = medicos.filter(medico => {
    const buscaMatch = filtros.busca === "" || 
      medico.nome?.toLowerCase().includes(filtros.busca.toLowerCase()) ||
      medico.crm?.includes(filtros.busca);
    
    const especialidadeMatch = filtros.especialidade === "todas" || 
      medico.especialidade === filtros.especialidade;

    const statusMatch = filtros.status === "todos" ||
      medico.status === filtros.status;

    return buscaMatch && especialidadeMatch && statusMatch;
  });

  return (
    <ProtectedRoute requiredRole={["admin", "user"]}>
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Médicos</h1>
              <p className="text-gray-600 mt-1">
                Gerencie os profissionais da clínica
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleSincronizarPrecos}
                disabled={syncing}
                variant="outline"
                className="gap-2"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sincronizar Preços
                  </>
                )}
              </Button>
              <Button 
                onClick={() => {
                  console.log('➕ Novo médico');
                  setMedicoSelecionado(null);
                  setMostrarForm(true);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Médico
              </Button>
            </div>
          </div>

          <FiltrosMedicos 
            filtros={filtros}
            onFiltrosChange={setFiltros}
          />

          <ListaMedicos
            medicos={medicosFiltrados}
            loading={loading}
            onEdit={handleEditarMedico}
            onDelete={handleDelete}
          />

          <FormularioMedico
            medico={medicoSelecionado}
            open={mostrarForm}
            onClose={handleFecharForm}
            onUpdate={handleAtualizarDados}
            categorias={categorias}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
