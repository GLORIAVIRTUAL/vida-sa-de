import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const text = await Deno.readTextFile('/tmp/functions/zapiWebhook.js');
  return Response.json({
    matches: text.split('\n').filter(line => line.includes('invoke'))
  });
});