import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Image as ImageIcon, Paperclip, Mic, Smile, MessageSquare, X, Loader2, StopCircle
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Frases pré-salvas
const FRASES_RAPIDAS = [
  { emoji: "👋", texto: "Olá! Como posso ajudar você hoje?" },
  { emoji: "📅", texto: "Gostaria de agendar uma consulta? Me informe a especialidade desejada." },
  { emoji: "⏰", texto: "Nosso horário de atendimento é de segunda a sexta, das 8h às 18h." },
  { emoji: "📍", texto: "Nosso endereço é: Av. Isabel, 29 – Sobreloja, Santa Cruz, Rio de Janeiro – RJ" },
  { emoji: "📞", texto: "Para mais informações, ligue para (21) 2222-3333" },
  { emoji: "✅", texto: "Seu agendamento foi confirmado! Te aguardamos." },
  { emoji: "🙏", texto: "Obrigado pelo contato! Qualquer dúvida, estou à disposição." },
  { emoji: "💳", texto: "Aceitamos cartões de crédito, débito, PIX e dinheiro." },
  { emoji: "🏥", texto: "Trabalhamos com diversas especialidades médicas. Qual você precisa?" },
  { emoji: "📋", texto: "Por favor, traga documento com foto e carteirinha do convênio (se tiver)." }
];

// Emojis populares
const EMOJIS = [
  "😊", "👍", "❤️", "🙏", "✅", "📅", "⏰", "📞", 
  "🏥", "💉", "💊", "🩺", "👨‍⚕️", "👩‍⚕️", "🔔", "📋",
  "💳", "💰", "🎉", "👋", "😃", "🤝", "👏", "💪"
];

// Função para comprimir imagem
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Reduzir dimensões se muito grande
        const maxDimension = 2048;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height *= maxDimension / width;
            width = maxDimension;
          } else {
            width *= maxDimension / height;
            height = maxDimension;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Converter para blob com qualidade reduzida
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            reject(new Error('Falha ao comprimir'));
          }
        }, 'image/jpeg', 0.8);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export default function ChatToolbar({ 
  onSendMessage, 
  inputValue, 
  onInputChange, 
  disabled,
  phoneNumber,
  contatoId 
}) {
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // Upload de arquivo/imagem
  const handleFileUpload = async (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      let fileToUpload = file;
      
      // Comprimir imagem se for maior que 4MB (Meta permite até 5MB)
      if (type === 'image' && file.size > 4 * 1024 * 1024) {
        try {
          fileToUpload = await compressImage(file);
          console.log('Imagem comprimida:', file.size, '→', fileToUpload.size);
        } catch (err) {
          console.warn('Erro ao comprimir, enviando original:', err);
        }
      }
      
      const { file_url } = await base44.integrations.Core.UploadFile({ file: fileToUpload });
      
      // Enviar via WhatsApp (apenas mídia, sem texto)
      // A função enviarMensagemHumano já registra no histórico, não precisa chamar onSendMessage
      await base44.functions.invoke('enviarMensagemHumano', {
        phoneNumber,
        contatoId,
        messageType: type === 'image' ? 'image' : 'document',
        mediaUrl: file_url,
        fileName: file.name
      });
    } catch (error) {
      alert('Erro ao enviar arquivo: ' + error.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  // Gravação de áudio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
        
        setUploading(true);
        try {
          const { file_url } = await base44.integrations.Core.UploadFile({ file: audioFile });
          
          // A função enviarMensagemHumano já registra no histórico, não precisa chamar onSendMessage
          await base44.functions.invoke('enviarMensagemHumano', {
            phoneNumber,
            contatoId,
            messageType: 'audio',
            mediaUrl: file_url
          });
        } catch (error) {
          alert('Erro ao enviar áudio: ' + error.message);
        } finally {
          setUploading(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (error) {
      alert('Erro ao acessar microfone: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
      setMediaRecorder(null);
    }
  };

  // Inserir emoji no input
  const insertEmoji = (emoji) => {
    onInputChange(inputValue + emoji);
  };

  // Usar frase rápida
  const usarFrase = (frase) => {
    onInputChange(frase);
  };

  return (
    <div className="space-y-2">
      {/* Barra de ferramentas */}
      <div className="flex items-center gap-1 px-1">
        {/* Upload de imagem */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileUpload(e, 'image')}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled || uploading}
          title="Enviar imagem"
        >
          <ImageIcon className="w-4 h-4 text-gray-500" />
        </Button>

        {/* Upload de arquivo */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={(e) => handleFileUpload(e, 'document')}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          title="Enviar arquivo"
        >
          <Paperclip className="w-4 h-4 text-gray-500" />
        </Button>

        {/* Gravação de áudio */}
        <Button
          variant="ghost"
          size="sm"
          onClick={recording ? stopRecording : startRecording}
          disabled={disabled || uploading}
          className={recording ? "text-red-500 animate-pulse" : ""}
          title={recording ? "Parar gravação" : "Gravar áudio"}
        >
          {recording ? (
            <StopCircle className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4 text-gray-500" />
          )}
        </Button>

        {/* Emojis */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              title="Emojis"
            >
              <Smile className="w-4 h-4 text-gray-500" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <p className="text-xs font-medium text-gray-500 mb-2">Emojis</p>
            <div className="grid grid-cols-8 gap-1">
              {EMOJIS.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => insertEmoji(emoji)}
                  className="text-lg hover:bg-gray-100 rounded p-1 transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Frases rápidas */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              title="Frases rápidas"
            >
              <MessageSquare className="w-4 h-4 text-gray-500" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="start">
            <p className="text-xs font-medium text-gray-500 mb-2">Frases Rápidas</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {FRASES_RAPIDAS.map((frase, i) => (
                <button
                  key={i}
                  onClick={() => usarFrase(frase.texto)}
                  className="w-full text-left p-2 hover:bg-purple-50 rounded-lg transition text-sm flex items-start gap-2"
                >
                  <span>{frase.emoji}</span>
                  <span className="text-gray-700 line-clamp-2">{frase.texto}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Indicador de upload */}
        {uploading && (
          <div className="flex items-center gap-1 text-xs text-purple-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Enviando...</span>
          </div>
        )}

        {/* Indicador de gravação */}
        {recording && (
          <div className="flex items-center gap-1 text-xs text-red-500">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span>Gravando...</span>
          </div>
        )}
      </div>
    </div>
  );
}