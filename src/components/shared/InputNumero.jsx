import React from 'react';
import { Input } from "@/components/ui/input";

/**
 * Campo numérico que ignora a rolagem do mouse, evitando que o valor
 * seja alterado acidentalmente ao rolar a página com o cursor sobre o campo.
 */
export default function InputNumero(props) {
  return (
    <Input
      {...props}
      type="number"
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
}