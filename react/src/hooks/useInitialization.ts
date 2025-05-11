import { useEffect } from 'preact/hooks';
import { loadModelsData, initializeModels } from '@/services/initializationService';
import { PromptPilotAction } from '@/reducers/appReducer';
import { Dispatch } from 'preact/hooks';
import { EXTENSION_ID } from '@/const/common';

declare function onOptionsChanged(callback: VoidFunction): void;

export let resolveInitialized: ((value: boolean) => void) | null;
const initializedPromise = new Promise<boolean>((resolve) => {
    resolveInitialized = resolve;
});

onOptionsChanged(() => {
    window.pilotIsActive = window.opts[`${EXTENSION_ID}_enabled`] as boolean;
    if (resolveInitialized) {
        resolveInitialized(true);
        resolveInitialized = null;
    }
});

export const useInitialization = (dispatch: Dispatch<PromptPilotAction>) => {
    useEffect(() => {
        const initialize = async () => {
            const result = await loadModelsData();
            if (result.success) {
                try {
                    await initializedPromise;
                    initializeModels(result.data);
                    dispatch({
                        type: 'SET_STATUS',
                        payload: 'success',
                    });
                } catch (e) {
                    console.error(e);
                    dispatch({
                        type: 'SET_STATUS',
                        payload: 'error',
                    });
                }
            }
        };

        initialize();
    }, [dispatch]);
};
