import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Search, User, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function GerenciarAlunos({ turma, onClose }) {
  const { toast } = useToast();
  const [alunos, setAlunos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState([]);
  const [buscando, setBuscando] = useState(false);
  
  // Estado para geração de agenda
  const [gerandoAgenda, setGerandoAgenda] = useState(false);
  const [periodoInicio, setPeriodoInicio] = useState(new Date());
  const [periodoFim, setPeriodoFim] = useState(addMonths(new Date(), 1));

  useEffect(() => {
    carregarAlunos();
  }, [turma]);

  const carregarAlunos = async () => {
    setLoading(true);
    try {
      // Buscar vínculos
      const vinculos = await base44.entities.AlunoTurma.filter({ turma_id: turma.id });
      
      // Enriquecer com dados do paciente
      const alunosDetalhados = await Promise.all(vinculos.map(async (v) => {
        const paciente = await base44.entities.Paciente.get(v.paciente_id);
        return { ...v, paciente };
      }));
      
      setAlunos(alunosDetalhados.filter(a => a.paciente)); // Filtrar caso algum paciente tenha sido deletado
    } catch (error) {
      console.error(error);
      toast({ title: "Erro ao carregar alunos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const buscarPaciente = async () => {
    if (busca.length < 2) return;
    setBuscando(true);
    try {
      const response = await base44.functions.invoke('searchPatients', { termo: busca, limit: 10 });
      setResultadosBusca(response.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setBuscando(false);
    }
  };

  const atualizarContagemTurma = async () => {
    const vinculos = await base44.entities.AlunoTurma.filter({ turma_id: turma.id });
    const ativos = vinculos.filter(v => !v.status || v.status === 'Ativo');
    await base44.entities.Turma.update(turma.id, { qtd_alunos: ativos.length });
  };

  const adicionarAluno = async (paciente) => {
    // Verificar se já está na turma
    if (alunos.some(a => a.paciente_id === paciente.id)) {
      toast({ title: "Aluno já está na turma", variant: "warning" });
      return;
    }

    try {
      await base44.entities.AlunoTurma.create({
        turma_id: turma.id,
        paciente_id: paciente.id,
        data_inicio: new Date().toISOString().split('T')[0],
        status: 'Ativo'
      });
      await atualizarContagemTurma();
      toast({ title: "Aluno adicionado!" });
      setBusca('');
      setResultadosBusca([]);
      carregarAlunos();
    } catch (error) {
      toast({ title: "Erro ao adicionar", variant: "destructive" });
    }
  };

  const removerAluno = async (idVinculo) => {
    if (!confirm("Remover aluno da turma?")) return;
    try {
      await base44.entities.AlunoTurma.delete(idVinculo);
      await atualizarContagemTurma();
      toast({ title: "Aluno removido" });
      carregarAlunos();
    } catch (error) {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  const gerarAgenda = async () => {
    setGerandoAgenda(true);
    try {
      const response = await base44.functions.invoke('generateClassAppointments', {
        turmaId: turma.id,
        dataInicio: format(periodoInicio, 'yyyy-MM-dd'),
        dataFim: format(periodoFim, 'yyyy-MM-dd')
      });

      if (response.data?.success) {
        toast({
          title: "Agenda Gerada!",
          description: `${response.data.count} agendamentos criados para ${response.data.students} alunos.`,
          duration: 5000
        });
      } else {
        throw new Error(response.data?.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Erro ao gerar agenda",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setGerandoAgenda(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerenciar Turma: {turma.nome}</DialogTitle>
          <DialogDescription>
            {turma.modalidade} • {turma.dias_semana.length} dias/sem • {turma.horario_inicio}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          
          {/* Adicionar Aluno */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Adicionar Aluno
            </h3>
            <div className="flex gap-2">
              <Input 
                placeholder="Buscar paciente por nome..." 
                value={busca}
                onChange={e => setBusca(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && buscarPaciente()}
              />
              <Button onClick={buscarPaciente} disabled={buscando || busca.length < 2}>
                {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            
            {resultadosBusca.length > 0 && (
              <div className="mt-2 bg-white border rounded-md max-h-40 overflow-y-auto shadow-sm">
                {resultadosBusca.map(p => (
                  <div 
                    key={p.id} 
                    className="p-2 hover:bg-gray-50 cursor-pointer flex justify-between items-center border-b last:border-0"
                    onClick={() => adicionarAluno(p)}
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium">{p.nome}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-blue-600">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lista de Alunos */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Alunos Matriculados ({alunos.length}/{turma.capacidade_maxima})</h3>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">Carregando...</TableCell>
                    </TableRow>
                  ) : alunos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-500">Nenhum aluno nesta turma.</TableCell>
                    </TableRow>
                  ) : (
                    alunos.map(aluno => (
                      <TableRow key={aluno.id}>
                        <TableCell className="font-medium">{aluno.paciente.nome}</TableCell>
                        <TableCell>{aluno.paciente.telefone}</TableCell>
                        <TableCell>
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                            {aluno.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-800" onClick={() => removerAluno(aluno.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Gerar Agenda */}
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
            <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" /> Gerar Agendamentos em Massa
            </h3>
            <p className="text-xs text-gray-600 mb-3">
              Isso criará agendamentos individuais no calendário para todos os alunos listados acima.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <Label className="text-xs">De</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[130px] justify-start text-left font-normal h-9">
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {format(periodoInicio, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={periodoInicio} onSelect={setPeriodoInicio} initialFocus locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[130px] justify-start text-left font-normal h-9">
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {format(periodoFim, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={periodoFim} onSelect={setPeriodoFim} initialFocus locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
              <Button onClick={gerarAgenda} disabled={gerandoAgenda || alunos.length === 0} className="bg-purple-600 hover:bg-purple-700 h-9">
                {gerandoAgenda ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarIcon className="w-4 h-4 mr-2" />}
                Gerar Agenda
              </Button>
            </div>
          </div>

        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}