import React, { useContext, useEffect, useRef, useState } from 'react';
import { ChatService } from "../service/ChatService";
import Chat from "./Chat";
import { ChatCompletion, ChatMessage, MessageType, Role } from "../models/ChatCompletion";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { OPENAI_DEFAULT_SYSTEM_PROMPT } from "../config";
import { CustomError } from "../service/CustomError";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom/client';
import MessageBox, { MessageBoxHandles } from "./MessageBox";
import { CONVERSATION_NOT_FOUND, DEFAULT_INSTRUCTIONS, DEFAULT_MODEL, MAX_TITLE_LENGTH, SNIPPET_MARKERS } from "../constants/appConstants";
import { ChatSettings } from '../models/ChatSettings';
import chatSettingsDB, { chatSettingsEmitter, updateShowInSidebar } from '../service/ChatSettingsDB';
import ChatSettingDropdownMenu from "./ChatSettingDropdownMenu";
import ConversationService, { Conversation } from '../service/ConversationService';
import { UserContext } from '../UserContext';
import { NotificationService } from '../service/NotificationService';
import CustomChatSplash from './CustomChatSplash';
import { FileDataRef } from '../models/FileData';
import { OpenAIModel } from '../models/model';
import { ArrowUturnDownIcon, MicrophoneIcon, StopIcon } from '@heroicons/react/24/outline';
import VideoPlayer from './VideoPlayer';

import classes from './mainPage.module.css';

function getFirstValidString(...args: (string | undefined | null)[]): string {
  for (const arg of args) {
    if (arg !== null && arg !== undefined && arg.trim() !== '') {
      return arg;
    }
  }
  return '';
}

interface MainPageProps {
  className: string;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapse: () => void;
  nombre?: string | null;
}

const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

