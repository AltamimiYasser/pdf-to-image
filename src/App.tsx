import React, { useState, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import './App.css';

// Set worker path
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
}

interface PDFPreview {
  url: string;
  pageNumber: number;
}

function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<PDFPreview[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle drag events for the entire page
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === document.documentElement) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer?.files[0];
      if (file && file.type === 'application/pdf') {
        setPdfFile(file);
        await handleFile(file);
      } else {
        setError('Please upload a valid PDF file');
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, []); // Empty dependency array since we don't use any external values

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setDownloadUrl(null);
    setDownloadFileName(null);
    
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      await handleFile(file);
    } else {
      setError('Please upload a valid PDF file');
    }
  }, []);

  const handleFile = async (file: File) => {
    try {
      setIsConverting(true);
      setError(null);
      
      const arrayBuffer = await file.arrayBuffer();
      
      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://unpkg.com/pdfjs-dist/cmaps/',
        cMapPacked: true,
      }).promise;

      const previews: PDFPreview[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (!context) throw new Error('Could not get canvas context');

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;

          previews.push({
            url: canvas.toDataURL('image/png', 1.0),
            pageNumber: i
          });
        } catch (pageError) {
          console.error(`Error processing page ${i}:`, pageError);
          throw new Error(`Failed to process page ${i}`);
        }
      }

      setPreviews(previews);

      if (previews.length === 1) {
        setDownloadUrl(previews[0].url);
        setDownloadFileName(`page-${previews[0].pageNumber}.png`);
      } else {
        const zip = new JSZip();
        previews.forEach((preview) => {
          const base64Data = preview.url.split(',')[1];
          zip.file(`page-${preview.pageNumber}.png`, base64Data, { base64: true });
        });

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        setDownloadUrl(url);
        setDownloadFileName('converted-pages.zip');
      }
    } catch (err) {
      console.error('PDF processing error:', err);
      setError(`Error processing PDF file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="app-container">
      {/* Full page drop overlay */}
      <div className={`full-page-drop ${isDragging ? 'active' : ''}`}>
        <div className="drop-zone dragging">
          <svg
            className="drop-zone-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m0 0l-4-4m4 4l4-4"
            />
          </svg>
          <div className="drop-zone-text">Drop PDF anywhere</div>
        </div>
      </div>

      <header className="app-header">
        <div className="header-content">
          <svg 
            className="header-logo"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 16l4 4L19 7" 
            />
          </svg>
          <div className="header-text">
            <h1 className="header-title">SnapPDF</h1>
            <p className="header-subtitle">Convert with precision</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div 
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        >
          <div className="drop-zone-content">
            <svg
              className="drop-zone-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m0 0l-4-4m4 4l4-4"
              />
            </svg>

            <label htmlFor="file-input" className="drop-zone-label">
              <input
                id="file-input"
                type="file"
                accept=".pdf"
                onChange={handleFileInput}
                className="drop-zone-input"
              />
              <div className="drop-zone-text">
                {isConverting ? 'Converting...' : 
                 error ? <span className="error-text">{error}</span> :
                 'Drop PDF or click to upload'}
              </div>
            </label>
          </div>
        </div>

        {downloadUrl && (
          <a
            href={downloadUrl}
            download={downloadFileName}
            className="download-button"
          >
            <svg
              className="download-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span className="download-text">
              Download {downloadFileName}
            </span>
          </a>
        )}
      </main>

      <footer className="app-footer">
        <p className="footer-text">© {new Date().getFullYear()} Yasser Altamimi. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
