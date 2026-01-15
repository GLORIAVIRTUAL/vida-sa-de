import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, Trash2, MoreVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import FormularioProcedimento from "../components/procedimentos/FormularioProcedimento";
import { Procedimento, CategoriaPreco, TabelaPreco } from "@/entities/all";

export default function Procedimentos() {
  const [procedimentos, setProcedimentos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tabelaPrecos, setTabelaPrecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProcedimento, setSelectedProcedimento] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [procedimentosData, categoriasData, precosData] = await Promise.all([
        Procedimento.list('-created_date', 1000),
        CategoriaPreco.list('-created_date', 100),
        TabelaPreco.list('-created_date', 5000)
      ]);
      console.log('TabelaPreco carregada:', precosData?.length, 'registros');
      setProcedimentos(procedimentosData || []);
      setCategorias(categoriasData || []);
      setTabelaPrecos(precosData || []);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const handleOpenForm = (procedimento = null) => {
    setSelectedProcedimento(procedimento);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedProcedimento(null);
  };

  const handleSave = async () => {
    await carregarDados();
    handleCloseForm();
  };

  const handleDelete = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir este procedimento? Esta ação não pode ser desfeita.")) {
      try {
        setLoading(true);
        await Procedimento.delete(id);
        await carregarDados();
      } catch (error) {
        console.error("Erro ao excluir:", error);
        alert("Erro ao excluir procedimento. Verifique se não há agendamentos vinculados.");
      } finally {
        setLoading(false);
      }
    }
  };

  const getPreco = (procedimentoId, categoriaId) => {
    const preco = tabelaPrecos.find(
      (p) => p.procedimento_id === procedimentoId && p.categoria_id === categoriaId
    );
    
    // Debug - mostrar o que temos na tabela de preços para este procedimento
    if (!preco) {
      const precosDesteProcedimento = tabelaPrecos.filter(p => p.procedimento_id === procedimentoId);
      if (precosDesteProcedimento.length === 0) {
        console.log(`⚠️ Nenhum preço encontrado para procedimento_id: ${procedimentoId}`);
      }
    }
    
    return preco ? `R$ ${preco.valor.toFixed(2)}` : "-";
  };

  const filteredProcedimentos = procedimentos.filter(proc =>
    proc.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    proc.especialidade?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Cadastro de Procedimentos e Serviços</h1>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Lista de Procedimentos</CardTitle>
            <Button onClick={() => handleOpenForm()}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Procedimento
            </Button>
          </div>
          <div className="mt-4 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou especialidade..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="text-left p-4 text-sm font-medium text-gray-500">Procedimento</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-500">Código</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-500">Especialidade</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-500">Valor Particular</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-500">Duração</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center p-6">Carregando...</td>
                  </tr>
                ) : filteredProcedimentos.map((proc) => {
                  const categoriaParticular = categorias.find(c => c.nome?.toLowerCase().includes('particular'));
                  const valorParticular = categoriaParticular ? getPreco(proc.id, categoriaParticular.id) : '-';
                  
                  return (
                    <tr key={proc.id} className="border-b hover:bg-gray-50/50 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-semibold text-gray-900">{proc.nome || `ID: ${proc.id}`}</p>
                          {proc.descricao && (
                            <p className="text-sm text-gray-500 mt-0.5">{proc.descricao}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-gray-600">{proc.codigo || '-'}</td>
                      <td className="p-4 text-gray-600">{proc.especialidade || '-'}</td>
                      <td className="p-4 text-emerald-600 font-medium">{valorParticular}</td>
                      <td className="p-4 text-gray-600">{proc.duracao_minutos ? `${proc.duracao_minutos} min` : '-'}</td>
                      <td className="p-4">
                        <Badge 
                          variant="outline" 
                          className={proc.status === 'Ativo' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                          }
                        >
                          {proc.status || 'Ativo'}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4 text-gray-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenForm(proc)}>
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(proc.id)}
                              className="text-red-600"
                            >
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isFormOpen && (
        <FormularioProcedimento
          procedimento={selectedProcedimento}
          categorias={categorias}
          precosExistentes={tabelaPrecos.filter(p => p.procedimento_id === selectedProcedimento?.id)}
          onClose={handleCloseForm}
          onSave={handleSave}
        />
      )}
    </div>
  );
}