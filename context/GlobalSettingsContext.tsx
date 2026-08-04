import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

type GlobalSettings = {
  lineChiefMode: boolean;
  activeTowPlaneId: string;
};

const GlobalSettingsContext = createContext<GlobalSettings>({
  lineChiefMode: true,
  activeTowPlaneId: '',
});

export function GlobalSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<GlobalSettings>({
    lineChiefMode: true,
    activeTowPlaneId: '',
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'globalSettings', 'current'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          lineChiefMode: data.lineChiefMode ?? true,
          activeTowPlaneId: data.activeTowPlaneId || '',
        });
      }
    });
    return unsubscribe;
  }, []);

  return (
    <GlobalSettingsContext.Provider value={settings}>
      {children}
    </GlobalSettingsContext.Provider>
  );
}

export function useGlobalSettings() {
  return useContext(GlobalSettingsContext);
}
