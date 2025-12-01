import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <Card className="w-full max-w-lg shadow-lg border-red-200">
            <CardHeader className="bg-red-50 border-b border-red-100">
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-6 h-6" />
                Ops! Algo deu errado.
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-gray-700 mb-4">
                {(this.state.error?.toString().includes('insertBefore') || 
                  this.state.error?.toString().includes('Node') || 
                  this.state.error?.toString().includes('NotFound'))
                  ? "⚠️ ERRO DE TRADUÇÃO: Desative o Google Tradutor (ou extensões similares) e recarregue a página para corrigir." 
                  : "Ocorreu um erro inesperado na aplicação. Tente recarregar a página."}
              </p>
              
              {this.state.error && (
                <div className="bg-gray-100 p-3 rounded text-xs font-mono text-red-600 mb-4 overflow-auto max-h-40">
                  {this.state.error.toString()}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button onClick={() => window.history.back()} variant="outline">
                  Voltar
                </Button>
                <Button onClick={this.handleReload} className="bg-red-600 hover:bg-red-700">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Recarregar Página
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;