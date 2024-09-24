import React, { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { SparklesIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import MarkdownBlock from './MarkdownBlock';
import CopyButton, { CopyButtonMode } from "./CopyButton";
import { ChatMessage, MessageType } from "../models/ChatCompletion";
import UserContentBlock from "./UserContentBlock";
import TextToSpeechButton from "./TextToSpeechButton";
import '@fontsource/dancing-script';

interface Props {
  block: ChatMessage;
  loading: boolean;
  isLastBlock: boolean;
  className?: string;
  onAudioPlay: (isPlaying: boolean) => void;
  responseComplete?: boolean;
}

const ChatBlock: React.FC<Props> = ({ block, loading, isLastBlock, className, onAudioPlay, responseComplete }) => {
  const [isEdit, setIsEdit] = useState(false);
  const [editedBlockContent, setEditedBlockContent] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [savedHeight, setSavedHeight] = useState<string | null>(null);
  const textToSpeechButtonRef = useRef<any>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [typedContent, setTypedContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasStartedTyping, setHasStartedTyping] = useState(false);

  const errorStyles = block.messageType === MessageType.Error ? {
    backgroundColor: '#F5E6E6',
    borderColor: 'red',
    borderWidth: '1px',
    borderRadius: '8px',
    padding: '10px'
  } : {};

  useEffect(() => {
    if (isEdit) {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(0, 0);
    }
  }, [isEdit]);

  useEffect(() => {
    if (!loading && block.role === 'assistant' && isLastBlock && responseComplete) {
      if (textToSpeechButtonRef.current) {
        textToSpeechButtonRef.current.startAudio();
      }
    }
  }, [loading, block.role, isLastBlock, responseComplete]);

  useEffect(() => {
    if (isTyping && typedContent.length < block.content.length) {
      const timer = setTimeout(() => {
        setTypedContent(block.content.slice(0, typedContent.length + 1));
      }, 50);
      return () => clearTimeout(timer);
    } else if (isTyping && typedContent.length === block.content.length) {
      setIsTyping(false);
    }
  }, [isTyping, typedContent, block.content]);

  const handleRegenerate = () => {
    // Implementación de regeneración
  };

  const handleEdit = () => {
    if (contentRef.current) {
      setSavedHeight(`${contentRef.current.offsetHeight}px`);
    }
    setIsEdit(true);
    setEditedBlockContent(block.content);
  };

  const handleEditSave = () => {
    setIsEdit(false);
  };

  const handleEditCancel = () => {
    setIsEdit(false);
  };

  const checkForSpecialKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditCancel();
    }
  };

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setEditedBlockContent(event.target.value);
  };

  const handleAudioPlay = (isPlaying: boolean) => {
    setIsAudioPlaying(isPlaying);
    if (isPlaying) {
      setIsTyping(true);
      setHasStartedTyping(true);
      setTypedContent('');
    } else {
      setIsTyping(false);
    }
    onAudioPlay(isPlaying);
  };

  return (
    <div
      key={`chat-block-${block.id}`}
      className={`group w-full text-gray-800 dark:text-gray-100 border-b border-black/10 dark:border-gray-900/50 
        ${block.role === 'assistant' ? 'bg-green-800 dark:bg-gray-900' : 'bg-white dark:bg-gray-850'} 
        ${className || ''}`} 
    >
      <div className="text-base md:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl 3xl:max-w-6xl 4xl:max-w7xl p-2 flex lg:px-0 m-auto flex-col">
        <div className="w-full flex">
          <div className="w-[30px] flex flex-col relative items-end mr-4">
            <div className="relative flex h-[30px] w-[30px] p-0 rounded-sm items-center justify-center">
              {block.role === 'user' ? (
                <UserCircleIcon width={24} height={24} />
              ) : block.role === 'assistant' ? (
                <SparklesIcon key={`open-ai-logo-${block.id}`} />
              ) : null}
            </div>
          </div>
          <div className="relative flex w-[calc(100%-50px)] flex-col gap-1 md:gap-3 lg:w-full">
            <div
              id={`message-block-${block.id}`}
              className={`flex flex-grow flex-col gap-3 ${className || ''}`}
              style={{
                ...errorStyles,
                fontFamily: block.role === 'assistant' ? 'Dancing Script, cursive' : 'inherit',
                color: block.role === 'user' ? 'white' : 'black',
                fontSize: block.role === 'assistant' ? '240%' : 'inherit',
                backgroundColor: block.role === 'assistant' ? 'white' : 'inherit',
                padding: block.role === 'assistant' ? '10px' : 'inherit',
                borderRadius: block.role === 'assistant' ? '10px' : 'inherit',
                border: block.role === 'assistant' ? '3px solid black' : 'inherit',
                lineHeight: block.role === 'assistant' ? '1.8' : 'inherit'
              }}
            >
              <div className="min-h-[20px] flex flex-col items-start gap-4">
                {isEdit ? (
                  <textarea
                    spellCheck={false}
                    tabIndex={0}
                    ref={textareaRef}
                    style={{ height: savedHeight ?? undefined, lineHeight: '1.33', fontSize: '1rem' }}
                    className="border border-black/10 bg-white dark:border-gray-900/50 dark:bg-gray-700 w-full m-0 p-0 pr-7 pl-2 md:pl-0 resize-none bg-transparent dark:bg-transparent focus:ring-0 focus-visible:ring-0 outline-none shadow-none"
                    onChange={handleTextChange}
                    onKeyDown={checkForSpecialKey}
                    value={editedBlockContent}
                  ></textarea>
                ) : (
                  <div ref={contentRef} className="markdown prose w-full break-words dark:prose-invert light">
                    {block.role === 'user' ? (
                      <UserContentBlock text={block.content} fileDataRef={block.fileDataRef || []} />
                    ) : hasStartedTyping ? (
                      <MarkdownBlock markdown={typedContent} role={block.role} loading={false} />
                    ) : (
                      <div>Generando respuesta...</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {!(isLastBlock && loading) && (
          <div id={`action-block-${block.id}`} className="flex justify-start items-center ml-10">
            {block.role === 'assistant' && (
              <TextToSpeechButton 
                ref={textToSpeechButtonRef} 
                content={block.content} 
                onAudioPlay={handleAudioPlay} 
                autoPlay={responseComplete} 
              />
            )}
            <div className="copy-button">
              <CopyButton mode={CopyButtonMode.Compact} text={block.content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatBlock;