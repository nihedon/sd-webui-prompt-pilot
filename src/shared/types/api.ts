export interface ResponseData {
    suggestionModels: Record<string, Record<string, number>>;
    tagModels: Record<
        string,
        {
            post_count: number;
            category: string;
            is_deprecated: boolean;
            aliases: string[];
            use_count: number;
        }
    >;
    loraModels: Record<
        string,
        {
            search_words: string[];
            preview_file: string;
        }
    >;
}
