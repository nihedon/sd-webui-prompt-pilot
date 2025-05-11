import * as parser from '@/parsers/promptParser';
import { AppProps, PromptInfo } from '@/types/props';
import { Dispatch } from 'preact/hooks';
import { PromptPilotAction } from '@/reducers/appReducer';
import * as db_sg from '@/services/suggestionService';
import * as db_tag from '@/services/tagService';
import * as db_lora from '@/services/loraService';
import { dispatchSetItems, dispatchSetMessage } from '@/reducers/dispatchHelper';

function extractPromptInfo(state: AppProps) {
    const textarea = state.textarea!;
    const parseResult = parser.updatePromptState(textarea.value, textarea.selectionEnd);

    return parseResult;
}

function collectExistingTags(promptInfo: PromptInfo): Set<string> {
    return new Set(promptInfo.words.filter((word, i) => i !== promptInfo.activeWordIndex && word.type !== 'lora').map((word) => word.value));
}

function findNearestTag(promptInfo: PromptInfo): string | undefined {
    for (let i = promptInfo.activeWordIndex - 1; i >= 0; i--) {
        const word = promptInfo.words[i];
        if (word.type === 'lora') {
            continue;
        }
        return word.value;
    }
    return undefined;
}

function collectPriorityTags(inputtingString: string, nearestTag: string | undefined, existTags: Set<string>): string[] {
    const suggestions = db_sg.searchSuggestion(nearestTag, existTags);
    const priorityTag: string[] = [];

    for (const suggestion of suggestions) {
        if (suggestion.value.startsWith(inputtingString)) {
            priorityTag.push(suggestion.value);
        }
    }

    return priorityTag;
}

function handleTagItems(inputtingString: string, nearestTag: string | undefined, existTags: Set<string>, dispatch: Dispatch<PromptPilotAction>) {
    if (inputtingString === '') {
        const suggestions = db_sg.searchSuggestion(nearestTag, existTags);
        dispatchSetItems(dispatch, 'simple', suggestions);
        return;
    }

    const priorityTag = collectPriorityTags(inputtingString, nearestTag, existTags);

    if (inputtingString.startsWith('*') && inputtingString.length > 1) {
        db_tag.debounceSearchWithApi(inputtingString.substring(1), (resultSet) => {
            dispatchSetItems(dispatch, 'tag', resultSet);
        });
        dispatchSetMessage(dispatch, 'tag', 'Searching for tags via API...');
    } else {
        const items = db_tag.searchTag(inputtingString, priorityTag);
        dispatchSetItems(dispatch, 'tag', items);
    }
}

function handleLoraItems(inputtingString: string, dispatch: Dispatch<PromptPilotAction>) {
    const items = db_lora.searchLora(inputtingString);
    dispatchSetItems(dispatch, 'lora', items);
}

export function updateContext(state: AppProps, dispatch: Dispatch<PromptPilotAction>) {
    const parseResult = extractPromptInfo(state);

    if (state.status !== 'success') {
        dispatch({
            type: 'SET_VISIBILITY',
            payload: true,
        });
        return;
    }

    dispatch({
        type: 'SET_PARSE_RESULT',
        payload: parseResult,
    });

    const { promptInfo } = parseResult;

    const activeWord = promptInfo.words[promptInfo.activeWordIndex];
    const inputtingString = promptInfo.inputtingString;

    const existTags = collectExistingTags(promptInfo);

    if (activeWord.type !== 'lora') {
        const nearestTag = findNearestTag(promptInfo);
        handleTagItems(inputtingString, nearestTag, existTags, dispatch);
    } else {
        handleLoraItems(inputtingString, dispatch);
    }
}
