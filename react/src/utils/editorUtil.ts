import { AppProps, ItemProps } from '@/types/props';
import * as db_tag from '@/services/tagService';
import { EXTENSION_ID } from '@/const/common';

interface TextInsertionData {
    range: {
        start: number;
        end: number;
    };
    insertText: string;
}

export function insertWordIntoPrompt(state: AppProps) {
    let itemProps: ItemProps | undefined;
    if (state.selectedItem) {
        itemProps = state.selectedItem;
    }
    if (!itemProps) {
        return;
    }

    let insertionData: TextInsertionData;
    if (state.type === 'tag') {
        insertionData = getTagInsertionData(state, itemProps);
    } else if (state.type === 'lora') {
        insertionData = getLoraInsertionData(state, itemProps);
    } else if (state.type === 'simple') {
        insertionData = getSuggestionInsertionData(state, itemProps);
    } else {
        return;
    }

    const usingExecCommand = window.opts[`${EXTENSION_ID}_using_execCommand`] as boolean;

    const textarea = state.textarea!;
    if (usingExecCommand) {
        textarea.focus();
        textarea.setSelectionRange(insertionData.range.start, insertionData.range.end);
        document.execCommand('insertText', false, insertionData.insertText);
    } else {
        const val = textarea.value;
        textarea.value = val.slice(0, insertionData.range.start) + insertionData.insertText + val.slice(insertionData.range.end);
    }
    textarea.selectionStart = textarea.selectionEnd = insertionData.range.start + insertionData.insertText.length;
}

function getTagInsertionData(state: AppProps, props: ItemProps): TextInsertionData {
    const { promptInfo, insertionInfo } = state.parseResult;

    const activeWord = promptInfo.words[promptInfo.activeWordIndex];
    let startPosition = activeWord.position;
    let offset = -1;
    const tags: string[] = [];
    tags.push(props.value);
    if (props.consequentTagModel) {
        tags.push(props.consequentTagModel.value);
    }
    const insertionRange = promptInfo.prompt.substring(startPosition, promptInfo.caretPosition);
    for (const wordInfo of splitStringWithIndices(insertionRange, /[ _-]/g)) {
        for (const tag of tags) {
            if (wordInfo.word === '') {
                continue;
            }
            const escapedPart = escapeRegex(unescapePrompt(wordInfo.word));
            const match = new RegExp(`(?:^|[ _-])${escapedPart}`, 'gi').exec(tag);
            if (match && match.index !== -1) {
                if (offset === -1 || offset > wordInfo.position) {
                    offset = wordInfo.position;
                }
            }
        }
    }
    if (offset > -1) {
        startPosition += offset;
    }

    let insertTag = props.isOfficial ? props.value : props.consequentTagModel!.value;
    const source = (window.opts[`${EXTENSION_ID}_tag_source`] as string).replace(/\./g, '_');
    const delimiter = (window.opts[`${EXTENSION_ID}_${source}_${props.category}_tag_delimiter`] as string) ?? 'auto';
    if (!db_tag.alwaysSpaceTags.has(insertTag)) {
        let replaceToUnderscore = false;
        if (db_tag.alwaysUnderscoreTags.has(insertTag)) {
            replaceToUnderscore = true;
        } else if (delimiter === 'underscore') {
            replaceToUnderscore = true;
        } else if (delimiter === 'auto') {
            replaceToUnderscore = promptInfo.inputtingString.includes('_');
        }
        if (replaceToUnderscore) {
            insertTag = insertTag.replace(/ /g, '_');
        }
    }

    if (insertionInfo.needPrependComma) {
        insertTag = ', ' + insertTag;
    } else if (offset <= 0 && insertionInfo.needPrependSpace) {
        insertTag = ' ' + insertTag;
    }
    insertTag = escapePrompt(insertTag);

    const appendComma = window.opts[`${EXTENSION_ID}_append_comma`] as boolean;
    if (appendComma) {
        insertTag += ',';
    }
    insertTag += ' ';
    return { range: { start: startPosition, end: promptInfo.caretPosition }, insertText: insertTag };
}

function getLoraInsertionData(state: AppProps, props: ItemProps): TextInsertionData {
    const { promptInfo } = state.parseResult;

    const activeWord = promptInfo.words[promptInfo.activeWordIndex];
    const startPosition = activeWord.position;
    let loraName = props.value;
    const match = promptInfo.prompt.substring(startPosition).match(/^<(?:lora|lyco):[^<>:]+(:.+>)/i);
    let caret = promptInfo.caretPosition;
    if (match) {
        caret = startPosition + match[0].length;
        loraName += match[1];
    } else {
        loraName += ':1>';
    }
    loraName += ' ';
    return { range: { start: startPosition, end: caret }, insertText: loraName };
}

function getSuggestionInsertionData(state: AppProps, props: ItemProps): TextInsertionData {
    const { promptInfo, insertionInfo } = state.parseResult;

    const activeWord = promptInfo.words[promptInfo.activeWordIndex];
    const startPosition = activeWord.position;
    const tag = db_tag.getTagModel(props.value);
    const category = tag?.category ?? 'custom';
    let word = escapePrompt(props.value);

    const source = (window.opts[`${EXTENSION_ID}_tag_source`] as string).replace(/\./g, '_');
    const delimiter = (window.opts[`${EXTENSION_ID}_${source}_${category}_tag_delimiter`] as string) ?? 'auto';
    if (!db_tag.alwaysSpaceTags.has(word)) {
        let replaceToUnderscore = false;
        if (db_tag.alwaysUnderscoreTags.has(word)) {
            replaceToUnderscore = true;
        } else if (delimiter === 'underscore') {
            replaceToUnderscore = true;
        } else if (delimiter === 'auto') {
            replaceToUnderscore = promptInfo.inputtingString.includes('_');
        }
        if (replaceToUnderscore) {
            word = word.replace(/ /g, '_');
        }
    }

    if (insertionInfo.needPrependComma) {
        word = ', ' + word;
    } else if (insertionInfo.needPrependSpace) {
        word = ' ' + word;
    }

    const appendComma = window.opts[`${EXTENSION_ID}_append_comma`] as boolean;
    if (appendComma) {
        word += ',';
    }
    word += ' ';
    return { range: { start: startPosition, end: promptInfo.caretPosition }, insertText: word };
}

export function htmlEncode(str: string): string {
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
}

export function escapePrompt(str: string): string {
    return str.replace(/[{}()\[\]\\]/g, '\\$&');
}

export function unescapePrompt(str: string): string {
    let props = '';
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '\\') {
            if (i + 1 < str.length) {
                props += str[i + 1];
                i++;
            } else {
                props += '\\';
            }
        } else {
            props += str[i];
        }
    }
    return props;
}

export function splitStringWithIndices(input: string, delimiter: RegExp): { word: string; position: number }[] {
    const props: { word: string; position: number }[] = [];
    const regex = delimiter;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = regex.exec(input)) !== null) {
        props.push({ word: input.slice(lastIndex, match.index), position: lastIndex });
        lastIndex = regex.lastIndex;
    }

    props.push({ word: input.slice(lastIndex), position: lastIndex });
    return props;
}
