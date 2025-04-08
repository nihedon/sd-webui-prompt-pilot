import { EXTENSION_ID } from 'shared/const/common';
import { ResponseData } from 'shared/types/api';
import { TagModel } from 'shared/types/model';
import { TagResult } from 'shared/types/model';

let errorFlag = false;

let tagModels: Record<string, TagModel>;
let tagIndex: Record<string, Record<string, TagModel>>;
export let alwaysUnderscoreTags: Set<string>;
export let alwaysSpaceTags: Set<string>;

export function isLoaded() {
    return tagModels && tagIndex;
}

export function hasError() {
    return errorFlag;
}

export function initializeTagModels(resData: ResponseData | undefined): void {
    if (!resData) {
        errorFlag = true;
        return;
    }
    try {
        alwaysUnderscoreTags = new Set();
        (window.opts[`${EXTENSION_ID}_always_underscore_tags`] as string).split(/[\n,]/).forEach((tag: string) => {
            tag = tag.trim().replace(/_/g, ' ');
            if (tag) {
                alwaysUnderscoreTags.add(tag);
            }
        });

        alwaysSpaceTags = new Set();
        (window.opts[`${EXTENSION_ID}_always_space_tags`] as string).split(/[\n,]/).forEach((tag: string) => {
            tag = tag.trim().replace(/_/g, ' ');
            if (tag) {
                alwaysSpaceTags.add(tag);
            }
        });

        tagModels = {};
        Object.entries(resData.tagModels).forEach(([tag, data]) => {
            const splitTag = tag.split(/[ _-]/g);
            const tagModel: TagModel = tagModels[tag] ?? {
                value: tag,
                values: tag.split(/[ _-]/g),
                flatValue: splitTag.join(''),
                category: data.category,
                useCount: data.use_count,
                postCount: data.post_count,
                consequentTagModel: undefined,
                isOfficial: true,
            };
            tagModel.isOfficial = true;
            for (const alias of data.aliases) {
                const splitAlias = alias.split(/[ _-]/g);
                const aliasTagModel = tagModels[alias] ?? {
                    value: alias,
                    values: alias.split(/[ _-]/g),
                    flatValue: splitAlias.join(''),
                    category: data.category,
                    useCount: data.use_count,
                    postCount: data.post_count,
                    consequentTagModel: tagModel,
                    isOfficial: false,
                };
                if (aliasTagModel.isOfficial) {
                    aliasTagModel.consequentTagModel = tagModel;
                } else {
                    tagModels[alias] = aliasTagModel;
                }
            }
            tagModels[tag] = tagModel;
        });

        buildTagIndex(tagModels);
    } catch (e) {
        console.error(e);
        errorFlag = true;
    }
}

function getPrefixes(tag: string, maxLen = 3): Set<string> {
    const set: Set<string> = new Set();
    for (const t of tag.split(/[ _-]/g)) {
        const len = Math.min(maxLen, t.length);
        for (let i = 1; i <= len; i++) {
            set.add(t.substring(0, i));
        }
    }
    return set;
}

export function buildTagIndex(tagModels: Record<string, TagModel>): void {
    tagIndex = {};
    for (const tagModel of Object.values(tagModels)) {
        const prefixes = getPrefixes(tagModel.value, 3);
        for (const p of prefixes) {
            if (!(p in tagIndex)) {
                tagIndex[p] = {};
            }
            tagIndex[p][tagModel.value] = tagModel;
        }
    }
}

function appendTagModel(tagModel: TagModel): void {
    if (tagModel.value && tagModel.value in tagModels) {
        return;
    }
    tagModels[tagModel.value] = tagModel;
    const prefixes = getPrefixes(tagModel.value, 3);
    for (const p of prefixes) {
        if (!(p in tagIndex)) {
            tagIndex[p] = {};
        }
        tagIndex[p][tagModel.value] = tagModel;
    }
}

export function getTagModel(tag: string): TagModel | undefined {
    return tagModels[tag];
}

