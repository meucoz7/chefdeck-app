
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
 * Расширенный fetch с поддержкой таймаута
 */
export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const timeout = 8000; // 8 секунд на ответ
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const headers = new Headers(init?.headers || {});
    headers.set('x-bot-id', getBotId());

    try {
        const response = await window.fetch(input, {
            ...init,
            headers,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error: any) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            console.warn(`Request timed out for ${input.toString()}`);
            throw new Error('Timeout: Сервер отвечает слишком долго');
        }
        throw error;
    }
};
