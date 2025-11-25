import React, { useState } from 'react';
import { User } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, User as UserIcon, Stethoscope, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const roleColors = {
  admin: "bg-red-100 text-red-800 border-red-200",
  user: "bg-blue-100 text-blue-800 border-blue-200",
  medico: "bg-green-100 text-green-800 border-green-200",
};

const roleLabels = {
  admin: "Administrador",
  user: "Atendente",
  medico: "Médico",
};

const roleIcons = {
  admin: <Shield className="w-4 h-4 text-red-600" />,
  user: <UserIcon className="w-4 h-4 text-blue-600" />,
  medico: <Stethoscope className="w-4 h-4 text-green-600" />,
};

// Formulário para Adicionar Novo Usuário
function AddUserForm({ open, onClose, onUpdate }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleClose = () => {
    setEmail('');
    setRole('user');
    setError('');
    setSuccess('');
    onClose();
  };

  const handleSave = async () => {
    if (!email) {
      setError("O campo de e-mail é obrigatório.");
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Encontrar o usuário pelo e-mail
      const usersFound = await User.filter({ email: email.trim() });
      
      if (!usersFound || usersFound.length === 0) {
        setError("Usuário não encontrado. Certifique-se de que a pessoa já fez login no sistema pelo menos uma vez.");
        setLoading(false);
        return;
      }
      
      const userToUpdate = usersFound[0];
      
      // 2. Atualizar o papel do usuário
      await User.update(userToUpdate.id, { app_role: role });
      
      setSuccess(`Usuário ${email} atualizado para o papel de ${roleLabels[role]} com sucesso!`);
      
      setTimeout(() => {
        onUpdate(); // Atualiza a lista na página principal
        handleClose();
      }, 2000);

    } catch (err) {
      console.error("Erro ao adicionar usuário:", err);
      setError(err.message || "Ocorreu um erro. Verifique o console para mais detalhes.");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Novo Usuário</DialogTitle>
          <DialogDescription>
            Digite o e-mail do usuário e defina sua permissão. Lembre-se, o usuário precisa ter feito login no sistema ao menos uma vez.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="border-green-500 text-green-700">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="email">Email do Usuário</Label>
            <Input
              id="email"
              type="email"
              placeholder="exemplo@google.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <Label htmlFor="role">Permissão</Label>
            <Select value={role} onValueChange={setRole} disabled={loading}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Atendente</SelectItem>
                <SelectItem value="medico">Médico</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || !email}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Usuário'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ListaUsuarios({ usuarios, loading, onUpdate, isFormOpen, setIsFormOpen }) {
  
  const handleRoleChange = async (userId, newRole) => {
    try {
      await User.update(userId, { app_role: newRole });
      onUpdate(); // Recarrega a lista de usuários na página pai
    } catch (error) {
      console.error("Erro ao alterar permissão:", error);
      alert("Não foi possível alterar a permissão. Tente novamente.");
    }
  };

  const getRoleForDisplay = (user) => {
    return user.app_role || user.role;
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome Completo</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Permissão Atual</TableHead>
            <TableHead className="w-48">Alterar Permissão</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                <TableCell><Skeleton className="h-6 w-28 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-10 w-full" /></TableCell>
              </TableRow>
            ))
          ) : (
            usuarios.map((usuario) => {
              const currentRole = getRoleForDisplay(usuario);
              return (
                <TableRow key={usuario.id}>
                  <TableCell className="font-medium">{usuario.full_name}</TableCell>
                  <TableCell>{usuario.email}</TableCell>
                  <TableCell>
                    <Badge className={`${roleColors[currentRole] || roleColors['user']} border`}>
                      {roleIcons[currentRole] || roleIcons['user']}
                      <span className="ml-1">{roleLabels[currentRole] || 'Usuário'}</span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      defaultValue={currentRole}
                      onValueChange={(newRole) => handleRoleChange(usuario.id, newRole)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Definir permissão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Atendente</SelectItem>
                        <SelectItem value="medico">Médico</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
      
      <AddUserForm 
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onUpdate={onUpdate}
      />
    </>
  );
}