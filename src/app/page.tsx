
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Download, Edit3, ShieldAlert, FileText, Image as ImageIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker:
// pdfjsLib.GlobalWorkerOptions.workerSrc needs to be set for pdf.js to function correctly.
// For Webpack 5+ (which Next.js uses), the recommended way is new URL(...) with import.meta.url.
if (typeof window !== 'undefined') {
  // This tells pdf.js where to load its worker script from.
  // Webpack (or Turbopack) will handle bundling 'pdfjs-dist/build/pdf.worker.mjs'
  // and resolving its URL correctly here.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
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
  const [originalImagePreviewSrc, setOriginalImagePreviewSrc] = useState<string | null>(null); // For <img> src preview
  const [watermarkText, setWatermarkText] = useState<string>('CONFIDENTIAL');
  const [watermarkedImageSrc, setWatermarkedImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const originalImageRef = useRef<HTMLImageElement | null>(null); // To hold the loaded image/pdf page for canvas processing

  const resetState = () => {
    setOriginalFile(null);
    setOriginalImagePreviewSrc(null);
    setWatermarkedImageSrc(null);
    setIsLoading(false);
    setProgress(0);
    setError(null);
    if (originalImageRef.current) {
      originalImageRef.current.src = "";
    }
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = ""; // Reset file input
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    resetState(); // Reset previous state when a new file is selected
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) { // 20MB limit
        setError("File is too large. Maximum size is 20MB.");
        toast({ title: "Error", description: "File is too large. Maximum size is 20MB.", variant: "destructive" });
        return;
      }
      setOriginalFile(file);
      setError(null);
    }
  };

  useEffect(() => {
    if (!originalFile) {
      setOriginalImagePreviewSrc(null);
      if(originalImageRef.current) originalImageRef.current.src = "";
      return;
    }

    setIsLoading(true);
    setProgress(10);

    const reader = new FileReader();

    reader.onload = async (e) => {
      const fileSrc = e.target?.result as string;
      setProgress(30);

      try {
        if (originalFile.type === 'application/pdf') {
          const pdf = await pdfjsLib.getDocument({ data: atob(fileSrc.split(',')[1]) }).promise;
          setProgress(50);
          const page = await pdf.getPage(1); // Process first page
          const viewport = page.getViewport({ scale: 2.0 }); // Increased scale for better quality
          
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          
          if (context) {
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            setProgress(70);
            const imageSrc = canvas.toDataURL('image/png');
            setOriginalImagePreviewSrc(imageSrc);
            if(originalImageRef.current) originalImageRef.current.src = imageSrc;
          } else {
            throw new Error("Failed to get canvas context for PDF page.");
          }
        } else if (originalFile.type.startsWith('image/')) {
          setOriginalImagePreviewSrc(fileSrc);
          if(originalImageRef.current) originalImageRef.current.src = fileSrc;
        } else {
          throw new Error("Unsupported file type. Please upload an image (PNG, JPG) or PDF.");
        }
        setProgress(100);
      } catch (err: any) {
        console.error("Error processing file:", err);
        setError(err.message || "Failed to load or process the file.");
        toast({ title: "Processing Error", description: err.message || "Failed to load or process the file.", variant: "destructive" });
        setOriginalImagePreviewSrc(null);
        if(originalImageRef.current) originalImageRef.current.src = "";
      } finally {
        setIsLoading(false);
        if (!error) setProgress(0); // Reset progress if no error
      }
    };

    reader.onerror = () => {
      setError("Failed to read the file.");
      toast({ title: "File Read Error", description: "Failed to read the file.", variant: "destructive" });
      setIsLoading(false);
      setProgress(0);
    };
    
    if (originalFile.type === 'application/pdf') {
      reader.readAsDataURL(originalFile); // Read as data URL for PDF.js data format
    } else {
      reader.readAsDataURL(originalFile); // For images
    }

  }, [originalFile, toast, error]); // Added error to dep array to clear progress if error occurs

  const applyWatermark = useCallback(() => {
    if (!originalImageRef.current || !originalImageRef.current.src || originalImageRef.current.naturalWidth === 0) {
      setError("Original image not loaded properly for watermarking.");
      toast({ title: "Watermark Error", description: "Original image not loaded. Please re-upload.", variant: "destructive" });
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setProgress(0);

    // Simulate progress for watermarking
    setTimeout(() => { // Use timeout to allow UI update for loader
      try {
        const img = originalImageRef.current!;
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
        const fontSize = Math.max(12, Math.min(canvas.width, canvas.height) / 25); // Adjusted font size
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = "rgba(128, 128, 128, 0.35)"; // Subtle gray, slightly less transparent
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        setProgress(60);

        const angle = -Math.PI / 4; // -45 degrees
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        
        // More robust step calculation for tiling
        const diagonalLength = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
        const repetitions = Math.ceil(diagonalLength / (textWidth * 0.7)); // Adjust density factor
        const step = diagonalLength / Math.max(5, repetitions); // Ensure at least 5 repetitions along diagonal for coverage

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle);
        
        for (let y = -diagonalLength / 2; y < diagonalLength / 2; y += step) {
          for (let x = -diagonalLength / 2; x < diagonalLength / 2; x += step * 2.5) { // Wider horizontal spacing
             ctx.fillText(text, x, y);
          }
        }
        
        // Reset transform for any further drawing if needed (though not in this case)
        ctx.rotate(-angle);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);

        setProgress(80);
        setWatermarkedImageSrc(canvas.toDataURL('image/png'));
        setProgress(100);
        toast({ title: "Success", description: "Watermark applied successfully!" });
      } catch (err: any) {
        console.error("Error applying watermark:", err);
        setError(err.message || "Failed to apply watermark.");
        toast({ title: "Watermark Error", description: err.message || "Failed to apply watermark.", variant: "destructive" });
        setWatermarkedImageSrc(null);
      } finally {
        setIsLoading(false);
        setProgress(0);
      }
    }, 100);

  }, [watermarkText, toast]);

  const handleDownload = () => {
    if (!watermarkedImageSrc || !originalFile) return;
    const link = document.createElement('a');
    link.href = watermarkedImageSrc;
    const fileNameParts = originalFile.name.split('.');
    const extension = fileNameParts.pop();
    const nameWithoutExtension = fileNameParts.join('.');
    link.download = `${nameWithoutExtension}_watermarked.${extension === 'pdf' ? 'png' : extension}`; // PDF becomes PNG
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
        {/* Hidden image element for loading and processing */}
        <img ref={originalImageRef} alt="Original for processing" className="hidden" crossOrigin="anonymous" />

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
                <RefreshCw className="mr-2 h-4 w-4" /> Clear Selection
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
                {isLoading && watermarkedImageSrc === null ? 'Applying...' : 'Apply Watermark'} 
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
              <CardDescription>Review your document. The original is on the left (if applicable), watermarked on the right.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Original Preview</Label>
                  {originalImagePreviewSrc ? (
                    <div className="mt-2 border rounded-md overflow-hidden aspect-video bg-muted flex items-center justify-center">
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={originalImagePreviewSrc} alt="Original Document" className="max-w-full max-h-[400px] object-contain transition-opacity duration-500 ease-in-out opacity-100" data-ai-hint="document scan" />
                    </div>
                  ) : (
                     <div className="mt-2 border rounded-md aspect-video bg-muted flex items-center justify-center text-muted-foreground">No document uploaded or preview unavailable.</div>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Watermarked Preview</Label>
                  {watermarkedImageSrc ? (
                    <div className="mt-2 border rounded-md overflow-hidden aspect-video bg-muted flex items-center justify-center">
                       {/* eslint-disable-next-line @next/next/no-img-element */}
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

    

    

    

    