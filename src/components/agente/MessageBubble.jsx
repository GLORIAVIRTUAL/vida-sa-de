import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

function FunctionDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const proj = toolCall.display_projection || {};
  const running = ['pending', 'running', 'in_progress'].includes(toolCall.status);

  let parsed = toolCall.results;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { /* mantém texto */ }
  }
  const failed = ['failed', 'error'].includes(toolCall.status) || parsed?.success === false;

  const label = running
    ? proj.active_label || 'Consultando dados...'
    : failed
      ? proj.error_label || 'Falha na consulta'
      : proj.label || `Consultou ${toolCall.name}`;

  const hideDetails = proj.hide_details && proj.details_redacted;

  return (
    <div className="mt-2 text-xs text-gray-500">
      <button
        type="button"
        onClick={() => !hideDetails && setExpanded(!expanded)}
        className="flex items-center gap-1 hover:text-gray-700"
      >
        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : failed ? <AlertCircle className="w-3 h-3 text-red-500" /> : <CheckCircle2 className="w-3 h-3 text-green-600" />}
        <span>{label}</span>
        {!hideDetails && (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
      </button>
      {expanded && !hideDetails && (
        <div className="mt-1 bg-gray-50 border rounded p-2 space-y-1 overflow-x-auto">
          <p className="font-semibold">Parâmetros:</p>
          <pre className="whitespace-pre-wrap">{toolCall.arguments_string}</pre>
          <p className="font-semibold">Resultado:</p>
          <pre className="whitespace-pre-wrap">{typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`max-w-[85%] rounded-lg px-4 py-2 ${isUser ? 'bg-blue-600 text-white' : 'bg-white border'}`}>
        {message.content && (isUser
          ? <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          : <ReactMarkdown className="text-sm prose prose-sm max-w-none">{message.content}</ReactMarkdown>)}
        {message.tool_calls?.map((tc, idx) => <FunctionDisplay key={idx} toolCall={tc} />)}
      </div>
    </div>
  );
}