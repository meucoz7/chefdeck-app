
export const getBotId = () => {
    try {
        const params = new URLSearchParams(window.location.search);
        let botId = params.get('bot_id');
        
        if (botId) {
            localStorage.setItem('chefdeck_bot_id', botId);
            return botId;
        }
        
        // Попытка восстановить из hash-роутинга, если Telegram перенаправил криво
        if (window.location.hash.includes('bot_id=')) {
            const hashParts = window.location.hash.split('?');
            if (hashParts[1]) {
                const hashParams = new URLSearchParams(hashParts[1]);
                botId = hashParams.get('bot_id');
                if (botId) {
                    localStorage.setItem('chefdeck_bot_id', botId);
                    return botId;
                }
            }
        }
    } catch (e) {
        console.error("Error parsing URL params", e);
    }
    
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
