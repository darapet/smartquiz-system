import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.darapet.smartquiz',
  appName: 'DaraQuiz AI',
  webDir: 'www',
  bundledWebRuntime: false,
  server: {
    allowNavigation: [
      'firebaseapp.com',
      '*.firebaseapp.com',
      'firebaseio.com',
      '*.firebaseio.com',
      'googleapis.com',
      '*.googleapis.com',
      'pollinations.ai',
      '*.pollinations.ai',
      'pixabay.com',
      '*.pixabay.com',
      'tmpfiles.org',
      'file.io',
      'groq.com',
      '*.groq.com'
    ]
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#0d1b4b',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0d1b4b'
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    Microphone: {
      permissions: ['microphone']
    }
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    allowsLinkPreview: false
  }
};

export default config;