const MainPage: React.FC<MainPageProps> = ({ className, isSidebarCollapsed, toggleSidebarCollapse , nombre}) => {
  const { userSettings } = useContext(UserContext);
  const { t } = useTranslation();
  const [chatSettings, setChatSettings] = useState<ChatSettings | undefined>(undefined);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [model, setModel] = useState<OpenAIModel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { id, gid } = useParams<{ id?: string, gid?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [allowAutoScroll, setAllowAutoScroll] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isRecording, setRecording] = useState(false);
  const [isReady, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const messageBoxRef = useRef<MessageBoxHandles>(null);
  const chatSettingsRef = useRef(chatSettings);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [isProcessingFirstChunk, setIsProcessingFirstChunk] = useState(true);
  const firstChunkRef = useRef('');

  
  
  useEffect(() => {
    if (nombre) {
      console.log("Nombre recibido en MainPage:", nombre);
    }
  }, [nombre]);
  const handleAudioPlay = (isPlaying: boolean) => {
    setIsAudioPlaying(isPlaying);
  };

  const handleStream = (stream: MediaStream) => {
    try {
      mediaRef.current = new MediaRecorder(stream, {
        audioBitsPerSecond: 128000,
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRef.current.addEventListener('dataavailable', handleData);
      mediaRef.current.addEventListener("stop", handleStop);

      setReady(true);
    } catch (error) {
      console.error("Error al manejar el stream de audio:", error);
    }
  };

  const handleData = (e: BlobEvent) => {
    if (chunksRef.current) {
      chunksRef.current.push(e.data);
    }
  };
  const [transcription, setTranscription] = useState<string>('');

  const handleStop = () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
    const name = `file${Date.now()}` + Math.round(Math.random() * 100000);
    const file = new File([blob], `${name}.webm`);

    chunksRef.current = [];
    sendData(name, file);
  };

  const sendData = async (name: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file, `${name}.webm`);
    formData.append('name', name);
    formData.append('datetime', new Date().toISOString());
    formData.append('options', JSON.stringify({
      language: chatSettings?.language || 'es',
      temperature: chatSettings?.temperature || 0,
    }));
    console.log("[send data]", (new Date()).toLocaleTimeString());

    try {
      const url = '${baseUrl}/transcribe';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: formData,
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        console.error('Error en la respuesta del servidor:', response.status, response.statusText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result?.transcription) {
        console.log("Transcripción recibida:", result.transcription);

        const transcriptionText = result.transcription.split('\n').slice(1).join(' ');

        addMessage(Role.User, MessageType.Normal, transcriptionText, [], handleTranscriptionMessage);
      } else {
        console.log("La respuesta no contiene una transcripción");
      }
    } catch (err) {
      console.error("Error al enviar el archivo:", err.message);
    }
  };

  const handleTranscriptionMessage = (updatedMessages: ChatMessage[]) => {
    setLoading(true);
    clearInputArea();

    let messages: ChatMessage[] = [
      {
        role: Role.System,
        content: OPENAI_DEFAULT_SYSTEM_PROMPT,
      } as ChatMessage,
      ...updatedMessages,
    ];

    let effectiveSettings = getEffectiveChatSettings();

    ChatService.sendMessageStreamed(effectiveSettings, messages, handleStreamedResponse,nombre,isFirstMessage)
      .then((response: ChatCompletion) => {
        // nop
      })
      .catch((err) => {
        if (err instanceof CustomError) {
          const message: string = err.message;
          setLoading(false);
          addMessage(Role.Assistant, MessageType.Error, message, []);
        } else {
          NotificationService.handleUnexpectedError(err, 'Failed to send message to  Asistente Industrias.');
        }
      })
      .finally(() => {
        setLoading(false);
        setIsFirstMessage(false);
      });
  };

  const startRecording = () => {
    if (mediaRef.current && mediaRef.current.state === 'inactive') {
      mediaRef.current.start();
      setRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
      setRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(handleStream)
        .catch((error) => {
          console.error("Error al acceder al micrófono", error);
          setErrorMessage('Error al acceder al micrófono');
        });
    } else {
      setErrorMessage('El navegador no soporta el acceso a dispositivos multimedia');
    }
  }, []);

  useEffect(() => {
    chatSettingsEmitter.on('chatSettingsChanged', chatSettingsListener);

    const button = createButton();
    buttonRef.current = button;

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      chatSettingsEmitter.off('chatSettingsChanged', chatSettingsListener);
    };
  }, []);

  useEffect(() => {
    chatSettingsRef.current = chatSettings;
  }, [chatSettings]);

  useEffect(() => {
    if (location.pathname === '/') {
      newConversation();
    } else {
      if (id) {
        handleSelectedConversation(id);
      } else {
        newConversation();
      }
    }

    if (gid) {
      const gidNumber = Number(gid);
      if (!isNaN(gidNumber)) {
        fetchAndSetChatSettings(gidNumber);
      } else {
        setChatSettings(undefined);
      }
    } else {
      setChatSettings(undefined);
    }
  }, [gid, id, location.pathname]);

  useEffect(() => {
    if (location.state?.reset) {
      messageBoxRef.current?.reset();
      messageBoxRef.current?.focusTextarea();
    }
  }, [location.state]);

  useEffect(() => {
    if (messages.length === 0) {
      setConversation(null);
    }
    if (conversation && conversation.id) {
      if (messages.length > 0) {
        ConversationService.updateConversation(conversation, messages);
      }
    }
  }, [messages]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        ChatService.cancelStream();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    if (userSettings.model) {
      fetchModelById(userSettings.model).then(setModel);
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAudioEnded = () => {
    console.log('Audio playback ended');
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.addEventListener('ended', handleAudioEnded);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('ended', handleAudioEnded);
      }
    };
  }, []);

  useEffect(() => {
    if (userSettings.model) {
      fetchModelById(userSettings.model).then(setModel);
    }
  }, [userSettings]);

  const fetchModelById = async (modelId: string): Promise<OpenAIModel | null> => {
    try {
      const fetchedModel = await ChatService.getModelById(modelId);
      return fetchedModel;
    } catch (error) {
      console.error('Failed to fetch model:', error);
      if (error instanceof Error) {
        NotificationService.handleUnexpectedError(error, 'Failed to fetch model.');
      }
      return null;
    }
  };

  const chatSettingsListener = (data: { gid?: number }) => {
    const currentChatSettings = chatSettingsRef.current;
    if (data && typeof data === 'object') {
      if (currentChatSettings && currentChatSettings.id === data.gid) {
        fetchAndSetChatSettings(data.gid);
      }
    } else {
      if (currentChatSettings) {
        fetchAndSetChatSettings(currentChatSettings.id);
      }
    }
  };

  const fetchAndSetChatSettings = async (gid: number) => {
    try {
      const settings = await chatSettingsDB.chatSettings.get(gid);
      setChatSettings(settings);
      if (settings) {
        if (settings.model === null) {
          setModel(null);
        } else {
          fetchModelById(settings.model).then(setModel);
        }
      }
    } catch (error) {
      console.error('Failed to fetch chat settings:', error);
    }
  };

  const newConversation = () => {
    setConversation(null);
    setShowScrollButton(false);
    clearInputArea();
    setMessages([]);
    messageBoxRef.current?.focusTextarea();
  };

  const handleSelectedConversation = (id: string | null) => {
    if (id && id.length > 0) {
      let n = Number(id);
      ConversationService.getConversationById(n)
        .then((conversation) => {
          if (conversation) {
            setConversation(conversation);
            clearInputArea();
            ConversationService.getChatMessages(conversation).then((messages: ChatMessage[]) => {
              if (messages.length == 0) {
                console.warn('possible state problem');
              } else {
                setMessages(messages);
              }
            });
          } else {
            const errorMessage = 'Conversation ' + location.pathname + ' not found';
            NotificationService.handleError(errorMessage, CONVERSATION_NOT_FOUND);
            navigate('/');
          }
        });
    } else {
      newConversation();
    }
    setAllowAutoScroll(true);
    setShowScrollButton(false);
    messageBoxRef.current?.focusTextarea();
  };

  function getTitle(message: string): string {
    let title = message.trimStart();
    let firstNewLineIndex = title.indexOf('\n');
    if (firstNewLineIndex === -1) {
      firstNewLineIndex = title.length;
    }
    return title.substring(0, Math.min(firstNewLineIndex, MAX_TITLE_LENGTH));
  }

  function startConversation(message: string, fileDataRef: FileDataRef[]) {
    const id = Date.now();
    const timestamp = Date.now();
    let shortenedText = getTitle(message);
    let instructions = getFirstValidString(
      chatSettings?.instructions,
      userSettings.instructions,
      OPENAI_DEFAULT_SYSTEM_PROMPT,
      DEFAULT_INSTRUCTIONS
    );
    const conversation: Conversation = {
      id: id,
      gid: getEffectiveChatSettings().id,
      timestamp: timestamp,
      title: shortenedText,
      model: model?.id || DEFAULT_MODEL,
      systemPrompt: instructions,
      messages: '[]',
    };
    setConversation(conversation);
    ConversationService.addConversation(conversation);
    if (gid) {
      navigate(`/g/${gid}/c/${conversation.id}`);
      updateShowInSidebar(Number(gid), 1);
    } else {
      navigate(`/c/${conversation.id}`);
    }
  }

  const handleModelChange = (value: string | null) => {
    if (value === null) {
      setModel(null);
    } else {
      fetchModelById(value).then(setModel);
    }
  };

  const callApp = (message: string, fileDataRef: FileDataRef[]) => {
    console.log('callApp called with message:', message);
    if (!conversation) {
      startConversation(message, fileDataRef);
    }
    setAllowAutoScroll(true);
    addMessage(Role.User, MessageType.Normal, message, fileDataRef, sendMessage);
  };

  const addMessage = (
    role: Role,
    messageType: MessageType,
    message: string,
    fileDataRef: FileDataRef[],
    callback?: (callback: ChatMessage[]) => void
  ) => {
    let content: string = message;

    setMessages((prevMessages: ChatMessage[]) => {
      const message: ChatMessage = {
        id: prevMessages.length + 1,
        role: role,
        messageType: messageType,
        content: content,
        fileDataRef: fileDataRef,
      };
      return [...prevMessages, message];
    });

    const newMessage: ChatMessage = {
      id: messages.length + 1,
      role: role,
      messageType: messageType,
      content: content,
      fileDataRef: fileDataRef,
    };
    const updatedMessages = [...messages, newMessage];
    if (callback) {
      callback(updatedMessages);
    }
  };

  function getEffectiveChatSettings(): ChatSettings {
    let effectiveSettings = chatSettings;
    if (!effectiveSettings) {
      effectiveSettings = {
        id: 0,
        author: 'system',
        name: 'default',
        model: model?.id || DEFAULT_MODEL,
      };
    }
    return effectiveSettings;
  }

  function sendMessage(updatedMessages: ChatMessage[]) {
    setLoading(true);
    clearInputArea();
    let systemPrompt = getFirstValidString(
      conversation?.systemPrompt,
      chatSettings?.instructions,
      userSettings.instructions,
      OPENAI_DEFAULT_SYSTEM_PROMPT,
      DEFAULT_INSTRUCTIONS
    );
    let messages: ChatMessage[] = [
      {
        role: Role.System,
        content: systemPrompt,
      } as ChatMessage,
      ...updatedMessages,
    ];

    let effectiveSettings = getEffectiveChatSettings();

    ChatService.sendMessageStreamed(effectiveSettings, messages, handleStreamedResponse,nombre,isFirstMessage)
      .then((response: ChatCompletion) => {
        // nop
      })
      .catch((err) => {
        if (err instanceof CustomError) {
          const message: string = err.message;
          setLoading(false);
          addMessage(Role.Assistant, MessageType.Error, message, []);
        } else {
          NotificationService.handleUnexpectedError(err, 'Failed to send message to openai.');
        }
      })
      .finally(() => {
        setLoading(false);
        setIsFirstMessage(false);
      });
  }

  function handleStreamedResponse(content: string, fileDataRef: FileDataRef[], isEnd?: boolean,isFirst?: boolean) {
    if (isEnd) {
      console.log('Respuesta completa recibida');
      setLoading(false);
      // Aquí puedes añadir cualquier lógica adicional para manejar el final de la respuesta
      return;
    }
    setMessages((prevMessages) => {
      console.log('Fragmento de respuesta recibido:', content);
  
      if (prevMessages.length === 0) {
        console.error('prevMessages should not be empty in handleStreamedResponse.');
        return [];
      }
  
      const lastMessage = prevMessages[prevMessages.length - 1];
      
      if (lastMessage.role === Role.User) {
        // Si el último mensaje es del usuario, creamos un nuevo mensaje del asistente
        return [...prevMessages, {
          id: prevMessages.length + 1,
          role: Role.Assistant,
          messageType: MessageType.Normal,
          content: content,
          fileDataRef: fileDataRef
        }];
      } else if (lastMessage.role === Role.Assistant) {
        // Si el último mensaje es del asistente, añadimos el nuevo contenido
        const updatedLastMessage = {
          ...lastMessage,
          content: lastMessage.content + content
        };
        return [...prevMessages.slice(0, -1), updatedLastMessage];
      }
  
      // Si llegamos aquí, algo inesperado ha ocurrido
      console.error('Unexpected message state in handleStreamedResponse');
      return prevMessages;
    });
  
    // Verificar si este es el último fragmento de la respuesta
    if (isLastPartOfResponse(content)) {
      console.log('Respuesta completa recibida');
      // Aquí puedes añadir cualquier lógica adicional para manejar el final de la respuesta
    }
  }
  
  function isLastPartOfResponse(content: string): boolean {
    // Mejorar la detección del final de la respuesta
    return content.trim().endsWith('.') || content.trim().endsWith('!') || content.trim().endsWith('?');
  }

  function playAudioResponse(text: string) {
    const synth = window.speechSynthesis;
    const utterThis = new SpeechSynthesisUtterance(text);
    synth.speak(utterThis);
    console.log('Reproduciendo audio:', text);
  }

  const scrollToBottom = () => {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.scroll({
        top: chatContainer.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const clearInputArea = () => {
    messageBoxRef.current?.clearInputValue();
  };

  const getTextAreaValue = () => {
    const value = messageBoxRef.current?.getTextValue();
  };

  const handleUserScroll = (isAtBottom: boolean) => {
    setAllowAutoScroll(isAtBottom);
    setShowScrollButton(!isAtBottom);
  };

  const createButton = () => {
    const button = document.createElement('button');
    button.className = 'px-2 py-1 bg-gray-100 text-black dark:text-black dark:bg-gray-200 border border-gray-200 dark:border-gray-800 rounded-md shadow-md hover:bg-gray-200 dark:hover:bg-gray-100 focus:outline-none';

    const iconContainer = document.createElement('div');
    iconContainer.className = 'h-5 w-5';

    const root = ReactDOM.createRoot(iconContainer);
    root.render(<ArrowUturnDownIcon />);

    button.appendChild(iconContainer);
    button.addEventListener('mousedown', (event) => event.stopPropagation());
    button.addEventListener('mouseup', (event) => event.stopPropagation());
    button.addEventListener('click', handleQuoteSelectedText);
    return button;
  };

  const handleSelectionChange = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim() === '') {
      if (buttonRef.current && buttonRef.current.parentNode) {
        buttonRef.current.parentNode.removeChild(buttonRef.current);
        buttonRef.current = null;
      }
    }
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim() !== '') {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (buttonRef.current && buttonRef.current.parentNode) {
        buttonRef.current.parentNode.removeChild(buttonRef.current);
      }

      const newButton = createButton();
      const buttonHeight = 30;
      const buttonWidth = newButton.offsetWidth;

      const chatContainer = document.getElementById('chat-container1');
      if (chatContainer) {
        const containerRect = chatContainer.getBoundingClientRect();

        newButton.style.position = 'absolute';
        newButton.style.left = `${rect.left - containerRect.left + rect.width / 2 - buttonWidth / 2}px`;
        newButton.style.top = `${rect.top - containerRect.top - buttonHeight}px`;
        newButton.style.display = 'inline-block';
        newButton.style.verticalAlign = 'middle';
        newButton.style.zIndex = '1000';

        chatContainer.appendChild(newButton);

        buttonRef.current = newButton;
      }
    }
  };

  const handleQuoteSelectedText = () => {
    const selection = window.getSelection();
    if (selection) {
      const selectedText = selection.toString();
      const modifiedText = `Assistant wrote:\n${SNIPPET_MARKERS.begin}\n${selectedText}\n${SNIPPET_MARKERS.end}\n`;
      messageBoxRef.current?.pasteText(modifiedText);
      messageBoxRef.current?.focusTextarea();
    }
  };

  return (
    <div className={`${className} overflow-hidden w-full h-full relative flex z-0 dark:bg-gray-900`}>
      <div className="flex flex-col items-stretch w-full h-full">
        <main
          className="relative h-full transition-width flex flex-col overflow-hidden items-stretch flex-1"
          onMouseUp={handleMouseUp}
        >
          <Chat
            chatBlocks={messages}
            onChatScroll={handleUserScroll}
            conversation={conversation}
            model={model?.id || DEFAULT_MODEL}
            onModelChange={handleModelChange}
            allowAutoScroll={allowAutoScroll}
            loading={loading}
            onAudioPlay={handleAudioPlay}
            responseComplete={!loading && messages.length > 0 && messages[messages.length - 1].role === Role.Assistant}
          />
          {showScrollButton && (
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 mb-10 z-10">
              <ScrollToBottomButton onClick={scrollToBottom} />
            </div>
          )}
         
          <MessageBox
            ref={messageBoxRef}
            callApp={callApp}
            loading={loading}
            setLoading={setLoading}
            allowImageAttachment={model === null || model?.image_support || false ? 'yes' : (!conversation ? 'warn' : 'no')}
          />
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 z-50 w-80 h-80 ">
            <VideoPlayer isAudioPlaying={isAudioPlaying} />
          </div>

          <div className="absolute bottom-0 right-0 m-4">
            <button
              onClick={toggleRecording}
              className={`p-4 rounded-full shadow-md ${isRecording ? 'bg-red-600' : 'bg-green-600'} text-white`}
            >
              {isRecording ? <StopIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
            </button>
          </div>

          {errorMessage && (
            <div className="absolute bottom-0 left-0 right-0 bg-red-500 text-white text-center p-2">
              {errorMessage}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MainPage;
