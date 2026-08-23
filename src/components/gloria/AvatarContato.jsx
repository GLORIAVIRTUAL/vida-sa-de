import React, { useState } from 'react';
import { User } from 'lucide-react';

// Foto de perfil do WhatsApp do contato, com iniciais como reserva.
export default function AvatarContato({ contato, size = 36 }) {
  const [erro, setErro] = useState(false);
  const foto = !erro ? contato?.foto_url : null;
  const nome = (contato?.nome || '').trim();
  const iniciais = nome
    ? nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
    : null;

  return (
    <div
      className="rounded-full bg-gray-200 text-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {foto ? (
        <img
          src={foto}
          alt={nome || 'Contato'}
          className="w-full h-full object-cover"
          onError={() => setErro(true)}
        />
      ) : iniciais ? (
        <span className="font-semibold" style={{ fontSize: size * 0.36 }}>{iniciais}</span>
      ) : (
        <User style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </div>
  );
}