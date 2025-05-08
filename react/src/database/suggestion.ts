import { ResponseData } from '../shared/types/api';
import { SuggestionModel, SuggestionResult } from '../shared/types/model';

let errorFlag = false;

let suggestionModels: Record<string, SuggestionModel[]>;

export function isLoaded() {
    return suggestionModels;
}

export function hasError() {
    return errorFlag;
}

export function setErrorFlag(flag: boolean) {
    errorFlag = flag;
}

export function initializeSuggestionModels(resData: ResponseData | undefined): void {
    if (!resData) {
        errorFlag = true;
        return;
    }
    try {
        suggestionModels = {};
        Object.entries(resData.suggestionModels).forEach(([word, record]) => {
            const sorted = Object.entries(record).sort(([, count1], [, count2]) => count2 - count1);
            suggestionModels[word] = sorted.map(([word, count]) => ({
                value: word,
                count: count,
            }));
        });
    } catch (e) {
        console.error(e);
        errorFlag = true;
    }
}

export function searchSuggestion(nearestTag: string | undefined, existTags: Set<string>): SuggestionResult[] {
    if (!nearestTag) {
        return [];
    }
    const suggestions = suggestionModels[nearestTag];
    if (!suggestions) return [];
    const result: SuggestionResult[] = [];
    for (const candidate of suggestions) {
        if (!existTags.has(candidate.value)) {
            result.push(new SuggestionResult(candidate));
        }
    }
    return result;
}