export function searchTag(query: string, priorityTags: string[]): TagResult[] {
    const queries = query
        .toLowerCase()
        .split(/[ _-]/g)
        .filter((q) => q.trim() !== '');
    let joinedQuery: string | undefined;
    if (queries.length > 1) {
        joinedQuery = queries.join('');
    }

    const priorityTagSet = new Set(priorityTags);
    let resultList: TagResult[] = [];
    const resultKeySet: Record<string, boolean> = {};
    queries.forEach((queryForCandidate) => {
        const prefixKey = queryForCandidate.length > 3 ? queryForCandidate.slice(0, 3) : queryForCandidate;
        const candidateTagList = tagIndex[prefixKey];
        for (const key in candidateTagList) {
            if (key in resultKeySet) {
                continue;
            }
            const tagModel = candidateTagList[key];

            const matchedWords: { word: string; index: number }[] = [];
            if (joinedQuery && tagModel.value.startsWith(joinedQuery)) {
                for (let i = 0; i < queries.length; i++) {
                    matchedWords.push({ word: queries[i], index: i });
                }
            } else {
                const matchedQueryIndices: Record<number, boolean> = {};
                for (const query of queries) {
                    if (!(0 in matchedQueryIndices) && tagModel.flatValue.startsWith(query)) {
                        matchedWords.push({ word: query, index: 0 });
                        matchedQueryIndices[0] = true;
                        continue;
                    }
                    for (let i = 0; i < tagModel.values.length; i++) {
                        if (!(i in matchedQueryIndices) && tagModel.values[i].startsWith(query)) {
                            matchedWords.push({ word: query, index: i });
                            matchedQueryIndices[i] = true;
                            break;
                        }
                    }
                }
            }
            if (matchedWords.length > 0) {
                const result = new TagResult(tagModel, priorityTagSet.has(tagModel.value));
                result.matchedWords = matchedWords;
                resultList.push(result);
                resultKeySet[key] = true;
            }
        }
    });

    const consequentTagMatchCount = resultList
        .filter((r) => !r.model.consequentTagModel)
        .reduce<Record<string, number>>((acc, r) => {
            acc[r.model.value] = r.matchedWords.length;
            return acc;
        }, {});
    resultList = resultList.filter((r) => {
        if (!r.model.consequentTagModel) return true;
        const consequentTag = r.model.consequentTagModel.value;
        return !(consequentTag in consequentTagMatchCount) || consequentTagMatchCount[consequentTag] < r.matchedWords.length;
    });

    const resultTagCount: Record<string, number> = {};
    const resultCount: Record<string, number> = {};
    resultList.forEach((r) => {
        r.matchedWords.forEach((m) => {
            if (!resultTagCount[m.word]) {
                resultTagCount[m.word] = 0;
            }
            resultTagCount[m.word] += 1;
        });
    });
    resultList.forEach((r) => {
        resultCount[r.model.value] = r.matchedWords.reduce((acc, m) => acc + resultTagCount[m.word], 0);
    });

    resultList = resultList.sort((a, b) => a.compare(b, query, joinedQuery, queries, resultCount));
    const groupCounter: Record<string, number> = {};
    for (const key of ['0', '1', '3', '4', '5', 'custom']) {
        groupCounter[key] = window.opts[`${EXTENSION_ID}_max_results_group${key}`] as number;
    }

    return resultList.filter((r) => {
        if (groupCounter[r.model.category] === -1 || groupCounter[r.model.category] > 0) {
            groupCounter[r.model.category] -= 1;
            return true;
        }
        return false;
    });
}

export function searchWithApi(query: string, callback: (results: TagResult[]) => void): void {
    const endpoint = 'https://danbooru.donmai.us/autocomplete.json';
    let apiUrl = endpoint;
    apiUrl += `?search[query]=${encodeURIComponent(query)}`;
    apiUrl += `&search[type]=tag`;
    apiUrl += `&limit=${50}`;
    apiUrl += `&version=1`;

    let resultSet: TagResult[] = [];
    fetch(apiUrl)
        .then(async (res) => {
            if (res.ok) {
                const json = await res.json();
                resultSet = json.map((item: { label: string; category: number; post_count: number; antecedent: string }) => {
                    let tag;
                    let consequentTagModel = undefined;
                    if (item.antecedent) {
                        tag = item.antecedent;
                        consequentTagModel = tagModels[item.label];
                    } else {
                        tag = item.label;
                    }
                    const splitTag = tag.split(/[ _-]/g);
                    return new TagResult(
                        {
                            value: tag,
                            values: splitTag,
                            flatValue: splitTag.join(''),
                            category: item.category.toString(),
                            useCount: 0,
                            postCount: item.post_count,
                            consequentTagModel: consequentTagModel,
                            isOfficial: consequentTagModel === undefined,
                        },
                        false,
                    );
                });
                resultSet.forEach((r) => {
                    appendTagModel(r.model);
                });
            }
            callback(resultSet);
        })
        .catch((err) => {
            console.error('Error fetching tag data:', err);
            callback(resultSet);
        });
}
