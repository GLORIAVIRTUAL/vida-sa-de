import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/entities/all";
      import { Loader2, User as UserIcon, Menu, LogOut, Calendar, BarChart3, Users, Stethoscope, DollarSign, FileText, Computer, AlertCircle, Edit, ClipboardList, Upload, MessageSquare, CreditCard, Activity, Wrench, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ProfileEditor from '../components/perfil/ProfileEditor';
import NotificacaoAgendamento from '../components/shared/NotificacaoAgendamento';
import ChatbotAjuda from '../components/shared/ChatbotAjuda';
import ErrorBoundary from '../components/shared/ErrorBoundary';

// Tela de Login
function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await User.login();
    } catch (err) {
      console.error("Erro ao tentar fazer login:", err);
      setError('Ocorreu um erro durante o login. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/696256b5ef59ea2bed1bd7ea/8ca927e40_Untitleddesign27.png" 
              alt="GLÓRIA CLÍNICA" 
              className="h-16 object-contain mx-auto mb-4" 
            />
            <h1 className="text-2xl font-bold text-gray-800 tracking-tight">GLÓRIA CLÍNICA</h1>
            <p className="text-gray-500">Sistema de Gestão Clínica</p>
          </div>
          
          <div className="space-y-4">
            <Button 
              size="lg"
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 text-lg font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Aguarde...
                </>
              ) : (
                'Acessar o Sistema'
              )}
            </Button>

            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription className="text-red-700">{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Layout Principal
function MainLayout({ children, currentPageName, currentUser, onUserUpdate }) {
        const [isSidebarOpen, setSidebarOpen] = useState(false);
        const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
        const [isProfileModalOpen, setProfileModalOpen] = useState(false);

  // Páginas que não devem mostrar o layout (menu lateral e header)
  const paginasSemLayout = ['Atendimento'];
  const mostrarLayout = !paginasSemLayout.includes(currentPageName);

  const handleLogout = async () => {
    try {
      await User.logout();
      window.location.reload();
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      window.localStorage.clear();
      window.location.reload();
    }
  };

  // Menu base para todos os usuários
  const menuBase = [
    { name: "Dashboard", page: "Dashboard", icon: BarChart3, roles: ["admin", "user"] },
    { name: "Agendamentos", page: "Agendamentos", icon: Calendar, roles: ["admin", "user"] },
    { name: "Turmas e Grupos", page: "Turmas", icon: Users, roles: ["admin", "user"] },
    { name: "Pacientes", page: "Pacientes", icon: Users, roles: ["admin", "user"] },
    { name: "Ordens de Serviço", page: "ordem-servico", icon: ClipboardList, roles: ["admin", "user"] },
        { name: "Glória", page: "ChatbotsAtivos", icon: MessageSquare, roles: ["admin", "user"], customLogo: true },
        { name: "Painel TV", page: "Atendimento", icon: Computer, roles: ["admin", "user"] },
    { name: "Portal do Médico", page: "PortalMedico", icon: Stethoscope, roles: ["medico"] },
    { name: "Médicos", page: "Medicos", icon: Stethoscope, roles: ["admin", "user"] },
    { name: "Procedimentos", page: "Procedimentos", icon: FileText, roles: ["admin", "user"] },
    { name: "Exames", page: "Exames", icon: FileText, roles: ["admin", "user"] },
    { name: "Resultados Exames", page: "ResultadosExames", icon: FileText, roles: ["admin", "user"] },
    { name: "Venda Cartão", page: "VendaCartao", icon: CreditCard, roles: ["admin", "user"] },
    { name: "Financeiro", page: "Financeiro", icon: DollarSign, roles: ["admin"] },
    { name: "Usuários", page: "Usuarios", icon: Users, roles: ["admin"] },
    
    { name: "CRM", url: "https://vidasaude.chatbotsystem.ai/w/pipeline-opportunities", icon: Users, roles: ["admin", "user"], external: true },
    
  ];

  const menuSistemaBase = [
    { name: "Logs de Webhook", page: "WebhookLogs", icon: Activity, roles: ["admin"] },
    { name: "Debug Usuário", page: "Debug", icon: Activity, roles: ["admin"] },
    { name: "Diagnóstico Dados", page: "Diagnostico", icon: Wrench, roles: ["admin"] },
    { name: "Importar Vendas Cartão", page: "ImportarVendasCartao", icon: CreditCard, roles: ["admin"] },
    { name: "Importador de Dados", page: "ImportadorDados", icon: Upload, roles: ["admin"] }, // NOVO: Página de importação
    { name: "API e Integrações", page: "ApiIntegracoes", icon: FileText, roles: ["admin"] },
    { name: "Teste de API", page: "ApiTest", icon: FileText, roles: ["admin"] },
    { name: "Verificação Assinatura", page: "VerificacaoAssinatura", icon: FileText, roles: ["admin"] },
    { name: "Auditoria Segurança", page: "AuditoriaSeguranca", icon: FileText, roles: ["admin"] }
  ];

  // Filtrar menus baseado no papel do usuário
  const userRole = currentUser?.app_role || currentUser?.role || "user";
  const menuPrincipal = menuBase.filter(item => item.roles.includes(userRole));
  const menuSistemaFiltrado = menuSistemaBase.filter(item => item.roles.includes(userRole));

  // Se for página sem layout, renderizar apenas o conteúdo
  if (!mostrarLayout) {
    return (
      <>
        {children}
        <NotificacaoAgendamento />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative fixed h-full z-20`}>
        <div className="h-16 flex items-center gap-2 border-b px-3 justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/696256b5ef59ea2bed1bd7ea/8ca927e40_Untitleddesign27.png" 
              alt="GLÓRIA CLÍNICA" 
              className="h-10 object-contain flex-shrink-0" 
            />
            {!isSidebarCollapsed && (
              <span className="font-semibold text-base text-gray-700 whitespace-nowrap">
                GLÓRIA CLÍNICA
              </span>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex h-8 w-8 flex-shrink-0"
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
        
        {/* Navegação com layout flexível */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Menu Principal */}
          <nav className="p-4 space-y-1">
            {menuPrincipal.map((item) => {
              // Se for link externo
              if (item.external) {
                return (
                  <a
                    key={item.name}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
                    onClick={() => setSidebarOpen(false)}
                    >
                    <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                    <span>{item.name}</span>
                    </a>
                );
              }
              
              // Link interno normal
              const isActive = currentPageName === item.page;
              return (
                <Link
                key={item.name}
                to={createPageUrl(item.page)}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => setSidebarOpen(false)}
                title={isSidebarCollapsed ? item.name : ''}
                >
                {item.customLogo ? (
                  <img 
                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/696256b5ef59ea2bed1bd7ea/bed877093_Untitleddesign14.png" 
                    alt="Glória Virtual" 
                    className={isSidebarCollapsed ? "h-6 object-contain" : "h-8 object-contain"}
                  />
                ) : (
                  <>
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
                    {!isSidebarCollapsed && <span>{item.name}</span>}
                  </>
                )}
                </Link>
              );
            })}
          </nav>
          
          {/* Espaço flexível para empurrar o menu do sistema para baixo */}
          <div className="flex-grow"></div>
          
          {/* Menu do Sistema - apenas se houver itens para mostrar */}
          {menuSistemaFiltrado.length > 0 && (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              {!isSidebarCollapsed && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
                  Sistema & Integrações
                </p>
              )}
              <div className="space-y-1">
                {menuSistemaFiltrado.map((item) => {
                  const isActive = currentPageName === item.page;
                  return (
                    <Link
                      key={item.name}
                      to={createPageUrl(item.page)}
                      className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? "bg-purple-100 text-purple-700"
                          : "text-gray-600 hover:bg-gray-100"
                      } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                      onClick={() => setSidebarOpen(false)}
                      title={isSidebarCollapsed ? item.name : ''}
                      >
                      <item.icon className={`w-4 h-4 flex-shrink-0 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
                      {!isSidebarCollapsed && <span>{item.name}</span>}
                      </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-6 sticky top-0 z-10">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <Menu className="w-6 h-6" />
          </Button>
          <div className="flex-1" />
          
          {currentUser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-3">
                  <UserIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">{currentUser.display_name || currentUser.full_name}</span>
                  <Badge className="ml-2">
                    {currentUser.app_role || currentUser.role}
                  </Badge>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{currentUser.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setProfileModalOpen(true)} className="cursor-pointer">
                  <Edit className="w-4 h-4 mr-2" />
                  Editar Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        
        <div className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
        
        <footer className="bg-white border-t p-3 text-center text-xs text-gray-500">
          <p>
            Sistema desenvolvido por <strong>Glória Virtual - Soluções com Inteligência Artificial</strong>
          </p>
          <p>
            <strong>gloriavirtual.com</strong> | CNPJ: 51.424.200/0001-02
          </p>
        </footer>
      </main>
      
      <ProfileEditor 
        user={currentUser}
        open={isProfileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onUpdate={onUserUpdate}
      />
      
      {/* Componente de notificação de agendamentos */}
      <NotificacaoAgendamento />
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPublicPage, setIsPublicPage] = useState(false);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const user = await User.me();
      setCurrentUser(user);
      console.log('Usuário carregado:', user);
    } catch (error) {
      console.log('Usuário não autenticado');
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Lista de páginas que devem ser públicas (sem necessidade de login)
    const publicPages = ['AgendamentoOnline'];
    
    if (publicPages.includes(currentPageName)) {
        setIsPublicPage(true);
        setLoading(false); // Não precisa carregar usuário para páginas públicas
    } else {
        setIsPublicPage(false);
        fetchUser();
    }
  }, [currentPageName, fetchUser]);

  // Redirecionamento automático para médicos
  useEffect(() => {
    if (currentUser && (currentUser.app_role === 'medico' || currentUser.role === 'medico') && currentPageName === 'Dashboard') {
      // Redirecionar médicos que tentam acessar o dashboard para o portal médico
      window.location.href = createPageUrl('PortalMedico');
    }
  }, [currentUser, currentPageName]);

  // Se é uma página pública, renderiza direto sem layout de login
  if (isPublicPage) {
    return (
      <>
        {children}
        <ChatbotAjuda />
      </>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }
  
  return (
    <>
      <MainLayout 
        currentUser={currentUser} 
        currentPageName={currentPageName}
        onUserUpdate={fetchUser}
      >
        {children}
      </MainLayout>
      {/* CORRIGIDO: Chatbot renderizado fora do MainLayout para funcionar em todas as páginas */}
      <ChatbotAjuda />
    </>
  );
}