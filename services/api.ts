
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
    // Fallback to localStorage, then default
    return localStorage.getItem('chefdeck_bot_id') || 'default';
};

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers || {});
    headers.set('x-bot-id', getBotId());

    const newInit = {
        ...init,
        headers
    };
    
    return window.fetch(input, newInit);
};
