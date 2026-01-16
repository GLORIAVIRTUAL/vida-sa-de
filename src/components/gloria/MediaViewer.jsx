import React, { useState } from 'react';
import { FileText, Download, Eye, Image as ImageIcon, File } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MediaViewer({ mediaType, mediaUrl, fileName, caption }) {
  const [showPreview, setShowPreview] = useState(false);

  const getFileIcon = () => {
    if (mediaType === 'image') return <ImageIcon className="w-5 h-5" />;
    if (mediaType === 'document' || mediaType === 'pdf') return <FileText className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const getFileTypeLabel = () => {
    switch (mediaType) {
      case 'image': return 'Imagem';
      case 'document': return 'Documento';
      case 'pdf': return 'PDF';
      case 'audio': return 'Áudio';
      case 'video': return 'Vídeo';
      default: return 'Arquivo';
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `arquivo.${mediaType}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
    }
  };

  if (mediaType === 'image') {
    return (
      <div className="mt-2 space-y-2">
        <img 
          src={mediaUrl} 
          alt={caption || 'Imagem recebida'}
          className="max-w-xs rounded-lg cursor-pointer hover:opacity-90 transition"
          onClick={() => setShowPreview(true)}
        />
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setShowPreview(true)}
            className="gap-1"
          >
            <Eye className="w-3 h-3" /> Visualizar
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleDownload}
            className="gap-1"
          >
            <Download className="w-3 h-3" /> Baixar
          </Button>
        </div>
        
        {showPreview && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowPreview(false)}>
            <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <img src={mediaUrl} alt="Preview" className="w-full h-auto rounded-lg" />
              <button 
                onClick={() => setShowPreview(false)}
                className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Documento/PDF
  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
          {getFileIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 truncate text-sm">{fileName}</p>
          <p className="text-xs text-gray-500">{getFileTypeLabel()} recebido</p>
        </div>
        <div className="flex gap-2">
          {mediaType === 'pdf' || mediaUrl?.includes('.pdf') ? (
            <Button 
              size="sm" 
              variant="outline" 
              asChild
              className="gap-1"
            >
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                <Eye className="w-3 h-3" /> Ver
              </a>
            </Button>
          ) : null}
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleDownload}
            className="gap-1"
          >
            <Download className="w-3 h-3" /> Baixar
          </Button>
        </div>
      </div>
    </div>
  );
}