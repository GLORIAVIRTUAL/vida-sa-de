import AgendamentoOnline from './pages/AgendamentoOnline';
import Agendamentos from './pages/Agendamentos';
import ApiIntegracoes from './pages/ApiIntegracoes';
import ApiTest from './pages/ApiTest';
import Atendimento from './pages/Atendimento';
import AuditoriaSeguranca from './pages/AuditoriaSeguranca';
import ChatbotGerenciamento from './pages/ChatbotGerenciamento';
import ChatbotsAtivos from './pages/ChatbotsAtivos';
import Dashboard from './pages/Dashboard';
import Debug from './pages/Debug';
import Diagnostico from './pages/Diagnostico';
import Exames from './pages/Exames';
import Financeiro from './pages/Financeiro';
import Home from './pages/Home';
import ImportadorDados from './pages/ImportadorDados';
import ImportarVendasCartao from './pages/ImportarVendasCartao';
import Medicos from './pages/Medicos';
import OrcamentoExames from './pages/OrcamentoExames';
import Pacientes from './pages/Pacientes';
import PortalMedico from './pages/PortalMedico';
import Procedimentos from './pages/Procedimentos';
import ProcessarRequisicao from './pages/ProcessarRequisicao';
import Turmas from './pages/Turmas';
import Usuarios from './pages/Usuarios';
import VendaCartao from './pages/VendaCartao';
import VerificacaoAssinatura from './pages/VerificacaoAssinatura';
import WebhookLogs from './pages/WebhookLogs';
import ordemServico from './pages/ordem-servico';
import ConfiguracaoChatbot from './pages/ConfiguracaoChatbot';
import ChatbotDashboard from './pages/ChatbotDashboard';
import ChatbotPipeline from './pages/ChatbotPipeline';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AgendamentoOnline": AgendamentoOnline,
    "Agendamentos": Agendamentos,
    "ApiIntegracoes": ApiIntegracoes,
    "ApiTest": ApiTest,
    "Atendimento": Atendimento,
    "AuditoriaSeguranca": AuditoriaSeguranca,
    "ChatbotGerenciamento": ChatbotGerenciamento,
    "ChatbotsAtivos": ChatbotsAtivos,
    "Dashboard": Dashboard,
    "Debug": Debug,
    "Diagnostico": Diagnostico,
    "Exames": Exames,
    "Financeiro": Financeiro,
    "Home": Home,
    "ImportadorDados": ImportadorDados,
    "ImportarVendasCartao": ImportarVendasCartao,
    "Medicos": Medicos,
    "OrcamentoExames": OrcamentoExames,
    "Pacientes": Pacientes,
    "PortalMedico": PortalMedico,
    "Procedimentos": Procedimentos,
    "ProcessarRequisicao": ProcessarRequisicao,
    "Turmas": Turmas,
    "Usuarios": Usuarios,
    "VendaCartao": VendaCartao,
    "VerificacaoAssinatura": VerificacaoAssinatura,
    "WebhookLogs": WebhookLogs,
    "ordem-servico": ordemServico,
    "ConfiguracaoChatbot": ConfiguracaoChatbot,
    "ChatbotDashboard": ChatbotDashboard,
    "ChatbotPipeline": ChatbotPipeline,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};