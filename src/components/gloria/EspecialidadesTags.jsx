import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Stethoscope } from 'lucide-react';

// Lista de referência de especialidades médicas (mesmo enum usado em Procedimentos)
const ESPECIALIDADES_REFERENCIA = [
  'Cardiologia', 'Clínico Geral', 'Dermatologia', 'Endocrinologia', 'Fisioterapeuta',
  'Gastroenterologia', 'Geriatria', 'Ginecologia', 'Neurologia', 'Neuropediatra',
  'Nutricionista', 'Odontologia', 'Oftalmologia', 'Optometrista', 'Ortopedia',
  'Otorrinolaringologia', 'Pediatria', 'Pneumologia', 'Psicologia', 'Psicopedagoga',
  'Psiquiatria', 'Quiropraxia', 'Traumatologia', 'Urologia'
];

const normalizar = (s) => (s || '').toString().trim().toLowerCase();

export default function EspecialidadesTags() {
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

  return (
    <div className="rounded-lg border bg-white px-3 py-2 max-w-md">
      <div className="flex items-center gap-1 mb-1.5">
        <Stethoscope className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[11px] font-semibold text-gray-600">Especialidades</span>
        <span className="ml-auto flex items-center gap-2 text-[9px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Tem</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Não tem</span>
        </span>
      </div>
      {isLoading ? (
        <p className="text-[10px] text-gray-400">Carregando...</p>
      ) : (
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {todasEspecialidades.map((esp) => {
            const temNaClinica = especialidadesNaClinica.has(normalizar(esp));
            return (
              <span
                key={esp}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  temNaClinica
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
                title={temNaClinica ? 'Disponível na clínica' : 'Não disponível na clínica'}
              >
                {esp}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}