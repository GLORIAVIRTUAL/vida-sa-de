import Dashboard from './pages/Dashboard';
import Agendamentos from './pages/Agendamentos';
import Pacientes from './pages/Pacientes';
import Medicos from './pages/Medicos';
import Procedimentos from './pages/Procedimentos';
import Exames from './pages/Exames';
import Financeiro from './pages/Financeiro';
import PortalMedico from './pages/PortalMedico';
import Atendimento from './pages/Atendimento';
import Usuarios from './pages/Usuarios';
import ApiIntegracoes from './pages/ApiIntegracoes';
import ApiTest from './pages/ApiTest';
import ordemServico from './pages/ordem-servico';
import ProcessarRequisicao from './pages/ProcessarRequisicao';
import AgendamentoOnline from './pages/AgendamentoOnline';
import VerificacaoAssinatura from './pages/VerificacaoAssinatura';
import AuditoriaSeguranca from './pages/AuditoriaSeguranca';
import ImportadorDados from './pages/ImportadorDados';
import ImportarVendasCartao from './pages/ImportarVendasCartao';
import VendaCartao from './pages/VendaCartao';
import WebhookLogs from './pages/WebhookLogs';
import Turmas from './pages/Turmas';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Agendamentos": Agendamentos,
    "Pacientes": Pacientes,
    "Medicos": Medicos,
    "Procedimentos": Procedimentos,
    "Exames": Exames,
    "Financeiro": Financeiro,
    "PortalMedico": PortalMedico,
    "Atendimento": Atendimento,
    "Usuarios": Usuarios,
    "ApiIntegracoes": ApiIntegracoes,
    "ApiTest": ApiTest,
    "ordem-servico": ordemServico,
    "ProcessarRequisicao": ProcessarRequisicao,
    "AgendamentoOnline": AgendamentoOnline,
    "VerificacaoAssinatura": VerificacaoAssinatura,
    "AuditoriaSeguranca": AuditoriaSeguranca,
    "ImportadorDados": ImportadorDados,
    "ImportarVendasCartao": ImportarVendasCartao,
    "VendaCartao": VendaCartao,
    "WebhookLogs": WebhookLogs,
    "Turmas": Turmas,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};