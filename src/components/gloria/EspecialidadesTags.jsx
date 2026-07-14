import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Stethoscope, Check, ChevronDown } from 'lucide-react';

// Lista de referência ampla de especialidades médicas/serviços de saúde
const ESPECIALIDADES_REFERENCIA = [
  'Acupuntura', 'Alergologia', 'Anestesiologia', 'Angiologia', 'Cardiologia',
  'Cirurgia Geral', 'Cirurgia Plástica', 'Cirurgia Vascular', 'Clínico Geral',
  'Colonoscopia', 'Dermatologia', 'Ecografia', 'Endocrinologia', 'Endoscopia',
  'Espirometria', 'Fisioterapeuta', 'Fonoaudiologia', 'Holter', 'Teste Ergométrico',
  'Vascular',
  'Gastroenterologia', 'Geriatria', 'Ginecologia', 'Hematologia', 'Hidroginástica',
  'Hidroterapia', 'Infectologia', 'Mastologia', 'Massoterapia', 'Nefrologia',
  'Natação', 'Neurologia', 'Neuropediatra', 'Nutricionista', 'Obstetrícia',
  'Odontologia', 'Oftalmologia', 'Oncologia', 'Optometrista', 'Ortopedia',
  'Otorrinolaringologia', 'Pediatria', 'Pilates', 'Pneumologia', 'Proctologia',
  'Psicologia', 'Psicopedagoga', 'Psiquiatria', 'Quiropraxia', 'Reumatologia',
  'Traumatologia', 'Urologia'
];

const normalizar = (s) => (s || '').toString().trim().toLowerCase();

// Serviços que a clínica oferece mesmo sem médico ativo cadastrado com a especialidade
const ESPECIALIDADES_FIXAS_CLINICA = ['Ecografia', 'Vascular', 'Teste Ergométrico', 'Espirometria', 'Endoscopia', 'Colonoscopia', 'Holter'];

export default function EspecialidadesTags({ contato, onAdicionarTag }) {
  const [aberto, setAberto] = React.useState(false);
  const { data: medicos = [], isLoading } = useQuery({
    queryKey: ['medicos_especialidades_chat'],
    queryFn: async () => base44.entities.Medico.filter({ status: 'Ativo' }),
    staleTime: 300000,
  });

  // Conjunto de especialidades que a clínica realmente tem (de médicos ativos)
  const especialidadesNaClinica = React.useMemo(() => {
    const set = new Set();
    medicos.forEach((m) => {
      if (m.especialidade) set.add(normalizar(m.especialidade));
      (m.especialidades || []).forEach((e) => set.add(normalizar(e)));
    });
    ESPECIALIDADES_FIXAS_CLINICA.forEach((e) => set.add(normalizar(e)));
    return set;
  }, [medicos]);

  // Mesclar referência + especialidades extras encontradas nos médicos
  const todasEspecialidades = React.useMemo(() => {
    const mapa = new Map();
    ESPECIALIDADES_REFERENCIA.forEach((e) => mapa.set(normalizar(e), e));
    medicos.forEach((m) => {
      const adicionar = (e) => {
        if (e && !mapa.has(normalizar(e))) mapa.set(normalizar(e), e);
      };
      adicionar(m.especialidade);
      (m.especialidades || []).forEach(adicionar);
    });
    return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [medicos]);

  const tagsAtuais = React.useMemo(
    () => (contato?.tags || []).map(normalizar),
    [contato?.tags]
  );

  return (
    <div className="rounded-lg border bg-white px-3 py-2 max-w-xl">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1 w-full"
      >
        <Stethoscope className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[11px] font-semibold text-gray-600">Especialidades (clique p/ adicionar tag)</span>
        {aberto && (
          <span className="ml-auto flex items-center gap-2 text-[9px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Tem</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Não tem</span>
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''} ${aberto ? '' : 'ml-auto'}`} />
      </button>
      {!aberto ? null : isLoading ? (
        <p className="text-[10px] text-gray-400">Carregando...</p>
      ) : (
        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto mt-1.5">
          {todasEspecialidades.map((esp) => {
            const temNaClinica = especialidadesNaClinica.has(normalizar(esp));
            const jaTag = tagsAtuais.includes(normalizar(esp));
            return (
              <button
                type="button"
                key={esp}
                onClick={() => onAdicionarTag && onAdicionarTag(esp)}
                title={jaTag ? 'Clique para remover a tag' : (temNaClinica ? 'Disponível na clínica — clique para adicionar tag' : 'Não disponível na clínica — clique para adicionar tag')}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition inline-flex items-center gap-1 ${
                  jaTag
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : temNaClinica
                      ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
                }`}
              >
                {jaTag && <Check className="w-2.5 h-2.5" />}
                {esp}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}