import { ItemProps } from '@/types/props';
import { EXTENSION_ID } from '@/const/common';
import { ResponseData } from '@/types/api';
import { TagModel } from '@/types/model';
import { debounceWithLeadingTrailing } from '@/utils/commonUtil';

let tagModels: Record<string, TagModel>;
let tagIndex: Record<string, Record<string, TagModel>>;
export let alwaysUnderscoreTags: Set<string>;
export let alwaysSpaceTags: Set<string>;

export function initializeTagModels(resData: ResponseData | undefined): void {
    if (!resData) {
        return;
    }
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

export function searchTag(query: string, priorityTags: string[]): ItemProps[] {
    const queries = query
        .toLowerCase()
        .split(/[ _-]/g)
        .filter((q) => q.trim() !== '');
    let joinedQuery: string | undefined;
    if (queries.length > 1) {
        joinedQuery = queries.join('');
    }

    const priorityTagSet = new Set(priorityTags);
    let resultList: ItemProps[] = [];
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
                const props: ItemProps = {
                    ...tagModel,
                    isPriority: priorityTagSet.has(tagModel.value),
                    matchedWords: matchedWords,
                    view: null,
                    previewFile: '',
                };
                resultList.push(props);
                resultKeySet[key] = true;
            }
        }
    });

    const consequentTagMatchCount = resultList
        .filter((r) => !r.consequentTagModel)
        .reduce<Record<string, number>>((acc, r) => {
            acc[r.value] = r.matchedWords.length;
            return acc;
        }, {});
    resultList = resultList.filter((r) => {
        if (!r.consequentTagModel) return true;
        const consequentTag = r.consequentTagModel.value;
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
        resultCount[r.value] = r.matchedWords.reduce((acc, m) => acc + resultTagCount[m.word], 0);
    });

    resultList = resultList.sort((a, b) => compare(a, b, query, joinedQuery, queries, resultCount));
    const groupCounter: Record<string, number> = {};
    for (const key of ['0', '1', '3', '4', '5', 'custom']) {
        groupCounter[key] = window.opts[`${EXTENSION_ID}_max_results_group${key}`] as number;
    }

    return resultList.filter((r) => {
        if (groupCounter[r.category] < 0 || groupCounter[r.category] > 0) {
            groupCounter[r.category] -= 1;
            return true;
        }
        return false;
    });
}

function compare(
    self: ItemProps,
    other: ItemProps,
    query: string,
    joinedQuery: string | undefined,
    queries: string[],
    resultCount: Record<string, number>,
): number {
    if (self.isPriority && !other.isPriority) return -1;
    if (!self.isPriority && other.isPriority) return 1;

    if (self.value === query || (joinedQuery && self.value === joinedQuery)) return -1;
    if (other.value === query || (joinedQuery && other.value === joinedQuery)) return 1;

    if (other.matchedWords.length !== self.matchedWords.length) {
        return other.matchedWords.length - self.matchedWords.length;
    } else if (queries.length === self.matchedWords.length) {
        for (let i = 0; i < self.matchedWords.length; i++) {
            if (self.matchedWords[i].index !== other.matchedWords[i].index) {
                return self.matchedWords[i].index - other.matchedWords[i].index;
            }
        }
    }

    if (other.useCount !== self.useCount) {
        return other.useCount - self.useCount;
    }
    const count = resultCount[self.value] - resultCount[other.value];
    if (count !== 0) {
        return count;
    }
    if (other.postCount !== self.postCount) {
        return other.postCount - self.postCount;
    }

    return self.value < other.value ? -1 : 1;
}

export const debounceSearchWithApi = debounceWithLeadingTrailing((query: string, callback: (results: ItemProps[]) => void): void => {
    const endpoint = 'https://danbooru.donmai.us/autocomplete.json';
    let apiUrl = endpoint;
    apiUrl += `?search[query]=${encodeURIComponent(query)}`;
    apiUrl += `&search[type]=tag`;
    apiUrl += `&limit=${50}`;
    apiUrl += `&version=1`;

    let resultSet: ItemProps[] = [];
    fetch(apiUrl)
        .then(async (res) => {
            if (!res.ok) {
                console.error('Error fetching tag data:', res.statusText);
                callback(resultSet);
                return;
            }
            const json = await res.json();
            resultSet = json.map((item: { label: string; category: number; post_count: number; antecedent: string }): ItemProps => {
                let tag;
                let consequentTagModel = null;
                if (item.antecedent) {
                    tag = item.antecedent;
                    consequentTagModel = tagModels[item.label];
                } else {
                    tag = item.label;
                }
                return {
                    value: tag,
                    category: item.category.toString(),
                    matchedWords: [],
                    useCount: 0,
                    postCount: item.post_count,
                    consequentTagModel: consequentTagModel,
                    isOfficial: consequentTagModel === undefined,
                    isPriority: false,
                    view: null,
                    previewFile: null,
                };
            });
            resultSet.forEach((r) => {
                const splitTag = r.value.split(/[ _-]/g);
                appendTagModel({
                    ...r,
                    values: splitTag,
                    flatValue: splitTag.join(''),
                });
            });
            callback(resultSet);
        })
        .catch((err) => {
            console.error('Error fetching tag data:', err);
            callback(resultSet);
        });
}, 1100);
