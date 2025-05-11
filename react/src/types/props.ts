import { TagModel } from '@/types/model';

export interface AppProps {
    isVisible: boolean;
    status: 'loading' | 'error' | 'success';
    type: 'tag' | 'lora' | 'simple';
    textarea: PilotTextArea | null;
    selectedCategory: string;
    selectedItem: ItemProps | null;
    items: ItemProps[];
    pos: {
        offset_x: number;
        offset_y: number;
        x: number;
        y: number;
    };
    parseResult: ParseResult;
    message: string;
}

export interface ItemProps {
    value: string;
    view: HTMLLIElement | null;
    isPriority: boolean;
    matchedWords: { word: string; index: number }[];
    category: string;
    useCount: number;
    postCount: number;
    consequentTagModel: TagModel | null;
    isOfficial: boolean;
    previewFile: string | null;
}

export interface Word {
    value: string;
    position: number;
    type: 'tag' | 'lora' | 'simple';
    isActive: boolean;
}

export interface PromptInfo {
    prompt: string;
    caretPosition: number;
    inputtingString: string;
    activeWordIndex: number;
    words: Word[];
}

export interface InsertionInfo {
    isMetaBlock: boolean;
    needPrependComma: boolean;
    needPrependSpace: boolean;
}

export interface ParseResult {
    promptInfo: PromptInfo;
    insertionInfo: InsertionInfo;
}
