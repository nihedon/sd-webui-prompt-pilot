import { gunzipSync } from 'fflate';
import * as db_tag from '@/services/tagService';
import * as db_lora from '@/services/loraService';
import * as db_sg from '@/services/suggestionService';

export const loadModelsData = async () => {
    try {
        const res = await fetch(`file=extensions/sd-webui-prompt-pilot/models.json.gz`);
        if (!res.ok) return { success: false };

        const buffer = new Uint8Array(await res.arrayBuffer());
        const decompressedBuffer = gunzipSync(buffer);
        const jsonString = new TextDecoder('utf-8').decode(decompressedBuffer);
        const resData = JSON.parse(jsonString);

        return { success: true, data: resData };
    } catch (e) {
        console.error(e);
        return { success: false };
    }
};

export const initializeModels = (data: any) => {
    db_tag.initializeTagModels(data);
    db_lora.initializeLoraModels(data);
    db_sg.initializeSuggestionModels(data);
};
