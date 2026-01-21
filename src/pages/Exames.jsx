import React, { useState, useEffect } from "react";
import { Exame } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

import FormularioExame from "../components/exames/FormularioExame";
import ConfirmacaoExclusao from "../components/shared/ConfirmacaoExclusao"; // New import

const statusColors = {
  "Ativo": "bg-green-100 text-green-800 border-green-200",
  "Inativo": "bg-red-100 text-red-800 border-red-200",
};

export default function Exames() {
  const [exames, setExames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const [exameParaExcluir, setExameParaExcluir] = useState(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const data = await Exame.list("-created_date");
      setExames(data);
    } catch (error) {
      console.error("Erro ao carregar exames:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async (dados) => {
    try {
      if (selecionado) {
        await Exame.update(selecionado.id, dados);
      } else {
        await Exame.create(dados);
      }
      setMostrarForm(false);
      setSelecionado(null);
      carregarDados();
    } catch (error) {
      console.error("Erro ao salvar exame:", error);
    }
  };

  const handleEditar = (item) => {
    setSelecionado(item);
    setMostrarForm(true);
  };

  const handleExcluir = async () => {
    if (!exameParaExcluir) return;
    
    try {
      await Exame.delete(exameParaExcluir.id);
      setExameParaExcluir(null); // Clear the item after deletion
      carregarDados();
    } catch (error) {
      console.error("Erro ao excluir exame:", error);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Exames Laboratoriais</h1>
            <p className="text-gray-600 mt-1">Gerencie os exames disponíveis</p>
          </div>
          <Button onClick={() => { setSelecionado(null); setMostrarForm(true); }} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Novo Exame
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle>Lista de Exames</CardTitle>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Laboratório</TableHead>
                  <TableHead>Valor Particular</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  exames
                    .filter(item => item.nome?.toLowerCase().includes(busca.toLowerCase()))
                    .map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.nome}</TableCell>
                      <TableCell>{item.tipo}</TableCell>
                      <TableCell>{item.laboratorio_parceiro}</TableCell>
                      <TableCell>R$ {item.valor_particular?.toFixed(2)}</TableCell>
                      <TableCell><Badge className={`${statusColors[item.status]} border`}>{item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" onClick={() => handleEditar(item)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => setExameParaExcluir(item)} className="text-red-600 hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {mostrarForm && (
          <FormularioExame
            exame={selecionado}
            onSalvar={handleSalvar}
            onCancelar={() => { setMostrarForm(false); setSelecionado(null); }}
          />
        )}

        <ConfirmacaoExclusao
          aberto={!!exameParaExcluir}
          titulo="Excluir Exame"
          mensagem={`Tem certeza que deseja excluir o exame "${exameParaExcluir?.nome}"? Esta ação não pode ser desfeita.`}
          onConfirmar={handleExcluir}
          onCancelar={() => setExameParaExcluir(null)}
        />
      </div>
    </div>
  );
}