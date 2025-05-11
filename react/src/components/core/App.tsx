import { createContext, FunctionComponent, h, render } from 'preact';
import { Dispatch, useContext, useReducer } from 'preact/hooks';
import { AppProps } from '@/types/props';
import { UITemplateContent } from '@/components/ui/AppComponent';
import { PromptPilotAction, promptPilotReducer } from '@/reducers/appReducer';

const PromptPilotContext = createContext<{
    state: AppProps;
    dispatch: Dispatch<PromptPilotAction>;
} | null>(null);

export const usePromptPilot = () => {
    const context = useContext(PromptPilotContext);
    if (!context) {
        throw new Error('usePromptPilot must be used within a PromptPilotProvider');
    }
    return context;
};

export const PromptPilotProvider: FunctionComponent<{
    promptPilotState: AppProps;
    children: h.JSX.Element | h.JSX.Element[];
}> = ({ promptPilotState, children }) => {
    const [state, dispatch] = useReducer(promptPilotReducer, promptPilotState);

    return <PromptPilotContext.Provider value={{ state, dispatch }}>{children}</PromptPilotContext.Provider>;
};

export function initialize(promptPilotProps: AppProps): void {
    render(
        <PromptPilotProvider promptPilotState={promptPilotProps}>
            <UITemplateContent />
        </PromptPilotProvider>,
        document.getElementById('prompt-pilot-container')!,
    );
}
