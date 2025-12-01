import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";

export default function WebhookLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const { toast } = useToast();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Buscar logs ordenados por data de criação (desc)
      const data = await base44.entities.WebhookLog.list("-created_date", 50);
      setLogs(data);
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os logs.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Auto-refresh a cada 10 segundos para acompanhar testes
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleClearLogs = async () => {
    if (!confirm("Tem certeza que deseja limpar todos os logs?")) return;
    try {
      // Exclusão um por um (limitação atual para garantir segurança)
      // Idealmente seria um bulk delete no backend, mas faremos via loop simples aqui para poucos registros
      const promises = logs.map(log => base44.entities.WebhookLog.delete(log.id));
      await Promise.all(promises);
      toast({ title: "Logs limpos com sucesso!" });
      fetchLogs();
    } catch (error) {
      toast({ title: "Erro ao limpar logs", variant: "destructive" });
    }
  };

  const formatJson = (jsonString) => {
    try {
      if (!jsonString) return "Vazio";
      const obj = JSON.parse(jsonString);
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return jsonString; // Retorna como texto se não for JSON válido
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-8 h-8 text-blue-600" />
              Logs de Webhook
            </h1>
            <p className="text-gray-600">Monitoramento de requisições recebidas (Callback)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="destructive" onClick={handleClearLogs} disabled={loading || logs.length === 0}>
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhum log registrado ainda.</p>
                <p className="text-sm mt-1">Faça uma requisição para a URL de callback para ver os dados aqui.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <TableRow 
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleExpand(log.id)}
                      >
                        <TableCell className="font-medium">
                          {log.created_date ? format(new Date(log.created_date), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.endpoint}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={
                              log.status === "success" ? "bg-green-100 text-green-800" : 
                              log.status === "error" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                            }
                          >
                            {log.status === "success" ? "Sucesso" : log.status === "error" ? "Erro" : "Processando"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {expandedId === log.id ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                        </TableCell>
                      </TableRow>
                      {expandedId === log.id && (
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={4} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-sm font-semibold mb-2 text-gray-700">Payload Recebido (Body):</h4>
                                <pre className="bg-gray-900 text-gray-100 p-3 rounded-md text-xs overflow-x-auto">
                                  {formatJson(log.body)}
                                </pre>
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold mb-2 text-gray-700">Resposta Enviada:</h4>
                                <pre className="bg-white border text-gray-800 p-3 rounded-md text-xs overflow-x-auto">
                                  {formatJson(log.response_sent)}
                                </pre>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}