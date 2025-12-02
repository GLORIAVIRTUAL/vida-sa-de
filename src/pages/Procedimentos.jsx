import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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
        Procedimento.list(),
        CategoriaPreco.list(),
        TabelaPreco.list()
      ]);
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
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">Nome</th>
                  <th className="text-left p-3">Especialidade</th>
                  {categorias.map(cat => (
                    <th key={cat.id} className="text-left p-3">{cat.nome}</th>
                  ))}
                  <th className="text-left p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={categorias.length + 3} className="text-center p-6">Carregando...</td>
                  </tr>
                ) : filteredProcedimentos.map((proc) => (
                  <tr key={proc.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{proc.nome}</td>
                    <td className="p-3">{proc.especialidade}</td>
                    {categorias.map(cat => (
                      <td key={cat.id} className="p-3">{getPreco(proc.id, cat.id)}</td>
                    ))}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpenForm(proc)}>
                          Editar
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(proc.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
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