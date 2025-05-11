import { Dispatch } from 'preact/hooks';
import { ItemProps } from '@/types/props';
import { PromptPilotAction } from '@/reducers/appReducer';

export function dispatchSetVisibility(dispatch: Dispatch<PromptPilotAction>, visibility: boolean) {
    dispatch({
        type: 'SET_VISIBILITY',
        payload: visibility,
    });
}

export function dispatchSetPosition(
    dispatch: Dispatch<PromptPilotAction>,
    contextPosition: {
        offset_x: number;
        offset_y: number;
        x: number;
        y: number;
    },
) {
    dispatch({
        type: 'SET_POSITION',
        payload: contextPosition,
    });
}

export function dispatchSetTextarea(dispatch: Dispatch<PromptPilotAction>, textarea: PilotTextArea | null) {
    dispatch({
        type: 'SET_TEXTAREA',
        payload: textarea,
    });
}

export function dispatchSetTab(dispatch: Dispatch<PromptPilotAction>, category: string) {
    dispatch({
        type: 'SET_TAB',
        payload: category,
    });
}

export function dispatchSetItems(dispatch: Dispatch<PromptPilotAction>, type: 'tag' | 'lora' | 'simple', items: ItemProps[]) {
    dispatch({
        type: 'SET_ITEMS',
        payload: {
            type: type,
            items,
        },
    });
}

export function dispatchSetSelectedItem(dispatch: Dispatch<PromptPilotAction>, item: ItemProps) {
    dispatch({
        type: 'SET_SELECTED_ITEM',
        payload: item,
    });
}

export function dispatchSetMessage(dispatch: Dispatch<PromptPilotAction>, type: 'tag' | 'lora' | 'simple', message: string) {
    dispatch({
        type: 'SET_MESSAGE',
        payload: {
            type: type,
            message: message,
        },
    });
}
