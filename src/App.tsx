import React, { useState, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
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

interface PDFFileStatus {
  file: File;
  previews: PDFPreview[];
  isConverted: boolean;
  error?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'convert' | 'merge'>('convert');
  const [pdfFiles, setPdfFiles] = useState<PDFFileStatus[]>([]);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isCombining, setIsCombining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const isFileDrag = (e: DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleDrop = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);

    // Get all dropped files
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    
    // Filter for PDF files
    const validFiles = droppedFiles.filter(file => {
      const isMimePdf = file.type === 'application/pdf';
      const endsWithPdf = file.name.toLowerCase().endsWith('.pdf');
      return isMimePdf || endsWithPdf;
    });
    
    if (validFiles.length > 0) {
      if (activeTab === 'convert') {
        const newPdfFiles = validFiles.map(file => ({
          file,
          previews: [],
          isConverted: false
        }));
        setPdfFiles(prevFiles => [...prevFiles, ...newPdfFiles]);
      } else {
        setMergeFiles(prev => [...prev, ...validFiles]);
      }
    } else if (droppedFiles.length > 0) {
      setError('Please upload valid PDF files only');
    }
  }, [activeTab]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.target === document.documentElement) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Handle drag events for the entire page
  useEffect(() => {
    // Add event listeners
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    // Cleanup
    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]); // Add handlers to dependencies

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isMimePdf = file.type === 'application/pdf';
      const endsWithPdf = file.name.toLowerCase().endsWith('.pdf');
      return isMimePdf || endsWithPdf;
    });
    
    if (validFiles.length > 0) {
      if (activeTab === 'convert') {
        const newPdfFiles = validFiles.map(file => ({
          file,
          previews: [],
          isConverted: false
        }));
        setPdfFiles(prevFiles => [...prevFiles, ...newPdfFiles]);
      } else {
        setMergeFiles(prev => [...prev, ...validFiles]);
      }
      setError(null);
    } else {
      setError('Please upload valid PDF files');
    }

    // Reset the input value so the same file can be selected again
    e.target.value = '';
  }, []);

  const handleRemoveFile = (index: number) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveMergeFile = (index: number) => {
    setMergeFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragStartItem = (index: number) => () => {
    setDraggedIndex(index);
  };

  const handleDragOverItem = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDropItem = (index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setMergeFiles(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(draggedIndex, 1);
      updated.splice(index, 0, moved);
      return updated;
    });
    setDraggedIndex(null);
  };

  const convertFiles = async () => {
    setIsConverting(true);
    setError(null);
    setDownloadUrl(null);
    setDownloadFileName(null);

    try {
      const zip = new JSZip();
      
      for (let i = 0; i < pdfFiles.length; i++) {
        const { file } = pdfFiles[i];
        const arrayBuffer = await file.arrayBuffer();
        
        const pdf = await pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://unpkg.com/pdfjs-dist/cmaps/',
          cMapPacked: true,
        }).promise;

        const previews: PDFPreview[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          try {
            const page = await pdf.getPage(pageNum);
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
              pageNumber: pageNum
            });
          } catch (pageError) {
            console.error(`Error processing page ${pageNum} of ${file.name}:`, pageError);
            throw new Error(`Failed to process page ${pageNum} of ${file.name}`);
          }
        }

        // Update the file status with previews
        setPdfFiles(prev => prev.map((pdfFile, index) => 
          index === i ? { ...pdfFile, previews, isConverted: true } : pdfFile
        ));

        // Handle file naming and zipping
        const fileName = file.name.replace('.pdf', '');
        
        if (pdfFiles.length === 1 && previews.length === 1) {
          // Single file with single page
          const blob = await fetch(previews[0].url).then(r => r.blob());
          setDownloadUrl(URL.createObjectURL(blob));
          setDownloadFileName(`${fileName}.png`);
          return;
        }

        // Add files to zip
        if (pdfFiles.length === 1) {
          // Single file with multiple pages
          previews.forEach((preview) => {
            const base64Data = preview.url.split(',')[1];
            zip.file(`${fileName}_${preview.pageNumber}.png`, base64Data, { base64: true });
          });
          const content = await zip.generateAsync({ type: 'blob' });
          setDownloadUrl(URL.createObjectURL(content));
          setDownloadFileName(`${fileName}.zip`);
        } else {
          // Multiple files
          const folder = zip.folder(fileName);
          if (folder) {
            previews.forEach((preview) => {
              const base64Data = preview.url.split(',')[1];
              folder.file(`${fileName}_${preview.pageNumber}.png`, base64Data, { base64: true });
            });
          }
        }
      }

      // If multiple files, generate the final zip
      if (pdfFiles.length > 1) {
        const content = await zip.generateAsync({ type: 'blob' });
        setDownloadUrl(URL.createObjectURL(content));
        setDownloadFileName('converted_files.zip');
      }
    } catch (err) {
      console.error('PDF processing error:', err);
      setError(`Error processing PDF files: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsConverting(false);
    }
  };

  const combineFiles = async () => {
    setIsCombining(true);
    setError(null);
    setDownloadUrl(null);
    setDownloadFileName(null);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const file of mergeFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
      }

      const bytes = await mergedPdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
      setDownloadFileName('merged.pdf');
    } catch (err) {
      console.error('PDF merge error:', err);
      setError(`Error merging PDF files: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCombining(false);
    }
  };

  const files = activeTab === 'convert' ? pdfFiles : mergeFiles;
  const isProcessing = activeTab === 'convert' ? isConverting : isCombining;

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
          <div className="drop-zone-text">Drop PDFs anywhere</div>
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

      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'convert' ? 'active' : ''}`}
          onClick={() => setActiveTab('convert')}
        >
          PDF to PNG
        </button>
        <button
          className={`tab-button ${activeTab === 'merge' ? 'active' : ''}`}
          onClick={() => setActiveTab('merge')}
        >
          Merge PDF
        </button>
      </div>

      <main className="app-main">
        <div className="drop-zone-container">
          <div className={`drop-zone ${isDragging ? 'dragging' : ''}`}>
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
                  multiple
                />
                <div className="drop-zone-text">
                  {isProcessing ? (
                    activeTab === 'convert' ? 'Converting...' : 'Combining...'
                  ) : error ? (
                    <span className="error-text">{error}</span>
                  ) : files.length > 0 ? (
                    'Drop PDFs or click to upload more files'
                  ) : (
                    'Drop PDFs or click to upload'
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="files-container">
            <div className="files-list">
              {activeTab === 'convert'
                ? pdfFiles.map((pdfFile, index) => (
                    <div key={pdfFile.file.name + index} className="file-item">
                      <span className="file-name">{pdfFile.file.name}</span>
                      <button
                        className="delete-button"
                        onClick={() => handleRemoveFile(index)}
                        aria-label="Remove file"
                      >
                        <svg
                          className="delete-icon"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))
                : mergeFiles.map((file, index) => (
                    <div
                      key={file.name + index}
                      className="file-item"
                      draggable
                      onDragStart={handleDragStartItem(index)}
                      onDragOver={handleDragOverItem}
                      onDrop={handleDropItem(index)}
                    >
                      <span className="file-name">{file.name}</span>
                      <button
                        className="delete-button"
                        onClick={() => handleRemoveMergeFile(index)}
                        aria-label="Remove file"
                      >
                        <svg
                          className="delete-icon"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
            </div>

            <div className="convert-button-container">
              {activeTab === 'convert' ? (
                <button
                  className="convert-button"
                  onClick={convertFiles}
                  disabled={isConverting || pdfFiles.length === 0}
                >
                  {isConverting ? 'Converting...' : 'Convert'}
                </button>
              ) : (
                mergeFiles.length >= 2 && (
                  <button
                    className="convert-button"
                    onClick={combineFiles}
                    disabled={isCombining}
                  >
                    {isCombining ? 'Combining...' : 'Combine'}
                  </button>
                )
              )}
            </div>
          </div>
        )}

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
            <span className="download-text">Download {downloadFileName}</span>
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
