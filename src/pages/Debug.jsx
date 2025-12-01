import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DebugPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('debugUser');
      setData(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Debug Usuário</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={checkUser} disabled={loading}>
            {loading ? 'Verificando...' : 'Verificar tatibrocca@gmail.com'}
          </Button>
          
          {error && <p className="text-red-500 mt-4">{error}</p>}
          
          {data && (
            <pre className="mt-4 p-4 bg-gray-100 rounded overflow-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}