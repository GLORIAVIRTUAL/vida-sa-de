import React, { useState, useEffect } from "react";
import { Medico, CategoriaPreco } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, CalendarOff, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

import ListaMedicos from "../components/medicos/ListaMedicos";
import FormularioMedico from "../components/medicos/FormularioMedico";
import FiltrosMedicos from "../components/medicos/FiltrosMedicos";
import ConfirmacaoExclusao from "../components/shared/ConfirmacaoExclusao";

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
  const [showBlockHolidayModal, setShowBlockHolidayModal] = useState(false);
  const [selectedHolidayDate, setSelectedHolidayDate] = useState(null);
  const [blocking, setBlocking] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const [dataMedicos, dataCategorias] = await Promise.all([
      Medico.list("-created_date"),
      CategoriaPreco.list()]
      );
      setMedicos(dataMedicos);
      setCategorias(dataCategorias);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar a lista de médicos ou categorias.",
        variant: "destructive"
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
          variant: "default"
        });

        if (response.data.erros && response.data.erros.length > 0) {
          console.warn('⚠️ Alguns erros ocorreram:', response.data.erros);
          toast({
            title: "⚠️ Atenção",
            description: `${response.data.erros.length} médico(s) com problemas. Verifique o console.`,
            variant: "destructive"
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
        variant: "destructive"
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
        variant: "default"
      });
    } catch (error) {
      console.error("Erro ao excluir médico:", error);
      toast({
        title: "❌ Erro ao Excluir",
        description: `Não foi possível excluir o médico "${medicoParaExcluir.nome}".`,
        variant: "destructive"
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

  const handleBloquearFeriado = async () => {
    if (!selectedHolidayDate) return;
    setBlocking(true);
    try {
      const dataFormatada = selectedHolidayDate.toISOString().split('T')[0];
      const response = await base44.functions.invoke('blockHoliday', { data_feriado: dataFormatada });
      toast({
        title: "✅ Feriado Bloqueado!",
        description: `${response.data.medicos_atualizados} de ${response.data.total_medicos} médico(s) tiveram a agenda bloqueada em ${selectedHolidayDate.toLocaleDateString('pt-BR')}.`
      });
      setShowBlockHolidayModal(false);
      setSelectedHolidayDate(null);
      await carregarDados();
    } catch (error) {
      toast({
        title: "❌ Erro ao bloquear feriado",
        description: error.message || "Não foi possível bloquear o feriado.",
        variant: "destructive"
      });
    } finally {
      setBlocking(false);
    }
  };

  // Extrair datas bloqueadas (feriados) de todos os médicos
  const feriadosBloqueados = React.useMemo(() => {
    const datasSet = new Set();
    medicos.forEach(m => {
      (m.horarios_atendimento || []).forEach(h => {
        if (h.bloqueado && h.data_especifica) {
          datasSet.add(h.data_especifica);
        }
      });
    });
    return Array.from(datasSet).sort();
  }, [medicos]);

  const handleDesbloquearFeriado = async (dataFeriado) => {
    try {
      const response = await base44.functions.invoke('unblockHoliday', { data_feriado: dataFeriado });
      toast({
        title: "✅ Feriado desbloqueado!",
        description: `${response.data.medicos_atualizados} médico(s) tiveram a data ${new Date(dataFeriado + 'T12:00:00').toLocaleDateString('pt-BR')} desbloqueada.`
      });
      await carregarDados();
    } catch (error) {
      toast({ title: "❌ Erro", description: error.message, variant: "destructive" });
    }
  };

  const medicosFiltrados = medicos.filter((medico) => {
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
              <h1 className="text-cyan-500 text-3xl font-bold">Médicos</h1>
              <p className="text-gray-600 mt-1">
                Gerencie os profissionais da clínica
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => setShowBlockHolidayModal(true)}
                variant="outline"
                className="gap-2 border-red-300 text-red-600 hover:bg-red-50">
                <CalendarOff className="w-4 h-4" />
                Bloquear Feriado
              </Button>
              <Button
                onClick={handleSincronizarPrecos}
                disabled={syncing}
                variant="outline"
                className="gap-2">

                {syncing ?
                <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </> :

                <>
                    <RefreshCw className="w-4 h-4" />
                    Sincronizar Preços
                  </>
                }
              </Button>
              <Button
                onClick={() => {
                  console.log('➕ Novo médico');
                  setMedicoSelecionado(null);
                  setMostrarForm(true);
                }}
                className="bg-blue-600 hover:bg-blue-700">

                <Plus className="w-4 h-4 mr-2" />
                Novo Médico
              </Button>
            </div>
          </div>

          {feriadosBloqueados.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2">
              <CalendarOff className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-sm font-medium text-red-700 mr-1">Feriados bloqueados:</span>
              {feriadosBloqueados.map(data => (
                <Badge key={data} variant="outline" className="border-red-300 bg-white text-red-700 gap-1 pr-1">
                  {new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  <button
                    onClick={() => handleDesbloquearFeriado(data)}
                    className="ml-1 hover:bg-red-100 rounded-full p-0.5"
                    title="Desbloquear"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <FiltrosMedicos
            filtros={filtros}
            onFiltrosChange={setFiltros} />


          <ListaMedicos
            medicos={medicosFiltrados}
            loading={loading}
            onEdit={handleEditarMedico}
            onDelete={handleDelete} />


          <FormularioMedico
            medico={medicoSelecionado}
            open={mostrarForm}
            onClose={handleFecharForm}
            onUpdate={handleAtualizarDados}
            categorias={categorias} />

        </div>

        <Dialog open={showBlockHolidayModal} onOpenChange={setShowBlockHolidayModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarOff className="w-5 h-5 text-red-500" />
                Bloquear Feriado / Fechar Clínica
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500">
              Selecione a data em que a clínica ficará fechada. Todas as agendas serão bloqueadas nesse dia.
            </p>
            <div className="flex justify-center py-2">
              <Calendar
                mode="single"
                selected={selectedHolidayDate}
                onSelect={setSelectedHolidayDate}
                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
              />
            </div>
            {selectedHolidayDate && (
              <p className="text-center text-sm font-medium text-gray-700">
                Data selecionada: <span className="text-red-600">{selectedHolidayDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowBlockHolidayModal(false); setSelectedHolidayDate(null); }}>
                Cancelar
              </Button>
              <Button
                onClick={handleBloquearFeriado}
                disabled={!selectedHolidayDate || blocking}
                className="bg-red-600 hover:bg-red-700 text-white">
                {blocking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Bloqueando...
                  </>
                ) : (
                  'Confirmar Bloqueio'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>);

}