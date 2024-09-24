import React, { useState, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import Sidebar from "./components/SideBar";
import MainPage from "./components/MainPage";
import './App.css';
import { ToastContainer } from "react-toastify";
import ExploreCustomChats from "./components/ExploreCustomChats";
import CustomChatEditor from './components/CustomChatEditor';

const AppContent = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [nombre, setNombre] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const nombreParam = searchParams.get('nombre');
    if (nombreParam) {
      setNombre(nombreParam);
      console.log("Nombre capturado de la URL:", nombreParam);
      // Opcional: Remover el parámetro 'nombre' de la URL sin recargar la página
      searchParams.delete('nombre');
      window.history.replaceState({}, '', `${location.pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`);
    }
  }, [location]);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  interface MainPageProps {
    className: string;
    isSidebarCollapsed: boolean;
    toggleSidebarCollapse: () => void;
    nombre?: string | null;
  }

  const MainPageWithProps: React.FC<Partial<MainPageProps>> = (props) => (
    <MainPage
      className={'main-content'}
      isSidebarCollapsed={isSidebarCollapsed}
      toggleSidebarCollapse={toggleSidebarCollapse}
      nombre={nombre}
      {...props}
    />
  );

  return (
    <div className="App dark:bg-gray-900 dark:text-gray-100">
      <ToastContainer />
      <div className="flex overflow-hidden w-full h-full relative z-0">
        <Sidebar
          className="sidebar-container flex-shrink-0"
          isSidebarCollapsed={isSidebarCollapsed}
          toggleSidebarCollapse={toggleSidebarCollapse}
        />
        <div className="flex-grow h-full overflow-hidden">
          <Routes>
            <Route path="/" element={<MainPageWithProps />} />
            <Route path="/c/:id" element={<MainPageWithProps />} />
            <Route path="/explore" element={<ExploreCustomChats />} />
            <Route path="/g/:gid" element={<MainPageWithProps />} />
            <Route path="/g/:gid/c/:id" element={<MainPageWithProps />} />
            <Route path="/custom/editor" element={<CustomChatEditor />} />
            <Route path="/custom/editor/:id" element={<CustomChatEditor />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <I18nextProvider i18n={i18n}>
        <AppContent />
      </I18nextProvider>
    </BrowserRouter>
  );
};

export default App;