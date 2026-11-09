import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

export default function InstallAppButton({ className = 'btn-primary' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if we are running as an installed app
    const isApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(isApp);

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      // Android / Desktop Chrome: trigger native install prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast.success('App installed successfully!');
      }
      setDeferredPrompt(null);
    } else {
      // iOS or already installed or unsupported
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('iphone') || ua.includes('ipad')) {
        toast.info('Tap the Share icon and select "Add to Home Screen" to install.', { duration: 6000 });
      } else {
        toast.info('Tap the browser menu (⋮) and select "Install App" or "Add to Home Screen".', { duration: 6000 });
      }
    }
  }

  // Hide the button only if the app is already installed and running as a PWA
  if (isStandalone) return null;

  return (
    <button 
      type="button"
      onClick={handleInstall} 
      className={`${className} flex items-center justify-center gap-2`}
    >
      <Download className="h-4 w-4" />
      Download App
    </button>
  );
}
