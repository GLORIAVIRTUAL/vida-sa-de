import React from 'react';
import VerificadorIntegridade from "../components/assinatura/VerificadorIntegridade";

export default function VerificacaoAssinatura() {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Verificação de Assinatura</h1>
          <p className="text-gray-600 mt-2">
            Verifique a autenticidade e integridade de documentos médicos assinados digitalmente
          </p>
        </div>

        <VerificadorIntegridade />
      </div>
    </div>
  );
}