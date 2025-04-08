import { PromptItem } from '../types/prompt';

let _prompt: string;
let _caret: number;
let _isComposing = false;
let _isChangingWeight = false;
let _activeWord: string;
let _activePromptItemIndex: number;
let _promptItems: PromptItem[];
let _isMetaBlock: boolean;
let _prependComma: boolean;
let _prependSpace: boolean;

export function initialize(prompt: string, caret: number): void {
    _prompt = prompt;
    _caret = caret;
    _activeWord = '';
    _activePromptItemIndex = -1;
    _promptItems = [];
    _isMetaBlock = false;
    _prependComma = false;
    _prependSpace = false;
}

export function getPrompt(): string {
    return _prompt;
}

export function setPrompt(prompt: string): void {
    _prompt = prompt;
}

export function getCaret(): number {
    return _caret;
}

export function setCaret(caret: number): void {
    _caret = caret;
}

export function isComposing(): boolean {
    return _isComposing;
}

export function setComposing(isComposing: boolean): void {
    _isComposing = isComposing;
}

export function isChangingWeight(): boolean {
    return _isChangingWeight;
}

export function setChangingWeight(isChangingWeight: boolean): void {
    _isChangingWeight = isChangingWeight;
}

export function getActiveWord(): string {
    return _activeWord;
}

export function setActiveWord(activeWord: string): void {
    _activeWord = activeWord;
}

export function getActivePromptItemIndex(): number {
    return _activePromptItemIndex;
}

export function setActivePromptItemIndex(activeTagIndex: number): void {
    _activePromptItemIndex = activeTagIndex;
}

export function getPromptItemList(): PromptItem[] {
    return _promptItems;
}

export function getPromptItem(index: number): PromptItem {
    return _promptItems[index];
}

export function getActivePromptItem(): PromptItem {
    return _promptItems[_activePromptItemIndex];
}

export function setPromptItemList(promptItemList: PromptItem[]): void {
    _promptItems = promptItemList;
}

export function addPromptItem(promptItem: PromptItem): void {
    _promptItems.push(promptItem);
}

export function isMetaBlock(): boolean {
    return _isMetaBlock;
}

export function setMetaBlock(isMetaBlock: boolean): void {
    _isMetaBlock = isMetaBlock;
}

export function needPrependComma(): boolean {
    return _prependComma;
}

export function setNeedPrependComma(prependComma: boolean): void {
    _prependComma = prependComma;
}

export function needPrependSpace(): boolean {
    return _prependSpace;
}

export function setNeedPrependSpace(prependSpace: boolean): void {
    _prependSpace = prependSpace;
}
