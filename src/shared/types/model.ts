export interface Model {
    value: string;
}

export interface TagModel extends Model {
    values: string[];
    flatValue: string;
    category: string;
    useCount: number;
    postCount: number;
    consequentTagModel: TagModel | undefined;
    isOfficial: boolean;
}

export interface LoraModel extends Model {
    group: string;
    searchWords: string[];
    previewFile: string;
}

export interface SuggestionModel extends Model {
    count: number;
}

export class Result<T extends Model> {
    model: T;
    view: HTMLLIElement | undefined;

    constructor(model: T) {
        this.model = model;
    }
}

export class TagResult extends Result<TagModel> {
    isPriority: boolean;
    matchedWords: { word: string; index: number }[] = [];

    constructor(model: TagModel, isPriority: boolean) {
        super(model);
        this.isPriority = isPriority;
    }

    compare(other: TagResult, query: string, joinedQuery: string | undefined, queries: string[], resultCount: Record<string, number>): number {
        if (this.isPriority && !other.isPriority) return -1;
        if (!this.isPriority && other.isPriority) return 1;

        if (this.model.value === query || (joinedQuery && this.model.value === joinedQuery)) return -1;
        if (other.model.value === query || (joinedQuery && other.model.value === joinedQuery)) return 1;

        if (other.matchedWords.length !== this.matchedWords.length) {
            return other.matchedWords.length - this.matchedWords.length;
        } else if (queries.length === this.matchedWords.length) {
            for (let i = 0; i < this.matchedWords.length; i++) {
                if (this.matchedWords[i].index !== other.matchedWords[i].index) {
                    return this.matchedWords[i].index - other.matchedWords[i].index;
                }
            }
        }

        if (other.model.useCount !== this.model.useCount) {
            return other.model.useCount - this.model.useCount;
        }
        const count = resultCount[this.model.value] - resultCount[other.model.value];
        if (count !== 0) {
            return count;
        }
        if (other.model.postCount !== this.model.postCount) {
            return other.model.postCount - this.model.postCount;
        }

        return this.model.value < other.model.value ? -1 : 1;
    }
}

export class LoraResult extends Result<LoraModel> {
    matchWords: string[] = [];
    startsWith: boolean = false;

    constructor(model: LoraModel) {
        super(model);
    }

    compare(other: LoraResult, query: string, queries: string[]): number {
        if (this.model.value === query) return -1;
        if (other.model.value === query) return 1;

        if (other.matchWords.length !== this.matchWords.length) {
            return other.matchWords.length - this.matchWords.length;
        }

        const thisStartsQuery = this.matchStarts(queries);
        const otherStartsQuery = other.matchStarts(queries);
        if (thisStartsQuery && !otherStartsQuery) return -1;
        if (!thisStartsQuery && otherStartsQuery) return 1;

        return this.model.value < other.model.value ? -1 : 1;
    }

    matchStarts(queries: string[]): boolean {
        for (const q of queries) {
            for (const title of this.model.value.split(/[ _-]/g)) {
                if (title.startsWith(q)) {
                    return true;
                }
            }
        }
        return false;
    }
}

export class SuggestionResult extends Result<SuggestionModel> {
    constructor(model: SuggestionModel) {
        super(model);
    }
}
