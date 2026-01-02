const API_URL = 'https://pro.filma4.ru/api';
const API_KEY = '3f154923d8d6324c7a38dcd83159789f82a4ea9224335df225a375a6cb3d6415';

const folderCache: Record<string, number> = {};

/**
 * Получает ID папки по имени, создавая её при необходимости.
 */
const getFolderId = async (name: string): Promise<number | null> => {
    const normalizedName = name.toLowerCase().trim();
    if (folderCache[normalizedName]) return folderCache[normalizedName];

    try {
        // 1. Пытаемся найти существующую папку
        const res = await fetch(`${API_URL}/folders`, {
            headers: { 
                'X-API-Key': API_KEY,
                'Accept': 'application/json'
            }
        });
        
        if (res.ok) {
            const result = await res.json();
            if (result.success && Array.isArray(result.data)) {
                const folder = result.data.find((f: any) => f.name.toLowerCase() === normalizedName);
                if (folder) {
                    folderCache[normalizedName] = folder.id;
                    return folder.id;
                }
            }
        }

        // 2. Если папка не найдена, пытаемся создать
        const createRes = await fetch(`${API_URL}/folders`, {
            method: 'POST',
            headers: { 
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name: normalizedName })
        });
        
        const createResult = await createRes.json();
        if (createResult.success && createResult.data && createResult.data.id) {
            folderCache[normalizedName] = createResult.data.id;
            return createResult.data.id;
        }
    } catch (e) {
        console.error('[UploadService] Folder resolution error:', e);
    }
    return null;
};

/**
 * Загружает файл на сервер.
 */
export const uploadImage = async (file: File, folderName: string = 'general'): Promise<string> => {
    if (!file) throw new Error('Файл не выбран');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
        const folderId = await getFolderId(folderName);
        if (folderId !== null) {
            formData.append('folder_id', folderId.toString());
        }

        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 
                'X-API-Key': API_KEY,
                'Accept': 'application/json'
            },
            body: formData
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result || !result.success) {
            const serverMsg = result?.message || `Ошибка сервера: ${response.status}`;
            console.error('[UploadService] Server rejection:', serverMsg, result);
            throw new Error(serverMsg);
        }

        if (result.data && result.data.url) {
            return result.data.url;
        } else {
            throw new Error('Сервер не вернул ссылку на файл (data.url)');
        }
    } catch (error: any) {
        console.error('[UploadService] Critical error:', error);
        throw error;
    }
};
