import React from 'react';
import { User } from '@/entities/User';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

/**
 * Componente para proteger rotas com base no papel do usuário.
 * @param {{
 *   children: React.ReactNode,
 *   requiredRole: string | string[], // Pode ser um único papel ou um array de papéis permitidos
 *   fallbackMessage?: string
 * }} props
 */
export default function ProtectedRoute({ children, requiredRole, fallbackMessage }) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (e) {
        // Usuário não logado
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  if (loading) {
    return null; // ou um spinner
  }

  const userRole = user?.app_role || user?.role;
  const rolesPermitidos = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  if (!user || !rolesPermitidos.includes(userRole)) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center shadow-lg bg-red-50 border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-xl text-red-700">
              <AlertCircle className="w-6 h-6" />
              Acesso Negado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-800">
              {fallbackMessage || "Você não tem permissão para acessar esta página."}
            </p>
            { !user && <p className="text-sm mt-4 text-gray-600">Por favor, faça login para continuar.</p> }
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
}