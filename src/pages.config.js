/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AgendamentoOnline from './pages/AgendamentoOnline';
import Agendamentos from './pages/Agendamentos';
import ApiIntegracoes from './pages/ApiIntegracoes';
import ApiTest from './pages/ApiTest';
import Atendimento from './pages/Atendimento';
import AuditoriaMedicos from './pages/AuditoriaMedicos';
import AuditoriaOS from './pages/AuditoriaOS';
import AuditoriaSeguranca from './pages/AuditoriaSeguranca';
import ChatbotDashboard from './pages/ChatbotDashboard';
import ChatbotGerenciamento from './pages/ChatbotGerenciamento';
import ChatbotPipeline from './pages/ChatbotPipeline';
import ChatbotsAtivos from './pages/ChatbotsAtivos';
import ConfiguracaoChatbot from './pages/ConfiguracaoChatbot';
import Dashboard from './pages/Dashboard';
import Debug from './pages/Debug';
import Diagnostico from './pages/Diagnostico';
import Exames from './pages/Exames';
import Financeiro from './pages/Financeiro';
import Home from './pages/Home';
import ImportadorDados from './pages/ImportadorDados';
import ImportarPacientes from './pages/ImportarPacientes';
import ImportarProcedimentos from './pages/ImportarProcedimentos';
import ImportarTurmas from './pages/ImportarTurmas';
import ImportarVendasCartao from './pages/ImportarVendasCartao';
import ListaContatos from './pages/ListaContatos';
import Medicos from './pages/Medicos';
import OrcamentoExames from './pages/OrcamentoExames';
import Pacientes from './pages/Pacientes';
import Performance from './pages/Performance';
import PortalMedico from './pages/PortalMedico';
import Procedimentos from './pages/Procedimentos';
import ProcessarRequisicao from './pages/ProcessarRequisicao';
import Relatorios from './pages/Relatorios';
import ResultadosExames from './pages/ResultadosExames';
import Turmas from './pages/Turmas';
import Usuarios from './pages/Usuarios';
import VendaCartao from './pages/VendaCartao';
import VerificacaoAssinatura from './pages/VerificacaoAssinatura';
import WebhookLogs from './pages/WebhookLogs';
import ordemServico from './pages/ordem-servico';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AgendamentoOnline": AgendamentoOnline,
    "Agendamentos": Agendamentos,
    "ApiIntegracoes": ApiIntegracoes,
    "ApiTest": ApiTest,
    "Atendimento": Atendimento,
    "AuditoriaMedicos": AuditoriaMedicos,
    "AuditoriaOS": AuditoriaOS,
    "AuditoriaSeguranca": AuditoriaSeguranca,
    "ChatbotDashboard": ChatbotDashboard,
    "ChatbotGerenciamento": ChatbotGerenciamento,
    "ChatbotPipeline": ChatbotPipeline,
    "ChatbotsAtivos": ChatbotsAtivos,
    "ConfiguracaoChatbot": ConfiguracaoChatbot,
    "Dashboard": Dashboard,
    "Debug": Debug,
    "Diagnostico": Diagnostico,
    "Exames": Exames,
    "Financeiro": Financeiro,
    "Home": Home,
    "ImportadorDados": ImportadorDados,
    "ImportarPacientes": ImportarPacientes,
    "ImportarProcedimentos": ImportarProcedimentos,
    "ImportarTurmas": ImportarTurmas,
    "ImportarVendasCartao": ImportarVendasCartao,
    "ListaContatos": ListaContatos,
    "Medicos": Medicos,
    "OrcamentoExames": OrcamentoExames,
    "Pacientes": Pacientes,
    "Performance": Performance,
    "PortalMedico": PortalMedico,
    "Procedimentos": Procedimentos,
    "ProcessarRequisicao": ProcessarRequisicao,
    "Relatorios": Relatorios,
    "ResultadosExames": ResultadosExames,
    "Turmas": Turmas,
    "Usuarios": Usuarios,
    "VendaCartao": VendaCartao,
    "VerificacaoAssinatura": VerificacaoAssinatura,
    "WebhookLogs": WebhookLogs,
    "ordem-servico": ordemServico,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};