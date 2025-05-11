declare global {
    interface Window {
        pilotIsActive: boolean;
        opts: {
            [key: string]: string | string[] | number | boolean;
        };
    }
    type PilotTextArea = HTMLTextAreaElement & { dummy: HTMLDivElement & { caret: HTMLSpanElement } };
    function gradioApp(): Document;
}

export {};
