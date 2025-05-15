import { ShieldCheck } from 'lucide-react';
import type React from 'react';

const AppLogo: React.FC = () => {
  return (
    <div className="flex items-center space-x-2">
      <ShieldCheck className="h-8 w-8 text-primary" />
      <h1 className="text-3xl font-bold text-foreground">IdMark</h1>
    </div>
  );
};

export default AppLogo;
