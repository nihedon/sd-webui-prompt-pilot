// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
    let debounceTimeout: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounceWithLeadingTrailing<T extends (...args: any[]) => any>(func: T, wait: number) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let lastCallTime: number | null = null;
    let lastArgs: Parameters<T> | null = null;
    let hasPendingTrailing = false;

    return (...args: Parameters<T>) => {
        const now = Date.now();

        if (!lastCallTime || now - lastCallTime >= wait) {
            func(...args);
            hasPendingTrailing = false;
        } else {
            hasPendingTrailing = true;
            lastArgs = args;
        }
        lastCallTime = now;

        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => {
            if (hasPendingTrailing && lastArgs) {
                func(...lastArgs);
            }
            lastCallTime = null;
            hasPendingTrailing = false;
        }, wait);
    };
}

export function formatNumberWithUnits(num: number): string {
    if (Math.abs(num) >= 1e12) {
        return (num / 1e12).toFixed(1) + 'T';
    } else if (Math.abs(num) >= 1e9) {
        return (num / 1e9).toFixed(1) + 'G';
    } else if (Math.abs(num) >= 1e6) {
        return (num / 1e6).toFixed(1) + 'M';
    } else if (Math.abs(num) >= 1e3) {
        return (num / 1e3).toFixed(1) + 'K';
    } else {
        return num.toString();
    }
}

export function htmlEncode(str: string): string {
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
}

export function escapePrompt(str: string): string {
    return str.replace(/[{}()\[\]\\]/g, '\\$&');
}

export function unescapePrompt(str: string): string {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '\\') {
            if (i + 1 < str.length) {
                result += str[i + 1];
                i++;
            } else {
                result += '\\';
            }
        } else {
            result += str[i];
        }
    }
    return result;
}

export function splitStringWithIndices(input: string, delimiter: RegExp): { word: string; position: number }[] {
    const result: { word: string; position: number }[] = [];
    const regex = delimiter;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = regex.exec(input)) !== null) {
        result.push({ word: input.slice(lastIndex, match.index), position: lastIndex });
        lastIndex = regex.lastIndex;
    }

    result.push({ word: input.slice(lastIndex), position: lastIndex });
    return result;
}
