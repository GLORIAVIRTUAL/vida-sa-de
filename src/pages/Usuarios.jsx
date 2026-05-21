import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Users, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import ListaUsuarios from '../components/usuarios/ListaUsuarios';
import ProtectedRoute from '../components/auth/ProtectedRoute';

export default function UsuariosPage() {
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Estado para controlar a visibilidade do formulário que está dentro de ListaUsuarios
    const [isFormOpen, setIsFormOpen] = useState(false);

    const carregarUsuarios = useCallback(async () => {
        setLoading(true);
        try {
            const response = await base44.functions.invoke('listarUsuarios', {});
            const data = response?.data?.usuarios || [];
            setUsuarios(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Erro ao carregar usuários:", error);
            setUsuarios([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        carregarUsuarios();
    }, [carregarUsuarios]);

    return (
        <ProtectedRoute requiredRole="admin">
            <div className="p-6 bg-gray-50 min-h-screen">
                <div className="max-w-7xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <Users className="w-8 h-8 text-gray-700" />
                            <h1 className="text-3xl font-bold text-gray-900">Gestão de Usuários</h1>
                        </div>
                        <Button 
                            onClick={() => setIsFormOpen(true)}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            <PlusCircle className="w-5 h-5 mr-2" />
                            Adicionar Novo Usuário
                        </Button>
                    </div>

                    <Alert className="mb-6 bg-blue-50 border-blue-200">
                        <ShieldAlert className="h-5 w-5 text-blue-700" />
                        <AlertTitle className="font-semibold text-blue-800">Como Adicionar um Novo Usuário</AlertTitle>
                        <AlertDescription className="text-blue-700">
                            <p>
                                Para convidar um novo usuário, ele(a) precisa primeiro ter acessado este sistema **pelo menos uma vez** com a conta Google.
                            </p>
                            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                                <li>Peça para a pessoa acessar o link do sistema e fazer login.</li>
                                <li>Após o primeiro login, volte a esta tela e clique em "Adicionar Novo Usuário".</li>
                                <li>Digite o e-mail e defina o papel (Admin, User ou Médico).</li>
                            </ol>
                        </AlertDescription>
                    </Alert>

                    <Card className="shadow-lg">
                        <CardHeader>
                            <CardTitle>Lista de Usuários do Sistema</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ListaUsuarios
                                usuarios={usuarios}
                                loading={loading}
                                onUpdate={carregarUsuarios}
                                isFormOpen={isFormOpen}
                                setIsFormOpen={setIsFormOpen}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </ProtectedRoute>
    );
}