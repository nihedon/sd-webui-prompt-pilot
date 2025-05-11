import { AppProps, ItemProps, ParseResult } from '@/types/props';

export type PromptPilotAction =
    | { type: 'SET_TEXTAREA'; payload: PilotTextArea | null }
    | { type: 'SET_VISIBILITY'; payload: boolean }
    | {
          type: 'SET_STATUS';
          payload: 'loading' | 'error' | 'success';
      }
    | {
          type: 'SET_POSITION';
          payload: {
              x: number;
              y: number;
              offset_x: number;
              offset_y: number;
          };
      }
    | { type: 'SET_TAB'; payload: string }
    | { type: 'SET_SELECTED_ITEM'; payload: ItemProps }
    | {
          type: 'SET_ITEMS';
          payload: {
              type: 'tag' | 'lora' | 'simple';
              items: ItemProps[];
          };
      }
    | {
          type: 'SET_MESSAGE';
          payload: {
              type: 'tag' | 'lora' | 'simple';
              message: string;
          };
      }
    | {
          type: 'SET_PARSE_RESULT';
          payload: ParseResult;
      };

export const promptPilotReducer = (state: AppProps, action: PromptPilotAction): AppProps => {
    if (action.type === 'SET_TEXTAREA') {
        console.debug(action.type);
        return {
            ...state,
            isVisible: false,
            textarea: action.payload,
            selectedCategory: 'all',
        };
    } else if (action.type === 'SET_VISIBILITY') {
        console.debug(action.type);
        return {
            ...state,
            isVisible: action.payload,
            selectedCategory: 'all',
        };
    } else if (action.type === 'SET_STATUS') {
        console.debug(action.type, action.payload);
        return {
            ...state,
            status: action.payload,
        };
    } else if (action.type === 'SET_POSITION') {
        console.debug(action.type);
        return {
            ...state,
            pos: {
                offset_x: action.payload.offset_x,
                offset_y: action.payload.offset_y,
                x: action.payload.x,
                y: action.payload.y,
            },
        };
    } else if (action.type === 'SET_TAB') {
        console.debug(action.type);
        return {
            ...state,
            selectedCategory: action.payload,
        };
    } else if (action.type === 'SET_SELECTED_ITEM') {
        console.debug(action.type);
        return {
            ...state,
            selectedItem: action.payload,
        };
    } else if (action.type === 'SET_ITEMS') {
        console.debug(action.type);
        return {
            ...state,
            isVisible: true,
            type: action.payload.type,
            items: action.payload.items,
            selectedItem: action.payload.items.length > 0 ? action.payload.items[0] : null,
            message: action.payload.items.length > 0 ? '' : 'No results found',
        };
    } else if (action.type === 'SET_MESSAGE') {
        console.debug(action.type);
        return {
            ...state,
            isVisible: true,
            type: action.payload.type,
            message: action.payload.message,
        };
    } else if (action.type === 'SET_PARSE_RESULT') {
        console.debug(action.type);
        return {
            ...state,
            parseResult: action.payload,
        };
    } else {
        return state;
    }
};
