Deno.serve(async (req) => {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Teste</title>
    </head>
    <body>
      <h1>Função funcionando!</h1>
      <p>URL: ${req.url}</p>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
});