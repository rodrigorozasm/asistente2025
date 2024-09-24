import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {PlusIcon} from '@heroicons/react/24/outline';
import ChatSettingsList from './ChatSettingsList';
import chatSettingsDB, {ChatSettingsChangeEvent, chatSettingsEmitter} from '../service/ChatSettingsDB';
import {ChatSettings} from '../models/ChatSettings';
import {useTranslation} from 'react-i18next';
import chatSettingsData from '../service/chatSettingsData.json';
const ExploreCustomChats: React.FC = () => {
  const [exampleChats, setExampleChats] = useState<ChatSettings[]>([]);
  const [myChats, setMyChats] = useState<ChatSettings[]>([]);
  const navigate = useNavigate();
  const {t} = useTranslation();
  useEffect(() => {
    // Carga los datos del JSON directamente
    const allChatSettings: ChatSettings[] = chatSettingsData;
    
    setExampleChats(allChatSettings.filter(chat => chat.author === 'system' || chat.author === 'Ingeneria Industrial USACH'));
    setMyChats(allChatSettings.filter(chat => chat.author === 'user'));
  }, []);



  return (
    <div className="flex justify-center items-center h-screen gap-4 md:gap-6 md:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl 3xl:max-w-6xl 4xl:max-w7xl p-4 lg:px-0 m-auto">
      <div className="w-full">
        <h2 className="text-xl font-bold mb-2">{t('Asistentes Disponibles')}</h2>
        <ChatSettingsList chatSettings={exampleChats}/>
       
      
        <ChatSettingsList chatSettings={myChats}/>
      </div>
    </div>
  );
};

export default ExploreCustomChats;
