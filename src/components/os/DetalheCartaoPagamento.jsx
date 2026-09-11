import React from 'react';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_PARCELAS_CARTAO } from "./parcelasCartao";

// Campos obrigatórios da maquininha (bandeira e parcelas) para uma forma de pagamento com cartão
export default function DetalheCartaoPagamento({ pagamento, onChange, taxasCartao }) {
  const isCredito = pagamento.forma === 'Cartão Crédito';
  const bandeiras = isCredito ? taxasCartao.credito : taxasCartao.debito;

  return (
    <div className={`grid ${isCredito ? 'grid-cols-2' : 'grid-cols-1'} gap-3 p-3 bg-white border border-purple-200 rounded-md`}>
      <div>
        <Label className="text-sm">Bandeira do Cartão *</Label>
        <Select
          value={pagamento.bandeira || ''}
          onValueChange={(v) => onChange({ bandeira: v, parcelas: 1 })}
        >
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {Object.keys(bandeiras).map(b => (
              <SelectItem key={b} value={b}>{bandeiras[b].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isCredito && (
        <div>
          <Label className="text-sm">Parcelas *</Label>
          <Select
            value={String(pagamento.parcelas || 1)}
            onValueChange={(v) => onChange({ parcelas: parseInt(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: MAX_PARCELAS_CARTAO }, (_, i) => i + 1).map(p => {
                const taxa = pagamento.bandeira && taxasCartao.credito[pagamento.bandeira]?.taxas?.[p];
                return (
                  <SelectItem key={p} value={String(p)}>
                    {p}x {taxa ? `(Taxa: ${taxa}%)` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}