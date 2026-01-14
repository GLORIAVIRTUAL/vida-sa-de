import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Calendar, Clock, Edit, UserPlus, Trash2 } from "lucide-react";
import FormularioTurma from "@/components/turmas/FormularioTurma";
import GerenciarAlunos from "@/components/turmas/GerenciarAlunos";
import { useToast } from "@/components/ui/use-toast";

export default function Turmas() {
  const [turmas, setTurmas] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [alunosPorTurma, setAlunosPorTurma] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalTurmaOpen, setModalTurmaOpen] = useState(false);
  const [modalAlunosOpen, setModalAlunosOpen] = useState(false);
  const [turmaSelecionada, setTurmaSelecionada] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [turmasData, medicosData, alunosTurmaData] = await Promise.all([
        base44.entities.Turma.list(),
        base44.entities.Medico.list(),
        base44.entities.AlunoTurma.filter({ status: 'Ativo' })
      ]);
      setTurmas(turmasData);
      setMedicos(medicosData);
      
      // Contar alunos por turma
      const contagem = {};
      alunosTurmaData.forEach(at => {
        contagem[at.turma_id] = (contagem[at.turma_id] || 0) + 1;
      });
      setAlunosPorTurma(contagem);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({ title: "Erro ao carregar dados", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleNovaTurma = () => {
    setTurmaSelecionada(null);
    setModalTurmaOpen(true);
  };

  const handleEditarTurma = (turma) => {
    setTurmaSelecionada(turma);
    setModalTurmaOpen(true);
  };

  const handleGerenciarAlunos = (turma) => {
    setTurmaSelecionada(turma);
    setModalAlunosOpen(true);
  };

  const handleDeleteTurma = async (turmaId) => {
    if (!confirm("Tem certeza que deseja excluir esta turma?")) return;
    try {
      await base44.entities.Turma.delete(turmaId);
      toast({ title: "Turma excluída" });
      fetchData();
    } catch (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  };

  const getNomeMedico = (id) => {
    const medico = medicos.find(m => m.id === id);
    return medico ? medico.nome : 'Não definido';
  };

  const diasLabel = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Turmas e Grupos</h1>
            <p className="text-gray-600">Gerencie aulas de Hidroginástica, Pilates e outras atividades coletivas.</p>
          </div>
          <Button onClick={handleNovaTurma} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Nova Turma
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-10">Carregando...</div>
        ) : turmas.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
            <Users className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Nenhuma turma criada</h3>
            <p className="text-gray-500 mb-4">Comece criando sua primeira turma de alunos.</p>
            <Button onClick={handleNovaTurma}>Criar Turma</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {turmas.map(turma => (
              <Card key={turma.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <Badge className="mb-2 bg-blue-100 text-blue-700 hover:bg-blue-100">
                      {turma.modalidade}
                    </Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditarTurma(turma)}>
                        <Edit className="w-4 h-4 text-gray-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteTurma(turma.id)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-xl">{turma.nome}</CardTitle>
                  <CardDescription>Prof. {getNomeMedico(turma.medico_id)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span>{turma.horario_inicio} - {turma.horario_fim}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-500" />
                      <div className="flex gap-1">
                        {turma.dias_semana?.sort().map(d => (
                          <span key={d} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs font-medium">
                            {diasLabel[d]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="font-medium text-blue-600">{alunosPorTurma[turma.id] || 0}</span>
                      <span>/ {turma.capacidade_maxima} alunos</span>
                    </div>
                  </div>

                  <Button 
                    className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => handleGerenciarAlunos(turma)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" /> Gerenciar Alunos & Agenda
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {modalTurmaOpen && (
        <FormularioTurma 
          turma={turmaSelecionada} 
          medicos={medicos} 
          onClose={() => setModalTurmaOpen(false)} 
          onSave={() => {
            setModalTurmaOpen(false);
            fetchData();
          }} 
        />
      )}

      {modalAlunosOpen && turmaSelecionada && (
        <GerenciarAlunos 
          turma={turmaSelecionada} 
          onClose={() => setModalAlunosOpen(false)} 
        />
      )}
    </div>
  );
}