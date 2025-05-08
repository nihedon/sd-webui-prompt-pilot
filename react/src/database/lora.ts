import { EXTENSION_ID } from '../shared/const/common';
import { ResponseData } from '../shared/types/api';
import { LoraModel, LoraResult } from '../shared/types/model';

let errorFlag = false;

let loraModels: LoraModel[];

export function isLoaded() {
    return loraModels;
}

export function hasError() {
    return errorFlag;
}

export function setErrorFlag(flag: boolean) {
    errorFlag = flag;
}

export function initializeLoraModels(resData: ResponseData | undefined): void {
    if (!resData) {
        errorFlag = true;
        return;
    }
    try {
        loraModels = [];
        Object.entries(resData.loraModels).forEach(([lora_name, data]) => {
            loraModels.push({
                value: lora_name,
                group: 'lora',
                searchWords: data.search_words,
                previewFile: data.preview_file,
            });
        });
    } catch (e) {
        console.error(e);
        errorFlag = true;
    }
}

export function searchLora(query: string): LoraResult[] {
    const queries = query
        .toLowerCase()
        .split(/[ _-]/g)
        .filter((q) => q.trim() !== '');

    let resultSet: LoraResult[] = [];
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
            const result = new LoraResult(lora);
            result.matchWords = [...matchWordSet];
            resultSet.push(result);
        }
    });
    resultSet = resultSet.sort((a, b) => a.compare(b, query, queries));
    let groupCounter = window.opts[`${EXTENSION_ID}_max_results_grouplora`] as number;
    return resultSet.filter(() => {
        if (groupCounter > 0) {
            groupCounter -= 1;
            return true;
        }
        return false;
    });
}
