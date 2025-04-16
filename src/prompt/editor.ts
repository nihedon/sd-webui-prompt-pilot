import * as db_tag from 'database/tag';
import { EXTENSION_ID } from 'shared/const/common';
import * as contextState from 'shared/state/context';
import * as promptState from 'shared/state/prompt';
import { LoraModel, LoraResult, Result, SuggestionModel, SuggestionResult, TagModel, TagResult } from 'shared/types/model';
import { escapePrompt, escapeRegex, splitStringWithIndices, unescapePrompt } from 'shared/util';

interface InsertionInfo {
    range: {
        start: number;
        end: number;
    };
    insertText: string;
}

export function insertWordIntoPrompt(result: Result<TagModel | LoraModel | SuggestionModel> | undefined) {
    if (!result) {
        result = contextState.getSelectedResult();
    }
    if (!result) {
        return;
    }

    let insertionInfo: InsertionInfo;
    if (result instanceof TagResult) {
        insertionInfo = getTagInsertionInfo(result.model);
    } else if (result instanceof LoraResult) {
        insertionInfo = getLoraInsertionInfo(result.model);
    } else if (result instanceof SuggestionResult) {
        insertionInfo = getSuggestionInsertionInfo(result.model);
    } else {
        return;
    }

    const usingExecCommand = window.opts[`${EXTENSION_ID}_using_execCommand`] as boolean;

    const textarea = contextState.getActiveTextarea()!;
    if (usingExecCommand) {
        textarea.focus();
        textarea.setSelectionRange(insertionInfo.range.start, insertionInfo.range.end);
        document.execCommand('insertText', false, insertionInfo.insertText);
    } else {
        const val = textarea.value;
        textarea.value = val.slice(0, insertionInfo.range.start) + insertionInfo.insertText + val.slice(insertionInfo.range.end);
    }
    textarea.selectionStart = textarea.selectionEnd = insertionInfo.range.start + insertionInfo.insertText.length;
}

function getTagInsertionInfo(model: TagModel): InsertionInfo {
    let startPosition = promptState.getActivePromptItem().position;
    let offset = -1;
    const tags: string[] = [];
    tags.push(model.value);
    if (model.consequentTagModel) {
        tags.push(model.consequentTagModel.value);
    }
    const insertionRange = promptState.getPrompt().substring(startPosition, promptState.getCaret());
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

    let insertTag = model.isOfficial ? model.value : model.consequentTagModel!.value;
    const source = (window.opts[`${EXTENSION_ID}_tag_source`] as string).replace(/\./g, '_');
    const delimiter = (window.opts[`${EXTENSION_ID}_${source}_${model.category}_tag_delimiter`] as string) ?? 'auto';
    if (!db_tag.alwaysSpaceTags.has(insertTag)) {
        let replaceToUnderscore = false;
        if (db_tag.alwaysUnderscoreTags.has(insertTag)) {
            replaceToUnderscore = true;
        } else if (delimiter === 'underscore') {
            replaceToUnderscore = true;
        } else if (delimiter === 'auto') {
            replaceToUnderscore = promptState.getActiveWord().includes('_');
        }
        if (replaceToUnderscore) {
            insertTag = insertTag.replace(/ /g, '_');
        }
    }

    if (promptState.needPrependComma()) {
        insertTag = ', ' + insertTag;
    } else if (offset <= 0 && promptState.needPrependSpace()) {
        insertTag = ' ' + insertTag;
    }
    insertTag = escapePrompt(insertTag);

    const appendComma = window.opts[`${EXTENSION_ID}_append_comma`] as boolean;
    if (appendComma) {
        insertTag += ',';
    }
    insertTag += ' ';
    return { range: { start: startPosition, end: promptState.getCaret() }, insertText: insertTag };
}

function getLoraInsertionInfo(model: LoraModel): InsertionInfo {
    const startPosition = promptState.getActivePromptItem().position;
    let loraName = model.value;
    const match = promptState
        .getPrompt()
        .substring(startPosition)
        .match(/^<(?:lora|lyco):[^<>:]+(:.+>)/i);
    let caret = promptState.getCaret();
    if (match) {
        caret = startPosition + match[0].length;
        loraName += match[1];
    } else {
        loraName += ':1>';
    }
    loraName += ' ';
    return { range: { start: startPosition, end: caret }, insertText: loraName };
}

function getSuggestionInsertionInfo(model: SuggestionModel): InsertionInfo {
    const startPosition = promptState.getActivePromptItem().position;
    const tag = db_tag.getTagModel(model.value);
    const category = tag?.category ?? 'custom';
    let word = escapePrompt(model.value);

    const source = (window.opts[`${EXTENSION_ID}_tag_source`] as string).replace(/\./g, '_');
    const delimiter = (window.opts[`${EXTENSION_ID}_${source}_${category}_tag_delimiter`] as string) ?? 'auto';
    if (!db_tag.alwaysSpaceTags.has(word)) {
        let replaceToUnderscore = false;
        if (db_tag.alwaysUnderscoreTags.has(word)) {
            replaceToUnderscore = true;
        } else if (delimiter === 'underscore') {
            replaceToUnderscore = true;
        } else if (delimiter === 'auto') {
            replaceToUnderscore = promptState.getActiveWord().includes('_');
        }
        if (replaceToUnderscore) {
            word = word.replace(/ /g, '_');
        }
    }

    if (promptState.needPrependComma()) {
        word = ', ' + word;
    } else if (promptState.needPrependSpace()) {
        word = ' ' + word;
    }

    const appendComma = window.opts[`${EXTENSION_ID}_append_comma`] as boolean;
    if (appendComma) {
        word += ',';
    }
    word += ' ';
    return { range: { start: startPosition, end: promptState.getCaret() }, insertText: word };
}
