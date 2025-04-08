export enum PromptItemType {
    Tag,
    Lora,
}

export interface PromptItem {
    value: string;
    position: number;
    type: PromptItemType;
    isActive: boolean;
}
