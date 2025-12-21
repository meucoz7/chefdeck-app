
const API_URL = 'https://pro.filma4.ru/api';
const API_KEY = 'cec481f50361daa41f728e47a28dda963bf5052206438d747fdcb320fe3c14d6';

// Local cache for folder IDs to avoid redundant lookups
const folderCache: Record<string, number> = {};

/**
 * Gets the ID of a folder by name, creating it if it doesn't exist.
 */
const getFolderId = async (name: string): Promise<number | null> => {
    if (folderCache[name]) return folderCache[name];

    try {
        // 1. Get all folders
        const res = await fetch(`${API_URL}/folders`, {
            headers: { 'X-API-Key': API_KEY }
        });
        const result = await res.json();

        if (result.success && Array.isArray(result.data)) {
            const folder = result.data.find((f: any) => f.name.toLowerCase() === name.toLowerCase());
            if (folder) {
                folderCache[name] = folder.id;
                return folder.id;
            }
        }

        // 2. Folder not found, create it
        const createRes = await fetch(`${API_URL}/folders`, {
            method: 'POST',
            headers: { 
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        const createResult = await createRes.json();
        
        if (createResult.success && createResult.data) {
            folderCache[name] = createResult.data.id;
            return createResult.data.id;
        }
    } catch (e) {
        console.error('Folder discovery error:', e);
    }
    return null;
};

/**
 * Uploads a file to the server using the folder_id parameter.
 */
export const uploadImage = async (file: File, folderName: string = 'general'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const folderId = await getFolderId(folderName);
    if (folderId !== null) {
        formData.append('folder_id', folderId.toString());
    }

    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Ошибка при загрузке файла');
        }

        const result = await response.json();
        
        if (result.success && result.data && result.data.url) {
            return result.data.url;
        } else {
            throw new Error('Некорректный ответ сервера при загрузке');
        }
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
};
