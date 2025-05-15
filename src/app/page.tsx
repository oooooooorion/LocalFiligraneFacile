
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Download, Edit3, ShieldAlert, FileText, Image as ImageIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker:
if (typeof window !== 'undefined') {
  // pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString(); // Older Next.js/Webpack
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString(); // For Next.js 15+ with Turbopack or modern Webpack
}

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from "@/components/ui/progress";
import AppLogo from '@/components/AppLogo';
import { useToast } from "@/hooks/use-toast";

export default function IdMarkPage() {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalImagePreviewSrc, setOriginalImagePreviewSrc] = useState<string | null>(null);
  const [watermarkText, setWatermarkText] = useState<string>('CONFIDENTIAL');
  const [watermarkedImageSrc, setWatermarkedImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const originalImageRef = useRef<HTMLImageElement | null>(null); // Still used to set its src for potential direct use/debug, but not primary for watermarking

  const resetState = useCallback(() => {
    setOriginalFile(null);
    // No need to clear originalImagePreviewSrc here, useEffect for originalFile will handle it.
    // setOriginalImagePreviewSrc(null); 
    setWatermarkedImageSrc(null);
    setIsLoading(false);
    setProgress(0);
    setError(null);
    if (originalImageRef.current) {
      originalImageRef.current.src = ""; 
    }
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = ""; 
    }
  }, []);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    resetState(); // Reset previous state first

    if (file) {
      if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
        setError("Unsupported file type. Please upload an image (PNG, JPG) or PDF.");
        toast({ title: "Unsupported File", description: "Please upload an image (PNG, JPG) or PDF.", variant: "destructive" });
        setOriginalFile(null); // Ensure originalFile is null if invalid
        return; 
      }

      if (file.size > 20 * 1024 * 1024) { // 20MB limit
        setError("File is too large. Maximum size is 20MB.");
        toast({ title: "Error", description: "File is too large. Maximum size is 20MB.", variant: "destructive" });
        setOriginalFile(null); // Ensure originalFile is null if invalid
        return;
      }
      
      setOriginalFile(file); // Set file only if all checks pass
      // setError(null) was called in resetState
    } else {
      setOriginalFile(null); // Handles case where user clears selection from dialog
    }
  };

  useEffect(() => {
    if (!originalFile) {
      setOriginalImagePreviewSrc(null);
      if (originalImageRef.current) {
        originalImageRef.current.src = "";
      }
      // Don't reset isLoading/progress/error here if they were set by handleFileChange for an invalid file
      // Let resetState handle general resets or successful processing handle its own.
      return;
    }

    setIsLoading(true);
    setProgress(10);
    setError(null); 

    const reader = new FileReader();

    reader.onload = async (e) => {
      const fileSrc = e.target?.result as string;
      setProgress(30);

      try {
        if (originalFile.type === 'application/pdf') {
          const pdf = await pdfjsLib.getDocument({ data: atob(fileSrc.split(',')[1]) }).promise;
          setProgress(50);
          const page = await pdf.getPage(1); 
          const viewport = page.getViewport({ scale: 2.0 }); 
          
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          
          if (!context) {
            throw new Error("Failed to get canvas context for PDF page.");
          }
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          setProgress(70);
          const imageSrc = canvas.toDataURL('image/png');
          setOriginalImagePreviewSrc(imageSrc);
          if(originalImageRef.current) originalImageRef.current.src = imageSrc; // For hidden img
        } else if (originalFile.type.startsWith('image/')) {
          setOriginalImagePreviewSrc(fileSrc);
          if(originalImageRef.current) originalImageRef.current.src = fileSrc; // For hidden img
        }
        setProgress(100);
      } catch (err: any) {
        console.error("Error processing file:", err);
        const errorMessage = err.message || "Failed to load or process the file.";
        setError(errorMessage);
        toast({ title: "Processing Error", description: errorMessage, variant: "destructive" });
        setOriginalImagePreviewSrc(null);
        if(originalImageRef.current) originalImageRef.current.src = "";
        // setOriginalFile(null); // Don't null originalFile here, let user decide to re-select or clear.
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      const errorMessage = "Failed to read the file.";
      setError(errorMessage);
      toast({ title: "File Read Error", description: errorMessage, variant: "destructive" });
      setIsLoading(false);
      setProgress(0);
      setOriginalImagePreviewSrc(null);
      // setOriginalFile(null); 
    };
    
    reader.readAsDataURL(originalFile);

  }, [originalFile, toast, resetState]);

  const applyWatermark = useCallback(() => {
    if (!originalImagePreviewSrc) {
      setError("Original image not loaded or no preview available for watermarking.");
      toast({ title: "Watermark Error", description: "No image preview. Please re-upload.", variant: "destructive" });
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setProgress(0);

    const img = new Image();
    // img.crossOrigin = "anonymous"; // Not strictly necessary for data URIs, can sometimes cause issues.

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error("Could not get canvas context.");
        }
        
        setProgress(20);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setProgress(40);

        const text = watermarkText || "CONFIDENTIAL";
        const fontSize = Math.max(12, Math.min(canvas.width, canvas.height) / 25);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = "rgba(128, 128, 128, 0.35)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        setProgress(60);

        const angle = -Math.PI / 4;
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        
        const diagonalLength = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
        const repetitions = Math.ceil(diagonalLength / (textWidth * 0.7)); 
        const step = diagonalLength / Math.max(5, repetitions); 

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle);
        
        for (let y = -diagonalLength / 2; y < diagonalLength / 2; y += step) {
          for (let x = -diagonalLength / 2; x < diagonalLength / 2; x += step * 2.5) {
             ctx.fillText(text, x, y);
          }
        }
        
        ctx.rotate(-angle);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);

        setProgress(80);
        setWatermarkedImageSrc(canvas.toDataURL('image/png'));
        setProgress(100);
        toast({ title: "Success", description: "Watermark applied successfully!" });
      } catch (err: any) {
        console.error("Error applying watermark (canvas operations):", err);
        const errorMessage = err.message || "Failed to apply watermark.";
        setError(errorMessage);
        toast({ title: "Watermark Error", description: errorMessage, variant: "destructive" });
        setWatermarkedImageSrc(null);
      } finally {
        setIsLoading(false);
        setProgress(0); 
      }
    };

    img.onerror = (errEv) => {
        console.error("Error loading image for watermarking (in-memory Image object):", errEv);
        setError("Failed to load image for watermarking. The image data might be corrupted or the format is unsupported by the browser for canvas operations.");
        toast({ title: "Watermark Error", description: "Failed to load image for watermarking. Please try again or use a different file.", variant: "destructive" });
        setIsLoading(false);
        setProgress(0);
        setWatermarkedImageSrc(null);
    };
    
    img.src = originalImagePreviewSrc; // Trigger loading

  }, [originalImagePreviewSrc, watermarkText, toast]);

  const handleDownload = () => {
    if (!watermarkedImageSrc || !originalFile) return;
    const link = document.createElement('a');
    link.href = watermarkedImageSrc;
    const fileNameParts = originalFile.name.split('.');
    const extension = fileNameParts.pop() || 'png';
    const nameWithoutExtension = fileNameParts.join('.') || 'document';
    link.download = `${nameWithoutExtension}_watermarked.${originalFile.type === 'application/pdf' ? 'png' : extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Download Started", description: `Downloading ${link.download}` });
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-8 space-y-6 bg-background">
      <header className="w-full max-w-4xl">
        <AppLogo />
        <p className="text-muted-foreground mt-1">Securely watermark your ID documents client-side.</p>
      </header>

      <main className="w-full max-w-4xl space-y-6">
        <img ref={originalImageRef} alt="Original for processing" className="hidden" 
          onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
            console.error("Hidden image load error. Src (start):", e.currentTarget.src.substring(0, 100));
          }}
        />

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center"><Upload className="mr-2 h-6 w-6 text-primary" />Upload Document</CardTitle>
            <CardDescription>Select an image (PNG, JPG) or PDF file of your ID document. Processing is done in your browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="file-upload">ID Document File</Label>
              <Input id="file-upload" type="file" accept="image/png, image/jpeg, application/pdf" onChange={handleFileChange} className="cursor-pointer file:text-primary file:font-semibold" />
            </div>
            {originalFile && (
              <Button variant="outline" size="sm" onClick={resetState} className="mt-4">
                <RefreshCw className="mr-2 h-4 w-4" /> Clear Selection & Reset
              </Button>
            )}
          </CardContent>
        </Card>

        {isLoading && progress > 0 && (
           <div className="w-full p-4 rounded-md bg-card">
             <Progress value={progress} className="w-full" />
             <p className="text-sm text-muted-foreground text-center mt-2">Processing: {progress}%</p>
           </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {originalImagePreviewSrc && !isLoading && !error && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center"><Edit3 className="mr-2 h-6 w-6 text-primary" />Customize Watermark</CardTitle>
              <CardDescription>Enter the text for your watermark. It will be subtly overlaid across the document.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="watermark-text">Watermark Text</Label>
                <Input 
                  id="watermark-text" 
                  type="text" 
                  value={watermarkText} 
                  onChange={(e) => setWatermarkText(e.target.value)} 
                  placeholder="e.g., For Verification Only" 
                />
              </div>
              <Button onClick={applyWatermark} disabled={isLoading || !originalImagePreviewSrc}>
                Apply Watermark
              </Button>
            </CardContent>
          </Card>
        )}
        
        {(originalImagePreviewSrc || watermarkedImageSrc) && !isLoading && !error && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center">
                {originalFile?.type === 'application/pdf' ? <FileText className="mr-2 h-6 w-6 text-primary" /> : <ImageIcon className="mr-2 h-6 w-6 text-primary" />}
                Preview & Download
              </CardTitle>
              <CardDescription>Review your document. The original is on the left, watermarked on the right.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Original Preview</Label>
                  {originalImagePreviewSrc ? (
                    <div className="mt-2 border rounded-md overflow-hidden aspect-video bg-muted flex items-center justify-center">
                      <img src={originalImagePreviewSrc} alt="Original Document" className="max-w-full max-h-[400px] object-contain transition-opacity duration-500 ease-in-out opacity-100" data-ai-hint="document scan" />
                    </div>
                  ) : (
                     <div className="mt-2 border rounded-md aspect-video bg-muted flex items-center justify-center text-muted-foreground">No document preview available.</div>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Watermarked Preview</Label>
                  {watermarkedImageSrc ? (
                    <div className="mt-2 border rounded-md overflow-hidden aspect-video bg-muted flex items-center justify-center">
                      <img src={watermarkedImageSrc} alt="Watermarked Document" className="max-w-full max-h-[400px] object-contain transition-opacity duration-500 ease-in-out opacity-100" data-ai-hint="document watermark" />
                    </div>
                  ) : (
                    <div className="mt-2 border rounded-md aspect-video bg-muted flex items-center justify-center text-muted-foreground">Apply watermark to see preview.</div>
                  )}
                </div>
              </div>
            </CardContent>
            {watermarkedImageSrc && (
              <CardFooter>
                <Button onClick={handleDownload} disabled={isLoading || !watermarkedImageSrc}>
                  <Download className="mr-2 h-5 w-5" /> Download Watermarked Image
                </Button>
              </CardFooter>
            )}
          </Card>
        )}

        <Alert variant="default" className="bg-card border-primary/50 shadow-md">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <AlertTitle className="font-semibold">Important Security & Usage Notice</AlertTitle>
          <AlertDescription className="space-y-1 mt-1">
            <p>Your privacy is paramount. All processing happens directly in your browser. No files are sent to any server.</p>
            <p>You are solely responsible for how this watermarked image is used and the watermark text you choose.</p>
            <p><strong>Each watermarked image is unique. Never reuse the same watermarked image for different purposes, as it can be traced back to a single instance of sharing.</strong></p>
          </AlertDescription>
        </Alert>

      </main>

      <footer className="w-full max-w-4xl text-center py-4">
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} IdMark. All rights reserved.</p>
      </footer>
    </div>
  );
}
