import AgendamentoOnline from './pages/AgendamentoOnline';
import Agendamentos from './pages/Agendamentos';
import ApiIntegracoes from './pages/ApiIntegracoes';
import ApiTest from './pages/ApiTest';
import Atendimento from './pages/Atendimento';
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
import PortalMedico from './pages/PortalMedico';
import Procedimentos from './pages/Procedimentos';
import ProcessarRequisicao from './pages/ProcessarRequisicao';
import ResultadosExames from './pages/ResultadosExames';
import Turmas from './pages/Turmas';
import Usuarios from './pages/Usuarios';
import VendaCartao from './pages/VendaCartao';
import VerificacaoAssinatura from './pages/VerificacaoAssinatura';
import WebhookLogs from './pages/WebhookLogs';
import ordemServico from './pages/ordem-servico';
import Confirmacao from './pages/Confirmacao';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AgendamentoOnline": AgendamentoOnline,
    "Agendamentos": Agendamentos,
    "ApiIntegracoes": ApiIntegracoes,
    "ApiTest": ApiTest,
    "Atendimento": Atendimento,
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
    "PortalMedico": PortalMedico,
    "Procedimentos": Procedimentos,
    "ProcessarRequisicao": ProcessarRequisicao,
    "ResultadosExames": ResultadosExames,
    "Turmas": Turmas,
    "Usuarios": Usuarios,
    "VendaCartao": VendaCartao,
    "VerificacaoAssinatura": VerificacaoAssinatura,
    "WebhookLogs": WebhookLogs,
    "ordem-servico": ordemServico,
    "Confirmacao": Confirmacao,
}

export const pagesConfig = {
    mainPage: "AgendamentoOnline",
    Pages: PAGES,
    Layout: __Layout,
};