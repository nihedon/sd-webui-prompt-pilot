import { ItemProps } from '@/types/props';
import { ResponseData } from '@/types/api';
import { SuggestionModel } from '@/types/model';

let suggestionModels: Record<string, SuggestionModel[]>;

export function initializeSuggestionModels(resData: ResponseData | undefined): void {
    if (!resData) {
        return;
    }
    suggestionModels = {};
    Object.entries(resData.suggestionModels).forEach(([word, record]) => {
        const sorted = Object.entries(record).sort(([, count1], [, count2]) => count2 - count1);
        suggestionModels[word] = sorted.map(([word, count]) => ({
            value: word,
            count: count,
        }));
    });
}

export function searchSuggestion(nearestTag: string | undefined, existTags: Set<string>): ItemProps[] {
    if (!nearestTag) {
        return [];
    }
    const suggestions = suggestionModels[nearestTag];
    if (!suggestions) return [];
    const props: ItemProps[] = [];
    for (const candidate of suggestions) {
        if (!existTags.has(candidate.value)) {
            props.push({
                ...candidate,
                view: null,
                isPriority: false,
                matchedWords: [],
                category: '',
                exists: false,
                useCount: 0,
                postCount: 0,
                consequentTagModel: null,
                isOfficial: false,
                previewFile: null,
            });
        }
    }
    return props;
}
