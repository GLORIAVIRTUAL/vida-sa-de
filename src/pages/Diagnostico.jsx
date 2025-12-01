import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle, Wrench } from "lucide-react";

export default function DiagnosticoPage() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);

  const runDiagnostic = async (fix = false) => {
    if (fix) setFixing(true);
    else setLoading(true);

    try {
      const response = await base44.functions.invoke('checkConsistency', { fix });
      setResult(response.data);
    } catch (error) {
      console.error("Erro:", error);
      setResult({ error: error.message });
    } finally {
      setLoading(false);
      setFixing(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-6 h-6 text-blue-600" />
            Diagnóstico de Integridade de Dados
          </CardTitle>
          <CardDescription>
            Verifica se existem agendamentos apontando para médicos ou pacientes que foram excluídos,
            o que pode causar travamentos (tela branca) na agenda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <Button onClick={() => runDiagnostic(false)} disabled={loading || fixing}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
              Verificar Problemas
            </Button>

            {result?.issues_found > 0 && (
              <Button 
                onClick={() => runDiagnostic(true)} 
                disabled={loading || fixing}
                variant="destructive"
              >
                {fixing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Corrigir Automaticamente
              </Button>
            )}
          </div>

          {result && (
            <div className="space-y-4">
              {result.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Erro na execução</AlertTitle>
                  <AlertDescription>{result.error}</AlertDescription>
                </Alert>
              ) : (
                <>
                   <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-gray-100 p-3 rounded text-center">
                        <p className="text-sm text-gray-500">Agendamentos Verificados</p>
                        <p className="text-xl font-bold">{result.total_agendamentos_verificados}</p>
                      </div>
                      <div className="bg-gray-100 p-3 rounded text-center">
                        <p className="text-sm text-gray-500">Médicos Ativos</p>
                        <p className="text-xl font-bold">{result.total_medicos_db}</p>
                      </div>
                      <div className="bg-gray-100 p-3 rounded text-center">
                        <p className="text-sm text-gray-500">Problemas Encontrados</p>
                        <p className={`text-xl font-bold ${result.issues_found > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {result.issues_found}
                        </p>
                      </div>
                   </div>

                   {result.fixed && (
                     <Alert className="bg-green-50 border-green-200 mb-4">
                       <CheckCircle className="w-4 h-4 text-green-600" />
                       <AlertTitle className="text-green-800">Correção Realizada</AlertTitle>
                       <AlertDescription className="text-green-700">
                         Foram corrigidos {result.fixed_ids?.length} agendamentos. Tente acessar a agenda novamente.
                       </AlertDescription>
                     </Alert>
                   )}

                   {result.issues_found === 0 && !result.fixed && (
                     <Alert className="bg-green-50 border-green-200">
                       <CheckCircle className="w-4 h-4 text-green-600" />
                       <AlertTitle className="text-green-800">Tudo certo!</AlertTitle>
                       <AlertDescription className="text-green-700">
                         Nenhum agendamento órfão foi encontrado nos últimos 500 registros.
                       </AlertDescription>
                     </Alert>
                   )}

                   {result.issues?.length > 0 && (
                     <div className="border rounded-md overflow-hidden">
                       <table className="min-w-full divide-y divide-gray-200">
                         <thead className="bg-gray-50">
                           <tr>
                             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Horário</th>
                             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Problema</th>
                             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Agendamento</th>
                           </tr>
                         </thead>
                         <tbody className="bg-white divide-y divide-gray-200">
                           {result.issues.map((issue, idx) => (
                             <tr key={idx}>
                               <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                 {issue.data} às {issue.horario}
                               </td>
                               <td className="px-6 py-4 text-sm text-red-600">
                                 {issue.description}
                               </td>
                               <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                 {issue.agendamento_id}
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}