import { ItemProps } from '@/types/props';
import { EXTENSION_ID } from '@/const/common';
import { ResponseData } from '@/types/api';
import { LoraModel } from '@/types/model';

let loraModels: LoraModel[];

export function initializeLoraModels(resData: ResponseData | undefined): void {
    if (!resData) {
        return;
    }
    loraModels = [];
    Object.entries(resData.loraModels).forEach(([lora_name, data]) => {
        loraModels.push({
            value: lora_name,
            searchWords: data.search_words,
            previewFile: data.preview_file,
        });
    });
}

export function searchLora(query: string): ItemProps[] {
    const queries = query
        .toLowerCase()
        .split(/[ _-]/g)
        .filter((q) => q.trim() !== '');

    let resultSet: ItemProps[] = [];
    loraModels.forEach((lora) => {
        const matchWordSet = new Set<string>();
        for (const word of lora.searchWords) {
            const flatWord = word.replace(/[ _-]/g, '');
            queries.forEach((q) => {
                if (flatWord.includes(q)) {
                    matchWordSet.add(q);
                }
            });
        }
        if (queries.length === matchWordSet.size) {
            const props: ItemProps = {
                ...lora,
                matchedWords: [...matchWordSet].map((w) => ({ index: 0, word: w })),
                view: null,
                isPriority: false,
                category: '',
                exists: false,
                useCount: 0,
                postCount: 0,
                consequentTagModel: null,
                isOfficial: false,
            };
            resultSet.push(props);
        }
    });
    resultSet = resultSet.sort((a, b) => compare(a, b, query, queries));
    let groupCounter = window.opts[`${EXTENSION_ID}_max_results_grouplora`] as number;
    return resultSet.filter(() => {
        if (groupCounter > 0) {
            groupCounter -= 1;
            return true;
        }
        return false;
    });
}

function compare(self: ItemProps, other: ItemProps, query: string, queries: string[]): number {
    if (self.value === query) return -1;
    if (other.value === query) return 1;

    if (other.matchedWords.length !== self.matchedWords.length) {
        return other.matchedWords.length - self.matchedWords.length;
    }

    const thisStartsQuery = matchStarts(self, queries);
    const otherStartsQuery = matchStarts(other, queries);
    if (thisStartsQuery && !otherStartsQuery) return -1;
    if (!thisStartsQuery && otherStartsQuery) return 1;

    return self.value < other.value ? -1 : 1;
}

function matchStarts(obj: ItemProps, queries: string[]): boolean {
    for (const q of queries) {
        for (const title of obj.value.split(/[ _-]/g)) {
            if (title.startsWith(q)) {
                return true;
            }
        }
    }
    return false;
}
