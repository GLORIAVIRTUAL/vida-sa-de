
import React, { useState } from "react";
import { Paciente } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Loader2, User, Phone, MapPin, Edit, Trash2, AlertCircle, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from 'date-fns';

import ProtectedRoute from "../components/auth/ProtectedRoute";
import FormularioPaciente from "../components/pacientes/FormularioPaciente";
import ConfirmacaoExclusao from "../components/shared/ConfirmacaoExclusao";

const prioridadeColors = {
  "Normal": "bg-gray-100 text-gray-700",
  "Idoso (60+ anos)": "bg-blue-100 text-blue-700",
  "Deficiente Físico": "bg-purple-100 text-purple-700",
  "Gestante": "bg-pink-100 text-pink-700",
  "Lactante": "bg-green-100 text-green-700",
  "Criança de Colo": "bg-orange-100 text-orange-700",
  "Pessoa com Criança de Colo": "bg-red-100 text-red-700"
};

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState(null);
  const [erro, setErro] = useState(null);
  const [totalCarregados, setTotalCarregados] = useState(0);

  const buscarPacientes = async () => {
    const termo = searchTerm.trim().toLowerCase();
    
    if (termo.length < 2) {
      setErro("Digite pelo menos 2 caracteres para buscar");
      setPacientes([]);
      return;
    }

    setLoading(true);
    setErro(null);
    
    try {
      console.log(`🔍 Buscando pacientes com termo: "${termo}"`);
      
      // Buscar em lotes de 10.000 (limite máximo da API)
      let todosPacientes = [];
      let offset = 0;
      const limite = 10000;
      let temMais = true;
      
      while (temMais) {
        console.log(`📥 Carregando lote a partir de offset ${offset}...`);
        const lote = await Paciente.list('nome', limite, offset);
        const loteArray = Array.isArray(lote) ? lote : [];
        
        if (loteArray.length === 0) {
          temMais = false;
        } else {
          todosPacientes = [...todosPacientes, ...loteArray];
          
          if (loteArray.length < limite) {
            temMais = false;
          } else {
            offset += limite;
          }
        }
      }
      
      setTotalCarregados(todosPacientes.length);
      console.log(`📥 Total carregado: ${todosPacientes.length} pacientes`);
      
      // Filtrar no frontend
      const termoSemAcentos = termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const resultados = todosPacientes.filter(paciente => {
        if (!paciente || !paciente.nome) return false;
        
        const nome = paciente.nome.toLowerCase();
        const nomeNormalizado = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const cpf = (paciente.cpf || '').replace(/\D/g, '');
        const telefone = (paciente.telefone || '').replace(/\D/g, '');
        const email = (paciente.email || '').toLowerCase();
        
        const termoNumeros = termo.replace(/\D/g, '');
        
        if (nome.startsWith(termo) || nomeNormalizado.startsWith(termoSemAcentos)) {
          return true;
        }
        
        if (nome.includes(termo) || nomeNormalizado.includes(termoSemAcentos)) {
          return true;
        }
        
        if (termoNumeros && (cpf.includes(termoNumeros) || telefone.includes(termoNumeros))) {
          return true;
        }
        
        if (email.includes(termo)) {
          return true;
        }
        
        return false;
      });
      
      resultados.sort((a, b) => {
        const nomeA = (a.nome || '').toLowerCase();
        const nomeB = (b.nome || '').toLowerCase();
        
        const aComeca = nomeA.startsWith(termo);
        const bComeca = nomeB.startsWith(termo);
        
        if (aComeca && !bComeca) return -1;
        if (!aComeca && bComeca) return 1;
        
        return nomeA.localeCompare(nomeB, 'pt-BR');
      });
      
      setPacientes(resultados);
      console.log(`✅ Encontrados ${resultados.length} pacientes que correspondem à busca`);
      
      if (resultados.length === 0) {
        setErro(`Nenhum paciente encontrado com "${termo}". Todos os ${todosPacientes.length} pacientes foram verificados.`);
      }
      
    } catch (error) {
      console.error("❌ Erro ao buscar:", error);
      setErro(`Erro ao buscar pacientes: ${error.message}`);
      setPacientes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      buscarPacientes();
    }
  };

  const handleSave = async (data) => {
    try {
      if (selectedPaciente) {
        await Paciente.update(selectedPaciente.id, data);
      } else {
        await Paciente.create(data);
      }
      setIsFormOpen(false);
      setSelectedPaciente(null);
      if (searchTerm.trim().length >= 2) {
        await buscarPacientes();
      }
    } catch (error) {
      console.error("Erro ao salvar:", error);
      throw error;
    }
  };

  const handleDelete = async (id) => {
    try {
      await Paciente.delete(id);
      setPacientes(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error("Erro ao deletar:", error);
      alert("Erro ao deletar paciente");
    }
  };

  // NOVA FUNÇÃO: Verificar se é Cartão Mais Vida
  const isCartaoMaisVida = (convenio) => {
    return convenio && convenio.toLowerCase().includes('cartão mais vida');
  };

  const calcularIdade = (dataNascimento) => {
    if (!dataNascimento) return null;
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }
    return idade;
  };

  const handleImprimirPaciente = (paciente) => {
    const idade = calcularIdade(paciente.data_nascimento);
    const cartaoVerde = isCartaoMaisVida(paciente.convenio);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Cadastro do Paciente - ${paciente.nome}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 40px;
            color: #333;
          }
          .header { 
            display: flex; 
            align-items: center; 
            border-bottom: 3px solid #4338ca; 
            padding-bottom: 20px; 
            margin-bottom: 30px;
          }
          .logo { 
            width: 80px; 
            height: 80px; 
            margin-right: 20px; 
          }
          .clinic-info { 
            flex: 1; 
          }
          .clinic-name { 
            font-size: 28px; 
            font-weight: bold; 
            color: #4338ca; 
          }
          .clinic-details { 
            font-size: 14px; 
            color: #666; 
            margin-top: 5px; 
          }
          .document-title { 
            text-align: center; 
            font-size: 24px; 
            font-weight: bold; 
            margin: 30px 0; 
            color: #4338ca; 
          }
          .section { 
            margin-bottom: 30px; 
            page-break-inside: avoid;
          }
          .section-title { 
            font-size: 18px; 
            font-weight: bold; 
            color: #4338ca; 
            border-bottom: 2px solid #e5e7eb; 
            padding-bottom: 8px; 
            margin-bottom: 15px;
          }
          .info-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 15px; 
          }
          .info-item { 
            padding: 10px; 
            background-color: #f9fafb; 
            border-radius: 6px;
          }
          .info-label { 
            font-weight: bold; 
            color: #4b5563; 
            font-size: 12px; 
            text-transform: uppercase; 
            margin-bottom: 4px;
          }
          .info-value { 
            font-size: 15px; 
            color: #111827;
          }
          .badge { 
            display: inline-block; 
            padding: 4px 12px; 
            border-radius: 4px; 
            font-size: 13px; 
            font-weight: 500;
          }
          .badge-priority { 
            background-color: #fef3c7; 
            color: #92400e; 
            border: 1px solid #fcd34d;
          }
          .badge-green { 
            background-color: #d1fae5; 
            color: #065f46; 
            border: 2px solid #10b981;
            font-weight: bold;
          }
          .observacoes-box { 
            background-color: #eff6ff; 
            border-left: 4px solid #3b82f6; 
            padding: 15px; 
            border-radius: 6px; 
            margin-top: 10px;
          }
          .footer { 
            margin-top: 50px; 
            text-align: center; 
            color: #64748b; 
            font-size: 12px; 
            border-top: 1px solid #e5e7eb; 
            padding-top: 20px;
          }
          .empty-value {
            color: #9ca3af;
            font-style: italic;
          }
          @media print {
            body { margin: 20px; }
            .header { page-break-after: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo Centro Vida Saúde" class="logo">
          <div class="clinic-info">
            <div class="clinic-name">CENTRO VIDA SAÚDE</div>
            <div class="clinic-details">
              Sistema de Gestão Clínica<br>
              CNPJ: 51.424.200/0001-02
            </div>
          </div>
        </div>

        <div class="document-title">📋 CADASTRO DO PACIENTE</div>

        <!-- Dados Pessoais -->
        <div class="section">
          <div class="section-title">👤 Dados Pessoais</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Nome Completo</div>
              <div class="info-value">${paciente.nome}</div>
            </div>
            <div class="info-item">
              <div class="info-label">CPF</div>
              <div class="info-value">${paciente.cpf || '<span class="empty-value">Não informado</span>'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">RG</div>
              <div class="info-value">${paciente.rg || '<span class="empty-value">Não informado</span>'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Data de Nascimento / Idade</div>
              <div class="info-value">
                ${paciente.data_nascimento ? format(new Date(paciente.data_nascimento), "dd/MM/yyyy") : '<span class="empty-value">Não informado</span>'}
                ${paciente.data_nascimento ? ` <span style="color: #6b7280;">(${idade} anos)</span>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Contato -->
        <div class="section">
          <div class="section-title">📞 Informações de Contato</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Telefone Principal</div>
              <div class="info-value">${paciente.telefone}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Telefone Secundário</div>
              <div class="info-value">${paciente.telefone_secundario || '<span class="empty-value">Não informado</span>'}</div>
            </div>
            <div class="info-item" style="grid-column: 1 / -1;">
              <div class="info-label">Email</div>
              <div class="info-value">${paciente.email || '<span class="empty-value">Não informado</span>'}</div>
            </div>
          </div>
        </div>

        <!-- Endereço -->
        <div class="section">
          <div class="section-title">🏠 Endereço</div>
          ${paciente.endereco && (paciente.endereco.logradouro || paciente.endereco.cidade) ? `
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">CEP</div>
                <div class="info-value">${paciente.endereco.cep || '<span class="empty-value">-</span>'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Logradouro</div>
                <div class="info-value">${paciente.endereco.logradouro || '<span class="empty-value">-</span>'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Número</div>
                <div class="info-value">${paciente.endereco.numero || '<span class="empty-value">-</span>'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Complemento</div>
                <div class="info-value">${paciente.endereco.complemento || '<span class="empty-value">-</span>'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Bairro</div>
                <div class="info-value">${paciente.endereco.bairro || '<span class="empty-value">-</span>'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Cidade / Estado</div>
                <div class="info-value">${paciente.endereco.cidade || '<span class="empty-value">-</span>'} / ${paciente.endereco.estado || '<span class="empty-value">-</span>'}</div>
              </div>
            </div>
          ` : '<p class="empty-value">Endereço não cadastrado</p>'}
        </div>

        <!-- Convênio e Prioridade -->
        <div class="section">
          <div class="section-title">🏥 Informações de Atendimento</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Convênio</div>
              <div class="info-value">
                ${cartaoVerde ? '<span class="badge badge-green">💳 ' + paciente.convenio + '</span>' : paciente.convenio || 'Particular'}
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">Número da Carteira</div>
              <div class="info-value">${paciente.numero_carteira || '<span class="empty-value">Não informado</span>'}</div>
            </div>
            <div class="info-item" style="grid-column: 1 / -1;">
              <div class="info-label">Prioridade</div>
              <div class="info-value">
                ${paciente.prioridade && paciente.prioridade !== 'Normal' ? 
                  '<span class="badge badge-priority">⚠️ ' + paciente.prioridade + '</span>' : 
                  'Normal'}
              </div>
            </div>
          </div>
        </div>

        <!-- Marketing -->
        ${paciente.como_conheceu ? `
        <div class="section">
          <div class="section-title">📢 Como Conheceu a Clínica</div>
          <div class="info-grid">
            <div class="info-item" style="grid-column: 1 / -1;">
              <div class="info-label">Origem</div>
              <div class="info-value">${paciente.como_conheceu}</div>
              ${paciente.como_conheceu_outro ? `<div class="info-value" style="margin-top: 5px; font-style: italic;">Detalhes: ${paciente.como_conheceu_outro}</div>` : ''}
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Observações -->
        ${paciente.observacoes ? `
        <div class="section">
          <div class="section-title">📝 Observações</div>
          <div class="observacoes-box">
            ${paciente.observacoes}
          </div>
        </div>
        ` : ''}

        <!-- Data de Cadastro -->
        <div class="section">
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Data de Cadastro</div>
              <div class="info-value">${format(new Date(paciente.created_date), "dd/MM/yyyy 'às' HH:mm")}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Última Atualização</div>
              <div class="info-value">${format(new Date(paciente.updated_date || paciente.created_date), "dd/MM/yyyy 'às' HH:mm")}</div>
            </div>
          </div>
        </div>

        <div class="footer">
          <p><strong>Centro Vida Saúde</strong> - Cuidando de você com excelência</p>
          <p>Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <ProtectedRoute requiredRole={["admin", "user"]}>
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Pacientes</h1>
              <p className="text-gray-600">
                {pacientes.length > 0 
                  ? `${pacientes.length} paciente${pacientes.length !== 1 ? 's' : ''} encontrado${pacientes.length !== 1 ? 's' : ''}`
                  : 'Digite pelo menos 2 caracteres para buscar'}
              </p>
              {totalCarregados > 0 && (
                <p className="text-sm text-gray-500">
                  (Verificados todos os {totalCarregados} pacientes cadastrados)
                </p>
              )}
            </div>
            <Button 
              onClick={() => { setSelectedPaciente(null); setIsFormOpen(true); }} 
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Paciente
            </Button>
          </div>

          {/* Busca */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    placeholder="🔍 Digite nome, CPF, telefone ou email (mínimo 2 caracteres)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="pl-10"
                    autoFocus
                  />
                </div>
                <Button 
                  onClick={buscarPacientes}
                  disabled={loading || searchTerm.trim().length < 2}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>
              
              <div className="mt-3 text-sm text-gray-600 space-y-1">
                <p>💡 <strong>Dica:</strong> A busca funciona com qualquer parte do nome, CPF ou telefone</p>
                <p>📌 Exemplo: "João", "Silva", "12345", "(11) 9"...</p>
                <p>✅ <strong>A busca verifica TODOS os pacientes cadastrados no sistema</strong></p>
              </div>
            </CardContent>
          </Card>

          {/* Erro */}
          {erro && (
            <Alert className="mb-6 border-amber-200 bg-amber-50">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <AlertDescription className="text-amber-800">
                {erro}
              </AlertDescription>
            </Alert>
          )}

          {/* Lista de Resultados */}
          {!loading && pacientes.length > 0 && (
            <div className="grid gap-4">
              {pacientes.map((paciente) => {
                const cartaoVerde = isCartaoMaisVida(paciente.convenio);
                
                return (
                  <Card 
                    key={paciente.id} 
                    className={`hover:shadow-md transition-shadow ${
                      cartaoVerde ? 'border-2 border-green-500 bg-green-50' : ''
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className={`font-semibold text-lg ${
                              cartaoVerde ? 'text-green-800' : 'text-gray-900'
                            }`}>
                              {paciente.nome}
                            </h3>
                            {paciente.prioridade && paciente.prioridade !== 'Normal' && (
                              <Badge className={`text-xs ${prioridadeColors[paciente.prioridade]}`}>
                                {paciente.prioridade}
                              </Badge>
                            )}
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                cartaoVerde 
                                  ? 'bg-green-100 text-green-800 border-green-300 font-semibold' 
                                  : ''
                              }`}
                            >
                              {cartaoVerde && '💳 '}
                              {paciente.convenio || 'Particular'}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <User className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{paciente.cpf || 'CPF não informado'}</span>
                            </div>
                            
                            {paciente.telefone && (
                              <div className="flex items-center gap-1">
                                <Phone className="w-4 h-4 flex-shrink-0" />
                                <span>{paciente.telefone}</span>
                              </div>
                            )}
                            
                            {paciente.endereco?.cidade && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                <span>{paciente.endereco.cidade}, {paciente.endereco.estado}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleImprimirPaciente(paciente)}
                            className="text-purple-600 border-purple-200 hover:bg-purple-50"
                            title="Imprimir cadastro completo"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedPaciente(paciente); setIsFormOpen(true); }}
                            className={
                              cartaoVerde 
                                ? 'text-green-700 border-green-300 hover:bg-green-100' 
                                : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                            }
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          
                          <ConfirmacaoExclusao
                            titulo="Excluir Paciente"
                            mensagem={`Tem certeza que deseja excluir o paciente "${paciente.nome}"?`}
                            onConfirm={() => handleDelete(paciente.id)}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </ConfirmacaoExclusao>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
              <p className="text-gray-600">Carregando pacientes...</p>
              <p className="text-sm text-gray-500">Isso pode levar alguns segundos</p>
            </div>
          )}

          {/* Formulário */}
          {isFormOpen && (
            <FormularioPaciente
              paciente={selectedPaciente}
              onSalvar={handleSave}
              onCancelar={() => {
                setIsFormOpen(false);
                setSelectedPaciente(null);
              }}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
