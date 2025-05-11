interface Model {
    value: string;
}

export interface TagModel extends Model {
    values: string[];
    flatValue: string;
    category: string;
    useCount: number;
    postCount: number;
    consequentTagModel: TagModel | null;
    isOfficial: boolean;
}

export interface LoraModel extends Model {
    searchWords: string[];
    previewFile: string;
}

export interface SuggestionModel extends Model {
    count: number;
}
