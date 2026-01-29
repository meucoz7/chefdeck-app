export const getBotId = () => {
    try {
        const params = new URLSearchParams(window.location.search);
        const botId = params.get('bot_id');
        if (botId) {
            localStorage.setItem('chefdeck_bot_id', botId);
            return botId;
        }
    } catch (e) {
        console.error("Error parsing URL params", e);
    }
    return localStorage.getItem('chefdeck_bot_id') || 'default';
};

/**
 * Обертка над fetch с таймаутом и пробросом bot_id
 */
export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers || {});
    headers.set('x-bot-id', getBotId());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 секунд таймаут

    try {
        const response = await window.fetch(input, {
            ...init,
            headers,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.warn("API request timed out:", input);
        }
        throw error;
    }
};
