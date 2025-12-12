import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Users } from "lucide-react";
import CartaoDigital from "./CartaoDigital";

export default function GeradorCartoes({ venda, open, onClose }) {
  if (!venda) return null;

  const temDependentes = venda.dependentes && venda.dependentes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            Cartões Digitais - Cartão Mais Vida
          </DialogTitle>
        </DialogHeader>

        {temDependentes ? (
          <Tabs defaultValue="titular" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="titular" className="gap-2">
                <CreditCard className="w-4 h-4" />
                Titular
              </TabsTrigger>
              <TabsTrigger value="dependentes" className="gap-2">
                <Users className="w-4 h-4" />
                Dependentes ({venda.dependentes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="titular" className="space-y-4">
              <div className="flex flex-col items-center">
                <CartaoDigital venda={venda} titular={true} />
              </div>
            </TabsContent>

            <TabsContent value="dependentes" className="space-y-6">
              {venda.dependentes.map((dep, index) => (
                <div key={index} className="flex flex-col items-center border-b pb-6 last:border-b-0">
                  <h3 className="text-lg font-semibold mb-4">Dependente {index + 1}</h3>
                  <CartaoDigital venda={venda} titular={false} dependente={dep} />
                </div>
              ))}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col items-center py-4">
            <CartaoDigital venda={venda} titular={true} />
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}