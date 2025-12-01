import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code, TestTube, Clock, User, Search, Database } from "lucide-react";
import { listMedicos } from "@/functions/listMedicos";
import { Medico } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function ApiTest() {
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [medicoInfo, setMedicoInfo] = useState(null);
  const [loadingMedico, setLoadingMedico] = useState(false);
  const [medicoId, setMedicoId] = useState(""); // Novo state para o ID digitado
  const [migrating, setMigrating] = useState(false);
  const { toast } = useToast();

  const handleMigration = async () => {
    setMigrating(true);
    try {
      const { data } = await base44.functions.invoke('migratePatientNames');
      console.log('Migração concluída:', data);
      toast({
        title: "Migração Concluída",
        description: `Atualizados: ${data.stats.atualizados}, Ignorados: ${data.stats.ignorados}, Erros: ${data.stats.erros}`,
        variant: "default"
      });
    } catch (err) {
      console.error('Erro na migração:', err);
      toast({
        title: "Erro na Migração",
        description: err.message || "Falha ao migrar nomes",
        variant: "destructive"
      });
    } finally {
      setMigrating(false);
    }
  };

  const handleTestClick = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);
    try {
      const result = await listMedicos();
      setResponse(result.data);
    } catch (err) {
      console.error("Erro ao chamar a função:", err);
      setError(err.response ? err.response.data : { message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const verificarMedico = async () => {
    if (!medicoId.trim()) {
      setError({ message: "Por favor, digite um ID de médico válido" });
      return;
    }

    setLoadingMedico(true);
    setMedicoInfo(null);
    setError(null);
    
    try {
      const medico = await Medico.get(medicoId.trim());
      
      if (medico) {
        setMedicoInfo(medico);
        console.log("Dados completos do médico:", medico);
      } else {
        setError({ message: "Médico não encontrado" });
      }
    } catch (err) {
      console.error("Erro ao buscar médico:", err);
      setError({ message: `Erro ao buscar médico: ${err.message}` });
    } finally {
      setLoadingMedico(false);
    }
  };

  const diasSemanaMap = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <TestTube className="w-8 h-8 text-blue-600" />
            Página de Teste da API
          </h1>
          <p className="text-gray-600 mt-1">
            Use esta página para testar funcionalidades e verificar dados específicos.
          </p>
        </div>

        <div className="grid gap-6">
          {/* Card de Migração */}
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <Database className="w-5 h-5" />
                Migração de Dados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-amber-800">
                Use este botão para preencher os nomes dos pacientes nos agendamentos antigos que estão sem nome.
              </p>
              <Button 
                onClick={handleMigration} 
                disabled={migrating}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {migrating ? "Migrando..." : "Migrar Nomes de Pacientes nos Agendamentos"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Testar a Função `listMedicos`</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Clique no botão abaixo para executar a função `listMedicos` diretamente do aplicativo.
              </p>
              <Button onClick={handleTestClick} disabled={loading}>
                {loading ? "Testando..." : "Testar Chamada da Função"}
              </Button>

              {response && (
                <div className="mt-4">
                  <h3 className="font-semibold text-green-700">Sucesso! Resposta da Função:</h3>
                  <pre className="bg-gray-900 text-white p-4 rounded-md mt-2 text-sm overflow-auto">
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </div>
              )}

              {error && (
                <div className="mt-4">
                  <h3 className="font-semibold text-red-700">Erro! A função retornou um erro:</h3>
                  <pre className="bg-red-50 text-red-900 p-4 rounded-md mt-2 text-sm overflow-auto">
                    {JSON.stringify(error, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Verificar Médico Específico
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="medicoId">ID do Médico</Label>
                <div className="flex gap-3">
                  <Input
                    id="medicoId"
                    placeholder="Digite o ID do médico (ex: 68baf44b4a24efbd721933c6)"
                    value={medicoId}
                    onChange={(e) => setMedicoId(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={verificarMedico} 
                    disabled={loadingMedico || !medicoId.trim()}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {loadingMedico ? "Carregando..." : "Pesquisar"}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Digite o ID completo do médico que você quer verificar
                </p>
              </div>

              {medicoInfo && (
                <div className="mt-4">
                  <h3 className="font-semibold text-blue-700 mb-4">Informações do Médico:</h3>
                  
                  <div className="bg-blue-50 p-4 rounded-md space-y-3">
                    <div><strong>ID:</strong> {medicoInfo.id}</div>
                    <div><strong>Nome:</strong> {medicoInfo.nome}</div>
                    <div><strong>CRM:</strong> {medicoInfo.crm}</div>
                    <div><strong>Especialidade:</strong> {medicoInfo.especialidade}</div>
                    <div><strong>Status:</strong> {medicoInfo.status}</div>
                    <div><strong>Tipo de Atendimento:</strong> {medicoInfo.tipo_atendimento || "Horários Marcados"}</div>
                    <div><strong>Tempo de Consulta:</strong> {medicoInfo.tempo_consulta_minutos || 30} minutos</div>
                    
                    {medicoInfo.tipo_atendimento === "Ordem de Chegada" && (
                      <div><strong>Limite Ordem de Chegada:</strong> {medicoInfo.limite_ordem_chegada || 1} pacientes</div>
                    )}
                  </div>

                  <div className="bg-green-50 p-4 rounded-md mt-4">
                    <h4 className="font-semibold text-green-800 mb-3">Horários de Atendimento:</h4>
                    {medicoInfo.horarios_atendimento && Array.isArray(medicoInfo.horarios_atendimento) && medicoInfo.horarios_atendimento.length > 0 ? (
                      <div className="space-y-2">
                        {medicoInfo.horarios_atendimento.map((horario, index) => (
                          <div key={index} className="bg-white p-3 rounded border border-green-200">
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <strong>Dia:</strong> {diasSemanaMap[horario.dia_semana] || `Dia ${horario.dia_semana}`}
                              </div>
                              <div>
                                <strong>Início:</strong> {horario.horario_inicio}
                              </div>
                              <div>
                                <strong>Fim:</strong> {horario.horario_fim}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-red-600">❌ Nenhum horário de atendimento configurado!</p>
                    )}
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer font-semibold">Ver dados completos (JSON)</summary>
                    <pre className="bg-gray-900 text-white p-4 rounded-md mt-2 text-sm overflow-auto">
                      {JSON.stringify(medicoInfo, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}