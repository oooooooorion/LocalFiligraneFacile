
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, Download, Edit3, ShieldAlert, FileText, Image as ImageIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker:
if (typeof window !== 'undefined') {
  // For Next.js 15+ with Turbopack or modern Webpack
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
  const [originalImagePreviewSrc, setOriginalImagePreviewSrc] = useState<string | null>(null);
  const [watermarkText, setWatermarkText] = useState<string>('CONFIDENTIAL');
  const [watermarkedImageSrc, setWatermarkedImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const resetState = useCallback(() => {
    setOriginalFile(null);
    setOriginalImagePreviewSrc(null);
    setWatermarkedImageSrc(null);
    setIsLoading(false);
    setProgress(0);
    setError(null);
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    // Always reset previous state when a new file interaction occurs
    resetState();

    if (file) {
      if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
        const errText = "Unsupported file type. Please upload an image (PNG, JPG) or PDF.";
        setError(errText);
        toast({ title: "Unsupported File", description: errText, variant: "destructive" });
        // setOriginalFile(null) is handled by resetState()
        return;
      }

      if (file.size > 20 * 1024 * 1024) { // 20MB limit
        const errText = "File is too large. Maximum size is 20MB.";
        setError(errText);
        toast({ title: "Error", description: errText, variant: "destructive" });
        // setOriginalFile(null) is handled by resetState()
        return;
      }
      
      // If checks pass, set the file. Error state was cleared by resetState.
      setOriginalFile(file);
    }
    // If no file is selected (e.g., user cancels dialog), originalFile is already null due to resetState.
  };

  useEffect(() => {
    if (!originalFile) {
      // If originalFile is null, ensure preview is also cleared.
      // Other states like isLoading/progress/error are managed by resetState or specific error handlers.
      setOriginalImagePreviewSrc(null);
      return;
    }

    // This effect runs when originalFile changes and is valid.
    // resetState would have cleared any previous error messages.
    setIsLoading(true);
    setProgress(10);
    setError(null); // Explicitly clear error related to file processing

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
        } else if (originalFile.type.startsWith('image/')) {
          setOriginalImagePreviewSrc(fileSrc);
        }
        setProgress(100);
        toast({ title: "File Loaded", description: `${originalFile.name} ready for watermarking.` });
      } catch (err: any) {
        console.error("Error processing file:", err);
        const errorMessage = err.message || "Failed to load or process the file.";
        setError(errorMessage);
        toast({ title: "Processing Error", description: errorMessage, variant: "destructive" });
        setOriginalImagePreviewSrc(null); // Clear preview on error
        // Don't null originalFile here, let user decide to re-select or clear.
        // isLoading will be set to false in finally
      } finally {
        setIsLoading(false);
        // Don't reset progress to 0 here if it was successful, let it show 100%
        // If error, progress is less relevant than the error message.
      }
    };

    reader.onerror = () => {
      const errorMessage = "Failed to read the file.";
      setError(errorMessage);
      toast({ title: "File Read Error", description: errorMessage, variant: "destructive" });
      setIsLoading(false);
      setProgress(0);
      setOriginalImagePreviewSrc(null);
      // setOriginalFile(null); // Let user decide to re-select.
    };
    
    reader.readAsDataURL(originalFile);

  }, [originalFile, toast, resetState]); // resetState is included if its definition might change, though it's stable here.

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
    // No crossOrigin needed for data URIs

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
        ctx.fillStyle = "rgba(128, 128, 128, 0.35)"; // Neutral gray with transparency
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        setProgress(60);

        // Watermark tiling logic
        const angle = -Math.PI / 4; // Diagonal angle
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        // const textHeight = fontSize; // Approximate height

        // Calculate spacing based on image dimensions and text size
        const diagonalLength = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
        const repetitions = Math.ceil(diagonalLength / (textWidth * 0.7)); // Ensure coverage, adjust 0.7 for density
        const step = diagonalLength / Math.max(5, repetitions); // Dynamic step, ensure at least 5 steps

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle);
        
        // Tile the watermark
        for (let y = -diagonalLength / 2; y < diagonalLength / 2; y += step) {
          for (let x = -diagonalLength / 2; x < diagonalLength / 2; x += step * 2.5) { // Wider horizontal spacing
             ctx.fillText(text, x, y);
          }
        }
        
        // Reset transformations
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
        // Don't reset progress to 0 if successful
      }
    };

    img.onerror = (errEv) => {
        console.error("Error loading image for watermarking (in-memory Image object):", errEv);
        // This error means originalImagePreviewSrc itself is problematic for canvas use
        setError("Failed to load image for watermarking. The image data might be corrupted or the format is unsupported by the browser for canvas operations.");
        toast({ title: "Watermark Error", description: "Failed to load image for watermarking. Please try again or use a different file.", variant: "destructive" });
        setIsLoading(false);
        setProgress(0);
        setWatermarkedImageSrc(null);
    };
    
    img.src = originalImagePreviewSrc; // Trigger loading of the preview source into the in-memory image

  }, [originalImagePreviewSrc, watermarkText, toast]);

  const handleDownload = () => {
    if (!watermarkedImageSrc || !originalFile) return;
    const link = document.createElement('a');
    link.href = watermarkedImageSrc;
    
    const fileNameParts = originalFile.name.split('.');
    const extension = fileNameParts.pop() || 'png'; // Default to png if no extension
    const nameWithoutExtension = fileNameParts.join('.') || 'document'; // Default to 'document' if no name part
    
    // If original was PDF, downloaded watermarked image is PNG. Otherwise, keep original extension.
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
        {/* Hidden image element removed */}

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

        {isLoading && progress > 0 && ( // Show progress if loading and progress has started
           <div className="w-full p-4 rounded-md bg-card">
             <Progress value={progress} className="w-full" />
             <p className="text-sm text-muted-foreground text-center mt-2">Processing: {progress}%</p>
           </div>
        )}

        {error && ( // Display error if any
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {originalImagePreviewSrc && !isLoading && !error && ( // Show watermark customization only if preview exists, not loading, and no error
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
        
        {/* Preview & Download Section: Show if either original or watermarked preview exists, not loading, and no overriding error */}
        {(originalImagePreviewSrc || watermarkedImageSrc) && !isLoading && !error && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center">
                {/* Dynamically choose icon based on original file type if available */}
                {originalFile?.type === 'application/pdf' ? <FileText className="mr-2 h-6 w-6 text-primary" /> : <ImageIcon className="mr-2 h-6 w-6 text-primary" />}
                Preview & Download
              </CardTitle>
              <CardDescription>Review your document. The original is on the left, watermarked on the right (if applied).</CardDescription>
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
            {watermarkedImageSrc && ( // Download button only if watermarked image exists
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
